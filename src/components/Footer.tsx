import React from 'react';
import { Plane, Shield, MapPin, PhoneCall, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (route: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-slate-950 border-t border-slate-800/80 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <Plane className="w-4 h-4 -rotate-45" />
              </div>
              <span className="text-base font-extrabold text-white">AeroPool</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Connecting passengers arriving at Chhatrapati Shivaji Maharaj International Airport (CSMIA) with travellers heading in the same direction. Save up to 40% on airport transit with verified commercial fleet partners.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span>CSMIA Terminals 1 & 2, Sahar, Andheri East, Mumbai 400099</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">Platform</div>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('/')} className="hover:text-white transition">
                  Home
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/app/book')} className="hover:text-white transition">
                  Book Airport Pool
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/how-it-works')} className="hover:text-white transition">
                  How It Works
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/safety')} className="hover:text-white transition">
                  Safety & KYC Verification
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/fleet-partners')} className="hover:text-white transition">
                  Become a Fleet Partner
                </button>
              </li>
            </ul>
          </div>

          {/* CSMIA Mumbai Terminals */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">Mumbai Terminals</div>
            <ul className="space-y-2">
              <li className="text-slate-300">
                <span className="font-semibold text-white">Terminal 2:</span> Level P4 East Pillar 4-6
              </li>
              <li className="text-slate-300">
                <span className="font-semibold text-white">Terminal 2 MLCP:</span> Level P7 Bay C
              </li>
              <li className="text-slate-300">
                <span className="font-semibold text-white">Terminal 1:</span> Domestic Arrival Pillar 3-4
              </li>
              <li>
                <button onClick={() => onNavigate('/faq')} className="text-sky-400 hover:underline">
                  Pickup Zone Guide →
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">Compliance & Trust</div>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('/terms')} className="hover:text-white transition">
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/privacy')} className="hover:text-white transition">
                  Privacy Policy & GPS Consent
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/terms')} className="hover:text-white transition">
                  Cancellation & Refund Policy
                </button>
              </li>
              <li className="pt-2 text-[11px] text-emerald-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Maharashtra Transport Dept Compliant</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <div>
            © {new Date().getFullYear()} AeroPool Mobility Technologies Pvt Ltd. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <PhoneCall className="w-3 h-3 text-sky-400" />
              <span>24x7 Airport Desk: 1800-209-AERO</span>
            </span>
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-sky-400" />
              <span>support@aeropool.in</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
