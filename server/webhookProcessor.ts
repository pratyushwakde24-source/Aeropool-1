import crypto from 'crypto';
import { getWebhookEventStore } from './idempotencyStore';
import { financialNotificationService } from './financialNotificationService';
import { getServerOrder, getServerRefund } from './orderStore';

const OPERATING_MODE = (process.env.VITE_OPERATING_MODE || process.env.VITE_APP_MODE || process.env.NODE_ENV || 'sandbox').toLowerCase();
const defaultWebhookStore = getWebhookEventStore(OPERATING_MODE);

/**
 * Core Webhook Processing Engine (Reusable by Route & Manual Replay)
 */
export async function processRazorpayWebhookPayload(
  eventPayload: any,
  rawBuffer: Buffer | Uint8Array,
  signature: string,
  customStore?: ReturnType<typeof getWebhookEventStore>
): Promise<{ success: boolean; eventType: string; status: string; isDuplicate?: boolean; message?: string }> {
  const webhookStore = customStore || defaultWebhookStore;
  const eventId = eventPayload.id || eventPayload.payload?.payment?.entity?.id || `evt_${Date.now()}`;
  const eventType = eventPayload.event || 'unknown.event';
  const payloadHash = crypto.createHash('sha256').update(rawBuffer).digest('hex');

  // Durable idempotency check & processing lock acquisition
  const claimResult = await webhookStore.claimEvent(eventId, eventType, payloadHash, eventPayload);

  if (claimResult.isDuplicate) {
    return {
      success: true,
      eventType,
      status: claimResult.status,
      isDuplicate: true,
      message: claimResult.message,
    };
  }

  try {
    // Monotonic State Machine Transitions & Notification Triggers
    if (eventType === 'payment.authorized') {
      const paymentEntity = eventPayload.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        const order = getServerOrder(paymentEntity.order_id);
        if (order && order.status === 'CREATED') {
          order.status = 'AUTHORIZED';
          order.paymentId = paymentEntity.id;
        }
      }
    } else if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = eventPayload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || eventPayload.payload?.order?.entity?.id;
      if (orderId) {
        const order = getServerOrder(orderId);
        if (order) {
          // Monotonic check: do not re-process if already terminal PAID
          if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED' && order.status !== 'REFUNDED') {
            order.status = 'PAID';
            order.paymentId = paymentEntity?.id || order.paymentId || `pay_${Date.now()}`;
            order.verifiedAt = new Date().toISOString();

            // Dispatch passenger notification
            financialNotificationService.notifyPaymentCaptured(
              order.passengerId,
              order.bookingId,
              order.amountPaise,
              order.orderId
            );
          }
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = eventPayload.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        const order = getServerOrder(paymentEntity.order_id);
        if (order) {
          // Critical Guard: Monotonic integrity prevents downgrading a PAID order
          if (order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUNDED') {
            financialNotificationService.notifyAdminSuspiciousTransition(
              order.orderId,
              eventType,
              order.status
            );
          } else {
            order.status = 'FAILED';
            const failReason = paymentEntity.error_description || 'Payment authorization failed';
            financialNotificationService.notifyPaymentFailed(
              order.passengerId,
              order.bookingId,
              order.amountPaise,
              failReason,
              order.orderId
            );
          }
        }
      }
    } else if (eventType === 'refund.created') {
      const refundEntity = eventPayload.payload?.refund?.entity;
      if (refundEntity?.id) {
        const refund = getServerRefund(refundEntity.id);
        if (refund && refund.status === 'REQUESTED') {
          refund.status = 'SUBMITTED';
          refund.submittedAt = new Date().toISOString();
        }
      }
    } else if (eventType === 'refund.processed') {
      const refundEntity = eventPayload.payload?.refund?.entity;
      if (refundEntity?.id) {
        const refund = getServerRefund(refundEntity.id);
        if (refund && refund.status !== 'PROCESSED') {
          refund.status = 'PROCESSED';
          refund.processedAt = new Date().toISOString();
          refund.providerRefundId = refundEntity.id;

          // Adjust order refund balance
          const order = getServerOrder(refund.orderId);
          if (order) {
            order.refundedAmountPaise = (order.refundedAmountPaise || 0) + refund.amountPaise;
            if (order.refundedAmountPaise >= order.amountPaise) {
              order.status = 'REFUNDED';
            } else {
              order.status = 'PARTIALLY_REFUNDED';
            }

            financialNotificationService.notifyRefundProcessed(
              order.passengerId,
              order.bookingId,
              refund.amountPaise,
              refund.refundId
            );
          }
        }
      }
    } else if (eventType === 'refund.failed') {
      const refundEntity = eventPayload.payload?.refund?.entity;
      if (refundEntity?.id) {
        const refund = getServerRefund(refundEntity.id);
        if (refund) {
          refund.status = 'FAILED';
          const reason = refundEntity.error_description || 'Gateway bank refund failed';
          refund.failureReason = reason;

          const order = getServerOrder(refund.orderId);
          if (order) {
            financialNotificationService.notifyRefundFailed(
              order.passengerId,
              order.bookingId,
              refund.amountPaise,
              refund.refundId,
              reason
            );
          }
          financialNotificationService.notifyAdminWebhookFailure(eventId, eventType, reason);
        }
      }
    }

    // Mark event completed in durable store
    await webhookStore.completeEvent(eventId);
    return { success: true, eventType, status: 'COMPLETED' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown webhook execution exception';
    // Schedule retry with exponential backoff
    const retryResult = await webhookStore.scheduleRetry(eventId, errorMsg);
    if (retryResult.isDeadLetter) {
      financialNotificationService.notifyAdminWebhookFailure(
        eventId,
        eventType,
        `Exceeded max retries (${retryResult.retryCount}). Moved to DEAD_LETTER.`
      );
    }
    throw err;
  }
}

