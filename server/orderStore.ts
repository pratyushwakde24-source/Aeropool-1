import { safeCompareSignatures, computeHmacSha256 } from '../src/services/paymentWebhookService';

export interface ServerRefundRecord {
  refundId: string;
  paymentId: string;
  orderId: string;
  bookingId: string;
  amountPaise: number;
  currency: string;
  reason: string;
  status: 'REQUESTED' | 'SUBMITTED' | 'PROCESSED' | 'FAILED' | 'PENDING';
  submittedAt?: string;
  isSandbox: boolean;
  idempotencyKey?: string;
  requestedBy: string;
  requestedAt: string;
  processedAt?: string;
  failureReason?: string;
  providerRefundId?: string;
}

export interface ServerPaymentOrder {
  orderId: string;
  bookingId: string;
  passengerId: string;
  amountPaise: number;
  currency: string;
  status: 'CREATED' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  isSandbox: boolean;
  paymentId?: string;
  signature?: string;
  verifiedAt?: string;
  refundedAmountPaise?: number;
  refunds?: ServerRefundRecord[];
  createdAt: string;
}

// In-memory server order registry (reconciled against Supabase payment_orders in production)
const orderRegistry = new Map<string, ServerPaymentOrder>();
const refundRegistry = new Map<string, ServerRefundRecord>();
const settlementRegistry = new Map<string, ServerSettlementRecord>();

export interface ServerSettlementRecord {
  settlementId: string;
  organizationId: string;
  cycle: string;
  periodStart: string;
  periodEnd: string;
  totalTrips: number;
  grossAmountPaise: number;
  commissionPaise: number;
  netPayoutPaise: number;
  status: 'PROCESSING' | 'SETTLEMENT_APPROVED' | 'SETTLED';
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export function registerServerSettlement(settlement: ServerSettlementRecord): void {
  settlementRegistry.set(settlement.settlementId, settlement);
}

export function getServerSettlement(settlementId: string): ServerSettlementRecord | undefined {
  return settlementRegistry.get(settlementId);
}

export function getAllServerSettlements(organizationId?: string): ServerSettlementRecord[] {
  const all = Array.from(settlementRegistry.values());
  if (organizationId) {
    return all.filter((s) => s.organizationId === organizationId);
  }
  return all;
}

export function approveServerSettlement(
  settlementId: string,
  adminId: string,
  adminRole: string,
  notes?: string
): { success: boolean; error?: string; settlement?: ServerSettlementRecord } {
  if (adminRole !== 'admin') {
    return {
      success: false,
      error: 'Unauthorized: Only Super Administrators can approve settlements.',
    };
  }

  const settlement = settlementRegistry.get(settlementId);
  if (!settlement) {
    return { success: false, error: `Settlement not found: ${settlementId}` };
  }

  if (settlement.status !== 'PROCESSING') {
    return {
      success: false,
      error: `Invalid transition: Cannot approve settlement with status '${settlement.status}'. Only 'PROCESSING' settlements can be approved.`,
    };
  }

  settlement.status = 'SETTLEMENT_APPROVED';
  settlement.approvedBy = adminId;
  settlement.approvedAt = new Date().toISOString();
  settlement.approvalNotes = notes || 'Approved by Super Admin';
  settlement.updatedAt = new Date().toISOString();

  return { success: true, settlement };
}

export function registerServerOrder(order: ServerPaymentOrder): void {
  orderRegistry.set(order.orderId, order);
}

export function getServerOrder(orderId: string): ServerPaymentOrder | undefined {
  return orderRegistry.get(orderId);
}

export function findOrderByPaymentId(paymentId: string): ServerPaymentOrder | undefined {
  for (const order of orderRegistry.values()) {
    if (order.paymentId === paymentId) return order;
  }
  return undefined;
}

export function registerServerRefund(refund: ServerRefundRecord): void {
  refundRegistry.set(refund.refundId, refund);
  const order = getServerOrder(refund.orderId);
  if (order) {
    if (!order.refunds) order.refunds = [];
    const existingIdx = order.refunds.findIndex((r) => r.refundId === refund.refundId);
    if (existingIdx >= 0) {
      order.refunds[existingIdx] = refund;
    } else {
      order.refunds.push(refund);
    }
    if (refund.status === 'PROCESSED') {
      const totalRefunded = order.refunds
        .filter((r) => r.status === 'PROCESSED')
        .reduce((sum, r) => sum + r.amountPaise, 0);
      order.refundedAmountPaise = totalRefunded;
      if (totalRefunded >= order.amountPaise) {
        order.status = 'REFUNDED';
      } else {
        order.status = 'PARTIALLY_REFUNDED';
      }
    }
  }
}

export function getServerRefund(refundId: string): ServerRefundRecord | undefined {
  return refundRegistry.get(refundId);
}

export function getServerRefundByIdempotencyKey(key: string): ServerRefundRecord | undefined {
  for (const refund of refundRegistry.values()) {
    if (refund.idempotencyKey === key) return refund;
  }
  return undefined;
}

export function getRefundsForPayment(paymentId: string): ServerRefundRecord[] {
  const result: ServerRefundRecord[] = [];
  for (const refund of refundRegistry.values()) {
    if (refund.paymentId === paymentId) result.push(refund);
  }
  return result;
}

export function getAllServerOrders(): ServerPaymentOrder[] {
  return Array.from(orderRegistry.values());
}

export function getAllServerRefunds(): ServerRefundRecord[] {
  return Array.from(refundRegistry.values());
}

export function clearOrdersForTesting(): void {
  orderRegistry.clear();
  refundRegistry.clear();
  settlementRegistry.clear();
  reconciliationRegistry.clear();
}

export interface ReconcilePaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
  bookingId: string;
  amountPaise: number;
  currency?: string;
  operatingMode: string;
  razorpaySecret: string;
}

