import React, { useState } from 'react';
import {
  Plane,
  Users,
  Shield,
  ArrowRight,
  TrendingDown,
  Clock,
  Car,
  MapPin,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Building,
  Leaf,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { MUMBAI_DESTINATIONS, PICKUP_ZONES } from '../services/geoService';
import { calculateRideFare, formatINR } from '../services/pricingEngine';

interface LandingViewProps {
  onNavigate: (route: string) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
  const [selectedDestIndex, setSelectedDestIndex] = useState(0);
  const currentDest = MUMBAI_DESTINATIONS[selectedDestIndex];
  const fareComparison = calculateRideFare(currentDest, 1, 'SHARED_POOL', 2);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 border-b border-slate-900">
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/10 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-sky-500/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column Copy */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-sky-400 text-xs font-semibold shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Now Live at CSMIA Mumbai • Terminals 1 & 2</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
                Your Airport Ride. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400">
                  Shared Smarter.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
                Connect with travellers heading your way, share a licensed taxi, and make every airport journey more affordable.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                <button
                  onClick={() => onNavigate('/app/book')}
                  className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xl shadow-blue-600/30 transition flex items-center justify-center gap-2"
                >
                  <span>Find My Ride</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onNavigate('/fleet-partners')}
                  className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Building className="w-4 h-4 text-sky-400" />
                  <span>Become a Fleet Partner</span>
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 max-w-lg mx-auto lg:mx-0 text-left">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white font-mono">Up to 40%</div>
                  <div className="text-[11px] text-slate-400">Passenger Fare Savings</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">100%</div>
                  <div className="text-[11px] text-slate-400">Verified Licensed Cabs</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-sky-400 font-mono">&lt; 15 min</div>
                  <div className="text-[11px] text-slate-400">Departure Window</div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive Fare Savings Widget */}
            <div className="lg:col-span-5">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Live Route Savings Calculator</div>
                      <div className="text-[11px] text-slate-400">From CSMIA Terminal 2 / T1</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    REAL-TIME
                  </span>
                </div>

                {/* Destination Dropdown */}
                <div className="mt-4 space-y-2">
                  <label className="block text-xs font-medium text-slate-300">Select Mumbai Destination</label>
                  <select
                    value={selectedDestIndex}
                    onChange={(e) => setSelectedDestIndex(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {MUMBAI_DESTINATIONS.map((dest, i) => (
                      <option key={dest.id} value={i}>
                        {dest.name} ({dest.distanceKmFromCSMIA} km • ~{dest.estMinutesFromCSMIA}m)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Breakdown Comparison Card */}
                <div className="mt-5 bg-slate-950/70 rounded-2xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400">Solo Airport Taxi</div>
                      <div className="text-sm font-bold text-slate-400 line-through font-mono">
                        {formatINR(fareComparison.individualBenchmarkFarePaise)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 justify-end">
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>Save {formatINR(fareComparison.savingsPaise)}</span>
                      </div>
                      <div className="text-2xl font-extrabold text-white font-mono">
                        {formatINR(fareComparison.passengerShareFarePaise)}
                      </div>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-sky-400 to-blue-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${100 - fareComparison.savingsPercentage}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>Includes CSMIA Airport Toll & GST</span>
                    <span className="text-emerald-400 font-semibold">{fareComparison.savingsPercentage}% Cheaper</span>
                  </div>
                </div>

                {/* CTA inside Card */}
                <button
                  onClick={() => onNavigate('/app/book')}
                  className="mt-5 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <span>Book Shared Ride to {currentDest.name.split('(')[0]}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW AEROPOOL WORKS (3 STEPS) */}
      <section className="py-16 bg-slate-900/40 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs uppercase tracking-widest text-sky-400 font-bold">How AeroPool Works</h2>
            <p className="text-2xl sm:text-3xl font-bold text-white mt-2">
              Three simple steps from arrival gate to your doorstep
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 relative group hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="text-base font-bold text-white">Enter Flight & Destination</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Provide your incoming flight number (e.g. 6E 5312 or AI 678). Our system tracks your actual touchdown time and terminal automatically.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 relative group hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="text-base font-bold text-white">Match with Co-Travellers</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Our algorithm groups 2 to 3 passengers with overlapping arrival windows and nearby destinations along the same Mumbai corridor.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 relative group hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="text-base font-bold text-white">Board at Dedicated Bay</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Walk to your terminal's AeroPool pickup bay (e.g., T2 Level P4 Pillar 4-6). Meet your verified driver, verify OTP, and split the fare.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SAFETY & VERIFICATION */}
      <section className="py-16 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero Compromise on Passenger Safety</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
                Verified commercial drivers. <br />
                Dedicated terminal bays.
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                AeroPool partners exclusively with licensed fleet operators and verified commercial drivers holding valid transport badges, police verification, and inspected vehicles.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong>100% Commercial Fleet Vehicles:</strong> Inspected Toyota Innova, Ertiga CNG, and Tata Nexon EVs with commercial yellow plates.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong>OTP Boarding Verification:</strong> Drivers can only commence trips after authenticating each passenger's 4-digit security code.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong>24x7 Emergency SOS & Live Share:</strong> Instantly broadcast your vehicle's live telemetry to trusted contacts or local police (112).
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => onNavigate('/safety')}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1.5"
                >
                  <span>Read our complete safety & verification charter</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Visual Security Badge Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Driver Compliance Standard
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Maharashtra Commercial Driver Badge</span>
                  <span className="text-emerald-400 font-semibold">Mandatory</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Police Background Verification Certificate</span>
                  <span className="text-emerald-400 font-semibold">Verified</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Vehicle Fitness & Comprehensive Insurance</span>
                  <span className="text-emerald-400 font-semibold">Annual Audit</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Airport Operator (Adani CSMIA) Commercial Permit</span>
                  <span className="text-emerald-400 font-semibold">Approved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ENVIRONMENTAL IMPACT */}
      <section className="py-16 bg-slate-900/30 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Leaf className="w-4 h-4" />
            <span>Environmental Impact & Sustainable Transit</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Fewer empty vehicles on Mumbai roads
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed">
            By aggregating arriving flyers traveling down common routes like the Western Express Highway and Bandra-Worli Sea Link, AeroPool replaces multiple single-occupancy cabs with optimized pooled journeys — cutting per-passenger emissions by up to 35%.
          </p>
        </div>
      </section>

      {/* 5. FAQ PREVIEW */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white">Frequently Asked Questions</h2>
            <p className="text-xs text-slate-400 mt-1">Everything you need to know about airport ride-pooling at CSMIA</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5">
              <h4 className="text-sm font-semibold text-white">What happens if my flight is delayed?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                AeroPool monitors live flight arrival status at CSMIA. If your flight is delayed, our system automatically reassigns you to the next available departure pool from your arrival terminal without penalty.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5">
              <h4 className="text-sm font-semibold text-white">How much luggage can I bring?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Each standard shared-pool seat includes allowance for 1 check-in bag (up to 23 kg) and 1 personal handbag. If you have extra luggage, you can specify additional bags during booking.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5">
              <h4 className="text-sm font-semibold text-white">Where do I meet my driver?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                At Terminal 2, head to Level P4 East (Pillar 4-6) or Level P7 MLCP. At Terminal 1, head to the Domestic Arrival Curbside Zone (Pillar 3-4). Detailed directions and your driver's number are shown on your live boarding pass.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM CALL TO ACTION */}
      <section className="py-14 bg-gradient-to-b from-blue-950/40 to-slate-950 border-t border-slate-800 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Ready for a smarter airport commute?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
            Book in less than 60 seconds with your flight number and destination. Transparent pricing, zero surge surprises.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onNavigate('/app/book')}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-blue-600/30 transition inline-flex items-center gap-2"
            >
              <span>Book Your CSMIA Shared Ride</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
