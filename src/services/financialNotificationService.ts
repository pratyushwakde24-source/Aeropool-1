/**
 * AeroPool — Client-Side Financial Notification Helper
 * Wraps db.createNotification with strongly-typed financial event helpers.
 */
import { db } from './db';
import { AppNotification, NotificationType, NotificationCategory } from '../types';

export class ClientFinancialNotificationService {
  public notifyPaymentCaptured(passengerId: string, bookingId: string, amountPaise: number, orderId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return db.createNotification({
      userId: passengerId,
      userRole: 'passenger',
      category: 'PAYMENT' as NotificationCategory,
      title: 'Payment Confirmed',
      message: `Your payment of ₹${formattedAmount} for booking #${bookingId.slice(-6).toUpperCase()} has been captured successfully.`,
      type: 'SUCCESS' as NotificationType,
      link: `/app/bookings`,
      eventId: `pay_cap_${orderId}`,
      metadata: { bookingId, orderId, amountPaise },
    });
  }

  public notifyPaymentFailed(passengerId: string, bookingId: string, amountPaise: number, reason: string, orderId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return db.createNotification({
      userId: passengerId,
      userRole: 'passenger',
      category: 'PAYMENT' as NotificationCategory,
      title: 'Payment Failed',
      message: `Payment of ₹${formattedAmount} could not be processed. Reason: ${reason}. Please retry.`,
      type: 'ALERT' as NotificationType,
      link: `/app/book`,
      eventId: `pay_fail_${orderId}`,
      metadata: { bookingId, orderId, reason },
    });
  }

  public notifyRefundRequested(passengerId: string, bookingId: string, amountPaise: number, refundId: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return db.createNotification({
      userId: passengerId,
      userRole: 'passenger',
      category: 'REFUND' as NotificationCategory,
      title: 'Refund Requested',
      message: `A full refund of ₹${formattedAmount} has been initiated for booking #${bookingId.slice(-6).toUpperCase()}.`,
      type: 'INFO' as NotificationType,
      link: `/app/bookings`,
      eventId: `rfnd_req_${refundId}`,
      metadata: { bookingId, refundId, amountPaise },
    });
  }

  public notifyRefundProcessed(passengerId: string, bookingId: string, amountPaise: number, refundId: string, creditNoteNumber?: string) {
    const formattedAmount = (amountPaise / 100).toFixed(2);
    return db.createNotification({
      userId: passengerId,
      userRole: 'passenger',
      category: 'REFUND' as NotificationCategory,
      title: 'Refund Credited',
      message: `Refund of ₹${formattedAmount} has been processed by your bank.${creditNoteNumber ? ` Credit Note: ${creditNoteNumber}` : ''}`,
      type: 'SUCCESS' as NotificationType,
      link: `/app/bookings`,
      eventId: `rfnd_proc_${refundId}`,
      metadata: { bookingId, refundId, creditNoteNumber, amountPaise },
    });
  }

  public notifyDriverEarnings(driverId: string, tripId: string, driverNetPaise: number, tollPaise: number = 0) {
    const formattedNet = (driverNetPaise / 100).toFixed(2);
    const tollMsg = tollPaise > 0 ? ` (includes ₹${(tollPaise / 100).toFixed(2)} 100% toll pass-through)` : '';
    return db.createNotification({
      userId: driverId,
      userRole: 'driver',
      category: 'SETTLEMENT' as NotificationCategory,
      title: 'Trip Earnings Credited',
      message: `₹${formattedNet} credited to your driver wallet${tollMsg} for trip #${tripId.slice(-6).toUpperCase()}.`,
      type: 'SUCCESS' as NotificationType,
      link: `/app/driver`,
      eventId: `drv_earn_${tripId}`,
      metadata: { tripId, driverNetPaise, tollPaise },
    });
  }

  public notifyAdminDiscrepancy(discrepancyType: string, entityId: string, discrepancyPaise: number, description: string) {
    return db.createNotification({
      userId: 'admin_broadcast',
      userRole: 'admin',
      category: 'RECONCILIATION' as NotificationCategory,
      title: 'Financial Discrepancy Detected',
      message: `[${discrepancyType}] Discrepancy of ₹${(discrepancyPaise / 100).toFixed(2)} on entity ${entityId}: ${description}`,
      type: 'WARNING' as NotificationType,
      link: `/app/admin`,
      eventId: `adm_disc_${entityId}_${discrepancyType}`,
      metadata: { discrepancyType, entityId, discrepancyPaise },
    });
  }
}

export const clientFinancialNotificationService = new ClientFinancialNotificationService();

