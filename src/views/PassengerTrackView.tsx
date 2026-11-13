import React, { useState, useEffect } from 'react';
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
  FileText,
  Navigation,
  Activity,
  Compass,
  Radio,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { db } from '../services/db';
import { InteractiveMap } from '../components/InteractiveMap';
import { SafetyModal } from '../components/SafetyModal';
import { formatINR } from '../services/pricingEngine';
import { RideStatus } from '../types';
import { realtimeGpsService } from '../services/maps';

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
  const [showBreadcrumbsLog, setShowBreadcrumbsLog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copiedOtp, setCopiedOtp] = useState(false);

  // Subscribe to real-time database updates for driver telemetry
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = db.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const currentUser = db.getState().currentUser;

  if (!currentUser) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-sky-400 mx-auto" />
          <h2 className="text-xl font-extrabold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400 max-w-md text-center leading-relaxed">
            Please sign in to your passenger account to track your airport ride.
          </p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
          >
            Return to Landing Page
          </button>
        </div>
      </div>
    );
  }

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
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          {isSecurityRestricted ? (
            <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          ) : (
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          )}
          <h2 className="text-xl font-extrabold text-white">
            {isSecurityRestricted ? 'Access Denied (Row Level Security)' : 'No Active Booking Found'}
          </h2>
          <p className="text-xs text-slate-400 max-w-md text-center leading-relaxed">
            {bookingLookup.error || 'Please book an airport ride first or check your booking history.'}
          </p>
          <button
            onClick={() => onNavigate('/app/bookings')}
            className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
          >
            View My Bookings
          </button>
        </div>
      </div>
    );
  }

  const currentBooking = bookingLookup.booking;
  const pool = db.getState().pools.find((p) => p.id === currentBooking.poolId);

  // Subscribe to real-time WebSocket channel for this active pool
  useEffect(() => {
    if (!currentBooking?.poolId || !currentUser?.id) return;
    const unsub = realtimeGpsService.subscribePoolTelemetry(
      currentBooking.poolId,
      currentUser.id,
      () => setTick((t) => t + 1)
    );
    return unsub;
  }, [currentBooking?.poolId, currentUser?.id]);

  // Retrieve authorized driver telemetry with privacy safeguards
  const telemetry = pool
    ? db.getPoolLocationTelemetry(pool.id, currentUser.id, currentUser.role)
    : { success: false, isConcluded: false, breadcrumbs: [], isStale: false };

  const currentLoc = telemetry.driverCurrentLocation;
  const breadcrumbs = telemetry.breadcrumbs || [];
  const isConcluded = telemetry.isConcluded || currentBooking.bookingStatus === 'COMPLETED' || currentBooking.bookingStatus === 'CANCELLED';

  const statusProgressSteps: { status: RideStatus; label: string }[] = [
    { status: 'CONFIRMED', label: 'Pool Confirmed' },
    { status: 'DRIVER_EN_ROUTE', label: 'Driver En Route' },
    { status: 'DRIVER_ARRIVED', label: 'At Pickup Bay' },
    { status: 'PICKUP_CONFIRMED', label: 'OTP Boarded' },
    { status: 'IN_PROGRESS', label: 'Expressway' },
    { status: 'COMPLETED', label: 'Completed' },
  ];

  const currentStatusIdx = statusProgressSteps.findIndex((s) => s.status === currentBooking.bookingStatus);

  const handleCopyOtp = () => {
    if (currentBooking.pickupOtp) {
      navigator.clipboard.writeText(currentBooking.pickupOtp);
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2000);
    }
  };

  const handleCancelBooking = async () => {
    setIsCancelling(true);
    setCancelError(null);
    try {
      const res = await db.cancelBookingAsync(currentBooking.id, cancelReason, currentUser.id, currentUser.role);
      if (res.success) {
        setShowCancelModal(false);
        onNavigate('/app/bookings');
      } else {
        setCancelError(res.error || 'Failed to cancel booking. Please try again.');
      }
    } catch (e: any) {
      setCancelError(e.message || 'Cancellation request encountered an unexpected error.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getTelemetryAgeText = () => {
    if (!currentLoc?.updatedAt) return 'No live telemetry';
    const ageSec = Math.max(0, Math.floor((Date.now() - new Date(currentLoc.updatedAt).getTime()) / 1000));
    if (ageSec < 5) return 'Just now (live feed)';
    if (ageSec < 60) return `Updated ${ageSec}s ago`;
    return `Updated ${Math.floor(ageSec / 60)}m ago`;
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Header & Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/app/bookings')}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition px-3 py-1.5 rounded-xl hover:bg-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>My Bookings</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowSafetyModal(true)}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition shadow-sm active:scale-[0.98]"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Safety & SOS</span>
            </button>
          </div>
        </div>

        {/* Live Status Header Banner */}
        <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full ${isConcluded ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`} />
                <h1 className="text-xl sm:text-2xl font-extrabold text-white capitalize tracking-tight">
                  {currentBooking.bookingStatus.replace(/_/g, ' ')}
                </h1>
                <span className="text-xs font-mono font-bold bg-slate-800/80 text-cyan-300 px-2.5 py-0.5 rounded-lg border border-slate-700/60">
                  #{currentBooking.id.slice(-6)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Flight {currentBooking.flightNumber} • Destination {currentBooking.destination.name}
              </p>
            </div>

            {/* High-Contrast OTP Boarding Pass Card */}
            <div className="bg-gradient-to-br from-cyan-950/60 via-slate-900 to-sky-950/60 border border-cyan-500/30 p-4 rounded-2xl flex items-center justify-between sm:justify-start gap-4 shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-widest">
                  Boarding OTP
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white tracking-widest">
                  {currentBooking.pickupOtp}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyOtp}
                title="Copy OTP"
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 ml-2"
              >
                {copiedOtp ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="w-full pt-2">
            <div className="grid grid-cols-6 gap-2 text-center">
              {statusProgressSteps.map((s, idx) => {
                const isPassed = currentStatusIdx >= idx;
                const isCurrent = currentStatusIdx === idx;
                return (
                  <div key={s.status} className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isPassed
                          ? 'bg-gradient-to-r from-sky-500 to-cyan-400 shadow-sm shadow-sky-500/50'
                          : 'bg-slate-800'
                      }`}
                    />
                    <div
                      className={`text-[11px] font-semibold hidden sm:block truncate ${
                        isCurrent ? 'text-cyan-300 font-extrabold' : isPassed ? 'text-slate-300' : 'text-slate-600'
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

        {/* Interactive Vector Map with Realtime Telemetry */}
        <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
          <InteractiveMap
            pickupZone={pool?.pickupZone}
            destination={currentBooking.destination}
            driverLocation={currentLoc ? { ...currentLoc, isStale: telemetry.isStale } : undefined}
            breadcrumbs={breadcrumbs}
            isConcluded={isConcluded}
            vehiclePlate={currentBooking.vehiclePlate || 'MH 02 EE 8421'}
            vehicleModel={currentBooking.vehicleModel || 'Toyota Innova Crysta'}
            isSimulatedDemo={currentLoc?.source !== 'REAL_GPS'}
            heightClass="h-72 sm:h-96"
          />
        </div>

        {/* Live Driver Telemetry HUD */}
        {!isConcluded && currentLoc ? (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Live Telemetry Stream
                    </h3>
                    {currentLoc.source === 'REAL_GPS' ? (
                      <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        <span>Real Device GPS (±{currentLoc.accuracyMeters || 5}m)</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        Demo Route Stream
                      </span>
                    )}

                    {telemetry.isStale && (
                      <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Signal Stale (&gt;30s)</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    {currentLoc.lat.toFixed(5)}° N, {currentLoc.lng.toFixed(5)}° E • {getTelemetryAgeText()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block font-sans">Speed</span>
                  <strong className="text-emerald-400 text-sm font-bold">{currentLoc.speedKmph || 0} km/h</strong>
                </div>
                <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block font-sans">Bearing</span>
                  <strong className="text-cyan-300 text-sm font-bold">{currentLoc.heading || 0}°</strong>
                </div>
                <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block font-sans">Points</span>
                  <strong className="text-white text-sm font-bold">{breadcrumbs.length}</strong>
                </div>
              </div>
            </div>

            {/* Breadcrumb Trail Inspector Toggle */}
            {breadcrumbs.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowBreadcrumbsLog(!showBreadcrumbsLog)}
                  className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white py-1 transition"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Navigation className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Recorded GPS Trail ({breadcrumbs.length} coordinates)</span>
                  </span>
                  {showBreadcrumbsLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showBreadcrumbsLog && (
                  <div className="mt-3 bg-slate-950/90 rounded-2xl p-3 border border-slate-800 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                    {breadcrumbs.map((b, idx) => (
                      <div key={b.id || idx} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-900 text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">#{idx + 1}</span>
                          <span>{b.lat.toFixed(4)}°N, {b.lng.toFixed(4)}°E</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-sans">
                            {b.source === 'REAL_GPS' ? 'REAL' : 'DEMO'}
                          </span>
                        </div>
                        <div className="text-slate-400 font-sans text-xs">
                          {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : isConcluded ? (
          <div className="glass-panel border border-slate-800/90 rounded-2xl p-5 flex items-center gap-3 text-xs text-slate-300">
            <Clock className="w-5 h-5 text-slate-500 shrink-0" />
            <div>
              <strong className="text-white block font-bold">Trip Concluded</strong>
              <span>Live driver telemetry and GPS stream has finished.</span>
            </div>
          </div>
        ) : (
          <div className="glass-panel border border-slate-800/90 rounded-2xl p-5 flex items-center gap-3 text-xs text-slate-300">
            <Radio className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <strong className="text-white block font-bold uppercase tracking-wider">Awaiting GPS Signal</strong>
              <span className="text-slate-400 text-xs">
                Your assigned commercial driver will connect telemetry shortly. OTP is ready for pickup bay boarding.
              </span>
            </div>
          </div>
        )}

        {/* Pickup Zone Instructions Card */}
        <div className="glass-panel border border-sky-500/30 rounded-3xl p-6 space-y-3 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Designated Airport Pickup Bay</div>
              <div className="text-base font-extrabold text-white mt-0.5">{currentBooking.pickupZoneName}</div>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            {currentBooking.pickupInstructions}
          </p>
        </div>

        {/* Assigned Driver & Vehicle Details */}
        <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                {currentBooking.driverName ? (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-600/30 to-sky-600/30 text-emerald-300 flex items-center justify-center font-extrabold text-lg">
                    {currentBooking.driverName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                ) : (
                  <Car className="w-7 h-7 text-slate-500" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-extrabold text-white">
                    {currentBooking.driverName || 'Awaiting Driver Assignment'}
                  </span>
                  {currentBooking.driverName ? (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      Commercial RTO Verified
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                      Matching in Bay...
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                  {currentBooking.vehicleModel ? (
                    <>
                      <span>{currentBooking.vehicleModel}</span>
                      {currentBooking.vehiclePlate && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-cyan-300 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                            {currentBooking.vehiclePlate}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">Vehicle details will appear once assigned by airport dispatcher</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentBooking.driverPhone ? (
                <a
                  href={`tel:${currentBooking.driverPhone}`}
                  className="h-11 px-5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition border border-slate-700"
                >
                  <PhoneCall className="w-4 h-4 text-cyan-400" />
                  <span>Call Driver</span>
                </a>
              ) : (
                <button
                  disabled
                  className="h-11 px-5 bg-slate-900 text-slate-500 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-800 cursor-not-allowed"
                >
                  <PhoneCall className="w-4 h-4 text-slate-600" />
                  <span>Call Driver</span>
                </button>
              )}
              <button
                onClick={() => setShowCancelModal(true)}
                className="h-11 px-4 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition"
              >
                Cancel Ride
              </button>
            </div>
          </div>
        </div>

        {/* Fare Summary Pill */}
        <div className="glass-panel border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400 shadow-md">
          <div>
            <span>Paid Fare: </span>
            <strong className="text-white font-mono text-sm">{formatINR(currentBooking.farePaise)}</strong>
            <span className="text-emerald-400 ml-2 font-bold">(Saved {formatINR(currentBooking.savingsPaise)})</span>
          </div>
          <div className="font-mono text-xs">
            Payment: <span className="text-emerald-400 font-bold uppercase">{currentBooking.paymentStatus}</span>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCancelling) setShowCancelModal(false);
          }}
        >
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2 text-rose-400">
              <XCircle className="w-6 h-6" />
              <span>Cancel Shared Airport Ride?</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              According to AeroPool policy, cancellations prior to 15 minutes before departure are eligible for a <strong>100% full refund</strong> of {formatINR(currentBooking.farePaise)}.
            </p>
            {cancelError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{cancelError}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Reason for Cancellation
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="Flight schedule changed">Flight schedule changed</option>
                <option value="Met friend or family at airport">Met friend or family at airport</option>
                <option value="Destination changed">Destination changed</option>
                <option value="Other personal reasons">Other personal reasons</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isCancelling}
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelError(null);
                }}
                className="h-11 px-5 text-xs font-bold text-slate-400 hover:text-white transition"
              >
                Keep Booking
              </button>
              <button
                disabled={isCancelling}
                onClick={handleCancelBooking}
                className="h-11 px-6 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
              >
                <span>{isCancelling ? 'Cancelling...' : 'Confirm Full Refund'}</span>
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
