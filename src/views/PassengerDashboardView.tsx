import React, { useState } from 'react';
import {
  Plane,
  MapPin,
  Clock,
  ArrowRight,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Users,
  Briefcase,
  ExternalLink,
  Compass,
  FileText,
  AlertCircle,
  HelpCircle,
  Phone,
  Car,
  QrCode,
  Info,
  LogOut,
  Sparkles,
  User
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { PICKUP_ZONES, MUMBAI_DESTINATIONS, TERMINALS } from '../services/geoService';
import { Booking, UserProfile } from '../types';
import { InformationCentre } from '../components/InformationCentre';

interface PassengerDashboardViewProps {
  onNavigate: (route: string) => void;
  currentUser?: UserProfile | null;
  onOpenAuthModal?: (mode: 'signin' | 'signup') => void;
  onSignOut?: () => void;
}

export const PassengerDashboardView: React.FC<PassengerDashboardViewProps> = ({
  onNavigate,
  currentUser: propUser,
  onOpenAuthModal,
  onSignOut,
}) => {
  const activeUser = propUser !== undefined ? propUser : db.getState().currentUser;

  // Get user bookings if authenticated
  const userBookings = activeUser
    ? db.getBookingsForUser(activeUser.id, activeUser.role)
    : [];

  // Active / Upcoming booking (latest active)
  const activeBooking: Booking | undefined = userBookings.find(
    (b) => b.bookingStatus !== 'COMPLETED' && b.bookingStatus !== 'CANCELLED'
  );

  // Recent completed/cancelled rides (up to 4)
  const recentHistory = userBookings
    .filter((b) => b.id !== activeBooking?.id)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-[#07101F] text-[#F8FAFC] py-6 sm:py-10 px-4 sm:px-6 lg:px-8 pb-28 lg:pb-16 selection:bg-[#00DDF5] selection:text-[#07101F]">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* =========================================================================
            1. TOP PROFILE / GUEST HEADER
           ========================================================================= */}
        {activeUser ? (
          <div className="bg-[#0B1930] border border-[rgba(75,150,220,0.25)] rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-[#00DDF5]/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#00DDF5]/15 text-[#00DDF5] border border-[#00DDF5]/30 flex items-center gap-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-[#00DDF5] animate-pulse" />
                    CSMIA BOM Active Hub
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Passenger
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-[#A8B5CA] bg-slate-800/80 border border-slate-700/60">
                    ID: {activeUser.id.slice(0, 8)}...
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Welcome back, {activeUser.fullName || 'Flyer'}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#A8B5CA]">
                  <span>{activeUser.email}</span>
                  {activeUser.phone && <span>• {activeUser.phone}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => onNavigate('/app/book')}
                  className="h-11 px-5 bg-gradient-to-r from-[#00DDF5] to-[#087BFF] hover:from-[#33e5f7] hover:to-[#268eff] text-[#07101F] font-extrabold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <Plane className="w-4 h-4 -rotate-45" />
                  <span>Book Airport Ride</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <button
                  onClick={() => onNavigate('/app/bookings')}
                  className="h-11 px-4 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700/80 transition flex items-center gap-2 cursor-pointer"
                >
                  <span>My Rides</span>
                  {userBookings.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[#00DDF5] text-[11px] font-mono font-bold">
                      {userBookings.length}
                    </span>
                  )}
                </button>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="h-11 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs rounded-xl border border-rose-500/20 transition flex items-center gap-1.5 cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#0B1930] border border-[rgba(75,150,220,0.25)] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-lg">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00DDF5]/10 border border-[#00DDF5]/30 text-[#00DDF5] text-[10px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Flyer Account & Information</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  AeroPool Passenger Portal
                </h1>
                <p className="text-xs text-[#A8B5CA] leading-relaxed">
                  Sign in or create an account to view and manage your airport pool bookings, track arrivals, and receive verified fare discounts.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    if (onOpenAuthModal) onOpenAuthModal('signin');
                  }}
                  className="h-11 px-6 bg-gradient-to-r from-[#00DDF5] to-[#087BFF] hover:from-[#33e5f7] hover:to-[#268eff] text-[#07101F] font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98] cursor-pointer"
                >
                  Sign In / Register
                </button>
                <button
                  onClick={() => onNavigate('/')}
                  className="h-11 px-4 bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl border border-slate-700/80 transition cursor-pointer"
                >
                  Book Ride
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            2. ACTIVE / UPCOMING BOOKING SPOTLIGHT (If Authenticated)
           ========================================================================= */}
        {activeBooking && (
          <div className="bg-[#0B1930] border-2 border-[#00DDF5]/40 rounded-3xl p-6 shadow-2xl shadow-cyan-500/10 space-y-4 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">
                  Active Upcoming Booking
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs font-mono text-slate-400">#{activeBooking.id.slice(-8)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                  {activeBooking.bookingStatus}
                </span>
                <button
                  onClick={() => onNavigate(`/app/track/${activeBooking.id}`)}
                  className="h-9 px-4 bg-gradient-to-r from-[#00DDF5] to-[#087BFF] text-[#07101F] font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Track Live Trip</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Departure Hub</span>
                <span className="font-bold text-white text-sm">CSMIA Terminal {activeBooking.terminal}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Drop Destination</span>
                <span className="font-bold text-white text-sm">{activeBooking.destination.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Fare Paid</span>
                <span className="font-bold text-white text-sm font-mono">{formatINR(activeBooking.farePaise)}</span>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            3. INFORMATION & GOVERNANCE CENTRE (About, Airport, Safety, Fleet, Help, Legal)
           ========================================================================= */}
        <InformationCentre onNavigate={onNavigate} />

        {/* =========================================================================
            4. RECENT RIDE HISTORY SECTION (If Authenticated with Trips)
           ========================================================================= */}
        {recentHistory.length > 0 && (
          <div className="bg-[#0B1930] border border-[rgba(75,150,220,0.2)] rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#00DDF5]" />
                  <span>Recent Airport Ride History</span>
                </h2>
                <p className="text-xs text-[#A8B5CA] mt-0.5">
                  Past trips and official GST Tax Invoices.
                </p>
              </div>
              <button
                onClick={() => onNavigate('/app/bookings')}
                className="text-xs text-[#00DDF5] hover:underline font-bold flex items-center gap-1"
              >
                <span>View All ({userBookings.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentHistory.map((booking) => (
                <div
                  key={booking.id}
                  className="p-3.5 bg-[#0B1728] border border-slate-800 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <div className="space-y-1 truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs truncate">{booking.destination.name}</span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                          booking.bookingStatus === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {booking.bookingStatus}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#A8B5CA]">
                      CSMIA {booking.terminal} • {new Date(booking.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono">
                      Fare: <strong className="text-white">{formatINR(booking.farePaise)}</strong>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('/app/bookings')}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition shrink-0"
                    title="View Booking Details & Invoice"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#00DDF5]" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
