/**
 * AeroPool Payment Webhook & Idempotency Guard Service
 * 
 * Implements:
 * - Razorpay webhook signature verification using HMAC-SHA256
 * - Idempotency registry to eliminate duplicate processing and replay attacks
 * - Safe payload extraction and state machine transitions
 */

export interface WebhookVerificationResult {
  isValid: boolean;
  isDuplicate: boolean;
  error?: string;
  payload?: {
    event: string;
    paymentId: string;
    orderId: string;
    amountPaise: number;
    status: string;
  };
}

// In-memory idempotency registry (in production backed by Redis / PostgreSQL table)
const PROCESSED_WEBHOOK_EVENTS = new Set<string>();

/**
 * Computes HMAC-SHA256 hex digest using Web Crypto API or Node crypto
 */
export async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(message);

    const cryptoKey = await subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await subtle.sign('HMAC', cryptoKey, msgData);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Safe fallback for Node environment without bundling static import into browser build
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeCrypto = await (Function('return import("crypto")')() as Promise<any>);
    return nodeCrypto.createHmac('sha256', secret).update(message).digest('hex');
  } catch {
    throw new Error('No cryptographic primitive available for HMAC verification');
  }
}

/**
 * Validates Razorpay Webhook signature and prevents replay attacks via idempotency.
 * 
 * @param rawBody - Exact unparsed request body string received from Razorpay
 * @param receivedSignature - The value of the 'x-razorpay-signature' HTTP header
 * @param webhookSecret - The configured RAZORPAY_WEBHOOK_SECRET
 * @param eventId - Unique event identifier from Razorpay headers / payload
 */
/**
 * Constant-time string comparison safe from timing attacks and buffer length RangeError crashes
 */
export function safeCompareSignatures(expected: string, received: string): boolean {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  if (!expected || !received) return false;
  const expLower = expected.toLowerCase();
  const recLower = received.toLowerCase();
  if (expLower.length !== recLower.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expLower.length; i++) {
    mismatch |= expLower.charCodeAt(i) ^ recLower.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyRazorpayWebhook(
  rawBody: string,
  receivedSignature: string,
  webhookSecret: string,
  eventId: string
): Promise<WebhookVerificationResult> {
  if (!webhookSecret) {
    return {
      isValid: false,
      isDuplicate: false,
      error: 'Webhook verification failed: RAZORPAY_WEBHOOK_SECRET is not configured.',
    };
  }

  if (!receivedSignature || !rawBody) {
    return {
      isValid: false,
      isDuplicate: false,
      error: 'Invalid webhook request: Missing signature or body.',
    };
  }

  // Idempotency check: Replay attack guard
  if (PROCESSED_WEBHOOK_EVENTS.has(eventId)) {
    return {
      isValid: true,
      isDuplicate: true,
      error: `Event ${eventId} has already been processed (Idempotent ignore).`,
    };
  }

  try {
    const expectedSignature = await computeHmacSha256(webhookSecret, rawBody);
    
    // Constant-time comparison
    if (!safeCompareSignatures(expectedSignature, receivedSignature)) {
      return {
        isValid: false,
        isDuplicate: false,
        error: 'Cryptographic signature mismatch: Untrusted webhook source.',
      };
    }

    // Parse verified payload safely
    const parsed = JSON.parse(rawBody);
    const paymentEntity = parsed.payload?.payment?.entity;

    // Register event in idempotency table
    PROCESSED_WEBHOOK_EVENTS.add(eventId);

    return {
      isValid: true,
      isDuplicate: false,
      payload: {
        event: parsed.event || 'unknown',
        paymentId: paymentEntity?.id || '',
        orderId: paymentEntity?.order_id || '',
        amountPaise: Number(paymentEntity?.amount || 0),
        status: paymentEntity?.status || 'unknown',
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'JSON parse or verification error';
    return {
      isValid: false,
      isDuplicate: false,
      error: `Webhook processing error: ${msg}`,
    };
  }
}

/**
 * Clears processed events (for test suite resets)
 */
export function resetWebhookIdempotencyCache() {
  PROCESSED_WEBHOOK_EVENTS.clear();
}
