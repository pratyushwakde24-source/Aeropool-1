import React from 'react';
import { ArrowLeft, Shield, FileText, CheckCircle2 } from 'lucide-react';

interface LegalTermsViewProps {
  onNavigate: (route: string) => void;
  section?: 'terms' | 'privacy';
}

export const LegalTermsView: React.FC<LegalTermsViewProps> = ({ onNavigate, section = 'terms' }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <button
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div>
          <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">
            Legal & Regulatory Governance
          </span>
          <h1 className="text-3xl font-extrabold text-white mt-1">
            {section === 'privacy' ? 'Privacy Policy & Location Consent' : 'Terms of Service & Cancellation Policy'}
          </h1>
          <p className="text-slate-400 text-xs mt-2">
            Last revised: October 2026 • Governing Law: Maharashtra, India
          </p>
        </div>

        <div className="space-y-6 text-xs text-slate-300 leading-relaxed bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-white">1. Platform Nature & Role</h2>
            <p>
              AeroPool Mobility Technologies Pvt. Ltd. operates an electronic platform that coordinates shared rides among passengers arriving at Chhatrapati Shivaji Maharaj International Airport (CSMIA) and licensed transport operators. AeroPool does not own motor vehicles or employ transport drivers directly.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-white">2. Transparent Pricing in Minor Units (Paise)</h2>
            <p>
              All fare estimates, splits, tolls, and refunds are calculated in integer paise. Fares include mandatory airport entry and parking cess as mandated by the airport operator (Adani Airports CSMIA) and applicable Goods & Services Tax (GST).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-white">3. Cancellation & Refund Policy</h2>
            <p>
              - Cancellations made prior to 15 minutes before the scheduled pickup window are entitled to a 100% full refund with zero cancellation fee.
              <br />
              - If a passenger cancels after the assigned driver has arrived at the terminal pickup bay, a nominal airport waiting fee of ₹100 (10,000 paise) may be withheld to compensate the driver partner.
              <br />
              - In the event of flight delays or cancellations verified by airport flight records, passengers are entitled to immediate reassignment or a full refund.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-white">4. GPS & Location Data Privacy</h2>
            <p>
              AeroPool requests device geolocation exclusively to facilitate pickup navigation and in-ride safety tracking. Location updates from drivers and passengers are captured only during active, authorized bookings and are never monetized or sold to third parties.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
