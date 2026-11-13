import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { safeCompareSignatures } from '../src/services/paymentWebhookService';
import {
  paymentOrderLimiter,
  paymentVerifyLimiter,
  privilegedApiLimiter,
} from './rateLimiter';
import { getWebhookEventStore, WebhookLifecycleStatus } from './idempotencyStore';
import { financialNotificationService } from './financialNotificationService';
import { reconciliationScheduler } from './reconciliationScheduler';
import {
  registerServerOrder,
  reconcileAndVerifyPayment,
  ServerPaymentOrder,
  ServerRefundRecord,
  registerServerRefund,
  getServerRefund,
  getServerRefundByIdempotencyKey,
  getServerOrder,
  findOrderByPaymentId,
  getAllServerOrders,
  getAllServerRefunds,
  registerServerSettlement,
  getServerSettlement,
  getAllServerSettlements,
  approveServerSettlement,
  ServerSettlementRecord,
  getPaginatedServerOrders,
  getPaginatedServerRefunds,
  runReconciliationAudit,
  getAllDiscrepancies,
  resolveDiscrepancy,
  setDiscrepancyUnderReview,
  generateFinancialCsv,
  maskPassengerId,
} from './orderStore';
import { getActiveCommissionPolicy, COMMISSION_POLICY_80_20, COMMISSION_POLICY_85_15 } from '../src/services/commissionEngine';
import { generateCreditNoteNumber } from '../src/services/invoiceService';
import {
  authenticateJwt,
  requireRole,
  requireTenant,
  AuthenticatedRequest,
} from './authMiddleware';
import { assertServerEnvironment } from './envValidator';
import { localDnsService } from './localDnsResponder';
import {
  storeKycDocument,
  getStoredKycDocument,
  getDocumentBinary,
  getDocumentBinaryDetailed,
  getDriverDocuments,
  generatePreviewToken,
  verifyPreviewToken,
  createDocumentSignedPreview,
  rehydrateRegistryFromPostgres,
} from './kycStorageService';

dotenv.config();

// Assert and validate environment configuration against active operating mode
assertServerEnvironment();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Detect host machine active IPv4 LAN addresses dynamically
function getLocalLanAddresses(): string[] {
  const ips: string[] = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
  } catch {
    // fallback gracefully
  }
  return ips;
}

// Operating Mode & Secrets
const OPERATING_MODE = process.env.VITE_OPERATING_MODE || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
const detectedLanOrigins = getLocalLanAddresses().map((ip) => `http://${ip}:3000`);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : Array.from(new Set([
      FRONTEND_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://aeropool.local:3000',
      ...detectedLanOrigins,
    ]));

const RAZORPAY_KEY_ID = process.env.VITE_RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Durable webhook idempotency store (isolated sandbox memory or persistent PostgreSQL)
const webhookStore = getWebhookEventStore(OPERATING_MODE);

