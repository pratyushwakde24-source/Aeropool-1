import React, { useState } from 'react';
import { ArrowLeft, FileCheck, CheckCircle2, Clock, XCircle, Upload, Shield } from 'lucide-react';
import { db } from '../services/db';

interface DriverKYCViewProps {
  onNavigate: (route: string) => void;
}

export const DriverKYCView: React.FC<DriverKYCViewProps> = ({ onNavigate }) => {
  const currentUser = db.getState().currentUser;
  const driver = db.getState().driverProfiles.find((d) => d.userId === currentUser.id) || db.getState().driverProfiles[0];

  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleSimulateUpload = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => onNavigate('/driver')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Driver Dashboard</span>
        </button>

        <div>
          <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">
            Verification & Compliance
          </span>
          <h1 className="text-2xl font-bold text-white mt-1">Driver Partner KYC & Documents</h1>
          <p className="text-xs text-slate-400 mt-1">
            Mandatory documents required to accept shared passenger pools from CSMIA Mumbai airport.
          </p>
        </div>

        {/* Verification Status Overview Banner */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white capitalize">{driver.fullName}</div>
              <div className="text-xs text-slate-400">
                Overall Verification Status:{' '}
                <strong className={driver.verificationStatus === 'approved' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {driver.verificationStatus.toUpperCase()}
                </strong>
              </div>
            </div>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-xl border border-slate-700">
            Badge: MH-PSV-9921
          </span>
        </div>

        {/* Documents List */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Submitted Documents</h2>
          {driver.documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">{doc.type.replace(/_/g, ' ')}</div>
                  <div className="text-slate-400 font-mono mt-0.5">Doc #{doc.documentNumber}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {doc.status === 'approved' && (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verified</span>
                  </span>
                )}
                {doc.status === 'under_review' && (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    <Clock className="w-4 h-4" />
                    <span>In Review</span>
                  </span>
                )}
                {doc.status === 'rejected' && (
                  <span className="flex items-center gap-1.5 text-red-400 font-semibold bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20">
                    <XCircle className="w-4 h-4" />
                    <span>Action Required</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Upload Document Form */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white">Upload Document Update / Renewal</h3>
          {uploadSuccess ? (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
              Document uploaded successfully! AeroPool compliance team will review within 4 business hours.
            </div>
          ) : (
            <form onSubmit={handleSimulateUpload} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Document Category</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white">
                  <option>COMMERCIAL_PERMIT (All India / Maharashtra)</option>
                  <option>VEHICLE_RC (Smart Card / Digilocker)</option>
                  <option>POLICE_VERIFICATION_CERTIFICATE</option>
                  <option>ANNUAL_VEHICLE_FITNESS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Document / Certificate Number</label>
                <input
                  type="text"
                  placeholder="e.g. MH-RTO-2026-98124"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Document for Review</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
