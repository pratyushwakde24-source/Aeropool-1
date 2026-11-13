import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Download,
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText,
  Printer,
  Ban,
  AlertTriangle,
  RotateCcw,
  Receipt,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Navigation,
  Car
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { Booking, PaymentRecord } from '../types';

interface PassengerBookingsViewProps {
  onNavigate: (route: string) => void;
  onSelectBooking: (bookingId: string) => void;
}

export const PassengerBookingsView: React.FC<PassengerBookingsViewProps> = ({
  onNavigate,
  onSelectBooking,
}) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Booking | null>(null);
  const [selectedRefundReceipt, setSelectedRefundReceipt] = useState<{
    booking: Booking;
    payment?: PaymentRecord;
  } | null>(null);

  // Filter & Refresh State
  const [activeTab, setActiveTab] = useState<'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedOtpId, setCopiedOtpId] = useState<string | null>(null);

  // Cancellation State
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Flight delayed or rescheduled by airline');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reactive DB subscription
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  const currentUser = db.getState().currentUser;

  if (!currentUser) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <Clock className="w-12 h-12 text-slate-500 mx-auto" />
          <h2 className="text-xl font-extrabold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400">Please sign in to view your airport ride bookings.</p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const bookings = db.getBookingsForUser(currentUser.id, currentUser.role);
  const upcomingCount = bookings.filter(
    (b) => b.bookingStatus !== 'COMPLETED' && b.bookingStatus !== 'CANCELLED'
  ).length;
  const completedCount = bookings.filter((b) => b.bookingStatus === 'COMPLETED').length;
  const cancelledCount = bookings.filter((b) => b.bookingStatus === 'CANCELLED').length;

  const filteredBookings = bookings.filter((b) => {
    if (activeTab === 'UPCOMING') {
      return b.bookingStatus !== 'COMPLETED' && b.bookingStatus !== 'CANCELLED';
    }
    if (activeTab === 'COMPLETED') {
      return b.bookingStatus === 'COMPLETED';
    }
    if (activeTab === 'CANCELLED') {
      return b.bookingStatus === 'CANCELLED';
    }
    return true;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setTick((prev) => prev + 1);
    setIsRefreshing(false);
  };

  const handleCopyOtp = (bookingId: string, otp: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(otp);
      setCopiedOtpId(bookingId);
      setTimeout(() => setCopiedOtpId(null), 2000);
    }
  };

  const handleOpenCancelModal = (booking: Booking) => {
    setCancellingBooking(booking);
    setCancelReason('Flight delayed or rescheduled by airline');
    setCustomReason('');
    setCancelFeedback(null);
  };

  const handleConfirmCancellation = async () => {
    if (!cancellingBooking) return;
    setIsSubmittingCancel(true);
    setCancelFeedback(null);

    const finalReason = cancelReason === 'Other' && customReason.trim()
      ? customReason.trim()
      : cancelReason;

    try {
      const res = await db.cancelBookingAsync(
        cancellingBooking.id,
        finalReason,
        currentUser.id,
        currentUser.role
      );

      if (res.success) {
        setCancelFeedback({
          type: 'success',
          message: `Booking #${cancellingBooking.id.slice(-6)} successfully cancelled. A 100% full refund of ${formatINR(cancellingBooking.farePaise)} has been credited to your payment ledger.`,
        });
        setCancellingBooking(null);
      } else {
        setCancelFeedback({
          type: 'error',
          message: res.error || 'Failed to cancel booking. Please try again or contact support.',
        });
      }
    } catch (e) {
      setCancelFeedback({
        type: 'error',
        message: e instanceof Error ? e.message : 'Cancellation request failed.',
      });
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex items-center justify-between pb-2">
          <button
            onClick={() => onNavigate('/app')}
            className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1.5 transition px-3 py-1.5 rounded-xl hover:bg-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Passenger Dashboard</span>
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 rounded-xl glass-panel hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition flex items-center gap-1.5 shadow"
              title="Refresh Bookings from Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => onNavigate('/app/book')}
              className="h-10 px-5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-1.5 active:scale-[0.98]"
            >
              <span>Book New Ride</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Airport Bookings</h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Live tracking, OTP boarding passes, automated full cancellation refunds, and GST tax receipts.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
          {[
            { id: 'ALL', label: 'All Bookings', count: bookings.length },
            { id: 'UPCOMING', label: 'Upcoming / Active', count: upcomingCount },
            { id: 'COMPLETED', label: 'Completed', count: completedCount },
            { id: 'CANCELLED', label: 'Cancelled', count: cancelledCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-sky-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Global Feedback Alert */}
        {cancelFeedback && (
          <div
            className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs animate-in fade-in ${
              cancelFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {cancelFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{cancelFeedback.message}</span>
            </div>
            <button
              onClick={() => setCancelFeedback(null)}
              className="text-slate-400 hover:text-white font-mono text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
          <div className="p-12 text-center glass-panel border border-slate-800 rounded-3xl space-y-3 shadow-xl">
            <Clock className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-white">
              {activeTab === 'ALL'
                ? 'No Airport Bookings Yet'
                : `No ${activeTab.charAt(0) + activeTab.slice(1).toLowerCase()} Bookings Found`}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              {activeTab === 'ALL'
                ? "You haven't booked any shared airport rides from CSMIA Mumbai yet. Book your first ride to save up to 40%."
                : `There are currently no bookings matching the "${activeTab.toLowerCase()}" filter.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const isActive =
                booking.bookingStatus !== 'COMPLETED' && booking.bookingStatus !== 'CANCELLED';
              const isCancellable = [
                'REQUESTED',
                'MATCHED',
                'CONFIRMED',
                'DRIVER_ASSIGNED',
                'DRIVER_EN_ROUTE',
                'DRIVER_ARRIVED',
              ].includes(booking.bookingStatus);
              const isCancelled = booking.bookingStatus === 'CANCELLED';
              const payment = db.getState().payments.find((p) => p.bookingId === booking.id);

              return (
                <div
                  key={booking.id}
                  className={`p-6 glass-panel border rounded-3xl transition space-y-5 shadow-xl ${
                    isActive
                      ? 'border-sky-500/40 shadow-sky-500/5'
                      : isCancelled
                      ? 'border-slate-800/80 bg-slate-950/40 opacity-80'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-extrabold text-white font-mono">
                        Flight {booking.flightNumber}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          isCancelled
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : booking.bookingStatus === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse'
                        }`}
                      >
                        {booking.bookingStatus.replace(/_/g, ' ')}
                      </span>
                      {isCancelled && payment?.status === 'refunded' && (
                        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          100% Refunded
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-mono text-slate-400">
                      Booked{' '}
                      {new Date(booking.createdAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px] font-medium">CSMIA Terminal & Pickup Bay</div>
                      <div className="text-white font-bold text-sm mt-0.5">{booking.pickupZoneName}</div>
                      {!isCancelled ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-cyan-300 font-mono font-bold bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60">
                            OTP: {booking.pickupOtp}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyOtp(booking.id, booking.pickupOtp)}
                            className="text-[11px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 transition flex items-center gap-1"
                            title="Copy Pickup OTP for Driver"
                          >
                            {copiedOtpId === booking.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-sans font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="font-sans font-semibold">Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 font-mono mt-1">
                          Capacity Restored to Pool
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px] font-medium">Drop-Off Destination</div>
                      <div className="text-white font-bold text-sm mt-0.5">{booking.destination.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{booking.destination.corridor}</div>
                    </div>

                    <div className="sm:text-right">
                      <div className="text-slate-400 text-[11px] font-medium">
                        {isCancelled ? 'Refunded Fare' : 'Paid Fare (Incl. GST)'}
                      </div>
                      <div
                        className={`text-lg font-extrabold font-mono mt-0.5 ${
                          isCancelled ? 'text-slate-400 line-through' : 'text-white'
                        }`}
                      >
                        {formatINR(booking.farePaise)}
                      </div>
                      {!isCancelled && (
                        <div className="text-xs text-emerald-400 font-bold">
                          Saved {formatINR(booking.savingsPaise)} vs solo taxi
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBooking(booking.id);
                            onNavigate(`/app/track/${booking.id}`);
                          }}
                          className="h-9 px-4 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-[0.98]"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Track Live Ride</span>
                        </button>
                      )}

                      {!isCancelled && (
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(booking)}
                          className="h-9 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                        >
                          <Receipt className="w-3.5 h-3.5 text-sky-400" />
                          <span>Tax Invoice</span>
                        </button>
                      )}

                      {isCancelled && (
                        <button
                          type="button"
                          onClick={() => setSelectedRefundReceipt({ booking, payment })}
                          className="h-9 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Refund Credit Note</span>
                        </button>
                      )}
                    </div>

                    {isCancellable && (
                      <button
                        type="button"
                        onClick={() => handleOpenCancelModal(booking)}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-xl transition"
                      >
                        Cancel Ride & Full Refund
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancellingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingCancel) setCancellingBooking(null);
          }}
        >
          <div className="glass-panel border border-slate-800 text-slate-100 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">Cancel Airport Ride</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Booking #{cancellingBooking.id.slice(-6)} • Flight {cancellingBooking.flightNumber}
                  </p>
                </div>
              </div>
              <button
                disabled={isSubmittingCancel}
                onClick={() => setCancellingBooking(null)}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* 100% Refund Policy Banner */}
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>100% Full Refund Guarantee</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Because your ride has not yet boarded at CSMIA Mumbai, 100% of your paid fare of{' '}
                <strong className="text-white font-mono">{formatINR(cancellingBooking.farePaise)}</strong>{' '}
                (including GST and parking fees) will be automatically credited back to your original payment method.
              </p>
            </div>

            {/* Itinerary Summary */}
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Terminal & Pickup:</span>
                <span className="font-bold text-slate-200">{cancellingBooking.pickupZoneName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Destination:</span>
                <span className="font-bold text-slate-200">{cancellingBooking.destination.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Seats Reserved:</span>
                <span>{cancellingBooking.seatsBooked} Seat(s) (will be restored to pool)</span>
              </div>
            </div>

            {/* Reason Selection */}
            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-bold uppercase tracking-wider">
                Reason for Cancellation:
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="Flight delayed or rescheduled by airline">Flight delayed or rescheduled by airline</option>
                <option value="Flight diverted or cancelled">Flight diverted or cancelled</option>
                <option value="Found alternative airport transport">Found alternative airport transport</option>
                <option value="Selected incorrect terminal or arrival time">Selected incorrect terminal or arrival time</option>
                <option value="Other">Other reason (specify below)</option>
              </select>

              {cancelReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Please state the reason for cancellation..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-sky-500 mt-2"
                />
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={() => setCancellingBooking(null)}
                className="h-11 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Keep Booking
              </button>
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={handleConfirmCancellation}
                className="h-11 px-6 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs font-extrabold rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center gap-2"
              >
                {isSubmittingCancel ? (
                  <span>Processing Refund...</span>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Confirm Cancel & Refund {formatINR(cancellingBooking.farePaise)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Tax Invoice Modal */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedInvoice(null);
          }}
        >
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">AeroPool Mobility</h3>
                <p className="text-xs text-slate-500 font-mono">GSTIN: 27AABCM8291Q1Z4 • CSMIA Mumbai Hub</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice ID:</span>
                <span className="font-mono font-bold">INV-{selectedInvoice.id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Passenger:</span>
                <span className="font-bold">{selectedInvoice.passengerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trip Date:</span>
                <span>{new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment ID:</span>
                <span className="font-mono">{selectedInvoice.paymentId}</span>
              </div>
            </div>

            <div className="border-t border-b py-3 space-y-2 text-xs">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Description</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pooled Airport Transit ({selectedInvoice.destination.name})</span>
                <span className="font-mono">
                  {formatINR(selectedInvoice.farePaise - Math.round(selectedInvoice.farePaise * 0.05))}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST (CGST 2.5% + SGST 2.5%)</span>
                <span className="font-mono">
                  {formatINR(Math.round(selectedInvoice.farePaise * 0.05))}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-slate-900 pt-2 border-t text-sm">
                <span>Total Paid (INR):</span>
                <span className="font-mono">{formatINR(selectedInvoice.farePaise, true)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              This is an authorized computer-generated tax invoice for shared passenger mobility.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.warn('Print preview blocked:', e);
                  }
                }}
                className="h-10 px-5 bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Print Tax Invoice</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Refund Credit Note Modal */}
      {selectedRefundReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRefundReceipt(null);
          }}
        >
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-slate-900">AeroPool Mobility</h3>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                    CREDIT NOTE
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">Refund Reference: RFN-{selectedRefundReceipt.booking.id.slice(-8).toUpperCase()}</p>
              </div>
              <button
                onClick={() => setSelectedRefundReceipt(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Passenger:</span>
                <span className="font-bold">{selectedRefundReceipt.booking.passengerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Original Booking:</span>
                <span className="font-mono">#{selectedRefundReceipt.booking.id.slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Refund Status:</span>
                <span className="font-bold text-emerald-700 uppercase">Processed (100% Credit)</span>
              </div>
            </div>

            <div className="border-t border-b py-3 space-y-2 text-xs">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Refunded Component</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Original Fare & Platform Fee</span>
                <span className="font-mono">{formatINR(selectedRefundReceipt.booking.farePaise)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-emerald-700 pt-2 border-t text-sm">
                <span>Total Refund Credited:</span>
                <span className="font-mono">{formatINR(selectedRefundReceipt.booking.farePaise, true)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              Credit note generated under AeroPool 100% Airport Cancellation Policy.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.warn('Print preview blocked:', e);
                  }
                }}
                className="h-10 px-5 bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Print Credit Note</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