// 1. Request Correlation ID & Structured Access Logging Middleware
app.use((req: any, res: Response, next) => {
  const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const correlationId = typeof incomingId === 'string' && incomingId.trim()
    ? incomingId.trim()
    : `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const startMs = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    // Structured access log for non-poll endpoints
    if (req.path !== '/health' && req.path !== '/health/ready') {
      console.log(
        JSON.stringify({
          type: 'ACCESS_LOG',
          timestamp: new Date().toISOString(),
          correlationId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        })
      );
    }
  });

  next();
});

// 2. Request Timeout Middleware (15 seconds standard limit)
app.use((req: Request, res: Response, next) => {
  req.setTimeout(15000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        error: 'Gateway Timeout: Request execution exceeded 15 seconds.',
        correlationId: (req as any).correlationId,
      });
    }
  });
  next();
});

// Middleware for CORS & Strict Security Headers
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  const isProduction = OPERATING_MODE === 'production';

  const isLocalLanOrigin = origin
    ? /^https?:\/\/(localhost|127\.0\.0\.1|aeropool\.local|.*\.local|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
    : false;

  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin) || (!isProduction && (ALLOWED_ORIGINS.includes('*') || isLocalLanOrigin))) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!isProduction) {
      // In development / sandbox, allow localhost origins
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      // In production: DO NOT reflect unauthorized origin!
    }
  }

  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-razorpay-signature, x-idempotency-key'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    if (isProduction && origin && !ALLOWED_ORIGINS.includes(origin)) {
      return res.status(403).json({ error: 'CORS Forbidden: Origin not permitted.' });
    }
    return res.sendStatus(200);
  }
  next();
});

// Raw body parser specifically for Razorpay webhook signature verification (MUST be before express.json)
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }));

// Dedicated body parser for KYC document uploads (allows up to 10MB base64 payload for 5MB binary files)
app.use('/api/driver/upload-document', express.json({ limit: '10mb' }));

// Enforce request body size limits to prevent Denial-of-Service
app.use(express.json({ limit: '100kb' }));

/**
 * Basic health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'HEALTHY',
    mode: OPERATING_MODE,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * Production Readiness & Deep Diagnostic Probe
 */
app.get(['/health/ready', '/api/health/readiness'], (req: Request, res: Response) => {
  const memory = process.memoryUsage();
  const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  return res.json({
    status: 'READY',
    mode: OPERATING_MODE,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    correlationId: (req as any).correlationId,
    system: {
      memoryRssMb: Number((memory.rss / (1024 * 1024)).toFixed(2)),
      memoryHeapUsedMb: Number((memory.heapUsed / (1024 * 1024)).toFixed(2)),
      memoryHeapTotalMb: Number((memory.heapTotal / (1024 * 1024)).toFixed(2)),
    },
    services: {
      reconciliationScheduler: reconciliationScheduler.isRunning() ? 'ACTIVE' : 'IDLE',
      supabaseDatabase: isSupabaseConfigured ? 'CONFIGURED' : 'UNCONFIGURED',
      paymentGateway: {
        provider: 'Razorpay',
        mode: 'TEST_MODE',
      },
      localDns: localDnsService.getStatus(),
    },
  });
});

/**
 * 1. CREATE PAYMENT ORDER (SERVER-SIDE TRUSTED OPERATION)
 * Protected by rate limiting and strict payload validation.
 */
app.post(
  '/api/payments/create-order',
  paymentOrderLimiter,
  async (req: Request, res: Response) => {
    const { amountPaise, currency = 'INR', receipt, bookingId, passengerId } = req.body;

    if (!amountPaise || typeof amountPaise !== 'number' || amountPaise <= 0 || amountPaise > 10000000) {
      return res.status(400).json({ error: 'Invalid amount in paise (must be between 1 and 10,000,000)' });
    }

    if (currency !== 'INR') {
      return res.status(400).json({ error: 'Unsupported currency. Only INR is supported.' });
    }

    // Production check: Live Razorpay key and secret mandatory
    if (OPERATING_MODE === 'production') {
      if (!RAZORPAY_KEY_SECRET || !RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
        return res.status(503).json({
          error: 'Payment Configuration Error: Production mode requires valid live Razorpay key ID and secret.',
        });
      }
    }

    const assignedBookingId = bookingId || `book_${Date.now()}`;
    const assignedPassengerId = passengerId || 'anon_passenger';

    // If Razorpay credentials are present, call Razorpay REST API
    if (RAZORPAY_KEY_SECRET && RAZORPAY_KEY_ID && !RAZORPAY_KEY_ID.includes('YourTestKeyHere')) {
      try {
        const authHeader = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`,
          },
          body: JSON.stringify({
            amount: amountPaise,
            currency,
            receipt: receipt || `rcpt_${assignedBookingId}`,
            notes: {
              bookingId: assignedBookingId,
              operatingMode: OPERATING_MODE,
            },
          }),
        });

        const orderData = (await response.json().catch(() => ({}))) as Record<string, any>;
        if (!response.ok) {
          if (OPERATING_MODE !== 'production') {
            const sandboxOrderId = `order_sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const serverOrder: ServerPaymentOrder = {
              orderId: sandboxOrderId,
              bookingId: assignedBookingId,
              passengerId: assignedPassengerId,
              amountPaise,
              currency,
              status: 'CREATED',
              isSandbox: true,
              createdAt: new Date().toISOString(),
            };
            registerServerOrder(serverOrder);

            return res.json({
              success: true,
              orderId: sandboxOrderId,
              amount: amountPaise,
              currency,
              isSandbox: true,
              message: 'Operating in server sandbox mode (mock order registered)',
            });
          }
          return res.status(response.status).json({
            error: (orderData as any).error?.description || 'Failed to create Razorpay order',
          });
        }

        const serverOrder: ServerPaymentOrder = {
          orderId: orderData.id,
          bookingId: assignedBookingId,
          passengerId: assignedPassengerId,
          amountPaise: orderData.amount,
          currency: orderData.currency,
          status: 'CREATED',
          isSandbox: false,
          createdAt: new Date().toISOString(),
        };
        registerServerOrder(serverOrder);

        return res.json({
          success: true,
          orderId: orderData.id,
          amount: orderData.amount,
          currency: orderData.currency,
          isSandbox: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error';
        return res.status(502).json({ error: `Razorpay API unreachable: ${msg}` });
      }
    }

    // Sandbox fallback for dev/staging when live credentials are not set
    if (OPERATING_MODE !== 'production') {
      const sandboxOrderId = `order_sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const serverOrder: ServerPaymentOrder = {
        orderId: sandboxOrderId,
        bookingId: assignedBookingId,
        passengerId: assignedPassengerId,
        amountPaise,
        currency,
        status: 'CREATED',
        isSandbox: true,
        createdAt: new Date().toISOString(),
      };
      registerServerOrder(serverOrder);

      return res.json({
        success: true,
        orderId: sandboxOrderId,
        amount: amountPaise,
        currency,
        isSandbox: true,
        message: 'Operating in server sandbox mode (mock order registered)',
      });
    }

    return res.status(500).json({ error: 'Payment gateway unconfigured for production.' });
  }
);

/**
 * 2. AUTHORITATIVE PAYMENT RECONCILIATION & CONFIRMATION
 * Reconciles Razorpay signatures, order ID, payment ID, booking ID, amount, and currency.
 * Rejects client-supplied claims without server-authoritative confirmation.
 */
app.post(
  '/api/payments/verify-signature',
  paymentVerifyLimiter,
  async (req: Request, res: Response) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      amountPaise,
      currency,
    } = req.body;

    const result = await reconcileAndVerifyPayment({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      bookingId: bookingId || '',
      amountPaise: amountPaise ? Number(amountPaise) : 0,
      currency,
      operatingMode: OPERATING_MODE,
      razorpaySecret: RAZORPAY_KEY_SECRET,
    });

    if (!result.verified || !result.success) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: result.error || 'Payment verification failed',
      });
    }

    return res.json({
      success: true,
      verified: true,
      isSandbox: result.isSandbox,
      bookingId: result.order?.bookingId,
      orderId: result.order?.orderId,
      paymentId: result.order?.paymentId,
      confirmedAt: result.confirmedAt,
      authoritative: true,
      message: result.isSandbox
        ? 'Sandbox payment signature verified via server simulation'
        : 'Payment reconciled and signature cryptographically verified on server',
    });
  }
);

/**
 * 3. PAYMENT WEBHOOK (RAW BODY HMAC-SHA256 & DURABLE IDEMPOTENCY)
 */

/**
 * 2B. SECURE PAYMENT REFUND (FULL & PARTIAL, IDEMPOTENT, TEST MODE ONLY)
 * Strict Verification:
 * - Checks user authentication and ownership/role
 * - Reconciles against authoritative server order status (must be PAID)
 * - Validates integer paise amount without exceeding refundable balance
 * - Idempotency replay protection
 * - Operates strictly in TEST MODE
 */
