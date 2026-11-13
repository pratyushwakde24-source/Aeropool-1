import React, { useState } from 'react';
import {
  Info,
  Plane,
  ShieldCheck,
  Car,
  HelpCircle,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  ExternalLink,
  MapPin,
  Clock,
  Sparkles,
  PhoneCall,
  UserCheck,
  FileCheck,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { PICKUP_ZONES } from '../services/geoService';

interface InformationCentreProps {
  onNavigate: (route: string) => void;
}

export const InformationCentre: React.FC<InformationCentreProps> = ({ onNavigate }) => {
  // Modal states for rich informational drawers
  const [activeModal, setActiveModal] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Info className="w-5 h-5 text-[#00DDF5]" />
            <span>Information & Governance Centre</span>
          </h2>
          <p className="text-xs text-[#A8B5CA] mt-0.5">
            Essential airport guides, safety standards, fleet onboarding, and legal policies.
          </p>
        </div>
      </div>

      {/* 6-CATEGORY GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* =========================================================================
            CATEGORY 1: ABOUT AEROPOOL
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">About AeroPool</h3>
              <p className="text-[11px] text-[#A8B5CA]">Company overview & airport pooling vision</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveModal('about-us')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">About Us</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/how-it-works')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">How AeroPool Works</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('pooling-concept')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Our Airport Pooling Concept</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 2: AIRPORT INFORMATION
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00DDF5]">
              <Plane className="w-4 h-4 -rotate-45" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Airport Information</h3>
              <p className="text-[11px] text-[#A8B5CA]">CSMIA Terminal 1 & 2 pickup guidance</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveModal('terminal-t1')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <div>
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">CSMIA Terminal 1 (T1)</span>
                <span className="text-[10px] text-slate-400 block">Domestic Santacruz • Pillars 3–4</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('terminal-t2')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <div>
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">CSMIA Terminal 2 (T2)</span>
                <span className="text-[10px] text-slate-400 block">International/Domestic Sahar • Level P4 East & P7</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('pickup-zones')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Pickup Zones Directory</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/faq')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Airport Pickup Guide</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 3: SAFETY AND TRUST
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Safety and Trust</h3>
              <p className="text-[11px] text-[#A8B5CA]">KYC standards, driver checks & passenger safety</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveModal('driver-verification')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Driver Verification & Badging</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('kyc-info')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">KYC & Document Verification</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('passenger-safety')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Passenger Safety & 24/7 SOS</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/safety')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Ride-Sharing Safety Charter</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 4: FLEET PARTNERS
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Fleet Partners</h3>
              <p className="text-[11px] text-[#A8B5CA]">Commercial operator onboarding & roster</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onNavigate('/fleet-partners')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Become a Fleet Partner</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('fleet-onboarding')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Fleet Onboarding Information</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 5: HELP AND SUPPORT
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Help and Support</h3>
              <p className="text-[11px] text-[#A8B5CA]">Flyer assistance, FAQs & ticket resolution</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onNavigate('/faq')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Help Centre</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/support')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Contact Support</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/faq')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Frequently Asked Questions</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 6: LEGAL AND GOVERNANCE
           ========================================================================= */}
        <div className="bg-[#0B1728]/95 border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-slate-700/40 border border-slate-600/50 flex items-center justify-center text-slate-300">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Legal and Compliance</h3>
              <p className="text-[11px] text-[#A8B5CA]">Terms, privacy, GPS consent & refunds</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onNavigate('/terms')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Terms of Service</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Privacy Policy and GPS Consent</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/terms')}
              className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center justify-between text-left transition group"
            >
              <span className="text-xs font-medium text-slate-200 group-hover:text-white">Cancellation and Refund Policy</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00DDF5] group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        </div>

      </div>

      {/* =========================================================================
          INTERACTIVE INFORMATION MODALS / DRAWERS
         ========================================================================= */}

      {/* MODAL 1: About Us */}
      {activeModal === 'about-us' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#00DDF5]" />
                <h3 className="text-base font-bold text-white">About AeroPool</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                AeroPool is Mumbai’s smart airport ride-pooling platform dedicated exclusively to travellers arriving at and departing from Chhatrapati Shivaji Maharaj International Airport (CSMIA BOM).
              </p>
              <p>
                By pairing arriving passengers sharing the same destination corridor, AeroPool lowers airport transit costs by up to 40% while reducing roadway traffic, airport kerbside congestion, and carbon emissions.
              </p>
              <div className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-1.5">
                <span className="text-xs font-bold text-white block">Our Core Principles</span>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Transparent integer minor unit pricing (paise) with zero surge extortion.</li>
                  <li>Fair driver compensation via standard 80/20 platform policy.</li>
                  <li>100% verified commercial transport fleet partners and driver KYC.</li>
                  <li>Strict corridor boundary isolation ensuring minimal passenger detours.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Our Airport Pooling Concept */}
      {activeModal === 'pooling-concept' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plane className="w-5 h-5 text-[#00DDF5] -rotate-45" />
                <h3 className="text-base font-bold text-white">Our Airport Pooling Concept</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Unlike generic city carpooling, airport pooling solves a specific challenge: thousands of travellers land simultaneously at CSMIA Mumbai with luggage and head towards the same municipal clusters (BKC, South Mumbai, Western Suburbs, Navi Mumbai).
              </p>
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">1. Arrival Window Grouping</span>
                  <span className="text-slate-400">Passengers arriving within an overlapping 15-minute window are matched automatically.</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">2. Corridor Boundary Isolation</span>
                  <span className="text-slate-400">South-bound passengers are never grouped with North-bound vehicles, eliminating detours.</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">3. Guaranteed Luggage Capacity</span>
                  <span className="text-slate-400">Every seat reservation includes confirmed boot capacity for 1 large check-in bag + carry-on.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Terminal 1 Info */}
      {activeModal === 'terminal-t1' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plane className="w-5 h-5 text-sky-400 -rotate-45" />
                <h3 className="text-base font-bold text-white">CSMIA Terminal 1 (T1) Domestic</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>Location:</strong> Western Express Highway, Navpada, Vile Parle East / Santacruz, Mumbai.
              </p>
              <div className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <MapPin className="w-4 h-4 text-[#00DDF5]" />
                  <span>AeroPool Dedicated Pickup Zone</span>
                </div>
                <p className="text-slate-300">
                  <strong>Domestic Arrivals Curbside — Pillars 3 to 4</strong>
                </p>
                <p className="text-slate-400 text-[11px]">
                  After exiting baggage claim, exit through Gate 2 onto the arrivals concourse. Look for the illuminated AeroPool zone markers adjacent to Pillar 3.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Terminal 2 Info */}
      {activeModal === 'terminal-t2' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plane className="w-5 h-5 text-cyan-400 -rotate-45" />
                <h3 className="text-base font-bold text-white">CSMIA Terminal 2 (T2) Sahar</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>Location:</strong> Sahar Airport Road, Andheri East, Mumbai.
              </p>
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-white font-bold text-xs">
                    <MapPin className="w-4 h-4 text-[#00DDF5]" />
                    <span>Primary Zone: Level P4 East (Pillars 4–6)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Take the arrivals elevator down to Parking Level P4. Head towards East Wing Pillars 4–6.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-white font-bold text-xs">
                    <MapPin className="w-4 h-4 text-sky-400" />
                    <span>Alternate Hub: MLCP Level P7 (Bay C)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Multi-Level Car Park P7 Bay C for premium and executive fleet dispatches.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Pickup Zones Directory */}
      {activeModal === 'pickup-zones' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#00DDF5]" />
                <h3 className="text-base font-bold text-white">CSMIA Pickup Zones Directory</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {PICKUP_ZONES.map((zone) => (
                <div key={zone.id} className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{zone.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                      {zone.terminalCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{zone.instructions}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Floor: {zone.floor} • Pillar: {zone.pillar}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Driver Verification Standards */}
      {activeModal === 'driver-verification' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Driver Verification & Badging</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Every driver operating on AeroPool undergoes multi-tier operational compliance before receiving airport dispatch privileges:
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                <li>Government-issued Commercial Driving License (Transport Category).</li>
                <li>Maharashtra Police Background Clearance certificate.</li>
                <li>Commercial vehicle permit and active airport taxi badge.</li>
                <li>Vehicle fitness, pollution, and comprehensive commercial passenger insurance.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: KYC Information */}
      {activeModal === 'kyc-info' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">KYC Verification Standards</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                AeroPool enforces KYC document verification via encrypted document vaults with strict MIME inspection and tamper-resistant storage.
              </p>
              <p>
                Fleet operators must maintain up-to-date GST registration, PAN cards, and verified bank accounts for settlement reconciliations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: Passenger Safety & SOS */}
      {activeModal === 'passenger-safety' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#00DDF5]" />
                <h3 className="text-base font-bold text-white">Passenger Safety & 24/7 SOS</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Your safety is AeroPool’s highest priority from flight landing to arrival at your doorstep:
              </p>
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">4-Digit Verification OTP</span>
                  <span className="text-slate-400">Drivers cannot initiate a trip until the passenger supplies the unique 4-digit OTP.</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">Direct Emergency SOS</span>
                  <span className="text-slate-400">In-app SOS triggers instant dispatch to Mumbai Police Control (112) and CSMIA Airport Security.</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B1728] border border-slate-800">
                  <span className="font-bold text-white block text-xs">Share Trip Live Link</span>
                  <span className="text-slate-400">Share your live GPS tracking status with friends and family with a single tap.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: Fleet Onboarding Information */}
      {activeModal === 'fleet-onboarding' && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in cursor-pointer sm:cursor-default"
        >
          <div className="w-full max-w-lg bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Fleet Onboarding Information</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Commercial fleet operators managing tourist taxis, app-cab aggregates, and executive chauffeur vehicles can onboard their fleets to receive predictable airport outbound pool assignments.
              </p>
              <div className="p-3 rounded-xl bg-[#0B1728] border border-slate-800 space-y-1 text-slate-400">
                <span className="font-bold text-white text-xs block">Key Benefits</span>
                <p>• 80% Driver / Fleet payout share on all completed corridor trips.</p>
                <p>• 100% full pass-through of airport entry tolls and parking cess.</p>
                <p>• Automated T+1 bank settlement via direct Razorpay/NEFT payouts.</p>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigate('/fleet-partners');
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow"
              >
                <span>Visit Commercial Fleet Onboarding Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
