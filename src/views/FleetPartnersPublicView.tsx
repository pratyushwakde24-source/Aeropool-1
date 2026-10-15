import React from 'react';
import { ArrowLeft, Building2, TrendingUp, Users, Shield, CheckCircle, ArrowRight } from 'lucide-react';

interface FleetPartnersPublicViewProps {
  onNavigate: (route: string) => void;
}

export const FleetPartnersPublicView: React.FC<FleetPartnersPublicViewProps> = ({ onNavigate }) => {
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
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest">
            Commercial Operator Partnership
          </span>
          <h1 className="text-3xl font-extrabold text-white mt-1">Become an AeroPool Fleet Partner</h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Maximize your fleet utilization with steady, high-value airport passenger demand from CSMIA Mumbai Terminals 1 and 2.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Guaranteed Airport Volume</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Eliminate costly airport waiting idle times. Connect directly with scheduled arriving flights for rapid vehicle turnaround.
            </p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <Building2 className="w-6 h-6 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Automated Weekly Settlements</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Transparent operator accounting with weekly direct bank transfers. Zero hidden deductions or unclear commissions.
            </p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <Shield className="w-6 h-6 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Full Operator Dashboard</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitor your vehicles, driver compliance records, and active trips in real time through our dedicated Fleet Management Portal.
            </p>
          </div>
        </div>

        {/* Qualification Criteria */}
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white">Fleet Onboarding Requirements</h3>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Valid GST registration and commercial transport operator license in Maharashtra</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Minimum fleet size of 3 commercial vehicles (Innova, Ertiga, XL6, or equivalent commercial EV)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Drivers with clean background checks and valid PSV transport badges</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="text-center pt-4">
          <button
            onClick={() => onNavigate('/fleet')}
            className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition inline-flex items-center gap-2"
          >
            <span>Access Fleet Operator Portal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