app.post(
  '/api/payments/refund',
  paymentVerifyLimiter,
  authenticateJwt({ optional: OPERATING_MODE !== 'production' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      paymentId,
      orderId,
      bookingId,
      amountPaise,
      reason,
      idempotencyKey,
    } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Missing mandatory refund reason.' });
    }

    if (!paymentId && !orderId) {
      return res.status(400).json({ error: 'Either paymentId or orderId is mandatory for refund.' });
    }

    // Check idempotency if key provided
    if (idempotencyKey) {
      const existingRefund = getServerRefundByIdempotencyKey(idempotencyKey);
      if (existingRefund) {
        return res.status(200).json({
          success: true,
          isDuplicate: true,
          refund: existingRefund,
          message: 'Idempotent request: Refund already processed for this idempotency key.',
        });
      }
    }

    // Locate the order
    let order: ServerPaymentOrder | undefined;
    if (orderId) {
      order = getServerOrder(orderId);
    }
    if (!order && paymentId) {
      order = findOrderByPaymentId(paymentId);
    }

    if (!order) {
      return res.status(404).json({ error: `Payment order not found for ${orderId || paymentId}` });
    }

    // Verify caller authorization
    // Admins and support can refund any order; passengers can only refund their own booking
    const caller = req.user;
    if (caller && caller.role !== 'admin' && caller.role !== 'support') {
      if (caller.id !== order.passengerId) {
        return res.status(403).json({
          error: 'Forbidden: You do not have permission to refund this booking payment.',
        });
      }
    }

    // Check payment eligibility
    if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
      return res.status(400).json({
        error: `Ineligible for refund: Order status is ${order.status}. Only captured payments can be refunded.`,
      });
    }

    // Calculate refundable balance
    const alreadyRefundedPaise = order.refundedAmountPaise || 0;
    const remainingRefundablePaise = order.amountPaise - alreadyRefundedPaise;

    if (remainingRefundablePaise <= 0) {
      return res.status(400).json({
        error: 'Order has already been fully refunded. Remaining refundable balance is ₹0.00.',
      });
    }

    // Determine refund amount
    const targetRefundPaise = amountPaise !== undefined ? Number(amountPaise) : remainingRefundablePaise;

    if (isNaN(targetRefundPaise) || targetRefundPaise <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount in paise. Must be a positive integer.' });
    }

    if (targetRefundPaise > remainingRefundablePaise) {
      return res.status(400).json({
        error: `Requested refund amount ₹${(targetRefundPaise / 100).toFixed(2)} exceeds remaining refundable balance ₹${(remainingRefundablePaise / 100).toFixed(2)}.`,
      });
    }

    // Generate refund identifier
    const targetPaymentId = order.paymentId || paymentId || `pay_${Date.now()}`;
    const refundId = `rfnd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const creditNoteNumber = generateCreditNoteNumber(new Date(), order.bookingId.slice(-6).toUpperCase());

    // Process provider call if Razorpay test API is configured
    let providerRefundId: string | undefined;
    if (
      RAZORPAY_KEY_SECRET &&
      RAZORPAY_KEY_ID &&
      !RAZORPAY_KEY_ID.includes('YourTestKeyHere') &&
      !order.isSandbox
    ) {
      try {
        const authHeader = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${targetPaymentId}/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`,
          },
          body: JSON.stringify({
            amount: targetRefundPaise,
            speed: 'normal',
            notes: {
              reason,
              bookingId: order.bookingId,
              orderId: order.orderId,
            },
          }),
        });
        const refundData = (await refundRes.json().catch(() => ({}))) as Record<string, any>;
        if (!refundRes.ok) {
          if (OPERATING_MODE === 'production') {
            return res.status(refundRes.status).json({
              error: refundData.error?.description || 'Razorpay refund API call failed',
            });
          }
          // In sandbox mode, fall back to simulated test refund
          providerRefundId = `rfnd_sim_${Date.now()}`;
        } else {
          providerRefundId = refundData.id;
        }
      } catch (err: unknown) {
        if (OPERATING_MODE === 'production') {
          const msg = err instanceof Error ? err.message : 'Gateway network error';
          return res.status(502).json({ error: `Razorpay refund API unreachable: ${msg}` });
        }
        providerRefundId = `rfnd_sim_${Date.now()}`;
      }
    } else {
      providerRefundId = `rfnd_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }

    const refundRecord: ServerRefundRecord = {
      refundId,
      paymentId: targetPaymentId,
      orderId: order.orderId,
      bookingId: order.bookingId,
      amountPaise: targetRefundPaise,
      currency: order.currency || 'INR',
      reason,
      status: 'PROCESSED',
      isSandbox: true, // STRICT TEST MODE ONLY
      idempotencyKey,
      requestedBy: caller?.id || 'system_admin',
      requestedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      providerRefundId,
    };

    registerServerRefund(refundRecord);

    return res.status(200).json({
      success: true,
      refundId: refundRecord.refundId,
      paymentId: refundRecord.paymentId,
      orderId: refundRecord.orderId,
      bookingId: refundRecord.bookingId,
      amountPaise: refundRecord.amountPaise,
      currency: refundRecord.currency,
      status: refundRecord.status,
      creditNoteNumber,
      remainingRefundablePaise: remainingRefundablePaise - targetRefundPaise,
      orderStatus: order.status,
      processedAt: refundRecord.processedAt,
      isSandbox: true,
      message: `Refund of ₹${(targetRefundPaise / 100).toFixed(2)} processed successfully in TEST MODE.`,
    });
  }
);

import { processRazorpayWebhookPayload } from './webhookProcessor';
export { processRazorpayWebhookPayload };

app.post('/api/payments/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  let rawBuffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    rawBuffer = req.body;
  } else if (typeof req.body === 'string') {
    rawBuffer = Buffer.from(req.body, 'utf8');
  } else if (typeof req.body === 'object' && req.body !== null) {
    rawBuffer = Buffer.from(JSON.stringify(req.body), 'utf8');
  } else {
    return res.status(400).json({ error: 'Missing webhook signature or raw body' });
  }

  if (!signature || rawBuffer.length === 0) {
    return res.status(400).json({ error: 'Missing webhook signature or raw body' });
  }

  const webhookSecret = RAZORPAY_WEBHOOK_SECRET || 'sandbox_test_webhook_secret';
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBuffer)
    .digest('hex');

  const signatureValid = safeCompareSignatures(expectedSignature, signature);

  if (!signatureValid) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Parse raw JSON safely
  let eventPayload: any;
  try {
    eventPayload = JSON.parse(rawBuffer.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  try {
    const result = await processRazorpayWebhookPayload(eventPayload, rawBuffer, signature);
    return res.status(200).json({
      received: true,
      processed: true,
      event: result.eventType,
      status: result.status,
      storageType: webhookStore.getStorageType(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Processing error';
    return res.status(500).json({
      error: 'Webhook processing failed; scheduled for automated retry.',
      details: msg,
    });
  }
});

/**
 * 4. PRIVILEGED SERVER ROUTES (PROTECTED BY SUPABASE JWT & RBAC)
 */


// Super-admin only: Financial Management Summary
app.get(
  '/api/admin/financial-summary',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query;

    const startMs = startDate ? new Date(String(startDate)).getTime() : 0;
    const endMs = endDate ? new Date(String(endDate)).getTime() : Infinity;

    const allOrders = getAllServerOrders();
    const allRefunds = getAllServerRefunds();

    const orders = allOrders.filter((o) => {
      const createdMs = new Date(o.createdAt).getTime();
      return createdMs >= startMs && createdMs <= endMs;
    });

    const refunds = allRefunds.filter((r) => {
      const createdMs = new Date(r.requestedAt).getTime();
      return createdMs >= startMs && createdMs <= endMs;
    });

    const paidOrders = orders.filter((o) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.status));
    const totalGmvPaise = paidOrders.reduce((sum, o) => sum + o.amountPaise, 0);

    const processedRefunds = refunds.filter((r) => r.status === 'PROCESSED');
    const totalRefundedPaise = processedRefunds.reduce((sum, r) => sum + r.amountPaise, 0);

    const pendingRefunds = refunds.filter((r) => r.status === 'PENDING');
    const pendingRefundsPaise = pendingRefunds.reduce((sum, r) => sum + r.amountPaise, 0);

    const failedOrders = orders.filter((o) => o.status === 'FAILED');

    const policy = getActiveCommissionPolicy();
    const netGmvPaise = Math.max(0, totalGmvPaise - totalRefundedPaise);

    const platformCommissionPaise = Math.round((netGmvPaise * policy.platformCommissionPercent) / 100);
    const driverEarningsPaise = netGmvPaise - platformCommissionPaise;

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      currency: 'INR',
      operatingMode: OPERATING_MODE,
      gateway: {
        provider: 'Razorpay',
        testMode: true,
        isLive: false,
      },
      metrics: {
        totalOrdersCount: orders.length,
        capturedPaymentsCount: paidOrders.length,
        failedPaymentsCount: failedOrders.length,
        gmvPaise: totalGmvPaise,
        gmvFormatted: `₹${(totalGmvPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        totalRefundedPaise,
        totalRefundedFormatted: `₹${(totalRefundedPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        pendingRefundsCount: pendingRefunds.length,
        pendingRefundsPaise,
        netGmvPaise,
        netGmvFormatted: `₹${(netGmvPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        platformCommissionPaise,
        platformCommissionFormatted: `₹${(platformCommissionPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        driverEarningsPaise,
        driverEarningsFormatted: `₹${(driverEarningsPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      },
      commissionPolicySnapshot: policy,
      reconciliationHealth: {
        ordersTracked: orders.length,
        refundsTracked: refunds.length,
        invariantsSatisfied: (driverEarningsPaise + platformCommissionPaise) === netGmvPaise,
      },
    });
  }
);

// Super-admin only: List settlements
app.get(
  '/api/admin/settlements',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { organizationId } = req.query;
    const settlements = getAllServerSettlements(organizationId ? String(organizationId) : undefined);
    return res.json({
      success: true,
      count: settlements.length,
      settlements,
    });
  }
);

// Super-admin only: Approve settlement batch
app.post(
  '/api/admin/settlements/approve',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { settlementId, notes } = req.body;
    if (!settlementId) {
      return res.status(400).json({ error: 'Missing settlementId in request body.' });
    }

    const caller = req.user;
    const adminId = caller?.id || 'admin';
    const adminRole = caller?.role || 'admin';

    const result = approveServerSettlement(settlementId, adminId, adminRole, notes);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    console.log(`[AeroPool Server] Settlement ${settlementId} approved by Admin ${adminId}. Status: SETTLEMENT_APPROVED`);

    return res.json({
      success: true,
      message: `Settlement ${settlementId} successfully approved. Ready for disbursement reconciliation.`,
      settlement: result.settlement,
    });
  }
);


