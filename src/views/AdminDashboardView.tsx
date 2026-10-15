import React, { useState } from 'react';
import {
  Shield,
  Users,
  Car,
  TrendingUp,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  RotateCcw,
  Sparkles,
  DollarSign,
  FileText
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { DriverProfile, RidePool, PaymentRecord, SafetyIncident, AuditLog } from '../types';

interface AdminDashboardViewProps {
  onNavigate: (route: string) => void;
  onOpenTestSuite: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  onNavigate,
  onOpenTestSuite,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'kyc' | 'pools' | 'payments' | 'incidents' | 'audit'>('overview');
  const [refundModalPayment, setRefundModalPayment] = useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('Customer flight diverted / cancelled');
  const [rejectDocModal, setRejectDocModal] = useState<{ driverId: string; docId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('Document blurred or expired');
  const [showResetModal, setShowResetModal] = useState(false);

  const state = db.getState();
  const { users, driverProfiles, pools, bookings, payments, safetyIncidents, auditLogs, organizations } = state;

  // Platform Metrics
  const totalPassengers = users.filter((u) => u.role === 'passenger').length;
  const activeDriversCount = driverProfiles.filter((d) => d.isAvailable && d.verificationStatus === 'approved').length;
  const totalGMVPaise = payments.reduce((sum, p) => (p.status === 'captured' ? sum + p.amountPaise : sum), 0);
  const platformRevenuePaise = Math.round(totalGMVPaise * 0.15);
  const totalSavingsPaise = bookings.reduce((sum, b) => sum + b.savingsPaise, 0);
  const openIncidentsCount = safetyIncidents.filter((i) => i.status === 'OPEN').length;
  const pendingKycCount = driverProfiles.filter((d) => d.verificationStatus === 'under_review').length;

  // Handlers
  const handleApproveDoc = (driverId: string, docId: string) => {
    db.verifyDriverDocument(driverId, docId, 'approved');
  };

  const handleOpenRejectDocModal = (driverId: string, docId: string) => {
    setRejectDocModal({ driverId, docId });
  };

  const handleConfirmRejectDoc = () => {
    if (!rejectDocModal) return;
    db.verifyDriverDocument(rejectDocModal.driverId, rejectDocModal.docId, 'rejected', rejectReason);
    setRejectDocModal(null);
  };

  const handleProcessRefund = () => {
    if (!refundModalPayment) return;
    db.processRefund(refundModalPayment.id, refundModalPayment.amountPaise, refundReason, 'admin-vikram');
    setRefundModalPayment(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Admin Header */}
        <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">AeroPool Super Admin Console</h1>
                <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 font-bold uppercase">
                  ROOT RBAC
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Central Operations, KYC Approvals, Financial Oversight & CSMIA Airport Audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenTestSuite}
              className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Run Automated QA Suite</span>
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
              title="Reset Demo Data"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset State</span>
            </button>
          </div>
        </div>

        {/* Executive Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Total Passengers</div>
            <div className="text-xl font-bold text-white font-mono">{totalPassengers}</div>
            <div className="text-[10px] text-emerald-400">Verified Mobile Accounts</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Drivers</div>
            <div className="text-xl font-bold text-white font-mono">{activeDriversCount}</div>
            <div className="text-[10px] text-sky-400">{driverProfiles.length} Total on Roster</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Platform GMV</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">{formatINR(totalGMVPaise)}</div>
            <div className="text-[10px] text-slate-400">Gross Processed</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Platform Take (15%)</div>
            <div className="text-xl font-bold text-sky-400 font-mono">{formatINR(platformRevenuePaise)}</div>
            <div className="text-[10px] text-slate-400">Net Revenue</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Passenger Savings</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">{formatINR(totalSavingsPaise)}</div>
            <div className="text-[10px] text-emerald-400">vs Individual Cabs</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Pending KYC / Incidents</div>
            <div className="text-xl font-bold text-amber-400 font-mono">{pendingKycCount + openIncidentsCount}</div>
            <div className="text-[10px] text-amber-400">Needs Review</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'overview' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview & Fleets
          </button>
          <button
            onClick={() => setActiveTab('kyc')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'kyc' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Driver KYC Queue</span>
            {pendingKycCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                {pendingKycCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('pools')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'pools' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Pools Monitor ({pools.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'payments' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Payments & Refunds ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'incidents' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Safety & Support</span>
            {openIncidentsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center">
                {openIncidentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'audit' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit Log Ledger
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-bold text-white">Registered Fleet Partner Organizations</h2>
              <div className="space-y-3">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">{org.name}</div>
                      <div className="text-slate-400 font-mono mt-0.5">{org.businessRegNumber} • {org.contactEmail}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold">{org.totalVehicles} Vehicles • {org.activeDrivers} Drivers</div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {org.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DRIVER KYC QUEUE */}
        {activeTab === 'kyc' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">Driver Verification & Document Review</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect commercial permits, driving licences, and vehicle registration certificates before approving airport pickup dispatch.
              </p>
            </div>

            <div className="space-y-6">
              {driverProfiles.map((driver) => (
                <div key={driver.id} className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{driver.fullName}</span>
                        <span className="text-xs text-slate-400 font-mono">({driver.phone})</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Org: {driver.organizationName || 'Independent'} • Rating: ★ {driver.rating}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg border ${
                        driver.verificationStatus === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : driver.verificationStatus === 'rejected'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                      }`}
                    >
                      {driver.verificationStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Documents List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {driver.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-200">{doc.type.replace(/_/g, ' ')}</div>
                          <div className="font-mono text-slate-400 text-[11px] mt-0.5">{doc.documentNumber}</div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {doc.status !== 'approved' && (
                            <button
                              onClick={() => handleApproveDoc(driver.id, doc.id)}
                              className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-md border border-emerald-500/30"
                              title="Approve Document"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {doc.status !== 'rejected' && (
                            <button
                              onClick={() => handleOpenRejectDocModal(driver.id, doc.id)}
                              className="p-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-md border border-red-500/30"
                              title="Reject Document"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <span className="text-[10px] font-mono text-slate-400 uppercase ml-1">{doc.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: LIVE POOLS MONITOR */}
        {activeTab === 'pools' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Live CSMIA Ride Pools & Occupancy</h2>
            <div className="space-y-4">
              {pools.map((pool) => (
                <div key={pool.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{pool.targetCorridor}</span>
                        <span className="text-xs text-sky-400 font-mono">({pool.terminal})</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Zone: {pool.pickupZone.name} • Vehicle: {pool.vehicleModel || 'Innova Crysta'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {pool.status}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Seats Left: <strong className="text-white">{pool.availableSeats} of {pool.totalSeats}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Passenger mini-pills */}
                  {pool.passengers.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs">
                      {pool.passengers.map((p) => (
                        <div key={p.bookingId} className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 text-slate-300">
                          {p.passengerName} → {p.destination.name.split('(')[0]} ({formatINR(p.farePaidPaise)})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: PAYMENTS & REFUNDS */}
        {activeTab === 'payments' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Payments & Instant Refunds</h2>
            <div className="space-y-3">
              {payments.map((pay) => (
                <div key={pay.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white text-sm">{pay.passengerName}</div>
                    <div className="text-slate-400 font-mono mt-0.5">
                      Order: {pay.razorpayOrderId} • Pay ID: {pay.razorpayPaymentId}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold text-sm">{formatINR(pay.amountPaise)}</div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400">{pay.status}</span>
                    </div>

                    {pay.status === 'captured' && (
                      <button
                        onClick={() => setRefundModalPayment(pay)}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold transition"
                      >
                        Refund
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: SAFETY & SUPPORT INCIDENTS */}
        {activeTab === 'incidents' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Safety Incidents & Emergency Escalations</h2>
            <div className="space-y-3">
              {safetyIncidents.map((inc) => (
                <div key={inc.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span>{inc.incidentType}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        {inc.severity}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono uppercase text-slate-400">{inc.status}</span>
                  </div>
                  <p className="text-slate-300">{inc.description}</p>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Reported by {inc.reporterName} at {new Date(inc.reportedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: AUDIT LOG LEDGER */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Immutable System Audit Log</h2>
            <div className="space-y-2 font-mono text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-300">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="text-sky-400 font-bold">{log.action}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div>{log.details}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Actor: {log.actorName} ({log.actorRole})</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white text-red-400">
              Issue Refund: {formatINR(refundModalPayment.amountPaise)}
            </h3>
            <p className="text-xs text-slate-300">
              Process instant refund to passenger <strong>{refundModalPayment.passengerName}</strong>.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Reason for Refund</label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRefundModalPayment(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Document Rejection Modal */}
      {rejectDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white text-rose-400">
              Reject Compliance Document
            </h3>
            <p className="text-xs text-slate-300">
              Please enter the compliance rejection reason for audit and driver notification:
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rejection Reason</label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Expired badge or blurry scan"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectDocModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejectDoc}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition"
              >
                Reject Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database State Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">
              Reset Demo Database State?
            </h3>
            <p className="text-xs text-slate-300">
              This will restore all sample bookings, pools, drivers, vehicles, and audit records to the initial pristine state.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  db.resetToDemoData();
                  setShowResetModal(false);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
