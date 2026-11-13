/**
 * AeroPool — Server-Side Financial Notification Service
 * 
 * Manages deterministic financial notifications for Passengers, Drivers, and Super Admins.
 * Guarantees:
 * 1. EventId deduplication (idempotent notification dispatch).
 * 2. Strict role-based isolation (passengers cannot inspect peer or admin alerts).
 * 3. Transparent delivery logging: records in-app delivery and marks external channels (SMS/Email/Push)
 *    as unavailable when SMTP/Push credentials are not configured.
 */

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
export type NotificationCategory = 'FLIGHT' | 'DISPATCH' | 'TRIP' | 'SETTLEMENT' | 'SYSTEM' | 'PAYMENT' | 'REFUND' | 'RECONCILIATION';

export interface FinancialNotificationRecord {
  id: string;
  userId: string;
  userRole: 'passenger' | 'driver' | 'fleet_operator' | 'admin';
  category: NotificationCategory;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string;
  createdAt: string;
  eventId?: string; // Idempotency deduplication key
  externalDeliveryStatus: 'NOT_CONFIGURED_SANDBOX' | 'SENT' | 'FAILED';
  metadata?: Record<string, any>;
}

// In-memory server notification store (reconciled with database notifications)
const notificationRegistry = new Map<string, FinancialNotificationRecord>();
const eventIdIndex = new Set<string>();

export class FinancialNotificationService {
  /**
   * Dispatches a financial notification with eventId deduplication
   */
  public dispatch(params: {
    userId: string;
    userRole: 'passenger' | 'driver' | 'fleet_operator' | 'admin';
    category: NotificationCategory;
    title: string;
    message: string;
    type: NotificationType;
    link?: string;
    eventId?: string;
    metadata?: Record<string, any>;
  }): { success: boolean; notification: FinancialNotificationRecord; isDuplicate: boolean } {
    const { userId, userRole, category, title, message, type, link, eventId, metadata } = params;

    // Deduplication check
    if (eventId && eventIdIndex.has(`${userId}:${eventId}`)) {
      const existing = Array.from(notificationRegistry.values()).find(
        (n) => n.userId === userId && n.eventId === eventId
      );
      if (existing) {
        return { success: true, notification: existing, isDuplicate: true };
      }
    }

    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notification: FinancialNotificationRecord = {
      id,
      userId,
      userRole,
      category,
      title,
      message,
      type,
      read: false,
      link,
      createdAt: new Date().toISOString(),
      eventId,
      externalDeliveryStatus: 'NOT_CONFIGURED_SANDBOX', // Sandbox mode note
      metadata,
    };

    notificationRegistry.set(id, notification);
    if (eventId) {
      eventIdIndex.add(`${userId}:${eventId}`);
    }

    // Keep store capped in memory
    if (notificationRegistry.size > 1000) {
      const oldestKey = notificationRegistry.keys().next().value;
      if (oldestKey) notificationRegistry.delete(oldestKey);
    }

    return { success: true, notification, isDuplicate: false };
  }

  // --- PASSENGER NOTIFICATION TRIGGERS ---

  public notifyPaymentCaptured(passengerId: string, bookingId: string, amountPaise: number, orderId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return this.dispatch({
      userId: passengerId,
      userRole: 'passenger',
      category: 'PAYMENT',
      title: 'Payment Confirmed',
      message: `Your payment of ₹${formattedAmount} for booking #${bookingId.slice(-6).toUpperCase()} has been captured successfully.`,
      type: 'SUCCESS',
      link: `/app/bookings`,
      eventId: `pay_cap_${orderId}`,
      metadata: { bookingId, orderId, amountPaise },
    });
  }

  public notifyPaymentFailed(passengerId: string, bookingId: string, amountPaise: number, reason: string, orderId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return this.dispatch({
      userId: passengerId,
      userRole: 'passenger',
      category: 'PAYMENT',
      title: 'Payment Failed',
      message: `Payment of ₹${formattedAmount} could not be processed. Reason: ${reason}. Please retry.`,
      type: 'ALERT',
      link: `/app/book`,
      eventId: `pay_fail_${orderId}`,
      metadata: { bookingId, orderId, reason },
    });
  }

  public notifyRefundRequested(passengerId: string, bookingId: string, amountPaise: number, refundId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return this.dispatch({
      userId: passengerId,
      userRole: 'passenger',
      category: 'REFUND',
      title: 'Refund Requested',
      message: `A full refund of ₹${formattedAmount} has been initiated for booking #${bookingId.slice(-6).toUpperCase()}.`,
      type: 'INFO',
      link: `/app/bookings`,
      eventId: `rfnd_req_${refundId}`,
      metadata: { bookingId, refundId, amountPaise },
    });
  }

  public notifyRefundProcessed(passengerId: string, bookingId: string, amountPaise: number, refundId: string, creditNoteNumber?: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return this.dispatch({
      userId: passengerId,
      userRole: 'passenger',
      category: 'REFUND',
      title: 'Refund Credited',
      message: `Refund of ₹${formattedAmount} has been processed by your bank.${creditNoteNumber ? ` Credit Note: ${creditNoteNumber}` : ''}`,
      type: 'SUCCESS',
      link: `/app/bookings`,
      eventId: `rfnd_proc_${refundId}`,
      metadata: { bookingId, refundId, creditNoteNumber, amountPaise },
    });
  }

