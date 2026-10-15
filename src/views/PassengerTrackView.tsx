import React, { useState } from 'react';
import {
  ArrowLeft,
  PhoneCall,
  Share2,
  ShieldAlert,
  MapPin,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Sparkles,
  XCircle,
  FileText
} from 'lucide-react';
import { db } from '../services/db';
import { InteractiveMap } from '../components/InteractiveMap';
import { SafetyModal } from '../components/SafetyModal';
import { formatINR } from '../services/pricingEngine';
import { RideStatus } from '../types';

interface PassengerTrackViewProps {
  bookingId?: string;
  onNavigate: (route: string) => void;
}

export const PassengerTrackView: React.FC<PassengerTrackViewProps> = ({
  bookingId,
  onNavigate,
}) => {
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('Change of airport plans');

  const currentUser = db.getState().currentUser;
  const bookingLookup = bookingId
    ? db.getBookingById(bookingId, currentUser.id, currentUser.role)
    : (() => {
        const userBookings = db.getBookingsForUser(currentUser.id, currentUser.role);
        return userBookings.length > 0
          ? { success: true, booking: userBookings[0] }
          : { success: false, error: 'No active booking found for current account.' };
      })();

  if (!bookingLookup.success || !bookingLookup.booking) {
    const isSecurityRestricted =
      bookingLookup.error?.includes('Security Notice') ||
      bookingLookup.error?.includes('restricted') ||
      bookingLookup.error?.includes('permission');
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center justify-center space-y-4">
        {isSecurityRestricted ? (
          <ShieldAlert className="w-12 h-12 text-red-400" />
        ) : (
          <AlertTriangle className="w-12 h-12 text-amber-400" />
        )}
        <h2 className="text-lg font-bold text-white">
          {isSecurityRestricted ? 'Access Denied (Row Level Security)' : 'No Active Booking Found'}
        </h2>
        <p className="text-xs text-slate-400 max-w-md text-center">
          {bookingLookup.error || 'Please book an airport ride first or check your booking history.'}
        </p>
        <button
          onClick={() => onNavigate('/app/bookings')}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
        >
          View My Bookings
        </button>
      </div>
    );
  }

  const currentBooking = bookingLookup.booking;
  const pool = db.getState().pools.find((p) => p.id === currentBooking.poolId);

  const statusProgressSteps: { status: RideStatus; label: string }[] = [
    { status: 'CONFIRMED', label: 'Pool Confirmed' },
    { status: 'DRIVER_EN_ROUTE', label: 'Driver En Route' },
    { status: 'DRIVER_ARRIVED', label: 'Arrived at Pillar' },
    { status: 'PICKUP_CONFIRMED', label: 'OTP Boarded' },
    { status: 'IN_PROGRESS', label: 'On Expressway' },
    { status: 'COMPLETED', label: 'Completed' },
  ];

  const currentStatusIdx = statusProgressSteps.findIndex((s) => s.status === currentBooking.bookingStatus);

  const handleCancelBooking = () => {
    const res = db.cancelBooking(currentBooking.id, cancelReason, currentUser.id, currentUser.role);
    if (res.success) {
      setShowCancelModal(false);
      onNavigate('/app/bookings');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header & Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/app/bookings')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>My Bookings</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSafetyModal(true)}
              className="px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Safety & SOS</span>
            </button>
          </div>
        </div>

        {/* Live Status Header Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <h1 className="text-lg font-bold text-white capitalize">
                  {currentBooking.bookingStatus.replace(/_/g, ' ')}
                </h1>
                <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                  #{currentBooking.id.slice(-6)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Flight {currentBooking.flightNumber} • Destination {currentBooking.destination.name}
              </p>
            </div>

            {/* OTP Boarding Badge */}
            <div className="bg-gradient-to-r from-blue-900/60 to-indigo-950 border border-blue-500/30 p-3 rounded-xl flex items-center gap-3">
              <QrCode className="w-8 h-8 text-sky-400 shrink-0" />
              <div>
                <div className="text-[10px] text-blue-300 font-semibold uppercase tracking-wider">Boarding Pass OTP</div>
                <div className="text-xl font-mono font-extrabold text-white tracking-widest">
                  {currentBooking.pickupOtp}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="w-full pt-2">
            <div className="grid grid-cols-6 gap-1 text-center">
              {statusProgressSteps.map((s, idx) => {
                const isPassed = currentStatusIdx >= idx;
                const isCurrent = currentStatusIdx === idx;
                return (
                  <div key={s.status} className="space-y-1">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        isPassed ? 'bg-sky-500 shadow-sm shadow-sky-500/50' : 'bg-slate-800'
                      }`}
                    />
                    <div
                      className={`text-[10px] font-medium hidden sm:block truncate ${
                        isCurrent ? 'text-sky-400 font-bold' : isPassed ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Vector Map */}
        <InteractiveMap
          pickupZone={pool?.pickupZone}
          destination={currentBooking.destination}
          vehiclePlate={currentBooking.vehiclePlate || 'MH 02 EE 8421'}
          vehicleModel={currentBooking.vehicleModel || 'Toyota Innova Crysta'}
          isSimulatedDemo={true}
          heightClass="h-72 sm:h-84"
        />

        {/* Pickup Zone Instructions Card */}
        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Designated Airport Pickup Bay</div>
              <div className="text-xs text-sky-300 font-medium">{currentBooking.pickupZoneName}</div>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
            {currentBooking.pickupInstructions}
          </p>
        </div>

        {/* Assigned Driver & Vehicle Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"
                  alt="Driver"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{currentBooking.driverName || 'Rajesh Patil'}</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    ★ 4.92 Verified
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{currentBooking.vehicleModel || 'Toyota Innova Crysta'}</span>
                  <span>•</span>
                  <span className="font-mono text-sky-400 font-bold">{currentBooking.vehiclePlate || 'MH 02 EE 8421'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <a
                href={`tel:${currentBooking.driverPhone || '+919819233104'}`}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              >
                <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
                <span>Call Driver</span>
              </a>
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition"
              >
                Cancel Ride
              </button>
            </div>
          </div>
        </div>

        {/* Fare Summary */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs text-slate-400">
          <div>
            <span>Paid Fare: </span>
            <strong className="text-white font-mono">{formatINR(currentBooking.farePaise)}</strong>
            <span className="text-emerald-400 ml-2 font-semibold">(Saved {formatINR(currentBooking.savingsPaise)})</span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Status: <span className="text-emerald-400 font-bold uppercase">{currentBooking.paymentStatus}</span>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              <span>Cancel Shared Ride Booking?</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              According to AeroPool policy, cancellations prior to 15 minutes before pickup are eligible for a <strong>100% full refund</strong> of {formatINR(currentBooking.farePaise)}.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Reason for Cancellation</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
              >
                <option value="Flight schedule changed">Flight schedule changed</option>
                <option value="Met friend or family at airport">Met friend or family at airport</option>
                <option value="Destination changed">Destination changed</option>
                <option value="Other personal reasons">Other personal reasons</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancelBooking}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                Confirm Cancellation & Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety & SOS Modal */}
      <SafetyModal
        isOpen={showSafetyModal}
        bookingId={currentBooking.id}
        passengerName={currentBooking.passengerName}
        driverPhone={currentBooking.driverPhone}
        onClose={() => setShowSafetyModal(false)}
      />
    </div>
  );
};
