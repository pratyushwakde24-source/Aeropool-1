import React, { useState, useEffect, useRef } from 'react';
import {
  Car,
  MapPin,
  CheckCircle2,
  Users,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Clock,
  PhoneCall,
  KeyRound,
  FileCheck,
  ArrowRight,
  Sparkles,
  Zap,
  Radio,
  Navigation,
  Crosshair,
  Lock,
  XCircle,
  Ban,
  ShieldAlert,
  Compass,
  DollarSign,
  Calendar,
  Check,
  Briefcase
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { RideStatus, RidePool, VerificationStatus } from '../types';
import { realtimeGpsService } from '../services/maps';
import { DriverWalletCard } from '../components/DriverWalletCard';
import { calculateCommissionSplit, getActiveCommissionPolicy } from '../services/commissionEngine';

interface DriverDashboardViewProps {
  onNavigate: (route: string) => void;
}

export const DriverDashboardView: React.FC<DriverDashboardViewProps> = ({ onNavigate }) => {
  const currentUser = db.getState().currentUser;
  const driverProfile = currentUser
    ? db.getState().driverProfiles.find((d) => d.userId === currentUser.id)
    : null;

  const [otpInput, setOtpInput] = useState<{ [bookingId: string]: string }>({});
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSuccess, setGpsSuccess] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // GPS Consent Modal state
  const [showGpsConsentModal, setShowGpsConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  // Continuous GPS watch ID ref
  const watchIdRef = useRef<number | null>(null);

  // 1-second operational timer for offer countdowns & GPS freshness checks
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
      db.expireStaleOffers();
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reactive DB subscription
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  // Active pool assigned to driver
  const activePool = driverProfile
    ? db.getState().pools.find(
        (p) =>
          p.assignedDriverId === driverProfile.id &&
          p.status !== 'COMPLETED' &&
          p.status !== 'CANCELLED'
      )
    : null;

  // Active pending ride offer for this driver
  const pendingOffer = driverProfile
    ? (db.getState().rideOffers || []).find(
        (o) =>
          (o.driverId === driverProfile.id || o.driverId === driverProfile.userId) &&
          o.status === 'PENDING'
      )
    : null;

  // Real-time GPS freshness evaluation (30s threshold)
  const lastLocationAgeSec = driverProfile?.lastKnownLocation
    ? Math.max(0, Math.floor((nowMs - new Date(driverProfile.lastKnownLocation.updatedAt).getTime()) / 1000))
    : null;
  const isGpsFresh = lastLocationAgeSec !== null && lastLocationAgeSec <= 30;

  // Active pools / trips completed by this driver for authoritative earnings
  const completedPools = driverProfile
    ? db.getState().pools.filter(
        (p) => p.assignedDriverId === driverProfile.id && p.status === 'COMPLETED'
      )
    : [];

  const walletSummary = driverProfile ? db.getDriverWalletSummary(driverProfile.id) : null;
  const totalCompletedTrips = walletSummary?.completedTripsCount ?? completedPools.length;
  const totalEarningsPaise = walletSummary?.lifetimeNetEarningsPaise ?? 0;

  // Clean up GPS watcher on unmount or when trip concludes
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Broadcast Real Hardware GPS
  const handleBroadcastRealGps = () => {
    if (!activePool || !driverProfile) return;
    setGpsError(null);
    setGpsSuccess(null);

    if (driverProfile.verificationStatus !== 'approved') {
      setGpsError('Unapproved driver cannot broadcast GPS coordinates.');
      return;
    }

    if (!driverProfile.gpsConsentGranted) {
      setShowGpsConsentModal(true);
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('Browser Geolocation API is not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        const validSpeedKmph = speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0;
        const validHeading = heading != null && !isNaN(heading) ? Math.round(heading) : (driverProfile.lastKnownLocation?.heading || 0);
        const validAccuracy = accuracy != null && !isNaN(accuracy) ? Math.round(accuracy) : 5;

        const res = db.recordDriverLocationBreadcrumb({
          poolId: activePool.id,
          driverId: driverProfile.id,
          lat: latitude,
          lng: longitude,
          speedKmph: validSpeedKmph,
          heading: validHeading,
          accuracyMeters: validAccuracy,
          source: 'REAL_GPS',
          timestamp: Date.now(),
          actorId: currentUser?.id,
          actorRole: 'driver',
        });

        // Broadcast to Realtime WebSocket channel for cross-device synchronization
        realtimeGpsService.broadcastDriverLocation({
          poolId: activePool.id,
          driverId: driverProfile.id,
          lat: latitude,
          lng: longitude,
          speedKmph: validSpeedKmph,
          heading: validHeading,
          accuracyMeters: validAccuracy,
          source: 'REAL_GPS',
          actorId: currentUser?.id,
        }).catch(() => {});

        if (res.success) {
          setGpsSuccess(`Live GPS breadcrumb pinged: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (Accuracy: ±${validAccuracy}m, Heading: ${validHeading}°)`);
        } else {
          setGpsError(res.error || 'Failed to record GPS telemetry');
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Location access was denied. Please grant device/browser location permission.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError('Device GPS position is unavailable. Ensure location sensors are enabled.');
        } else if (err.code === err.TIMEOUT) {
          setGpsError('GPS location request timed out.');
        } else {
          setGpsError(err.message || 'GPS telemetry broadcast error.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  if (!currentUser) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <Car className="w-12 h-12 text-slate-500 mx-auto" />
          <h2 className="text-xl font-extrabold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400">Please sign in with a verified driver account to access the driver queue.</p>
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

  if (!driverProfile) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">No Driver Profile Registered</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Your account <strong>({currentUser.fullName || currentUser.email})</strong> is not yet linked to an approved driver profile.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={() => onNavigate('/driver/kyc')}
              className="w-full h-12 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition active:scale-[0.98]"
            >
              Complete Driver KYC & Vehicle Registration
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="text-xs text-slate-400 hover:text-white transition py-2 font-semibold"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Available pools waiting for driver dispatch at CSMIA
  const unassignedPools = db.getState().pools.filter(
    (p) =>
      (!p.assignedDriverId || p.assignedDriverId === '') &&
      p.status !== 'COMPLETED' &&
      p.status !== 'CANCELLED'
  );

  const isApproved = driverProfile.verificationStatus === 'approved';

  const handleToggleAvailability = () => {
    setDispatchError(null);
    if (!driverProfile) return;

    if (driverProfile.isAvailable) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      const res = db.setDriverAvailability({
        driverId: driverProfile.id,
        targetState: 'OFFLINE',
        actorId: currentUser.id,
        actorRole: 'driver',
      });
      if (!res.success) {
        setDispatchError(res.error || 'Failed to go offline');
      }
    } else {
      if (!isApproved) {
        setDispatchError(
          `Cannot go online: Driver profile is ${driverProfile.verificationStatus.toUpperCase().replace(/_/g, ' ')}. Only approved drivers can accept dispatch.`
        );
        return;
      }

      if (!driverProfile.gpsConsentGranted) {
        setShowGpsConsentModal(true);
        return;
      }

      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, speed, heading, accuracy } = pos.coords;
            setGpsAccuracy(accuracy != null ? Math.round(accuracy) : 5);
            setGpsHeading(heading != null ? Math.round(heading) : 0);
            setGpsSpeed(speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0);
            db.recordDriverLocationBreadcrumb({
              driverId: driverProfile.id,
              lat: latitude,
              lng: longitude,
              accuracyMeters: accuracy != null ? Math.round(accuracy) : 5,
              heading: heading != null ? Math.round(heading) : 0,
              speedKmph: speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0,
              source: 'REAL_GPS',
              timestamp: Date.now(),
              actorId: currentUser.id,
              actorRole: 'driver',
              poolId: activePool?.id,
            });

            if (activePool?.id) {
              realtimeGpsService.broadcastDriverLocation({
                poolId: activePool.id,
                driverId: driverProfile.id,
                lat: latitude,
                lng: longitude,
                accuracyMeters: accuracy != null ? Math.round(accuracy) : 5,
                heading: heading != null ? Math.round(heading) : 0,
                speedKmph: speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0,
                source: 'REAL_GPS',
                actorId: currentUser.id,
              }).catch(() => {});
            }
          },
          (err) => {
            setGpsError(err.message || 'GPS location error');
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      }

      const res = db.setDriverAvailability({
        driverId: driverProfile.id,
        targetState: 'ONLINE',
        actorId: currentUser.id,
        actorRole: 'driver',
      });

      if (!res.success) {
        setDispatchError(res.error || 'Failed to become available');
      }
    }
  };

  const handleConfirmGpsConsent = () => {
    if (!consentChecked) return;
    db.updateDriverGpsConsent(driverProfile.id, true, currentUser.id);
    setShowGpsConsentModal(false);
    handleToggleAvailability();
  };

  const handleAcceptOffer = (offerId: string) => {
    if (!driverProfile) return;
    setDispatchError(null);
    const res = db.respondToRideOffer({
      offerId,
      driverId: driverProfile.id,
      response: 'ACCEPT',
      actorId: currentUser.id,
    });
    if (!res.success) {
      setDispatchError(res.error || 'Failed to accept ride offer');
    }
  };

  const handleDeclineOffer = (offerId: string) => {
    if (!driverProfile) return;
    setDispatchError(null);
    const res = db.respondToRideOffer({
      offerId,
      driverId: driverProfile.id,
      response: 'REJECT',
      actorId: currentUser.id,
    });
    if (!res.success) {
      setDispatchError(res.error || 'Failed to decline ride offer');
    }
  };

  const handleAdvanceStatus = (nextStatus: RideStatus) => {
    if (!activePool) return;
    setStatusError(null);
    const res = db.updateRideStatus(activePool.id, nextStatus, currentUser.id, 'driver');
    if (!res.success) {
      setStatusError(res.error || 'Failed to update status');
    }
  };

  const handleAcceptDispatch = (pool: RidePool) => {
    setDispatchError(null);
    if (!isApproved) {
      setDispatchError('Unapproved drivers cannot accept ride assignments.');
      return;
    }

    const vehicleId =
      driverProfile.assignedVehicle?.id ||
      (driverProfile as any).assignedVehicleId ||
      db.getState().vehicles.find((v) => v.status === 'ACTIVE')?.id ||
      'veh-innova-8421';

    const res = db.assignDriverToPool({
      poolId: pool.id,
      driverId: driverProfile.id,
      vehicleId,
      actorId: currentUser.id,
    });

    if (!res.success) {
      setDispatchError(res.error || 'Failed to accept dispatch offer.');
    }
  };

  const handleVerifyOtp = (bookingId: string, actualOtp: string) => {
    const entered = otpInput[bookingId]?.trim();
    if (entered === actualOtp) {
      setOtpSuccess(`Boarding verified for passenger!`);
      setOtpError(null);
      const passenger = activePool?.passengers.find((p) => p.bookingId === bookingId);
      if (passenger) passenger.status = 'BOARDED';
      const allBoarded = activePool?.passengers.every((p) => p.status === 'BOARDED');
      if (allBoarded) {
        db.updateRideStatus(activePool!.id, 'PICKUP_CONFIRMED', currentUser.id, 'driver');
      }
    } else {
      setOtpError(`Invalid OTP. Please check passenger boarding pass.`);
      setOtpSuccess(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cockpit Header Bar */}
        <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-2xl">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                AeroPool Commercial Cockpit
              </span>
              <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                isApproved
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : driverProfile.verificationStatus === 'rejected'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {driverProfile.verificationStatus.toUpperCase().replace(/_/g, ' ')}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tracking-tight">
              {driverProfile.fullName || currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Plate: <strong className="text-white font-mono">{driverProfile.assignedVehicle?.plateNumber || 'Pending Assignment'}</strong> •{' '}
              {driverProfile.assignedVehicle?.makeModel || 'Commercial Taxi'} ({driverProfile.assignedVehicle?.seats || 4} Seats)
            </p>
          </div>

          {/* Availability Toggle & KYC Link */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/driver/kyc')}
              className="h-11 px-4 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 rounded-2xl text-xs font-bold transition flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>KYC Documents</span>
            </button>

            <button
              onClick={handleToggleAvailability}
              className={`h-12 px-6 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2.5 border shadow-lg active:scale-[0.98] ${
                driverProfile.isAvailable
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border-emerald-400 shadow-emerald-500/20'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${driverProfile.isAvailable ? 'bg-slate-950 animate-pulse' : 'bg-slate-600'}`} />
              <span>{driverProfile.isAvailable ? 'ONLINE AT CSMIA' : 'GO ONLINE'}</span>
            </button>
          </div>
        </div>

        {/* Verification Alert Banner (if not approved) */}
        {!isApproved && (
          <div
            className={`p-5 rounded-3xl border flex items-start justify-between gap-4 text-xs shadow-xl ${
              driverProfile.verificationStatus === 'rejected'
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-extrabold text-sm">
                  {driverProfile.verificationStatus === 'rejected'
                    ? 'KYC Verification Action Required'
                    : 'KYC Document Verification In Progress'}
                </p>
                <p className="text-xs mt-1 leading-relaxed opacity-90">
                  {driverProfile.verificationStatus === 'rejected'
                    ? `Reason: ${driverProfile.rejectionReason || 'Please review document numbers and re-upload'}. You cannot go online until approved.`
                    : 'AeroPool operations team is verifying your Commercial Badge and vehicle fitness. Online availability and dispatch offers will unlock once approved.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('/driver/kyc')}
              className="h-9 px-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-xs font-bold shrink-0 hover:bg-slate-800"
            >
              Update Documents
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 glass-panel border border-slate-800 rounded-2xl space-y-1 shadow-md">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Completed Trips</span>
            <div className="text-2xl font-extrabold text-white font-mono">{totalCompletedTrips}</div>
            <span className="text-[11px] text-slate-500">Database verified</span>
          </div>

          <div className="p-5 glass-panel border border-slate-800 rounded-2xl space-y-1 shadow-md">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Total Net Payout</span>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">{formatINR(totalEarningsPaise)}</div>
            <span className="text-[11px] text-slate-500">80/20 active policy</span>
          </div>

          <div className="p-5 glass-panel border border-slate-800 rounded-2xl space-y-1 shadow-md">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Driver Rating</span>
            <div className="text-2xl font-extrabold text-amber-400 font-mono">★ {driverProfile.rating || 5.0}</div>
            <span className="text-[11px] text-slate-500">Verified flyers</span>
          </div>

          <div className="p-5 glass-panel border border-slate-800 rounded-2xl space-y-1 shadow-md">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">GPS Telemetry</span>
            <div className="text-sm font-extrabold font-mono mt-1 text-slate-200">
              {driverProfile.gpsConsentGranted ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Authorized</span>
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Pending</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">Location consent</span>
          </div>
        </div>

        {/* Error Alerts */}
        {dispatchError && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{dispatchError}</span>
            </div>
            <button onClick={() => setDispatchError(null)} className="text-slate-400 hover:text-white font-mono">
              ✕
            </button>
          </div>
        )}

        {/* INCOMING RIDE OFFER / DISPATCH CARD */}
        {pendingOffer && (
          <div className="glass-panel border-2 border-cyan-400 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-cyan-500/20 space-y-5 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-500/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400 text-cyan-300 flex items-center justify-center animate-pulse">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                    <span>Incoming Shared Ride Offer</span>
                    <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 px-2.5 py-0.5 rounded-full font-bold uppercase">
                      CSMIA {pendingOffer.terminal}
                    </span>
                  </h3>
                  <p className="text-xs text-cyan-200/90 mt-0.5">
                    Pickup Bay: <strong className="text-white">{pendingOffer.pickupZoneName}</strong> • Destination: <strong className="text-white">{pendingOffer.destinationName}</strong>
                  </p>
                </div>
              </div>

              {/* Countdown badge */}
              <div className="flex items-center gap-2">
                <div className="px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-300 font-mono text-xs font-bold flex items-center gap-2 shadow-inner">
                  <Clock className="w-4 h-4 text-rose-400 animate-spin" />
                  <span>
                    Expires in: {Math.max(0, Math.round((new Date(pendingOffer.expiresAt).getTime() - nowMs) / 1000))}s
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono uppercase">Passengers</span>
                <strong className="text-white text-sm">{pendingOffer.passengerCount} Flyers ({pendingOffer.totalSeatsBooked} seats)</strong>
              </div>
              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono uppercase">Corridor</span>
                <strong className="text-cyan-300 text-sm">{pendingOffer.corridor}</strong>
              </div>
              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono uppercase">Vehicle</span>
                <strong className="text-slate-200 text-sm font-mono">{pendingOffer.vehiclePlate}</strong>
              </div>
              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono uppercase">Est. Payout</span>
                <strong className="text-emerald-400 text-base font-mono">{formatINR(pendingOffer.estimatedEarningsPaise)}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleDeclineOffer(pendingOffer.id)}
                className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl border border-slate-700 transition"
              >
                Decline
              </button>
              <button
                onClick={() => handleAcceptOffer(pendingOffer.id)}
                className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>Accept Ride & Start Pickup</span>
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE POOL HUD */}
        {activePool ? (
          <div className="glass-panel border border-cyan-500/40 shadow-2xl shadow-cyan-500/10 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                  Active CSMIA Dispatch Assignment
                </span>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2 mt-0.5">
                  <span>Corridor: {activePool.targetCorridor}</span>
                  <span className="text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full">
                    {activePool.status.replace(/_/g, ' ')}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Pickup Zone: <strong className="text-white">{activePool.pickupZone.name}</strong> • Floor: {activePool.pickupZone.floor} • Pillar: {activePool.pickupZone.pillar}
                </p>
              </div>

              {/* Action Buttons to Advance Status */}
              <div className="flex items-center gap-2">
                {activePool.status === 'CONFIRMED' || activePool.status === 'DRIVER_ASSIGNED' ? (
                  <button
                    onClick={() => handleAdvanceStatus('DRIVER_EN_ROUTE')}
                    className="h-11 px-6 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
                  >
                    Start Trip to Terminal
                  </button>
                ) : activePool.status === 'DRIVER_EN_ROUTE' ? (
                  <button
                    onClick={() => handleAdvanceStatus('DRIVER_ARRIVED')}
                    className="h-11 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
                  >
                    Mark Arrived at Pillar
                  </button>
                ) : activePool.status === 'DRIVER_ARRIVED' ? (
                  <span className="text-xs text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 rounded-xl">
                    Verify Passenger OTPs Below
                  </span>
                ) : activePool.status === 'PICKUP_CONFIRMED' ? (
                  <button
                    onClick={() => handleAdvanceStatus('IN_PROGRESS')}
                    className="h-11 px-6 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
                  >
                    Start Expressway Transit
                  </button>
                ) : (
                  <button
                    onClick={() => handleAdvanceStatus('COMPLETED')}
                    className="h-11 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
                  >
                    Complete Ride & Record Earnings
                  </button>
                )}
              </div>
            </div>

            {/* Live GPS Telemetry Broadcasting Card */}
            <div className="p-5 bg-slate-950/80 rounded-2xl border border-sky-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>Live GPS Telemetry Broadcast</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        activePool.driverCurrentLocation?.source === 'REAL_GPS'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {activePool.driverCurrentLocation?.source === 'REAL_GPS' ? 'REAL GPS ACTIVE' : 'NO TELEMETRY RECORDED'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Transmits live breadcrumbs to pooled flyers. Turns off automatically when trip finishes.
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBroadcastRealGps}
                  className="h-10 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>Broadcast Device GPS</span>
                </button>
              </div>

              {activePool.driverCurrentLocation && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800 text-xs font-mono text-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[10px]">COORDINATES</span>
                    <span>{activePool.driverCurrentLocation.lat.toFixed(4)}, {activePool.driverCurrentLocation.lng.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">SPEED</span>
                    <span className="text-emerald-400 font-bold">{activePool.driverCurrentLocation.speedKmph || 0} km/h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">HEADING</span>
                    <span>{activePool.driverCurrentLocation.heading || 0}°</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">BREADCRUMBS</span>
                    <span className="text-cyan-300 font-bold">{activePool.breadcrumbs?.length || 0} points</span>
                  </div>
                </div>
              )}

              {gpsSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{gpsSuccess}</span>
                </div>
              )}
              {gpsError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{gpsError}</span>
                </div>
              )}
            </div>

            {/* Passenger Boarding & OTP Verification List */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Boarding Passenger List ({activePool.passengers.length})
              </h3>

              {otpSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{otpSuccess}</span>
                </div>
              )}
              {otpError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {activePool.passengers.map((p) => (
                <div
                  key={p.bookingId}
                  className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md"
                >
                  <div>
                    <div className="font-extrabold text-white text-sm flex items-center gap-2">
                      <span>{p.passengerName}</span>
                      <span className="text-[11px] font-mono text-slate-400">({p.passengerPhone})</span>
                      {p.status === 'BOARDED' && (
                        <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                          BOARDED
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 mt-1">
                      Drop-off: <strong className="text-slate-200">{p.destination.name}</strong> • Seats: {p.seatsBooked} • Bags: {p.luggageCount}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.status === 'BOARDED' ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5 font-mono text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>OTP Verified</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="4-digit OTP"
                          value={otpInput[p.bookingId] || ''}
                          onChange={(e) =>
                            setOtpInput({ ...otpInput, [p.bookingId]: e.target.value })
                          }
                          className="w-28 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:border-sky-500 font-bold"
                        />
                        <button
                          onClick={() => handleVerifyOtp(p.bookingId, p.pickupOtp)}
                          className="h-10 px-4 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition"
                        >
                          Verify OTP
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Available Dispatch Queue / Offline State */
          <div className="space-y-6">
            {!driverProfile.isAvailable ? (
              <div className="p-12 text-center glass-panel border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                <Car className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-extrabold text-white">Driver Status is Offline</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Toggle your availability to <strong className="text-emerald-400">ONLINE</strong> to join the CSMIA airport queue and receive passenger dispatch offers.
                </p>
                <button
                  onClick={handleToggleAvailability}
                  className="h-11 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition inline-flex items-center gap-2 mt-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>Go Online Now</span>
                </button>
              </div>
            ) : unassignedPools.length > 0 ? (
              <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span>Available CSMIA Dispatch Offers</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Unassigned ride pools waiting for commercial driver pickup at Mumbai Airport.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                    {unassignedPools.length} Available
                  </span>
                </div>

                <div className="space-y-4">
                  {unassignedPools.map((pool) => {
                    const totalGrossPaise = pool.passengers.reduce((sum, p) => sum + p.farePaidPaise, 0);
                    const split = calculateCommissionSplit({
                      grossFarePaise: totalGrossPaise,
                      airportTollPaise: 0,
                    });

                    return (
                      <div
                        key={pool.id}
                        className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-4 hover:border-slate-700 transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{pool.targetCorridor}</span>
                              <span className="text-xs font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-800/60 px-2 py-0.5 rounded">
                                {pool.terminal}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Pickup: <strong className="text-slate-300">{pool.pickupZone.name}</strong> ({pool.pickupZone.pillar})
                            </div>
                          </div>

                          <div className="sm:text-right">
                            <div className="text-xs text-slate-400">Driver Payout ({100 - split.policySnapshot.platformCommissionPercent}%)</div>
                            <div className="text-base font-bold font-mono text-emerald-400">
                              {formatINR(split.driverNetPayoutPaise)}
                            </div>
                            <div className="text-[10px] text-slate-500">Gross: {formatINR(totalGrossPaise)}</div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              Passengers: {pool.passengers.length} Booked, {pool.availableSeats} Remaining Seats
                            </span>
                          </div>

                          <button
                            onClick={() => handleAcceptDispatch(pool)}
                            className="h-10 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-[0.98]"
                          >
                            <span>Accept Dispatch</span>
                            <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center glass-panel border border-slate-800 rounded-3xl space-y-3 shadow-xl">
                <Car className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white tracking-wide">NO ACTIVE POOLS WAITING FOR DRIVERS</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  You are online at CSMIA Mumbai. When inbound flight arrivals match your vehicle type, dispatch assignments will appear here instantly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* DRIVER WALLET & FINANCIAL LEDGER */}
        <DriverWalletCard driverId={driverProfile.id} driverName={driverProfile.fullName || 'Driver'} />

        {/* AUTHORITATIVE COMPLETED TRIPS HISTORY */}
        {completedPools.length > 0 && (
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>Completed Trip History ({completedPools.length})</span>
            </h3>

            <div className="space-y-3">
              {completedPools.map((cp) => {
                const grossFare = cp.passengers.reduce((s, p) => s + p.farePaidPaise, 0);
                const split = calculateCommissionSplit({
                  grossFarePaise: grossFare,
                  airportTollPaise: 0,
                });

                return (
                  <div
                    key={cp.id}
                    className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-white flex items-center gap-2">
                        <span>{cp.targetCorridor}</span>
                        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60">
                          {cp.terminal}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs mt-1">
                        {cp.pickupZone.name} • {cp.passengers.length} Flyer(s)
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-400">
                        <span>Comm ({split.policySnapshot.platformCommissionPercent}%): -{formatINR(split.platformCommissionPaise)}</span>
                        {split.driverTollReimbursementPaise > 0 && (
                          <span className="text-emerald-400">• Toll: +{formatINR(split.driverTollReimbursementPaise)}</span>
                        )}
                      </div>
                    </div>

                    <div className="sm:text-right">
                      <div className="font-mono text-emerald-400 font-extrabold text-base">
                        {formatINR(split.driverNetPayoutPaise)}
                      </div>
                      <span className="text-[10px] text-slate-500">Gross Fare: {formatINR(split.grossFarePaise)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* GPS Consent Modal */}
      {showGpsConsentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGpsConsentModal(false);
          }}
        >
          <div className="glass-panel border border-slate-800 text-slate-100 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">Device GPS Consent</h3>
                <p className="text-xs text-slate-400">Digital Personal Data Protection Act compliance</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              AeroPool collects real-time vehicle GPS coordinates strictly while on duty at CSMIA Mumbai to route shared flyers and verify pickup zone arrival. Location sharing automatically terminates when the pool completes.
            </p>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-start gap-3">
              <input
                type="checkbox"
                id="gpsConsentCheck"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-4 h-4 accent-cyan-400 rounded"
              />
              <label htmlFor="gpsConsentCheck" className="text-xs text-slate-300 leading-snug cursor-pointer">
                I authorize AeroPool to record and stream vehicle GPS telemetry during airport dispatch assignments.
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowGpsConsentModal(false)}
                className="h-11 px-5 text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!consentChecked}
                onClick={handleConfirmGpsConsent}
                className="h-11 px-6 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
              >
                Confirm & Go Online
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