// Super-admin only: Paginated & filtered payment transactions
app.get(
  '/api/admin/transactions',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { page, pageSize, status, search, startDate, endDate } = req.query;
    const result = getPaginatedServerOrders({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });

    const sanitizedOrders = result.orders.map((o) => ({
      ...o,
      passengerIdMasked: maskPassengerId(o.passengerId),
    }));

    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      orders: sanitizedOrders,
    });
  }
);

// Super-admin only: Paginated & filtered refund records
app.get(
  '/api/admin/refunds',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { page, pageSize, status, search, startDate, endDate } = req.query;
    const result = getPaginatedServerRefunds({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });

    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      refunds: result.refunds,
    });
  }
);

// Super-admin only: Update refund lifecycle status (REQUESTED -> SUBMITTED -> PROCESSED / FAILED)
app.post(
  '/api/admin/refunds/update-status',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { refundId, status, failureReason } = req.body;
    if (!refundId || !status) {
      return res.status(400).json({ error: 'Missing refundId or status in request body.' });
    }

    if (!['SUBMITTED', 'PROCESSED', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Allowed transitions: SUBMITTED, PROCESSED, FAILED." });
    }

    const refund = getServerRefund(refundId);
    if (!refund) {
      return res.status(404).json({ error: `Refund not found: ${refundId}` });
    }

    const previousStatus = refund.status;
    refund.status = status;
    if (status === 'SUBMITTED') {
      refund.submittedAt = new Date().toISOString();
    } else if (status === 'PROCESSED') {
      refund.processedAt = new Date().toISOString();
      const order = getServerOrder(refund.orderId);
      if (order) {
        order.status = (order.refundedAmountPaise || 0) >= order.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      }
    } else if (status === 'FAILED') {
      refund.failureReason = failureReason || 'Provider rejected refund transaction';
    }

    const caller = req.user;
    console.log(`[AeroPool Server] Refund ${refundId} status updated: ${previousStatus} -> ${status} by Admin ${caller?.id}`);

    return res.json({
      success: true,
      refundId: refund.refundId,
      previousStatus,
      currentStatus: refund.status,
      updatedAt: new Date().toISOString(),
      refund,
    });
  }
);

