import React, { useState, useEffect } from 'react';
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
  FileText,
  Activity,
  Server,
  Database,
  Plane,
  CreditCard,
  Bell,
  Cpu,
  Lock,
  Compass,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Radio,
  Zap,
  Clock,
  Navigation,
  Eye,
  ExternalLink,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { DriverProfile, RidePool, PaymentRecord, SafetyIncident, AuditLog } from '../types';
import { runFullDiagnosticsProbe, DiagnosticsReport, SubsystemDiagnostic, IntegrationHealthStatus } from '../services/diagnosticsService';
import { getOperatingMode, getAppConfig } from '../services/configService';
import { MapProviderSettingsCard } from '../components/MapProviderSettingsCard';
import { AdminFinancialCommandCenter } from '../components/AdminFinancialCommandCenter';
import { getActiveMapProvider } from '../services/maps';
import { getActiveCommissionPolicy } from '../services/commissionEngine';
import { womenOnlyService } from '../services/womenOnlyService';
import { WomenOnlyPoolConfig, WomenOnlyVerificationRecord } from '../types';
import { OperatorSettlement } from '../types';

interface AdminDashboardViewProps {
  onNavigate: (route: string) => void;
  onOpenTestSuite: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  onNavigate,
  onOpenTestSuite,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics' | 'kyc' | 'pools' | 'payments' | 'incidents' | 'audit' | 'maps' | 'women_pool'>('overview');
  const [womenConfig, setWomenConfig] = useState(womenOnlyService.getConfig());
  const [womenVerifications, setWomenVerifications] = useState(womenOnlyService.getAllVerificationRecords());
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);
  const [refundModalPayment, setRefundModalPayment] = useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('Customer flight diverted / cancelled');
  const [rejectDocModal, setRejectDocModal] = useState<{ driverId: string; docId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('Document blurred or expired');
  const [rejectDriverModal, setRejectDriverModal] = useState<{ driverId: string; fullName: string } | null>(null);
  const [rejectDriverReason, setRejectDriverReason] = useState('Commercial badge expired or vehicle fitness invalid');
  const [suspendDriverModal, setSuspendDriverModal] = useState<{ driverId: string; fullName: string } | null>(null);
  const [suspendDriverReason, setSuspendDriverReason] = useState('Safety compliance review or passenger report');
  const [kycFilter, setKycFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'>('ALL');
  const [kycSearchQuery, setKycSearchQuery] = useState('');
  const [adminPreviewDoc, setAdminPreviewDoc] = useState<{
    driverName: string;
    driverId: string;
    docId: string;
    type: string;
    number: string;
    fileUrl: string;
    downloadUrl?: string;
    mimeType?: string;
    expiryDate?: string;
    status: string;
  } | null>(null);
  const [dispatchFeedback, setDispatchFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [diagReport, setDiagReport] = useState<DiagnosticsReport | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [settlementFeedback, setSettlementFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reactive DB subscription
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  const handleRunDiagnostics = async () => {
    setIsProbing(true);
    try {
      const report = await runFullDiagnosticsProbe();
      setDiagReport(report);
    } catch (e) {
      console.error('Failed to run diagnostics probe', e);
    } finally {
      setIsProbing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'diagnostics' && !diagReport && !isProbing) {
      handleRunDiagnostics();
    }
  }, [activeTab]);

  const state = db.getState();
  const { users, driverProfiles, pools, bookings, payments, safetyIncidents, auditLogs, organizations, operatorSettlements = [], driverLedger = [] } = state;

  // Platform Metrics
  const totalPassengers = users.filter((u) => u.role === 'passenger').length;
  const activeDriversCount = driverProfiles.filter((d) => d.isAvailable && d.verificationStatus === 'approved').length;
  const totalGMVPaise = payments.reduce((sum, p) => (p.status === 'captured' ? sum + p.amountPaise : sum), 0);
  const activeCommissionPolicy = getActiveCommissionPolicy();
  const platformRevenuePaise = Math.round(totalGMVPaise * (activeCommissionPolicy.platformCommissionPercent / 100));
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

  
  const handleApproveSettlement = (settlementId: string) => {
    const actorId = state.currentUser?.id || 'admin';
    const actorRole = state.currentUser?.role || 'admin';
    const res = db.approveSettlement(settlementId, actorId, actorRole, 'Approved in Admin Console');
    if (res.success) {
      setSettlementFeedback({ type: 'success', message: `Settlement ${settlementId} approved successfully.` });
    } else {
      setSettlementFeedback({ type: 'error', message: res.error || 'Approval failed' });
    }
    setTimeout(() => setSettlementFeedback(null), 4000);
  };

  const handleProcessRefund = () => {
    if (!refundModalPayment) return;
    const actorId = state.currentUser?.id || 'admin';
    db.processRefund(refundModalPayment.id, refundModalPayment.amountPaise, refundReason, actorId);
    setRefundModalPayment(null);
  };

  const handleApproveDriverApplication = async (driver: DriverProfile) => {
    const actorId = state.currentUser?.id || 'admin';
    const res = db.adminReviewDriverApplication({
      driverId: driver.id,
      status: 'approved',
      adminId: actorId,
      adminRole: 'admin',
    });
    if (res.success) {
      setDispatchFeedback({
        type: 'success',
        message: `Driver partner ${driver.fullName} approved successfully. Role synchronized to driver.`,
      });
      // Synchronize with server endpoint in background
      fetch('/api/admin/verify-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          userId: driver.userId,
          status: 'approved',
          notes: 'Approved via Super Admin console',
        }),
      }).catch((e) => console.warn('Server verify-kyc sync:', e));
    } else {
      setDispatchFeedback({
        type: 'error',
        message: res.error || 'Failed to approve driver application.',
      });
    }
  };

  const handleConfirmRejectDriver = async () => {
    if (!rejectDriverModal) return;
    const actorId = state.currentUser?.id || 'admin';
    const res = db.adminReviewDriverApplication({
      driverId: rejectDriverModal.driverId,
      status: 'rejected',
      reason: rejectDriverReason,
      adminId: actorId,
      adminRole: 'admin',
    });
    if (res.success) {
      setDispatchFeedback({
        type: 'success',
        message: `Driver ${rejectDriverModal.fullName} application rejected. Rejection reason logged.`,
      });
      fetch('/api/admin/verify-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: rejectDriverModal.driverId,
          status: 'rejected',
          notes: rejectDriverReason,
        }),
      }).catch((e) => console.warn('Server verify-kyc sync:', e));
    }
    setRejectDriverModal(null);
  };

  const handleConfirmSuspendDriver = async () => {
    if (!suspendDriverModal) return;
    const actorId = state.currentUser?.id || 'admin';
    const res = db.adminReviewDriverApplication({
      driverId: suspendDriverModal.driverId,
      status: 'suspended',
      reason: suspendDriverReason,
      adminId: actorId,
      adminRole: 'admin',
    });
    if (res.success) {
      setDispatchFeedback({
        type: 'success',
        message: `Driver ${suspendDriverModal.fullName} suspended. Dispatch privileges revoked.`,
      });
      fetch('/api/admin/verify-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: suspendDriverModal.driverId,
          status: 'suspended',
          notes: suspendDriverReason,
        }),
      }).catch((e) => console.warn('Server verify-kyc sync:', e));
    }
    setSuspendDriverModal(null);
  };

  const handleAssignDriverToPool = (poolId: string, driverId: string) => {
    setDispatchFeedback(null);
    if (!driverId) return;
    const driver = driverProfiles.find((d) => d.id === driverId || d.userId === driverId);
    if (!driver) return;
    const vehicleId =
      driver.assignedVehicle?.id ||
      (driver as any).assignedVehicleId ||
      state.vehicles.find((v) => v.status === 'ACTIVE' && v.organizationId === driver.organizationId)?.id ||
      state.vehicles.find((v) => v.status === 'ACTIVE')?.id;
    if (!vehicleId) {
      setDispatchFeedback({
        type: 'error',
        message: `No active vehicle available for driver ${driver.fullName}.`,
      });
      return;
    }

    const actorId = state.currentUser?.id || 'admin';
    const res = db.assignDriverToPool({
      poolId,
      driverId: driver.id,
      vehicleId,
      actorId,
    });

    if (res.success) {
      setDispatchFeedback({
        type: 'success',
        message: `Driver ${driver.fullName} assigned to pool #${poolId.slice(-6)} successfully.`,
      });
    } else {
      setDispatchFeedback({
        type: 'error',
        message: res.error || 'Failed to assign driver.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-3 pb-24 sm:py-6 sm:pb-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Admin Header / Super Admin Console Card */}
        <div className="relative overflow-hidden bg-slate-900/95 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-xl shadow-slate-950/50 backdrop-blur-sm">
          {/* Subtle top accent highlight */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Identity & Scope */}
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-b from-sky-500/15 to-sky-500/5 text-sky-400 border border-sky-500/25 flex items-center justify-center shrink-0 shadow-inner">
                <Shield className="w-5 h-5 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    AeroPool Super Admin Console
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/25 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    ROOT RBAC
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Central Operations, KYC Approvals, Financial Oversight &amp; CSMIA Airport Audit
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-3 sm:pt-0 border-t border-slate-800/60 sm:border-t-0 shrink-0">
              <button
                type="button"
                onClick={onOpenTestSuite}
                className="group inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-150 shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-12 transition-transform duration-200" />
                <span>Run Automated QA Suite</span>
              </button>
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="group inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 active:scale-[0.98] border border-slate-700/60 hover:border-slate-600 transition-all duration-150 shadow-sm cursor-pointer"
                title="Reset Demo Data"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400 group-hover:-rotate-45 transition-transform duration-200" />
                <span>Reset State</span>
              </button>
            </div>
          </div>
        </div>

        {/* Executive Metric / KPI Dashboard Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
          {/* Total Passengers */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Total Passengers
              </span>
              <div className="w-5 h-5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center justify-center shrink-0">
                <Users className="w-3 h-3 text-slate-300" />
              </div>
            </div>
            <div className="my-1.5">
              <div className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
                {totalPassengers.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="text-[10px] font-medium text-emerald-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">Verified Mobile Accounts</span>
            </div>
          </div>

          {/* Active Drivers */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Active Drivers
              </span>
              <div className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                <Car className="w-3 h-3 text-sky-400" />
              </div>
            </div>
            <div className="my-1.5">
              <div className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
                {activeDriversCount.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="text-[10px] font-medium text-sky-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
              <span className="truncate">{driverProfiles.length} Total on Roster</span>
            </div>
          </div>

          {/* Platform GMV */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Platform GMV
              </span>
              <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
            <div className="my-1.5">
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                {formatINR(totalGMVPaise)}
              </div>
            </div>
            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
              <span className="truncate">Gross Processed</span>
            </div>
          </div>

          {/* Platform Commission */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                  Commission
                </span>
                <span className="text-[9px] font-mono text-sky-300 bg-sky-500/15 px-1 py-0.2 rounded border border-sky-500/25 shrink-0">
                  {activeCommissionPolicy.policyName.includes('80/20') ? '20%' : '15%'}
                </span>
              </div>
              <div className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                <CreditCard className="w-3 h-3 text-sky-400" />
              </div>
            </div>
            <div className="my-1.5">
              <div className="text-xl sm:text-2xl font-bold font-mono text-sky-400 tracking-tight">
                {formatINR(platformRevenuePaise)}
              </div>
            </div>
            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
              <span className="truncate">Net Revenue</span>
            </div>
          </div>

          {/* Passenger Savings */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Passenger Savings
              </span>
              <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
            <div className="my-1.5">
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                {formatINR(totalSavingsPaise)}
              </div>
            </div>
            <div className="text-[10px] font-medium text-emerald-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">vs Individual Cabs</span>
            </div>
          </div>

          {/* Pending KYC / Incidents */}
          <div className="relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-200 shadow-md shadow-slate-950/40 min-h-[110px] sm:min-h-[118px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Pending Actions
              </span>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                pendingKycCount + openIncidentsCount > 0
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                <AlertTriangle className="w-3 h-3" />
              </div>
            </div>
            <div className="my-1.5">
              <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
                pendingKycCount + openIncidentsCount > 0 ? 'text-amber-400' : 'text-slate-300'
              }`}>
                {(pendingKycCount + openIncidentsCount).toLocaleString('en-IN')}
              </div>
            </div>
            <div className={`text-[10px] font-medium flex items-center gap-1 truncate ${
              pendingKycCount + openIncidentsCount > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                pendingKycCount + openIncidentsCount > 0 ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <span className="truncate">
                {pendingKycCount + openIncidentsCount > 0
                  ? `${pendingKycCount} KYC / ${openIncidentsCount} Incidents`
                  : 'All Systems Normal'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'overview' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview & Fleets
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'diagnostics' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Health & Diagnostics</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>
          <button
            onClick={() => setActiveTab('kyc')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'kyc' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
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
              activeTab === 'pools' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Pools Monitor ({pools.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'payments' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Payments & Refunds ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'incidents' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
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
              activeTab === 'audit' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit Log Ledger
          </button>
          <button
            onClick={() => setActiveTab('maps')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'maps'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Map Provider Engine</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-cyan-950 border border-cyan-800 text-cyan-300 rounded font-bold">
              {getActiveMapProvider() === 'mapbox' ? 'Mapbox' : 'Google'}
            </span>
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

        {/* TAB: HEALTH & INTEGRATION DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Top Diagnostics Status Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-sky-400" />
                    <span>Subsystem Health & Integration Diagnostics</span>
                  </h2>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      getOperatingMode() === 'production'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : getOperatingMode() === 'sandbox'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    }`}
                  >
                    MODE: {getOperatingMode()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Real-time configuration and connectivity audit across all 7 platform backends. Non-sensitive read-only probes with latency metrics.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRunDiagnostics}
                  disabled={isProbing}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                  <span>{isProbing ? 'Probing Subsystems...' : 'Run Live Diagnostic Probe'}</span>
                </button>
              </div>
            </div>

            {/* Operating Mode Safeguards Notice */}
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                getOperatingMode() === 'production'
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : getOperatingMode() === 'sandbox'
                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                  : 'bg-sky-950/30 border-sky-500/40 text-sky-200'
              }`}
            >
              <Shield className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-white text-sm">
                  {getOperatingMode() === 'production'
                    ? 'Production Safeguards Active: Real PostgreSQL Required'
                    : getOperatingMode() === 'sandbox'
                    ? 'Sandbox Mode Active: Gateway Test Credentials & Tagged Ledger'
                    : 'Development Mode Active: Sample Data with Local Capacity Locking'}
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {getOperatingMode() === 'production'
                    ? 'All ride pools, bookings, driver dispatches, and financial transactions require live Supabase PostgreSQL persistence. Offline temporary fallback is strictly prohibited. Mock payments cannot be captured.'
                    : getOperatingMode() === 'sandbox'
                    ? 'Operating with Razorpay test keys (rzp_test_*). All transactions are tagged with is_sandbox = true. No real bank accounts or passenger cards are charged.'
                    : 'Running in local transactional mode with complete ACID concurrency simulation, capacity locking, and sample CSMIA flight schedule.'}
                </p>
              </div>
            </div>

            {/* Diagnostics Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diagReport?.subsystems.map((subsystem) => {
                const getStatusBadge = (status: IntegrationHealthStatus) => {
                  switch (status) {
                    case 'PRODUCTION_VERIFIED':
                    case 'CONNECTED_AND_VERIFIED':
                      return (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Production Verified</span>
                        </span>
                      );
                    case 'MIGRATIONS_APPLIED':
                      return (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Migrations Applied</span>
                        </span>
                      );
                    case 'DATABASE_CONNECTED':
                      return (
                        <span className="bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Database Connected</span>
                        </span>
                      );
                    case 'INTEGRATION_TESTED':
                      return (
                        <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Integration Tested</span>
                        </span>
                      );
                    case 'AWAITING_APPROVAL':
                      return (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Awaiting Approval</span>
                        </span>
                      );
                    case 'CONFIGURATION_MISSING':
                    case 'MISSING_CREDENTIALS':
                      return (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Configuration Missing</span>
                        </span>
                      );
                    case 'SOURCE_CODE_IMPLEMENTED':
                      return (
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          <span>Source Code Implemented</span>
                        </span>
                      );
                    case 'CONFIGURED':
                      return (
                        <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Configured</span>
                        </span>
                      );
                    case 'CONFIGURED_BUT_FAILING':
                      return (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Configured But Failing</span>
                        </span>
                      );
                    case 'SANDBOX_MODE':
                      return (
                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>Sandbox Mode</span>
                        </span>
                      );
                    case 'NOT_IMPLEMENTED':
                    default:
                      return (
                        <span className="bg-slate-500/10 text-slate-400 border border-slate-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          <span>Not Implemented</span>
                        </span>
                      );
                  }
                };

                const getSubsystemIcon = (cat: string) => {
                  switch (cat) {
                    case 'DATABASE':
                      return <Database className="w-4 h-4 text-sky-400" />;
                    case 'AUTH':
                      return <Lock className="w-4 h-4 text-emerald-400" />;
                    case 'FLIGHTS':
                      return <Plane className="w-4 h-4 text-blue-400" />;
                    case 'MAPS':
                      return <Compass className="w-4 h-4 text-amber-400" />;
                    case 'PAYMENTS':
                      return <CreditCard className="w-4 h-4 text-cyan-400" />;
                    case 'NOTIFICATIONS':
                      return <Bell className="w-4 h-4 text-rose-400" />;
                    case 'BACKGROUND_JOBS':
                      return <Cpu className="w-4 h-4 text-teal-400" />;
                    default:
                      return <Server className="w-4 h-4 text-slate-400" />;
                  }
                };

                return (
                  <div
                    key={subsystem.id}
                    className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                            {getSubsystemIcon(subsystem.category)}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-white">{subsystem.name}</h3>
                            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{subsystem.category}</div>
                          </div>
                        </div>
                        <div>{getStatusBadge(subsystem.status)}</div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                        {subsystem.summary}
                      </p>
                    </div>

                    {/* Technical Metadata (Safe, non-secret parameters) */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] font-mono">
                      {Object.entries(subsystem.details).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between text-slate-400">
                          <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                          <span className="text-slate-200 font-semibold">{String(v)}</span>
                        </div>
                      ))}
                      {subsystem.pingMs !== undefined && (
                        <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                          <span>Probe Roundtrip Latency:</span>
                          <span className="text-sky-400 font-bold">{subsystem.pingMs} ms</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 7-Stage Production Readiness Checklist */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Production Readiness & Deployment Checklist</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-stage verification ensuring AeroPool is strictly deployment-ready before routing live passenger funds.
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  7 Verification Gates
                </span>
              </div>

              <div className="space-y-3">
                {diagReport?.checklist?.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold">
                          {item.stageNumber}
                        </span>
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        <span className="text-[10px] font-mono text-slate-400">({item.stageName})</span>
                      </div>
                      <p className="text-xs text-slate-400 pl-7">{item.description}</p>
                      {item.actionHint && (
                        <p className="text-[11px] text-amber-400/90 pl-7 font-mono flex items-center gap-1">
                          <span>↳ Action: {item.actionHint}</span>
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {item.status === 'COMPLETED' ? (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                      ) : item.status === 'SANDBOX_ACTIVE' ? (
                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>Sandbox Active</span>
                        </span>
                      ) : (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Pending Action</span>
                        </span>
                      )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Driver Verification & KYC Review</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspect commercial permits, driving licences, profile photos, and vehicles before approving airport pickup dispatch.
                </p>
              </div>

              {/* KYC Search & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={kycSearchQuery}
                    onChange={(e) => setKycSearchQuery(e.target.value)}
                    placeholder="Search name, phone, DL, plate..."
                    className="w-full h-8 pl-8 pr-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setKycFilter(filter)}
                    className={`px-3 py-1 rounded-lg font-semibold transition ${
                      kycFilter === filter
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {filter.replace(/_/g, ' ')}
                  </button>
                ))}
                </div>
              </div>
            </div>

            {/* Drivers Application Cards */}
            <div className="space-y-6">
              {driverProfiles
                .filter((d) => {
                  if (kycSearchQuery.trim()) {
                    const q = kycSearchQuery.toLowerCase();
                    const matchName = d.fullName?.toLowerCase().includes(q);
                    const matchPhone = d.phone?.toLowerCase().includes(q);
                    const matchPlate = d.assignedVehicle?.plateNumber?.toLowerCase().includes(q);
                    const matchDL = d.licenseNumber?.toLowerCase().includes(q);
                    if (!matchName && !matchPhone && !matchPlate && !matchDL) return false;
                  }
                  if (kycFilter === 'ALL') return true;
                  if (kycFilter === 'PENDING') return d.verificationStatus === 'under_review' || d.verificationStatus === 'submitted' || d.verificationStatus === 'pending' || d.verificationStatus === 'draft';
                  if (kycFilter === 'APPROVED') return d.verificationStatus === 'approved';
                  if (kycFilter === 'REJECTED') return d.verificationStatus === 'rejected';
                  if (kycFilter === 'SUSPENDED') return d.verificationStatus === 'suspended';
                  return true;
                })
                .map((driver) => (
                  <div key={driver.id} className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        {driver.profilePhotoUrl ? (
                          <img
                            src={driver.profilePhotoUrl}
                            alt={driver.fullName}
                            className="w-11 h-11 rounded-full object-cover border-2 border-sky-400"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs">
                            {driver.fullName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{driver.fullName}</span>
                            <span className="text-xs text-slate-400 font-mono">({driver.phone})</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Org: {driver.organizationName || 'Independent'} • Rating: ★ {driver.rating} • Email: {driver.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg border font-mono ${
                            driver.verificationStatus === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : driver.verificationStatus === 'rejected'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : driver.verificationStatus === 'suspended'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                          }`}
                        >
                          {driver.verificationStatus.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Personal & Vehicle Details Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                      <div>
                        <div className="text-slate-400 text-[11px]">Commercial Licence & Badge</div>
                        <div className="font-mono text-slate-200 font-semibold">{driver.licenseNumber || 'Not specified'}</div>
                        <div className="text-slate-400 text-[11px] font-mono mt-0.5">PSV Badge: {driver.badgeNumber || 'N/A'}</div>
                      </div>

                      <div>
                        <div className="text-slate-400 text-[11px]">Assigned Commercial Vehicle</div>
                        <div className="text-slate-200 font-semibold">
                          {driver.assignedVehicle?.plateNumber || 'No Plate Registered'}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {driver.assignedVehicle?.makeModel || 'Commercial Cab'} ({driver.assignedVehicle?.seats || 4} Seats, {driver.assignedVehicle?.luggageLimit || 3} Bags)
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-400 text-[11px]">Address & Emergency Contact</div>
                        <div className="text-slate-200 truncate">{driver.residentialAddress || 'Mumbai MMR'}</div>
                        <div className="text-slate-400 text-[11px] font-mono mt-0.5">SOS: {driver.emergencyContact || 'None provided'}</div>
                      </div>
                    </div>

                    {/* Rejection / Suspension Alert Notice */}
                    {driver.verificationStatus === 'rejected' && driver.rejectionReason && (
                      <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
                        <strong>Rejection Reason:</strong> {driver.rejectionReason}
                      </div>
                    )}
                    {driver.verificationStatus === 'suspended' && driver.suspensionReason && (
                      <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                        <strong>Suspension Reason:</strong> {driver.suspensionReason}
                      </div>
                    )}

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
                            {doc.expiryDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">Expires: {doc.expiryDate}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setAdminPreviewDoc({
                                  driverName: driver.fullName,
                                  driverId: driver.id,
                                  docId: doc.id,
                                  type: doc.type,
                                  number: doc.documentNumber,
                                  fileUrl: doc.fileUrl,
                                  downloadUrl: doc.downloadUrl || doc.fileUrl,
                                  mimeType: doc.mimeType,
                                  expiryDate: doc.expiryDate,
                                  status: doc.status,
                                })
                              }
                              className="p-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 rounded-md border border-sky-500/30"
                              title="Preview Document File"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
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

                    {/* Application-level Administrative Actions */}
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2.5">
                      {driver.verificationStatus !== 'approved' && (
                        <button
                          onClick={() => handleApproveDriverApplication(driver)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve Driver Application</span>
                        </button>
                      )}

                      {driver.verificationStatus !== 'rejected' && (
                        <button
                          onClick={() => setRejectDriverModal({ driverId: driver.id, fullName: driver.fullName })}
                          className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-500/30 hover:border-red-500/50 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          <span>Reject Application</span>
                        </button>
                      )}

                      {driver.verificationStatus === 'approved' && (
                        <button
                          onClick={() => setSuspendDriverModal({ driverId: driver.id, fullName: driver.fullName })}
                          className="px-3.5 py-1.5 bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5 text-amber-400" />
                          <span>Suspend Driver</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 3: DISPATCH OPERATIONS & LIVE POOLS MONITOR */}
        {activeTab === 'pools' && (() => {
          const opMetrics = db.getOperationalMetrics();
          const now = Date.now();

          return (
            <div className="space-y-6">
              {/* Authoritative Operational Metrics */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                      <Radio className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Phase 4 Dispatch Operations Center</span>
                        <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded font-bold uppercase">
                          Authoritative Telemetry
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Real-time airport fleet dispatch, GPS freshness verification & ride offer concurrency
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    Telemetry Ingestion: <span className="text-emerald-400 font-bold">LIVE (≤30s Freshness)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Online Drivers</span>
                    <div className="text-xl font-bold font-mono text-emerald-400">{opMetrics.onlineEligibleDrivers}</div>
                    <span className="text-[10px] text-slate-500">KYC Approved & Consented</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Fresh GPS (≤30s)</span>
                    <div className="text-xl font-bold font-mono text-sky-400">{opMetrics.freshGpsDrivers}</div>
                    <span className="text-[10px] text-emerald-400">Eligible for Auto-Dispatch</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Stale / Offline GPS</span>
                    <div className="text-xl font-bold font-mono text-amber-400">{opMetrics.staleGpsDrivers}</div>
                    <span className="text-[10px] text-amber-500/90">&gt;30s or Waiting Lock</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Active Ride Offers</span>
                    <div className="text-xl font-bold font-mono text-cyan-400">{opMetrics.activeRideOffers}</div>
                    <span className="text-[10px] text-cyan-400/80">45s Concurrency Window</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Accepted Dispatches</span>
                    <div className="text-xl font-bold font-mono text-emerald-400">{opMetrics.acceptedAssignments}</div>
                    <span className="text-[10px] text-slate-500">Assigned Driver Pools</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Unassigned Pools</span>
                    <div className="text-xl font-bold font-mono text-amber-400">{opMetrics.unassignedPools}</div>
                    <span className="text-[10px] text-slate-500">Awaiting Driver Pickup</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Active Trips</span>
                    <div className="text-xl font-bold font-mono text-sky-400">{opMetrics.activeTrips}</div>
                    <span className="text-[10px] text-slate-500">En Route / In Progress</span>
                  </div>
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Matching Failures</span>
                    <div className="text-xl font-bold font-mono text-red-400">{opMetrics.matchingFailures}</div>
                    <span className="text-[10px] text-slate-500">Expired or Declined</span>
                  </div>
                </div>
              </div>

              {/* Driver Fleet Telemetry Roster */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Car className="w-4 h-4 text-sky-400" />
                      <span>Live Driver Fleet Telemetry Roster ({driverProfiles.length})</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Direct device GPS telemetry, hardware accuracy & operational lifecycle states
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                        <th className="pb-3 font-semibold">Driver & Vehicle</th>
                        <th className="pb-3 font-semibold">KYC Status</th>
                        <th className="pb-3 font-semibold">Availability / State</th>
                        <th className="pb-3 font-semibold">GPS Telemetry Freshness</th>
                        <th className="pb-3 font-semibold">Current Assignment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {driverProfiles.map((driver) => {
                        const loc = driver.lastKnownLocation;
                        const ageSec = loc ? Math.max(0, Math.floor((now - new Date(loc.updatedAt).getTime()) / 1000)) : null;
                        const isFresh = ageSec !== null && ageSec <= 30;
                        const assignedPool = pools.find(
                          (p) => p.assignedDriverId === driver.id && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
                        );

                        return (
                          <tr key={driver.id} className="hover:bg-slate-950/50 transition">
                            <td className="py-3 pr-4">
                              <div className="font-bold text-white">{driver.fullName}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {driver.assignedVehicle?.plateNumber || 'No Plate'} • {driver.assignedVehicle?.makeModel || 'Cab'}
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                driver.verificationStatus === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : driver.verificationStatus === 'rejected'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              }`}>
                                {driver.verificationStatus}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${driver.isAvailable ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                                <span className="font-semibold text-slate-200">
                                  {driver.isAvailable ? 'ONLINE' : 'OFFLINE'}
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                {driver.lifecycleState || (driver.isAvailable ? 'ONLINE_AVAILABLE' : 'OFFLINE')}
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              {loc ? (
                                <div className="space-y-0.5 font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${
                                      isFresh
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    }`}>
                                      {isFresh ? `FRESH (${ageSec}s ago)` : `STALE (${ageSec}s ago)`}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {loc.lat.toFixed(4)}°N, {loc.lng.toFixed(4)}°E (±{loc.accuracyMeters || 8}m)
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-500">NO GPS SIGNAL</span>
                              )}
                            </td>
                            <td className="py-3">
                              {assignedPool ? (
                                <div>
                                  <span className="font-mono text-sky-400 font-bold">Pool #{assignedPool.id.slice(-6)}</span>
                                  <div className="text-[11px] text-slate-400">{assignedPool.targetCorridor}</div>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">Unassigned / Roaming</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live CSMIA Ride Pools & Occupancy */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-sky-400" />
                      <span>Live CSMIA Ride Pools & Occupancy</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Passenger grouping corridors, boarding state and airport pillar coordination
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg">
                    {pools.length} Active Pools
                  </span>
                </div>

                {pools.length > 0 ? (
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

                        {/* Driver Assignment & Dispatch Status */}
                        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          {pool.assignedDriverId ? (
                            <div className="flex items-center gap-2 text-slate-300">
                              <Car className="w-3.5 h-3.5 text-sky-400" />
                              <span>
                                Driver: <strong className="text-white">{pool.assignedDriverName || 'Assigned Driver'}</strong>{' '}
                                <span className="text-slate-400 font-mono">({pool.vehiclePlate || 'MH 02 EE 8421'})</span>
                              </span>
                              {pool.assignedDriverPhone && (
                                <span className="text-sky-400 font-mono text-[11px] hidden sm:inline">
                                  • {pool.assignedDriverPhone}
                                </span>
                              )}
                            </div>
                          ) : pool.status !== 'COMPLETED' && pool.status !== 'CANCELLED' ? (
                            <div className="flex items-center gap-2 text-amber-400 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Unassigned Driver — Pending Dispatch</span>
                            </div>
                          ) : (
                            <div className="text-slate-500">Concluded Pool</div>
                          )}

                          {!pool.assignedDriverId && pool.status !== 'COMPLETED' && pool.status !== 'CANCELLED' && (
                            <div className="flex items-center gap-2">
                              <select
                                defaultValue=""
                                onChange={(e) => handleAssignDriverToPool(pool.id, e.target.value)}
                                className="bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
                              >
                                <option value="" disabled>Dispatch Driver...</option>
                                {driverProfiles
                                  .filter((d) => d.verificationStatus === 'approved')
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.fullName} ({d.isAvailable ? 'Online' : 'Busy'}) • ★{d.rating}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                    <Car className="w-10 h-10 text-slate-600 mx-auto" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">NO MATCHING SHARED RIDES AVAILABLE</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Zero active airport pools currently awaiting dispatch. Pools form dynamically when incoming passengers book shared rides from CSMIA Terminals.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* TAB 4: PAYMENTS & FINANCIAL MANAGEMENT */}
        {activeTab === 'payments' && (
          <AdminFinancialCommandCenter onNavigate={onNavigate} onStateChange={() => setTick((p) => p + 1)} />
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

        {/* TAB 7: MAP PROVIDER ENGINE (PHASE 3) */}
        {activeTab === 'maps' && (
          <MapProviderSettingsCard
            onNotify={(type, msg) => setDispatchFeedback({ type: type === 'info' ? 'success' : type, message: msg })}
          />
        )}
      </div>

      {/* Refund Modal */}
      {refundModalPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRefundModalPayment(null);
          }}
        >
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRejectDocModal(null);
          }}
        >
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

      {/* Reject Driver Application Modal */}
      {rejectDriverModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRejectDriverModal(null);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white text-red-400">
              Reject Driver Application: {rejectDriverModal.fullName}
            </h3>
            <p className="text-xs text-slate-300">
              Please enter the official rejection reason. The driver will see this feedback in their portal:
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rejection Reason *</label>
              <input
                type="text"
                value={rejectDriverReason}
                onChange={(e) => setRejectDriverReason(e.target.value)}
                placeholder="e.g., Licence expired or vehicle model invalid"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectDriverModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejectDriver}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Driver Modal */}
      {suspendDriverModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSuspendDriverModal(null);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white text-amber-400">
              Suspend Driver Partner: {suspendDriverModal.fullName}
            </h3>
            <p className="text-xs text-slate-300">
              Suspending this driver will immediately revoke their online availability and ability to accept CSMIA dispatch.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Suspension Reason *</label>
              <input
                type="text"
                value={suspendDriverReason}
                onChange={(e) => setSuspendDriverReason(e.target.value)}
                placeholder="e.g., Safety investigation or license verification review"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSuspendDriverModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSuspendDriver}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Lightbox Preview Modal for Super Admin */}
      {adminPreviewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdminPreviewDoc(null);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{adminPreviewDoc.type.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-mono text-sky-400">({adminPreviewDoc.number})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Driver: {adminPreviewDoc.driverName} • Status:{' '}
                  <span className="uppercase font-mono text-emerald-400 font-bold">{adminPreviewDoc.status}</span>
                  {adminPreviewDoc.expiryDate && <span> • Expires: {adminPreviewDoc.expiryDate}</span>}
                </p>
              </div>
              <button
                onClick={() => setAdminPreviewDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-[260px] max-h-[55vh] overflow-auto rounded-xl bg-slate-950 flex items-center justify-center p-4 border border-slate-800">
              {adminPreviewDoc.mimeType === 'application/pdf' || adminPreviewDoc.downloadUrl?.includes('.pdf') ? (
                <div className="text-center space-y-3 p-6">
                  <FileText className="w-16 h-16 text-sky-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">Portable Document Format (PDF)</p>
                  <a
                    href={adminPreviewDoc.downloadUrl || adminPreviewDoc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in PDF Viewer</span>
                  </a>
                </div>
              ) : adminPreviewDoc.downloadUrl || adminPreviewDoc.fileUrl ? (
                <img
                  src={adminPreviewDoc.downloadUrl || adminPreviewDoc.fileUrl}
                  alt={adminPreviewDoc.type}
                  className="max-h-[50vh] object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div className="text-slate-500 text-xs">No preview scan available for this document.</div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleApproveDoc(adminPreviewDoc.driverId, adminPreviewDoc.docId);
                    setAdminPreviewDoc(null);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve This Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleOpenRejectDocModal(adminPreviewDoc.driverId, adminPreviewDoc.docId);
                    setAdminPreviewDoc(null);
                  }}
                  className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-500/30 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                  <span>Reject This Document</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAdminPreviewDoc(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client State Reset Modal */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResetModal(false);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">
              Reset Local Client Store?
            </h3>
            <p className="text-xs text-slate-300">
              This will clear local storage and reset in-memory cached state to a clean synchronized slate.
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
                  db.resetStore();
                  setShowResetModal(false);
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition"
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
