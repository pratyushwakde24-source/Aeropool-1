import React from 'react';
import { ArrowLeft, Clock, MapPin, Users, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { PICKUP_ZONES } from '../services/geoService';

interface HowItWorksViewProps {
  onNavigate: (route: string) => void;
}

export const HowItWorksView: React.FC<HowItWorksViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <button
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div>
          <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Guide & Workflow</span>
          <h1 className="text-3xl font-extrabold text-white mt-1">How AeroPool Works at CSMIA Mumbai</h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            A step-by-step walkthrough of airport ride-pooling, flight synchronization, and terminal pickup procedures.
          </p>
        </div>

        {/* Detailed Stages */}
        <div className="space-y-6">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h3 className="text-base font-bold text-white">Flight-Synchronized Request</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When booking your ride, provide your incoming flight number (e.g., IndiGo 6E 5312). AeroPool's flight adapter monitors delays, gate changes, and actual touchdown times at CSMIA Mumbai so you never have to worry about missing your ride if your flight is held up in the air.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h3 className="text-base font-bold text-white">Intelligent Corridor Clustering</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Instead of random carpooling, our engine only matches passengers heading down identical transit corridors (e.g. Bandra/BKC or Western Express Highway). We enforce a strict detour threshold of no more than 20 minutes, ensuring every passenger reaches their destination swiftly.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h3 className="text-base font-bold text-white">Dedicated Terminal Pickups</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Skip the chaotic curbside lines. AeroPool vehicles wait in designated airport pickup bays. At Terminal 2, head directly to Level P4 East Pillar 4-6 or Level P7 MLCP. At Terminal 1, head to Pillar 3-4.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <h3 className="text-base font-bold text-white">Transparent Fare Splitting (In Paise)</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Fares are split equitably among confirmed passengers. All amounts are calculated in exact minor units (paise) with zero hidden surge pricing. Driver partners receive guaranteed transparent payouts.
            </p>
          </div>
        </div>

        {/* Pickup Bays Table */}
        <div className="space-y-4 pt-4">
          <h2 className="text-lg font-bold text-white">CSMIA Terminal Pickup Zones</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PICKUP_ZONES.map((zone) => (
              <div key={zone.id} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{zone.terminalCode}</span>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                    {zone.pillar}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-200">{zone.name}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{zone.instructions}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-6">
          <button
            onClick={() => onNavigate('/app/book')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            Find a Match for Your Flight
          </button>
        </div>
      </div>
    </div>
  );
};
