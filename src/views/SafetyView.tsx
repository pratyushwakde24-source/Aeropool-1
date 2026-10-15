import React from 'react';
import { ArrowLeft, ShieldCheck, Lock, AlertTriangle, PhoneCall, CheckCircle2, FileCheck } from 'lucide-react';

interface SafetyViewProps {
  onNavigate: (route: string) => void;
}

export const SafetyView: React.FC<SafetyViewProps> = ({ onNavigate }) => {
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
          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">
            Trust & Security Charter
          </span>
          <h1 className="text-3xl font-extrabold text-white mt-1">Passenger Safety & Verification Standards</h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            How AeroPool protects flyers through rigorous commercial driver screening, airport compliance, and live telemetry.
          </p>
        </div>

        {/* 4 Pillars of Safety */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Triple Document Verification</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every driver must submit a valid Commercial Public Service Vehicle (PSV) Badge, valid Driving Licence, Vehicle Registration Certificate (RC), and Annual Fitness Certificate issued by the Maharashtra Transport Department.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Boarding OTP Security Gate</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Before any shared taxi departs from CSMIA airport, each passenger provides a unique 4-digit One-Time Password to the driver. The driver's app will not allow trip initiation until all passenger OTPs are authenticated.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Live Route Telemetry</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              During an active trip, vehicle coordinates are updated in real-time. Any unexpected deviation exceeding 3 kilometers triggers an automated alert in our Central Operations Center.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Emergency Response Escalation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              One-touch integration with Mumbai Police Control Room (112) and CSMIA Airport Security. Passengers can instantly share their trip link with family members via WhatsApp or SMS.
            </p>
          </div>
        </div>

        {/* Emergency Disclosure */}
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-white">Emergency Services Notice:</strong> AeroPool provides technology coordination and rapid response dispatch to verified fleet partners. In any imminent life-threatening emergency, passengers are advised to dial 112 directly.
          </div>
        </div>
      </div>
    </div>
  );
};