export interface ReconcilePaymentResult {
  success: boolean;
  verified: boolean;
  order?: ServerPaymentOrder;
  error?: string;
  isSandbox: boolean;
  confirmedAt?: string;
}

/**
 * Server-authoritative payment reconciliation & signature verification.
 * Browser checkout callbacks are treated as untrusted hints.
 * Reconciles Order ID, Payment ID, Booking ID, Amount in paise, Currency, and HMAC signature.
 */
export async function reconcileAndVerifyPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  bookingId: string;
  amountPaise: number;
  currency?: string;
  operatingMode: string;
  razorpaySecret: string;
}): Promise<ReconcilePaymentResult> {
  const {
    orderId,
    paymentId,
    signature,
    bookingId,
    amountPaise,
    currency = 'INR',
    operatingMode,
    razorpaySecret,
  } = params;

  if (!orderId || !paymentId || !signature) {
    return {
      success: false,
      verified: false,
      isSandbox: operatingMode !== 'production',
      error: 'Missing required parameters: orderId, paymentId, and signature are mandatory',
    };
  }

  const isProduction = operatingMode === 'production';
  let order = getServerOrder(orderId);

  // If order was generated in sandbox mode without prior registry insertion
  if (!order) {
    if (isProduction) {
      return {
        success: false,
        verified: false,
        isSandbox: false,
        error: `Order reconciliation failed: Order ${orderId} does not exist on this server.`,
      };
    }

    if (orderId.startsWith('order_sandbox_')) {
      order = {
        orderId,
        bookingId: bookingId || 'sandbox_booking',
        passengerId: 'sandbox_passenger',
        amountPaise,
        currency,
        status: 'CREATED',
        isSandbox: true,
        createdAt: new Date().toISOString(),
      };
      registerServerOrder(order);
    } else {
      return {
        success: false,
        verified: false,
        isSandbox: true,
        error: `Order ${orderId} not found in server registry.`,
      };
    }
  }

  // 1. Reconcile Booking ID
  if (bookingId && order.bookingId && order.bookingId !== 'pending' && order.bookingId !== 'sandbox_booking') {
    if (order.bookingId !== bookingId) {
      return {
        success: false,
        verified: false,
        isSandbox: order.isSandbox,
        error: `Booking ID mismatch: order belongs to ${order.bookingId}, received ${bookingId}.`,
      };
    }
  }

  // 2. Reconcile Amount (Integer Paise)
  if (amountPaise && order.amountPaise !== amountPaise) {
    return {
      success: false,
      verified: false,
      isSandbox: order.isSandbox,
      error: `Amount mismatch: order requires ₹${(order.amountPaise / 100).toFixed(2)}, received ₹${(amountPaise / 100).toFixed(2)}.`,
    };
  }

  // 3. Reconcile Currency
  if (order.currency !== currency) {
    return {
      success: false,
      verified: false,
      isSandbox: order.isSandbox,
      error: `Currency mismatch: order currency is ${order.currency}, received ${currency}.`,
    };
  }

  // 4. Sandbox vs Production Signature Rules
  if (isProduction) {
    if (order.isSandbox || orderId.startsWith('order_sandbox_')) {
      return {
        success: false,
        verified: false,
        isSandbox: false,
        error: 'Security Violation: Sandbox orders cannot be verified or confirmed in production mode.',
      };
    }

    if (signature === 'simulated_valid_signature_token') {
      return {
        success: false,
        verified: false,
        isSandbox: false,
        error: 'Security Violation: Simulated sandbox signature tokens are rejected in production mode.',
      };
    }

    if (!razorpaySecret) {
      return {
        success: false,
        verified: false,
        isSandbox: false,
        error: 'Server Configuration Error: RAZORPAY_KEY_SECRET is missing.',
      };
    }

    // Verify HMAC-SHA256
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = await computeHmacSha256(razorpaySecret, payload);

    if (!safeCompareSignatures(expectedSignature, signature)) {
      return {
        success: false,
        verified: false,
        isSandbox: false,
        error: 'Cryptographic signature verification failed: Untrusted payment token.',
      };
    }
  } else {
    // Development / Sandbox mode
    if (order.isSandbox && signature === 'simulated_valid_signature_token') {
      // Valid sandbox signature simulation
    } else if (razorpaySecret) {
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = await computeHmacSha256(razorpaySecret, payload);

      if (!safeCompareSignatures(expectedSignature, signature)) {
        return {
          success: false,
          verified: false,
          isSandbox: true,
          error: 'Cryptographic signature verification failed',
        };
      }
    }
  }

  // 5. Update order state to PAID atomically
  order.status = 'PAID';
  order.paymentId = paymentId;
  order.signature = signature;
  order.verifiedAt = new Date().toISOString();

  return {
    success: true,
    verified: true,
    order,
    isSandbox: order.isSandbox,
    confirmedAt: order.verifiedAt,
  };
}
export interface ServerReconciliationDiscrepancy {
  id: string;
  type:
    | 'ORPHAN_PROVIDER_CAPTURE'
    | 'INTERNAL_CAPTURE_WITHOUT_PROVIDER'
    | 'DUPLICATE_PAYMENT_REFERENCE'
    | 'REFUND_OVERRUN'
    | 'MISSING_DRIVER_LEDGER_ENTRY'
    | 'DUPLICATE_DRIVER_LEDGER_ENTRY'
    | 'UNVERIFIED_SETTLEMENT_PAYOUT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  entityId: string;
  description: string;
  expectedValue: string;
  actualValue: string;
  discrepancyPaise?: number;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

const reconciliationRegistry = new Map<string, ServerReconciliationDiscrepancy>();

export function registerDiscrepancy(d: ServerReconciliationDiscrepancy): void {
  reconciliationRegistry.set(d.id, d);
}

export function getDiscrepancy(id: string): ServerReconciliationDiscrepancy | undefined {
  return reconciliationRegistry.get(id);
}

export function getAllDiscrepancies(statusFilter?: string): ServerReconciliationDiscrepancy[] {
  const all = Array.from(reconciliationRegistry.values());
  if (statusFilter && statusFilter !== 'ALL') {
    return all.filter((d) => d.status === statusFilter);
  }
  return all;
}

export function resolveDiscrepancy(
  id: string,
  adminId: string,
  notes: string
): { success: boolean; discrepancy?: ServerReconciliationDiscrepancy; error?: string } {
  const item = reconciliationRegistry.get(id);
  if (!item) {
    return { success: false, error: `Discrepancy not found: ${id}` };
  }
  item.status = 'RESOLVED';
  item.resolvedAt = new Date().toISOString();
  item.resolvedBy = adminId;
  item.resolutionNotes = notes;
  return { success: true, discrepancy: item };
}

export function setDiscrepancyUnderReview(
  id: string,
  adminId: string
): { success: boolean; discrepancy?: ServerReconciliationDiscrepancy; error?: string } {
  const item = reconciliationRegistry.get(id);
  if (!item) {
    return { success: false, error: `Discrepancy not found: ${id}` };
  }
  item.status = 'UNDER_REVIEW';
  item.resolutionNotes = `Under review by Admin ${adminId}`;
  return { success: true, discrepancy: item };
}

/**
 * Dynamic Reconciliation Engine:
 * Compares server orders, provider payments, refunds, settlements, and driver ledger entries.
 */
export function runReconciliationAudit(driverLedger?: any[]): ServerReconciliationDiscrepancy[] {
  const orders = getAllServerOrders();
  const refunds = getAllServerRefunds();
  const settlements = getAllServerSettlements();
  const paymentIdMap = new Map<string, string[]>();

  // 1. Audit Orders
  for (const order of orders) {
    // Duplicate payment references
    if (order.paymentId) {
      const existing = paymentIdMap.get(order.paymentId) || [];
      existing.push(order.orderId);
      paymentIdMap.set(order.paymentId, existing);
    }

    // Captured status without payment ID
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.status) && !order.paymentId) {
      const discId = `disc_capture_nopay_${order.orderId}`;
      if (!reconciliationRegistry.has(discId)) {
        reconciliationRegistry.set(discId, {
          id: discId,
          type: 'INTERNAL_CAPTURE_WITHOUT_PROVIDER',
          severity: 'CRITICAL',
          status: 'OPEN',
          entityId: order.orderId,
          description: `Order ${order.orderId} is marked ${order.status} but lacks Razorpay payment ID confirmation.`,
          expectedValue: 'Verified payment ID',
          actualValue: 'undefined',
          discrepancyPaise: order.amountPaise,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Refund overrun
    if (order.refundedAmountPaise && order.refundedAmountPaise > order.amountPaise) {
      const discId = `disc_overrun_${order.orderId}`;
      if (!reconciliationRegistry.has(discId)) {
        reconciliationRegistry.set(discId, {
          id: discId,
          type: 'REFUND_OVERRUN',
          severity: 'CRITICAL',
          status: 'OPEN',
          entityId: order.orderId,
          description: `Order ${order.orderId} total refunded amount (₹${(order.refundedAmountPaise / 100).toFixed(2)}) exceeds gross order value (₹${(order.amountPaise / 100).toFixed(2)}).`,
          expectedValue: `<= ₹${(order.amountPaise / 100).toFixed(2)}`,
          actualValue: `₹${(order.refundedAmountPaise / 100).toFixed(2)}`,
          discrepancyPaise: order.refundedAmountPaise - order.amountPaise,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 2. Audit Duplicate Payment References
  for (const [payId, orderIds] of paymentIdMap.entries()) {
    if (orderIds.length > 1) {
      const discId = `disc_dup_pay_${payId}`;
      if (!reconciliationRegistry.has(discId)) {
        reconciliationRegistry.set(discId, {
          id: discId,
          type: 'DUPLICATE_PAYMENT_REFERENCE',
          severity: 'CRITICAL',
          status: 'OPEN',
          entityId: payId,
          description: `Payment ID ${payId} is associated with multiple orders: ${orderIds.join(', ')}.`,
          expectedValue: 'Unique payment mapping (1 order)',
          actualValue: `${orderIds.length} orders mapped`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 3. Audit Settlements marked SETTLED without proof
  for (const set of settlements) {
    if (set.status === 'SETTLED' && !set.approvedBy) {
      const discId = `disc_unverified_payout_${set.settlementId}`;
      if (!reconciliationRegistry.has(discId)) {
        reconciliationRegistry.set(discId, {
          id: discId,
          type: 'UNVERIFIED_SETTLEMENT_PAYOUT',
          severity: 'HIGH',
          status: 'OPEN',
          entityId: set.settlementId,
          description: `Settlement ${set.settlementId} is marked SETTLED without recorded approving admin or verified bank reference.`,
          expectedValue: 'Super Admin approval & bank reference',
          actualValue: 'Missing approval details',
          discrepancyPaise: set.netPayoutPaise,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 4. Audit Driver Ledger duplicates if ledger provided
  if (Array.isArray(driverLedger)) {
    const poolTripEarnings = new Map<string, number>();
    for (const entry of driverLedger) {
      if (entry.poolId && entry.transactionType === 'TRIP_EARNING') {
        const count = (poolTripEarnings.get(entry.poolId) || 0) + 1;
        poolTripEarnings.set(entry.poolId, count);
        if (count > 1) {
          const discId = `disc_dup_driver_earning_${entry.poolId}`;
          if (!reconciliationRegistry.has(discId)) {
            reconciliationRegistry.set(discId, {
              id: discId,
              type: 'DUPLICATE_DRIVER_LEDGER_ENTRY',
              severity: 'CRITICAL',
              status: 'OPEN',
              entityId: entry.poolId,
              description: `Pool ${entry.poolId} has multiple TRIP_EARNING ledger credits recorded for driver ${entry.driverId}.`,
              expectedValue: 'Exactly 1 TRIP_EARNING entry',
              actualValue: `${count} entries recorded`,
              discrepancyPaise: entry.driverEarningsPaise,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  return Array.from(reconciliationRegistry.values());
}

/**
 * Server-side paginated & filtered query for payment orders
 */
export function getPaginatedServerOrders(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  orders: ServerPaymentOrder[];
} {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const status = params.status && params.status !== 'ALL' ? params.status.toUpperCase() : undefined;
  const search = params.search ? params.search.trim().toLowerCase() : undefined;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Infinity;

  let list = getAllServerOrders();

  if (status) {
    list = list.filter((o) => o.status === status);
  }

  if (search) {
    list = list.filter(
      (o) =>
        o.orderId.toLowerCase().includes(search) ||
        o.bookingId.toLowerCase().includes(search) ||
        (o.paymentId && o.paymentId.toLowerCase().includes(search)) ||
        o.passengerId.toLowerCase().includes(search)
    );
  }

  if (params.startDate || params.endDate) {
    list = list.filter((o) => {
      const ms = new Date(o.createdAt).getTime();
      return ms >= startMs && ms <= endMs;
    });
  }

  // Sort descending by creation date
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = list.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const orders = list.slice(startIndex, startIndex + pageSize);

  return { total, page, pageSize, totalPages, orders };
}

/**
 * Server-side paginated & filtered query for refund records
 */
export function getPaginatedServerRefunds(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  refunds: ServerRefundRecord[];
} {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const status = params.status && params.status !== 'ALL' ? params.status.toUpperCase() : undefined;
  const search = params.search ? params.search.trim().toLowerCase() : undefined;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Infinity;

  let list = getAllServerRefunds();

  if (status) {
    list = list.filter((r) => r.status === status);
  }

  if (search) {
    list = list.filter(
      (r) =>
        r.refundId.toLowerCase().includes(search) ||
        r.paymentId.toLowerCase().includes(search) ||
        r.orderId.toLowerCase().includes(search) ||
        r.bookingId.toLowerCase().includes(search)
    );
  }

  if (params.startDate || params.endDate) {
    list = list.filter((r) => {
      const ms = new Date(r.requestedAt).getTime();
      return ms >= startMs && ms <= endMs;
    });
  }

  list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

  const total = list.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const refunds = list.slice(startIndex, startIndex + pageSize);

  return { total, page, pageSize, totalPages, refunds };
}

/**
 * Sanitizes a field for safe CSV generation (prevents CSV Formula Injection CWE-1236)
 */
export function sanitizeCsvField(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value).trim();
  // If field starts with =, +, -, @, \t, or \r, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape embedded double quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Exports financial records as CSV with formula-injection sanitization
 */
export function generateFinancialCsv(
  type: 'TRANSACTIONS' | 'REFUNDS' | 'DRIVER_LEDGER' | 'SETTLEMENTS' | 'RECONCILIATION',
  records: any[]
): string {
  if (type === 'TRANSACTIONS') {
    const headers = ['Order ID', 'Booking ID', 'Passenger Identifier', 'Amount (INR)', 'Status', 'Payment ID', 'Created At'];
    const rows = records.map((r) => [
      sanitizeCsvField(r.orderId),
      sanitizeCsvField(r.bookingId),
      sanitizeCsvField(maskPassengerId(r.passengerId)),
      sanitizeCsvField((r.amountPaise / 100).toFixed(2)),
      sanitizeCsvField(r.status),
      sanitizeCsvField(r.paymentId || 'N/A'),
      sanitizeCsvField(r.createdAt),
    ]);
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  if (type === 'REFUNDS') {
    const headers = ['Refund ID', 'Payment ID', 'Order ID', 'Booking ID', 'Amount (INR)', 'Status', 'Reason', 'Requested At', 'Processed At'];
    const rows = records.map((r) => [
      sanitizeCsvField(r.refundId),
      sanitizeCsvField(r.paymentId),
      sanitizeCsvField(r.orderId),
      sanitizeCsvField(r.bookingId),
      sanitizeCsvField((r.amountPaise / 100).toFixed(2)),
      sanitizeCsvField(r.status),
      sanitizeCsvField(r.reason),
      sanitizeCsvField(r.requestedAt),
      sanitizeCsvField(r.processedAt || 'Pending'),
    ]);
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  if (type === 'DRIVER_LEDGER') {
    const headers = ['Ledger ID', 'Driver ID', 'Pool ID', 'Type', 'Gross Fare (INR)', 'Platform Comm (INR)', 'Toll Reimbursement (INR)', 'Driver Net (INR)', 'Status', 'Timestamp'];
    const rows = records.map((r) => [
      sanitizeCsvField(r.id),
      sanitizeCsvField(r.driverId),
      sanitizeCsvField(r.poolId || 'N/A'),
      sanitizeCsvField(r.transactionType),
      sanitizeCsvField((r.grossFarePaise / 100).toFixed(2)),
      sanitizeCsvField((r.platformCommissionPaise / 100).toFixed(2)),
      sanitizeCsvField((r.tollReimbursementPaise / 100).toFixed(2)),
      sanitizeCsvField((r.driverEarningsPaise / 100).toFixed(2)),
      sanitizeCsvField(r.settlementStatus || 'AVAILABLE'),
      sanitizeCsvField(r.timestamp),
    ]);
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  if (type === 'SETTLEMENTS') {
    const headers = ['Settlement ID', 'Org ID', 'Cycle', 'Period Start', 'Period End', 'Trips', 'Gross (INR)', 'Commission (INR)', 'Net Payout (INR)', 'Status', 'Approved By'];
    const rows = records.map((r) => [
      sanitizeCsvField(r.settlementId || r.id),
      sanitizeCsvField(r.organizationId),
      sanitizeCsvField(r.settlementCycle || r.cycle),
      sanitizeCsvField(r.periodStart),
      sanitizeCsvField(r.periodEnd),
      sanitizeCsvField(r.totalTrips || r.completedTripsCount || 0),
      sanitizeCsvField(((r.grossAmountPaise || r.grossFaresPaise || 0) / 100).toFixed(2)),
      sanitizeCsvField(((r.commissionPaise || r.platformCommissionPaise || 0) / 100).toFixed(2)),
      sanitizeCsvField(((r.netPayoutPaise || r.netPayablePaise || 0) / 100).toFixed(2)),
      sanitizeCsvField(r.status),
      sanitizeCsvField(r.approvedBy || 'N/A'),
    ]);
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  if (type === 'RECONCILIATION') {
    const headers = ['Discrepancy ID', 'Type', 'Severity', 'Status', 'Entity ID', 'Description', 'Expected', 'Actual', 'Discrepancy (INR)', 'Detected At', 'Resolved At', 'Resolved By'];
    const rows = records.map((r) => [
      sanitizeCsvField(r.id),
      sanitizeCsvField(r.type),
      sanitizeCsvField(r.severity),
      sanitizeCsvField(r.status),
      sanitizeCsvField(r.entityId),
      sanitizeCsvField(r.description),
      sanitizeCsvField(r.expectedValue),
      sanitizeCsvField(r.actualValue),
      sanitizeCsvField(r.discrepancyPaise ? (r.discrepancyPaise / 100).toFixed(2) : '0.00'),
      sanitizeCsvField(r.detectedAt),
      sanitizeCsvField(r.resolvedAt || 'Open'),
      sanitizeCsvField(r.resolvedBy || 'Unresolved'),
    ]);
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  return '';
}

export function maskPassengerId(id?: string): string {
  if (!id) return 'Anonymous';
  if (id.length <= 6) return id;
  return `${id.substring(0, 3)}***${id.slice(-2)}`;
}
