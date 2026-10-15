import React, { useState } from 'react';
import { AlertTriangle, PhoneCall, Share2, ShieldAlert, X, Check, FileText } from 'lucide-react';
import { db } from '../services/db';

interface SafetyModalProps {
  isOpen: boolean;
  bookingId?: string;
  passengerName: string;
  driverPhone?: string;
  onClose: () => void;
}

export const SafetyModal: React.FC<SafetyModalProps> = ({
  isOpen,
  bookingId,
  passengerName,
  driverPhone = '+91 98192 33104',
  onClose,
}) => {
  const [incidentType, setIncidentType] = useState<
    'EMERGENCY_SOS' | 'ROUTE_DEVIATION' | 'DRIVER_BEHAVIOR' | 'VEHICLE_ISSUE'
  >('ROUTE_DEVIATION');
  const [description, setDescription] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!isOpen) return null;

  const handleShareTrip = () => {
    const trackingUrl = window.location.origin;
    navigator.clipboard?.writeText(trackingUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    db.reportSafetyIncident({
      bookingId,
      reporterId: db.getState().currentUser.id,
      reporterRole: db.getState().currentUser.role,
      reporterName: passengerName,
      incidentType,
      description,
      severity: incidentType === 'EMERGENCY_SOS' ? 'CRITICAL' : 'HIGH',
    });

    setIsSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-white" />
            <div>
              <div className="text-xs uppercase tracking-wider text-red-200 font-semibold">Safety & Emergency Hub</div>
              <h3 className="text-base font-bold">AeroPool Rapid Assistance</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legal Disclaimer */}
        <div className="p-4 bg-red-950/30 border-b border-red-500/20 text-xs text-red-200 flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <strong>Important Notice:</strong> For immediate, life-threatening emergencies, dial <strong>112</strong> directly. AeroPool Safety Ops works in parallel with local authorities and CSMIA airport security.
          </div>
        </div>

        {/* Emergency Quick Action Buttons */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <a
              href="tel:112"
              className="p-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition text-center"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Dial 112 (Police)</span>
            </a>
            <a
              href="tel:02266851010"
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition text-center"
            >
              <PhoneCall className="w-4 h-4 text-sky-400" />
              <span>CSMIA Security</span>
            </a>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleShareTrip}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-sky-400" />}
              <span>{linkCopied ? 'Trip Link Copied!' : 'Share Live Trip with Family'}</span>
            </button>
            <a
              href={`tel:${driverPhone}`}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              <PhoneCall className="w-4 h-4 text-amber-400" />
              <span>Call Driver</span>
            </a>
          </div>

          {/* Report an Incident Form */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Report An Active Incident</span>
            </div>

            {isSubmitted ? (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Incident Logged with Safety Desk
                </div>
                <p>Case ID #{Math.floor(1000 + Math.random() * 9000)}. Our duty officer has been alerted to review the vehicle GPS trace.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Incident Category</label>
                  <select
                    value={incidentType}
                    onChange={(e: any) => setIncidentType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="ROUTE_DEVIATION">Unplanned Route Deviation</option>
                    <option value="DRIVER_BEHAVIOR">Driver Conduct / Speeding</option>
                    <option value="VEHICLE_ISSUE">Vehicle Condition / Air Conditioning</option>
                    <option value="EMERGENCY_SOS">Emergency SOS Urgent Escalation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Details & Context</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what is happening..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs rounded-xl transition"
                >
                  Submit Priority Report to AeroPool Ops
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
