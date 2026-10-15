import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { RideStatus } from '../types';

interface DriverDashboardViewProps {
  onNavigate: (route: string) => void;
}

export const DriverDashboardView: React.FC<DriverDashboardViewProps> = ({ onNavigate }) => {
  const currentUser = db.getState().currentUser;
  const driverProfile = db.getState().driverProfiles.find((d) => d.userId === currentUser.id) || db.getState().driverProfiles[0];

  const [otpInput, setOtpInput] = useState<{ [bookingId: string]: string }>({});
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Active pool assigned to driver
  const activePool = db.getState().pools.find((p) => p.assignedDriverId === driverProfile.id && p.status !== 'COMPLETED' && p.status !== 'CANCELLED');

  const handleToggleAvailability = () => {
    driverProfile.isAvailable = !driverProfile.isAvailable;
    db.getState().driverProfiles.forEach((d) => {
      if (d.id === driverProfile.id) d.isAvailable = driverProfile.isAvailable;
    });
    // Trigger store update
    db.switchUser(currentUser.id);
  };

  const handleAdvanceStatus = (nextStatus: RideStatus) => {
    if (!activePool) return;
    setStatusError(null);
    const res = db.updateRideStatus(activePool.id, nextStatus, currentUser.id, 'driver');
    if (!res.success) {
      setStatusError(res.error || 'Failed to update status');
    }
  };

  const handleVerifyOtp = (bookingId: string, actualOtp: string) => {
    const entered = otpInput[bookingId]?.trim();
    if (entered === actualOtp) {
      setOtpSuccess(`Boarding verified for passenger!`);
      setOtpError(null);
      // Mark passenger boarded
      const passenger = activePool?.passengers.find((p) => p.bookingId === bookingId);
      if (passenger) passenger.status = 'BOARDED';
      // If all boarded, advance to PICKUP_CONFIRMED
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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Driver Status HUD Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
              <img
                src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'}
                alt={driverProfile.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">{driverProfile.fullName}</h1>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/20">
                  ★ {driverProfile.rating}
                </span>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  ({driverProfile.totalTrips} Trips)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {driverProfile.organizationName || 'Independent Partner'} • Vehicle:{' '}
                <strong className="text-sky-400 font-mono">
                  {driverProfile.assignedVehicle?.plateNumber || 'MH 02 EE 8421'}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/driver/kyc')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
            >
              <FileCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>KYC Docs</span>
            </button>

            <button
              onClick={handleToggleAvailability}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                driverProfile.isAvailable
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${driverProfile.isAvailable ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
              <span>{driverProfile.isAvailable ? 'ONLINE (READY FOR DISPATCH)' : 'OFFLINE'}</span>
            </button>
          </div>
        </div>

        {/* Weekly Earnings Quick Strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Weekly Payout</div>
            <div className="text-lg font-bold font-mono text-emerald-400">
              {formatINR(driverProfile.earningsThisWeekPaise)}
            </div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Vehicle</div>
            <div className="text-xs font-semibold text-white truncate">
              {driverProfile.assignedVehicle?.makeModel || 'Toyota Innova Crysta'}
            </div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Airport Terminal</div>
            <div className="text-xs font-semibold text-sky-400">CSMIA Terminal 2 Level P4</div>
          </div>
        </div>

        {/* ACTIVE TRIP DISPATCH QUEUE */}
        {activePool ? (
          <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                  <h2 className="text-base font-bold text-white">Active Dispatch Assignment</h2>
                  <span className="text-xs font-mono font-bold bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded border border-sky-500/30">
                    {activePool.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Corridor: <strong className="text-slate-200">{activePool.targetCorridor}</strong> • Pickup: {activePool.pickupZone.name}
                </p>
              </div>

              {statusError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{statusError}</span>
                </div>
              )}

              {/* Status Advancement Button */}
              <div className="flex items-center gap-2">
                {activePool.status === 'CONFIRMED' && (
                  <button
                    onClick={() => handleAdvanceStatus('DRIVER_EN_ROUTE')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                  >
                    Start Heading to Airport Terminal
                  </button>
                )}
                {activePool.status === 'DRIVER_EN_ROUTE' && (
                  <button
                    onClick={() => handleAdvanceStatus('DRIVER_ARRIVED')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                  >
                    Confirm Arrival at Pickup Bay ({activePool.pickupZone.pillar})
                  </button>
                )}
                {activePool.status === 'PICKUP_CONFIRMED' && (
                  <button
                    onClick={() => handleAdvanceStatus('IN_PROGRESS')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                  >
                    Start Transit onto Expressway
                  </button>
                )}
                {activePool.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => handleAdvanceStatus('COMPLETED')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                  >
                    Complete Ride & Record Earnings
                  </button>
                )}
              </div>
            </div>

            {/* OTP Notifications */}
            {otpSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{otpSuccess}</span>
              </div>
            )}
            {otpError && (
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            {/* Stop Sequence & Passenger Manifest */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Passenger Pickup Manifest & Boarding OTP Verification
              </h3>

              {activePool.passengers.map((p, idx) => (
                <div
                  key={p.bookingId}
                  className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{p.passengerName}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-400" />
                        <span>Drop-Off: {p.destination.name}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-white">{formatINR(p.farePaidPaise)}</div>
                      <div className="text-[10px] text-slate-400">{p.seatsBooked} Seat • {p.luggageCount} Bag</div>
                    </div>
                  </div>

                  {/* OTP Verification form */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      <span className="text-xs text-slate-300">Enter Passenger OTP:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="••••"
                        value={otpInput[p.bookingId] || ''}
                        onChange={(e) =>
                          setOtpInput({ ...otpInput, [p.bookingId]: e.target.value })
                        }
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => handleVerifyOtp(p.bookingId, p.pickupOtp)}
                        className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-lg transition"
                      >
                        Verify Boarding
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation Route Order */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-300">Recommended Stop Order:</div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                <span>CSMIA T2 Level P4 East (Pickup All Passengers)</span>
                <span>→</span>
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Bandra Kurla Complex (BKC)</span>
                <span>→</span>
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Bandra West (Linking Road)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <Car className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-sm font-bold text-white">No Active Pool Assigned</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You are currently online. When flights touch down at CSMIA matching your vehicle type, assignments will appear here immediately.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