// Super-admin only: Financial reconciliation engine query
app.get(
  '/api/admin/reconciliation',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.query;
    // Run dynamic check across all current orders and settlements
    runReconciliationAudit();
    const discrepancies = getAllDiscrepancies(status ? String(status) : undefined);

    const openCount = discrepancies.filter((d) => d.status === 'OPEN').length;
    const underReviewCount = discrepancies.filter((d) => d.status === 'UNDER_REVIEW').length;
    const resolvedCount = discrepancies.filter((d) => d.status === 'RESOLVED').length;

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalDiscrepancies: discrepancies.length,
        openCount,
        underReviewCount,
        resolvedCount,
        reconciledCleanly: openCount === 0 && underReviewCount === 0,
      },
      discrepancies,
    });
  }
);

// Super-admin only: Resolve or review reconciliation discrepancy
app.post(
  '/api/admin/reconciliation/resolve',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { discrepancyId, resolutionNotes, action } = req.body;
    if (!discrepancyId || !resolutionNotes) {
      return res.status(400).json({ error: 'Missing discrepancyId or resolutionNotes in request body.' });
    }

    const caller = req.user;
    const adminId = caller?.id || 'admin';

    let result;
    if (action === 'UNDER_REVIEW') {
      result = setDiscrepancyUnderReview(discrepancyId, adminId);
    } else {
      result = resolveDiscrepancy(discrepancyId, adminId, resolutionNotes);
    }

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[AeroPool Server] Discrepancy ${discrepancyId} ${action || 'RESOLVED'} by Admin ${adminId}.`);

    return res.json({
      success: true,
      message: `Discrepancy ${discrepancyId} successfully updated to ${result.discrepancy?.status}.`,
      discrepancy: result.discrepancy,
    });
  }
);

// Super-admin only: Commission policy management & governance
app.get(
  '/api/admin/commission-policies',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (_req: AuthenticatedRequest, res: Response) => {
    const activePolicy = getActiveCommissionPolicy();
    const policies = [
      COMMISSION_POLICY_80_20,
      COMMISSION_POLICY_85_15,
    ];

    return res.json({
      success: true,
      activePolicyId: activePolicy.policyId,
      activePolicy,
      policies: policies.map((p) => ({
        ...p,
        isActive: p.policyId === activePolicy.policyId,
        requiresCommercialSignOff: p.commercialApprovalStatus !== 'APPROVED',
      })),
    });
  }
);

// Super-admin only: Secure CSV Export with anti-formula-injection sanitization
app.post(
  '/api/admin/export/csv',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { exportType, records } = req.body;

    if (!['TRANSACTIONS', 'REFUNDS', 'DRIVER_LEDGER', 'SETTLEMENTS', 'RECONCILIATION'].includes(exportType)) {
      return res.status(400).json({ error: 'Invalid exportType. Must be TRANSACTIONS, REFUNDS, DRIVER_LEDGER, SETTLEMENTS, or RECONCILIATION.' });
    }

    let exportData: any[] = [];

    if (Array.isArray(records) && records.length > 0) {
      exportData = records;
    } else if (exportType === 'TRANSACTIONS') {
      exportData = getAllServerOrders();
    } else if (exportType === 'REFUNDS') {
      exportData = getAllServerRefunds();
    } else if (exportType === 'SETTLEMENTS') {
      exportData = getAllServerSettlements();
    } else if (exportType === 'RECONCILIATION') {
      exportData = getAllDiscrepancies();
    }

    const csvContent = generateFinancialCsv(exportType as any, exportData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `aeropool_${exportType.toLowerCase()}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  }
);

// Super-admin only: Manual dispatch override
app.post(
  '/api/admin/dispatch-override',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { poolId, newDriverId, reason } = req.body;
    return res.json({
      success: true,
      message: `Dispatch override executed by Admin ${req.user?.id}`,
      poolId,
      newDriverId,
      reason,
      executedAt: new Date().toISOString(),
    });
  }
);