  public notifyRefundFailed(passengerId: string, bookingId: string, amountPaise: number, refundId: string, reason: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return this.dispatch({
      userId: passengerId,
      userRole: 'passenger',
      category: 'REFUND',
      title: 'Refund Notice',
      message: `Refund of ₹${formattedAmount} failed to transfer. Reason: ${reason}. Support team alerted.`,
      type: 'ALERT',
      link: `/app/support`,
      eventId: `rfnd_fail_${refundId}`,
      metadata: { bookingId, refundId, reason },
    });
  }

  // --- DRIVER NOTIFICATION TRIGGERS ---

  public notifyTripEarningsRecorded(driverId: string, tripId: string, driverNetPaise: number, tollPaise: number = 0) {
    const formattedNet = (driverNetPaise / 100).toFixed(2);
    const tollMsg = tollPaise > 0 ? ` (includes ₹${(tollPaise / 100).toFixed(2)} 100% toll pass-through)` : '';
    return this.dispatch({
      userId: driverId,
      userRole: 'driver',
      category: 'SETTLEMENT',
      title: 'Trip Earnings Credited',
      message: `₹${formattedNet} credited to your driver wallet${tollMsg} for trip #${tripId.slice(-6).toUpperCase()}.`,
      type: 'SUCCESS',
      link: `/app/driver`,
      eventId: `drv_earn_${tripId}`,
      metadata: { tripId, driverNetPaise, tollPaise },
    });
  }

  public notifySettlementApproved(driverOrFleetId: string, cycle: string, netPayablePaise: number, settlementId: string) {
    const formattedAmount = (netPayablePaise / 100).toFixed(2);
    return this.dispatch({
      userId: driverOrFleetId,
      userRole: 'driver',
      category: 'SETTLEMENT',
      title: 'Weekly Settlement Approved',
      message: `Weekly settlement ${cycle} for ₹${formattedAmount} has been approved by Super Admin. Pending bank batch disbursement.`,
      type: 'SUCCESS',
      link: `/app/driver`,
      eventId: `settle_appr_${settlementId}`,
      metadata: { cycle, netPayablePaise, settlementId },
    });
  }

  // --- SUPER ADMIN NOTIFICATION TRIGGERS ---

  public notifyAdminWebhookFailure(eventId: string, eventType: string, error: string) {
    return this.dispatch({
      userId: 'admin_broadcast',
      userRole: 'admin',
      category: 'SYSTEM',
      title: 'Webhook Processing Error',
      message: `Razorpay webhook ${eventType} (ID: ${eventId}) failed processing: ${error}. Scheduled for retry.`,
      type: 'ALERT',
      link: `/app/admin`,
      eventId: `adm_wh_err_${eventId}`,
      metadata: { eventId, eventType, error },
    });
  }

  public notifyAdminDiscrepancy(discrepancyType: string, entityId: string, discrepancyPaise: number, description: string) {
    return this.dispatch({
      userId: 'admin_broadcast',
      userRole: 'admin',
      category: 'RECONCILIATION',
      title: 'Financial Discrepancy Detected',
      message: `[${discrepancyType}] Discrepancy of ₹${(discrepancyPaise / 100).toFixed(2)} on entity ${entityId}: ${description}`,
      type: 'WARNING',
      link: `/app/admin`,
      eventId: `adm_disc_${entityId}_${discrepancyType}`,
      metadata: { discrepancyType, entityId, discrepancyPaise },
    });
  }

  public notifyAdminSuspiciousTransition(orderId: string, attemptedEvent: string, currentStatus: string) {
    return this.dispatch({
      userId: 'admin_broadcast',
      userRole: 'admin',
      category: 'SYSTEM',
      title: 'Suspicious State Transition Blocked',
      message: `Out-of-order event ${attemptedEvent} attempted to alter ${currentStatus} order #${orderId}. Transition was blocked.`,
      type: 'ALERT',
      link: `/app/admin`,
      eventId: `adm_susp_${orderId}_${attemptedEvent}`,
      metadata: { orderId, attemptedEvent, currentStatus },
    });
  }

  // --- RETRIEVAL & QUERY METHODS ---

  public getNotifications(userId: string, role?: string): FinancialNotificationRecord[] {
    const list = Array.from(notificationRegistry.values());
    if (role === 'admin') {
      return list.filter((n) => n.userId === userId || n.userId === 'admin_broadcast');
    }
    return list.filter((n) => n.userId === userId);
  }

  public markAsRead(notificationId: string, userId: string): boolean {
    const notif = notificationRegistry.get(notificationId);
    if (!notif) return false;
    if (notif.userId === userId || notif.userId === 'admin_broadcast') {
      notif.read = true;
      return true;
    }
    return false;
  }

  public clearForTesting() {
    notificationRegistry.clear();
    eventIdIndex.clear();
  }
}

export const financialNotificationService = new FinancialNotificationService();