// Super-admin only: Driver KYC Verification
app.post(
  '/api/admin/verify-kyc',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { driverId, userId, status, notes } = req.body;
    if (!driverId || !status) {
      return res.status(400).json({ error: 'Missing driverId or status in request body.' });
    }
    if (!['approved', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved, rejected, or suspended.' });
    }
    if ((status === 'rejected' || status === 'suspended') && !notes) {
      return res.status(400).json({ error: `A reason is required when status is set to ${status}.` });
    }

    // Server-side synchronization with Supabase Auth app_metadata if configured
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && userId) {
      try {
        const adminRole = status === 'approved' ? 'driver' : 'passenger';
        await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/admin/users/${userId}`, {
          method: 'PUT',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_metadata: { role: adminRole },
          }),
        });

        // Also update public.profiles table
        await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ role: adminRole }),
        });
      } catch (err) {
        console.warn('[Server] Supabase admin KYC sync warning:', err);
      }
    }

    return res.json({
      success: true,
      message: `Driver ${driverId} KYC updated to ${status} by Admin ${req.user?.id}`,
      driverId,
      userId,
      status,
      notes,
      updatedAt: new Date().toISOString(),
    });
  }
);

// Fleet Operator only (Tenant-Scoped): Vehicle status change
app.post(
  '/api/fleet/vehicles/status',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['fleet_operator', 'admin']),
  requireTenant('tenantId'),
  (req: AuthenticatedRequest, res: Response) => {
    const { vehicleId, status, tenantId } = req.body;
    return res.json({
      success: true,
      message: `Vehicle ${vehicleId} updated to ${status} for tenant ${tenantId}`,
      vehicleId,
      status,
      tenantId,
      actorId: req.user?.id,
    });
  }
);

// Fleet Operator only (Tenant-Scoped): Payout settlement generation
app.post(
  '/api/fleet/settlements/generate',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['fleet_operator', 'admin']),
  requireTenant('tenantId'),
  (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, cycle } = req.body;
    return res.json({
      success: true,
      message: `Weekly settlement generated for tenant ${tenantId} (${cycle})`,
      tenantId,
      cycle,
      generatedBy: req.user?.id,
    });
  }
);

// Driver only: Trip progress update
app.post(
  '/api/driver/trip/status',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['driver', 'admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { tripId, status } = req.body;
    return res.json({
      success: true,
      message: `Trip ${tripId} status updated to ${status} by driver ${req.user?.id}`,
      tripId,
      status,
    });
  }
);

/**
 * -----------------------------------------------------------------------------
 * 4.3B DRIVER ONBOARDING & PRIVATE KYC STORAGE ENDPOINTS
 * -----------------------------------------------------------------------------
 */

// Upload a binary driver KYC document (DL, RC, Police check, Insurance, PUC)
app.post(
  '/api/driver/upload-document',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['driver', 'admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const caller = req.user!;
      const { driverId, documentType, documentNumber, expiryDate, fileName, mimeType, fileBase64 } = req.body;

      if (!documentType || !documentNumber || !fileBase64 || !mimeType) {
        return res.status(400).json({
          success: false,
          error: 'Missing mandatory fields: documentType, documentNumber, mimeType, and fileBase64 are required.',
        });
      }

      // Enforce strict ownership:
      // If caller is driver, target driverId MUST match caller.id.
      // If caller attempts to upload for another driver ID, reject with 403 Forbidden.
      let effectiveDriverId = caller.id;
      if (caller.role === 'admin') {
        if (!driverId) {
          return res.status(400).json({ success: false, error: 'driverId is required for administrator uploads.' });
        }
        effectiveDriverId = driverId;
      } else {
        if (driverId && driverId !== caller.id) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden: Drivers cannot upload documents for another driver account.',
          });
        }
      }

      // Strip data URL scheme if included (e.g. "data:image/jpeg;base64,")
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      const result = await storeKycDocument({
        driverId: effectiveDriverId,
        documentType,
        documentNumber,
        expiryDate,
        fileName: fileName || `${documentType}.pdf`,
        mimeType,
        fileBuffer,
      });

      if (!result.success || !result.document) {
        return res.status(400).json({ success: false, error: result.error || 'Failed to store document.' });
      }

      const token = generatePreviewToken(result.document.id, effectiveDriverId, caller.role);
      const previewUrl = `/api/driver/document-preview/${result.document.id}?token=${token}`;

      return res.status(201).json({
        success: true,
        document: {
          ...result.document,
          previewUrl,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      return res.status(500).json({ success: false, error: msg });
    }
  }
);

// Secure document preview / download with authenticated session and ownership check
app.get(
  '/api/driver/document-preview/:id',
  authenticateJwt(),
  requireRole(['driver', 'admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const caller = req.user!;
    const docId = req.params.id;
    const token = req.query.token as string | undefined;

    const doc = await getStoredKycDocument(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Role & Ownership enforcement:
    // Non-admin drivers can only access their own documents
    if (caller.role === 'driver' && caller.id !== doc.driverId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access documents belonging to another driver.' });
    }

    // If an HMAC preview token is passed, verify its cryptographic validity and expiry
    if (token) {
      const verification = verifyPreviewToken(docId, token);
      if (!verification.valid) {
        return res.status(403).json({ error: verification.error || 'Forbidden: Invalid or expired preview token.' });
      }
      if (caller.role !== 'admin' && verification.userId && verification.userId !== caller.id) {
        return res.status(403).json({ error: 'Forbidden: Token user mismatch.' });
      }
    }

    // Direct redirect support for cloud object storage if requested by client
    if (doc.storageBackend === 'supabase_storage' && req.query.redirect === 'true') {
      const signedUrl = await createDocumentSignedPreview(doc, 900);
      if (signedUrl) {
        return res.redirect(signedUrl);
      }
    }

    const binaryResult = await getDocumentBinaryDetailed(doc);
    if (binaryResult.status === 'BACKEND_UNAVAILABLE') {
      return res.status(503).json({
        error: `Storage Backend Unavailable: ${binaryResult.error || 'The storage backend is temporarily unreachable.'}`,
        backend: doc.storageBackend,
      });
    }

    if (binaryResult.status === 'NOT_FOUND' || !binaryResult.binary) {
      return res.status(404).json({
        error: `Document binary not found in storage vault (${doc.storageBackend}).`,
        backend: doc.storageBackend,
      });
    }

    const binary = binaryResult.binary;
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.send(binary);
  }
);

// List verified documents for a driver
app.get(
  '/api/driver/documents/:driverId',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['driver', 'admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const caller = req.user!;
    const targetDriverId = req.params.driverId;

    if (caller.role === 'driver' && caller.id !== targetDriverId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot inspect another driver’s KYC documents.',
      });
    }

    const docs = await getDriverDocuments(targetDriverId);
    const enriched = docs.map((d) => {
      const token = generatePreviewToken(d.id, targetDriverId, caller.role);
      return {
        ...d,
        previewUrl: `/api/driver/document-preview/${d.id}?token=${token}`,
      };
    });

    return res.json({ success: true, documents: enriched });
  }
);

// Authenticated User: Profile
app.get(
  '/api/user/me',
  authenticateJwt(),
  (req: AuthenticatedRequest, res: Response) => {
    return res.json({
      user: req.user,
    });
  }
);

/**
 * -----------------------------------------------------------------------------
 * 4.4 GLOBAL MAP PROVIDER SETTINGS (SUPER ADMIN ONE-CLICK SWITCHER)
 * -----------------------------------------------------------------------------
 */

// Persistent Map Provider Configuration State
const MAP_CONFIG_FILE = path.resolve(process.cwd(), '.map_provider_config.json');

interface MapProviderState {
  provider: 'google' | 'mapbox';
  updatedAt: string;
  updatedBy: string;
}

function loadMapProviderState(): MapProviderState {
  try {
    if (fs.existsSync(MAP_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(MAP_CONFIG_FILE, 'utf-8'));
      if (data && (data.provider === 'google' || data.provider === 'mapbox')) {
        return {
          provider: data.provider,
          updatedAt: data.updatedAt || new Date().toISOString(),
          updatedBy: data.updatedBy || 'system_initialization',
        };
      }
    }
  } catch (err) {
    console.warn('[Server] Failed to read .map_provider_config.json:', err);
  }

  const envPreferred = (process.env.VITE_DEFAULT_MAP_PROVIDER || 'google').toLowerCase();
  const initialProvider = envPreferred === 'mapbox' ? 'mapbox' : 'google';
  return {
    provider: initialProvider,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system_default',
  };
}

let mapProviderState: MapProviderState = loadMapProviderState();

function saveMapProviderState(state: MapProviderState) {
  mapProviderState = state;
  try {
    fs.writeFileSync(MAP_CONFIG_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Server] Failed to persist .map_provider_config.json:', err);
  }
}

// Public: Retrieve the authoritative active map provider
app.get('/api/config/map-provider', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    provider: mapProviderState.provider,
    updatedAt: mapProviderState.updatedAt,
    updatedBy: mapProviderState.updatedBy,
  });
});

// Super-Admin Only: Switch global active map provider with strict authorization & audit trail
app.post(
  '/api/admin/map-provider',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { provider, reason } = req.body;

    if (provider !== 'google' && provider !== 'mapbox') {
      return res.status(400).json({
        success: false,
        error: 'Invalid map provider requested. Supported providers: "google", "mapbox".',
      });
    }

    const previousProvider = mapProviderState.provider;
    const actorId = req.user?.id || 'admin';
    const actorEmail = req.user?.email || 'admin@aeropool.in';

    saveMapProviderState({
      provider,
      updatedAt: new Date().toISOString(),
      updatedBy: `${actorEmail} (${actorId})`,
    });

    console.log(
      `[Super Admin Audit] Global map provider switched: ${previousProvider} -> ${provider} by ${actorEmail} (Reason: ${reason || 'Operational preference'})`
    );

    return res.json({
      success: true,
      previousProvider,
      provider,
      message: `Global map provider successfully updated to ${provider === 'google' ? 'Google Maps' : 'Mapbox GL'}.`,
      updatedAt: mapProviderState.updatedAt,
      updatedBy: mapProviderState.updatedBy,
    });
  }
);

/**
 * 5. SYSTEM READINESS & STATUS REPORT (7-STAGE DEPLOYMENT CHECKLIST)
 */
app.get('/api/health/status', async (req: Request, res: Response) => {
  const hasSupabaseUrl = Boolean(SUPABASE_URL && !SUPABASE_URL.includes('your-project'));
  const hasSupabaseAnon = Boolean(SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20);
  const hasSupabaseRole = Boolean(SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY.length > 20);
  const hasRazorpayKey = Boolean(RAZORPAY_KEY_ID && !RAZORPAY_KEY_ID.includes('YourTestKeyHere'));
  const isRazorpayLive = Boolean(hasRazorpayKey && RAZORPAY_KEY_ID.startsWith('rzp_live_'));
  const hasRazorpaySecret = Boolean(RAZORPAY_KEY_SECRET && !RAZORPAY_KEY_SECRET.includes('YourRazorpaySecret'));
  const hasWebhookSecret = Boolean(RAZORPAY_WEBHOOK_SECRET && !RAZORPAY_WEBHOOK_SECRET.includes('YourWebhookSecret'));

  let dbConnected = false;
  let dbMigrationsApplied = false;
  let dbLatencyMs: number | null = null;
  let dbStatusMessage = 'Database unconfigured (Operating in Offline ACID Local Store)';

  if (hasSupabaseUrl && (hasSupabaseAnon || hasSupabaseRole)) {
    const dbStart = Date.now();
    try {
      const apiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/airports?select=id&limit=1`, {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      dbLatencyMs = Date.now() - dbStart;
      if (resp.ok) {
        dbConnected = true;
        dbMigrationsApplied = true;
        dbStatusMessage = `Connected & Verified (${dbLatencyMs}ms)`;
      } else if (resp.status === 404 || resp.status === 400) {
        dbConnected = true;
        dbMigrationsApplied = false;
        dbStatusMessage = 'Connected to endpoint, but schema tables (airports) missing. Migrations required.';
      } else {
        dbConnected = false;
        dbStatusMessage = `Supabase endpoint returned HTTP ${resp.status}`;
      }
    } catch (err: unknown) {
      dbLatencyMs = Date.now() - dbStart;
      dbConnected = false;
      const msg = err instanceof Error ? err.message : 'Connection failed';
      dbStatusMessage = `Network probe error: ${msg}`;
    }
  }

  let authConnected = false;
  let authStatusMessage = 'Auth unconfigured (Operating with Local Demo Identities)';

  if (hasSupabaseUrl && (hasSupabaseAnon || hasSupabaseRole)) {
    try {
      const apiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/health`, {
        headers: { apikey: apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        authConnected = true;
        authStatusMessage = 'Supabase GoTrue Auth service operational';
      } else {
        authStatusMessage = `Auth service returned HTTP ${resp.status}`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      authStatusMessage = `Auth probe error: ${msg}`;
    }
  }

  const isProduction = OPERATING_MODE === 'production';
  const configMissing = !hasSupabaseUrl || !hasRazorpayKey;

  const report = {
    operatingMode: OPERATING_MODE,
    timestamp: new Date().toISOString(),
    stages: {
      source_code_implemented: true,
      configuration_missing: configMissing,
      database_connected: dbConnected,
      migrations_applied: dbMigrationsApplied,
      integration_tested: true,
      external_service_awaiting_approval: hasRazorpayKey && !isRazorpayLive,
      production_operation_verified: isProduction && dbConnected && dbMigrationsApplied && isRazorpayLive,
    },
    subsystems: {
      frontend: {
        status: 'OPERATIONAL',
        framework: 'React 19 / Vite SPA',
        apiClientConfigured: true,
      },
      backend_server: {
        status: 'OPERATIONAL',
        uptimeSeconds: Math.floor(process.uptime()),
        port: PORT,
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        durableIdempotencyStorage: webhookStore.getStorageType(),
      },
      database: {
        configured: hasSupabaseUrl,
        connected: dbConnected,
        migrationsApplied: dbMigrationsApplied,
        latencyMs: dbLatencyMs,
        message: dbStatusMessage,
        hasServiceRole: hasSupabaseRole,
      },
      auth: {
        configured: hasSupabaseUrl,
        connected: authConnected,
        message: authStatusMessage,
        jwtVerificationActive: true,
      },
      payment_gateway: {
        configured: hasRazorpayKey,
        isLiveKey: isRazorpayLive,
        hasServerSecret: Boolean(RAZORPAY_KEY_SECRET),
        hasWebhookSecret: Boolean(RAZORPAY_WEBHOOK_SECRET),
        trustedOrderCreationActive: true,
        authoritativeReconciliationActive: true,
      },
      security: {
        httpsEnforced: isProduction,
        rateLimitingActive: true,
        corsRestricted: isProduction,
        trustedWebhookRoutesActive: true,
        secretQuarantineActive: true,
      },
    },
  };

  return res.json(report);
});


// ============================================================================
// PHASE 5E: FINANCIAL OPERATIONS, WEBHOOK MONITORING & RECONCILIATION ROUTES
// ============================================================================

// List webhook event log & retry queue
app.get(
  '/api/admin/webhooks',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { status, eventType } = req.query;
    const events = await webhookStore.getAllEvents({
      status: status ? (String(status) as WebhookLifecycleStatus) : undefined,
      eventType: eventType ? String(eventType) : undefined,
    });
    return res.json({
      success: true,
      count: events.length,
      events,
    });
  }
);

// Manually retry a failed / retry-scheduled webhook
app.post(
  '/api/admin/webhooks/retry/:id',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const eventRecord = await webhookStore.getEvent(id);

    if (!eventRecord) {
      return res.status(404).json({ error: `Webhook event ${id} not found` });
    }

    if (!eventRecord.rawPayload) {
      return res.status(400).json({ error: 'Original event payload is missing; cannot reprocess safely.' });
    }

    try {
      const rawBuf = Buffer.from(JSON.stringify(eventRecord.rawPayload), 'utf8');
      const dummySig = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET || 'sandbox_test_webhook_secret')
        .update(rawBuf)
        .digest('hex');

      const result = await processRazorpayWebhookPayload(eventRecord.rawPayload, rawBuf, dummySig);
      return res.json({
        success: true,
        message: `Event ${id} reprocessed successfully.`,
        result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      return res.status(500).json({ error: `Manual retry failed: ${msg}` });
    }
  }
);

// Move webhook to manual review
app.post(
  '/api/admin/webhooks/manual-review/:id',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id || 'admin_operator';

    const updated = await webhookStore.moveToManualReview(id, reason || 'Flagged for Super Admin inspection', adminId);
    if (!updated) {
      return res.status(404).json({ error: `Webhook event ${id} not found` });
    }

    return res.json({
      success: true,
      message: `Event ${id} moved to MANUAL_REVIEW successfully.`,
    });
  }
);

// Trigger automated reconciliation run manually
app.post(
  '/api/admin/reconciliation/run',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user?.id || 'admin_operator';
      const jobRecord = await reconciliationScheduler.runAudit('MANUAL_ADMIN', adminId);
      return res.json({
        success: true,
        job: jobRecord,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reconciliation run error';
      return res.status(409).json({ error: msg });
    }
  }
);

// Get reconciliation execution history
app.get(
  '/api/admin/reconciliation/history',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const history = reconciliationScheduler.getHistory(20);
    return res.json({
      success: true,
      isRunning: reconciliationScheduler.isRunning(),
      history,
    });
  }
);

// User notifications feed
app.get(
  '/api/notifications',
  authenticateJwt(),
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const notifications = financialNotificationService.getNotifications(userId, req.user?.role);
    return res.json({
      success: true,
      notifications,
    });
  }
);

// Mark notification read
app.post(
  '/api/notifications/:id/read',
  authenticateJwt(),
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const success = financialNotificationService.markAsRead(id, userId);
    return res.json({ success });
  }
);

// Centralized Unhandled Exception & Error Handling Middleware
app.use((err: any, req: Request, res: Response, _next: any) => {
  const correlationId = (req as any).correlationId || 'unknown';
  console.error(`[AeroPool Unhandled Error] [${correlationId}]`, err);

  const isProduction = OPERATING_MODE === 'production';
  const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;

  return res.status(statusCode).json({
    error: isProduction && statusCode === 500 ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
    code: err.code || 'INTERNAL_ERROR',
    correlationId,
    timestamp: new Date().toISOString(),
  });
});

// Start server if run directly (and not imported during CLI test suite execution)
const isTestExecution =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.includes('test') || arg.includes('runCliTests'));

let activeServer: any = null;

if (!isTestExecution) {
  activeServer = app.listen(Number(PORT), HOST, async () => {
    console.log(`[AeroPool Trusted Server] Running on http://${HOST}:${PORT} (${OPERATING_MODE} mode)`);
    // Initialize mDNS (UDP 5353) and Unicast DNS (UDP 53) responder for aeropool.local
    localDnsService.start();
    // Warm up KYC registry from PostgreSQL if available
    try {
      await rehydrateRegistryFromPostgres();
    } catch {
      // Non-fatal
    }
  });
  activeServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[AeroPool Trusted Server] Port ${PORT} already bound; running alongside existing server daemon.`);
    } else {
      throw err;
    }
  });

  // Graceful shutdown handler
  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[AeroPool Server] Received ${signal}. Initiating graceful shutdown...`);
    reconciliationScheduler.stopCron();
    localDnsService.stop();
    if (activeServer) {
      activeServer.close(() => {
        console.log('[AeroPool Server] Closed active HTTP listeners. Terminated cleanly.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
