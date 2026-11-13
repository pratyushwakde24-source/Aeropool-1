import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  CreditCard,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  Search,
  Filter,
  ShieldCheck,
  Ban,
  Activity,
  Play
} from 'lucide-react';
import { db } from '../services/db';
import { apiFetch } from '../services/apiClient';
import { formatINR } from '../services/pricingEngine';
import { getActiveCommissionPolicy, getCommissionPolicyById, getCommissionPolicyForTimestamp } from '../services/commissionEngine';
import {
  PaymentRecord,
  OperatorSettlement,
  RefundLifecycleStatus,
  ReconciliationDiscrepancy,
  FinancialExportType
} from '../types';

interface AdminFinancialCommandCenterProps {
  onNavigate?: (view: any) => void;
  onStateChange?: () => void;
}

type CommandSubTab = 'overview' | 'transactions' | 'refunds' | 'settlements' | 'policies' | 'reconciliation' | 'exports' | 'monitoring';

export const AdminFinancialCommandCenter: React.FC<AdminFinancialCommandCenterProps> = ({
  onNavigate,
  onStateChange
}) => {
  const [activeSubTab, setActiveSubTab] = useState<CommandSubTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'created' | 'captured' | 'failed' | 'refunded'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reconciliation state
  const [recFilter, setRecFilter] = useState<'ALL' | 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'>('ALL');
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<ReconciliationDiscrepancy | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Refund Lifecycle state
  const [selectedRefund, setSelectedRefund] = useState<PaymentRecord | null>(null);
  const [targetRefundStatus, setTargetRefundStatus] = useState<RefundLifecycleStatus>('SUBMITTED');
  const [refundStatusReason, setRefundStatusReason] = useState('');

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Read local DB state
  const [dbState, setDbState] = useState(db.getState());

  // Phase 5E: Financial Operations & Monitoring State
  const [webhookList, setWebhookList] = useState<any[]>([]);
  const [webhookFilter, setWebhookFilter] = useState<string>('ALL');
  const [reconHistory, setReconHistory] = useState<any[]>([]);
  const [selectedWebhookPayload, setSelectedWebhookPayload] = useState<any | null>(null);
  const [isReconRunning, setIsReconRunning] = useState<boolean>(false);

  // Fetch server webhook events and reconciliation history
  const loadMonitoringData = async () => {
    try {
      // 1. Fetch webhooks
      const whRes = await apiFetch('/api/admin/webhooks');
      if (whRes.ok) {
        const whData = await whRes.json();
        if (whData.events) setWebhookList(whData.events);
      }
    } catch {
      // Fallback empty if server offline
    }

    try {
      // 2. Fetch reconciliation history
      const rhRes = await apiFetch('/api/admin/reconciliation/history');
      if (rhRes.ok) {
        const rhData = await rhRes.json();
        if (rhData.history) setReconHistory(rhData.history);
      }
    } catch {
      // Fallback empty
    }
  };

  useEffect(() => {
    if (activeSubTab === 'monitoring') {
      loadMonitoringData();
    }
  }, [activeSubTab]);

  // Trigger manual reconciliation job
  const handleTriggerReconciliation = async () => {
    setIsReconRunning(true);
    try {
      const res = await apiFetch('/api/admin/reconciliation/run', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFeedback({
          type: 'success',
          message: `Automated reconciliation completed: Scanned ${data.job.recordsScanned} records, ${data.job.discrepanciesDetected} discrepancies.`
        });
        db.runLocalReconciliationAudit();
        loadMonitoringData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ type: 'error', message: errData.error || 'Reconciliation run failed' });
      }
      clearFeedback();
    } catch (err: any) {
      // Local fallback
      db.runLocalReconciliationAudit();
      setFeedback({ type: 'success', message: 'Local reconciliation audit executed successfully.' });
      clearFeedback();
    } finally {
      setIsReconRunning(false);
    }
  };

  // Replay / retry failed webhook
  const handleRetryWebhook = async (eventId: string) => {
    try {
      const res = await apiFetch(`/api/admin/webhooks/retry/${eventId}`, { method: 'POST' });
      if (res.ok) {
        setFeedback({ type: 'success', message: `Webhook ${eventId} replayed and processed successfully.` });
        loadMonitoringData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ type: 'error', message: errData.error || 'Webhook retry failed' });
      }
      clearFeedback();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Retry request failed' });
      clearFeedback();
    }
  };

  // Flag webhook for manual review
  const handleFlagManualReview = async (eventId: string) => {
    try {
      const res = await apiFetch(`/api/admin/webhooks/manual-review/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Flagged for Super Admin inspection' })
      });
      if (res.ok) {
        setFeedback({ type: 'success', message: `Webhook ${eventId} moved to MANUAL_REVIEW queue.` });
        loadMonitoringData();
      }
      clearFeedback();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Action failed' });
      clearFeedback();
    }
  };

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setDbState(db.getState());
    });
    return () => unsub();
  }, []);

  const clearFeedback = () => {
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  // Trigger manual refresh & run reconciliation check
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      db.runReconciliationAudit();
      setFeedback({ type: 'success', message: 'Financial ledger & reconciliation engine synchronized successfully.' });
      clearFeedback();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Refresh failed' });
      clearFeedback();
    } finally {
      setIsRefreshing(false);
    }
  };

  // 1. Authoritative KPI Calculations (Paise Arithmetic)
  const kpiData = useMemo(() => {
    const payments = dbState.payments || [];
    const settlements = dbState.operatorSettlements || [];
    const ledger = dbState.driverLedger || [];

    const totalGMVPaise = payments.reduce((sum, p) => (p.status === 'captured' ? sum + p.amountPaise : sum), 0);
    const capturedPaymentsPaise = payments.reduce((sum, p) => (p.status === 'captured' ? sum + p.amountPaise : sum), 0);
    // Calculate historical platform revenue from actual recorded driver ledger entries (TRIP_EARNING)
    // plus any captured payments with recorded platformCommissionPaise
    const ledgerCommissionPaise = ledger
      .filter((l) => l.transactionType === 'TRIP_EARNING')
      .reduce((sum, l) => sum + (l.platformCommissionPaise || 0), 0);

    const ledgerPoolIds = new Set(ledger.map((l) => l.poolId).filter(Boolean));
    const unsettledPaymentsCommissionPaise = payments.reduce((sum, p) => {
      if (p.status !== 'captured') return sum;
      if (p.bookingId && ledgerPoolIds.has(p.bookingId)) return sum;
      if (p.platformCommissionPaise != null) return sum + p.platformCommissionPaise;
      const policyAtTx = getCommissionPolicyForTimestamp(p.createdAt);
      return sum + Math.round((p.amountPaise * policyAtTx.platformCommissionPercent) / 100);
    }, 0);

    const platformRevenuePaise = ledgerCommissionPaise + unsettledPaymentsCommissionPaise;

    const totalRefundsPaise = payments.reduce((sum, p) => {
      if (p.status === 'refunded' || p.refundStatus === 'PROCESSED') {
        return sum + (p.refundedAmountPaise || p.amountPaise);
      }
      return sum;
    }, 0);

    // Driver Payable = Net earnings ledger credited minus paid out ledger debits
    const totalDriverCredited = ledger
      .filter((l) => l.transactionType === 'TRIP_EARNING' && l.settlementStatus === 'SETTLED')
      .reduce((sum, l) => sum + l.amountPaise, 0);
    const totalDriverDebited = ledger
      .filter((l) => l.transactionType === 'PAYOUT_SETTLEMENT' && l.settlementStatus === 'SETTLED')
      .reduce((sum, l) => sum + Math.abs(l.amountPaise), 0);
    const driverPayablePaise = Math.max(0, totalDriverCredited - totalDriverDebited);

    // Actual Verified Bank Payouts: ONLY settlements with status SETTLED (not merely SETTLEMENT_APPROVED)
    const actualVerifiedPayoutsPaise = settlements
      .filter((s) => s.status === 'SETTLED')
      .reduce((sum, s) => sum + s.netPayablePaise, 0);

    return {
      totalGMVPaise,
      capturedPaymentsPaise,
      platformRevenuePaise,
      driverPayablePaise,
      totalRefundsPaise,
      actualVerifiedPayoutsPaise,
      totalPaymentsCount: payments.length,
      capturedCount: payments.filter((p) => p.status === 'captured').length,
      refundCount: payments.filter((p) => p.status === 'refunded' || p.refundStatus === 'PROCESSED').length
    };
  }, [dbState]);

  // Privacy helper: mask passenger identifier
  const maskPassenger = (name?: string, passengerId?: string) => {
    if (name) return name;
    if (!passengerId) return 'Anonymous';
    if (passengerId.includes('@')) {
      const parts = passengerId.split('@');
      const user = parts[0];
      const domain = parts[1] || '';
      return `${user.charAt(0)}***@${domain}`;
    }
    return `User ${passengerId.substring(0, 6)}***`;
  };

  // 2. Filtered Transactions
  const filteredTransactions = useMemo(() => {
    const list = dbState.payments || [];
    return list.filter((p) => {
      // Filter by status
      if (txFilter !== 'all' && p.status !== txFilter) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOrder = p.razorpayOrderId?.toLowerCase().includes(q);
        const matchPay = p.razorpayPaymentId?.toLowerCase().includes(q);
        const matchBooking = p.bookingId?.toLowerCase().includes(q);
        const matchName = p.passengerName?.toLowerCase().includes(q);
        if (!matchOrder && !matchPay && !matchBooking && !matchName) return false;
      }
      return true;
    });
  }, [dbState.payments, txFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage]);

  // 3. Refunds Table (All payments that have requested, processed, or failed refunds)
  const refundRecords = useMemo(() => {
    const list = dbState.payments || [];
    return list.filter((p) => p.refundStatus || p.status === 'refunded');
  }, [dbState.payments]);

  // Handle Refund Lifecycle Advance
  const handleUpdateRefundStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefund) return;

    try {
      const currentUser = db.getState().currentUser;
      const adminId = currentUser?.id || 'admin_operator';

      db.updateRefundStatus(
        selectedRefund.id,
        targetRefundStatus,
        refundStatusReason.trim() || undefined,
        adminId
      );

      setFeedback({
        type: 'success',
        message: `Refund ${selectedRefund.id.substring(0, 8)} transitioned to ${targetRefundStatus} successfully.`
      });
      setSelectedRefund(null);
      setRefundStatusReason('');
      clearFeedback();
      if (onStateChange) onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Refund transition failed' });
      clearFeedback();
    }
  };

  // 4. Reconciliation Discrepancies
  const reconciliationDiscrepancies = useMemo(() => {
    const list = dbState.reconciliationDiscrepancies || [];
    if (recFilter === 'ALL') return list;
    return list.filter((d) => d.status === recFilter);
  }, [dbState.reconciliationDiscrepancies, recFilter]);

  // Handle Discrepancy Resolution
  const handleResolveDiscrepancy = (action: 'RESOLVE' | 'UNDER_REVIEW') => {
    if (!selectedDiscrepancy) return;

    try {
      const currentUser = db.getState().currentUser;
      const adminId = currentUser?.id || 'admin_operator';

      if (action === 'RESOLVE') {
        if (!resolutionNotes.trim()) {
          setFeedback({ type: 'error', message: 'Resolution notes are required to resolve a discrepancy.' });
          clearFeedback();
          return;
        }
        db.resolveReconciliationDiscrepancy(selectedDiscrepancy.id, adminId, resolutionNotes.trim(), 'RESOLVE');
        setFeedback({ type: 'success', message: 'Discrepancy marked as RESOLVED with audit note recorded.' });
      } else {
        db.setReconciliationUnderReview(selectedDiscrepancy.id, adminId);
        setFeedback({ type: 'success', message: 'Discrepancy marked as UNDER_REVIEW.' });
      }

      setSelectedDiscrepancy(null);
      setResolutionNotes('');
      clearFeedback();
      if (onStateChange) onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed' });
      clearFeedback();
    }
  };

  // 5. Settlement Approval
  const handleApproveSettlement = (settlementId: string) => {
    try {
      const currentUser = db.getState().currentUser;
      const adminId = currentUser?.id || 'admin_operator';

      db.approveOperatorSettlement(settlementId, adminId);
      setFeedback({
        type: 'success',
        message: `Settlement ${settlementId.substring(0, 8)} APPROVED. Note: Actual bank transfer required before marking SETTLED.`
      });
      clearFeedback();
      if (onStateChange) onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Settlement approval failed' });
      clearFeedback();
    }
  };

  // 6. CSV Download with CWE-1236 Formula Injection Protection
  const handleDownloadCsv = (type: FinancialExportType) => {
    try {
      const csvContent = db.generateFinancialCsv(type);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `aeropool_${type.toLowerCase()}_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback({
        type: 'success',
        message: `Exported ${type} CSV with spreadsheet formula injection protection (CWE-1236).`
      });
      clearFeedback();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Export failed' });
      clearFeedback();
    }
  };

  const activePolicy = getActiveCommissionPolicy();
  const proposedPolicy = getCommissionPolicyById('COMM_POL_85_15_PROPOSED');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Phase 5D Super Admin Command
              </span>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Razorpay TEST MODE
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-sky-400" />
              <span>Financial Command Center</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Authoritative revenue tracking, 4-stage refund controls, driver ledger audits, reconciliation discrepancy engine, and secure CWE-1236-protected exports.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
              <span>Sync Ledgers</span>
            </button>
            <button
              onClick={() => handleDownloadCsv('TRANSACTIONS')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Bar */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800 text-xs overflow-x-auto no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'overview'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveSubTab('transactions')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'transactions'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Transactions ({kpiData.totalPaymentsCount})
          </button>
          <button
            onClick={() => setActiveSubTab('refunds')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'refunds'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Refund Lifecycle ({refundRecords.length})
          </button>
          <button
            onClick={() => setActiveSubTab('settlements')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'settlements'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Ledgers & Settlements ({dbState.operatorSettlements?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('policies')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'policies'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Commission Policies
          </button>
          <button
            onClick={() => setActiveSubTab('reconciliation')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
              activeSubTab === 'reconciliation'
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Reconciliation</span>
            {dbState.reconciliationDiscrepancies && dbState.reconciliationDiscrepancies.filter((d) => d.status === 'OPEN').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-mono font-bold">
                {dbState.reconciliationDiscrepancies.filter((d) => d.status === 'OPEN').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('monitoring')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeSubTab === 'monitoring'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Operations & Monitoring</span>
          </button>
          <button
            onClick={() => setActiveSubTab('exports')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeSubTab === 'exports'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Secure Exports
          </button>
        </div>
      </div>

      {/* Global Action Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* SUB-TAB 1: OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* 6 Real-Data KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Gross GMV</span>
              <div className="text-lg font-bold text-white font-mono mt-1">
                {formatINR(kpiData.totalGMVPaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {kpiData.totalPaymentsCount} rides created
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-emerald-400 uppercase">Captured Cash</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {formatINR(kpiData.capturedPaymentsPaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {kpiData.capturedCount} verified orders
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-cyan-400 uppercase">Platform Rev ({activePolicy.platformCommissionPercent}%)</span>
              <div className="text-lg font-bold text-cyan-400 font-mono mt-1">
                {formatINR(kpiData.platformRevenuePaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Earned commission
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-sky-400 uppercase">Driver Payable</span>
              <div className="text-lg font-bold text-sky-400 font-mono mt-1">
                {formatINR(kpiData.driverPayablePaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Unsettled balance
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-amber-400 uppercase">Total Refunds</span>
              <div className="text-lg font-bold text-amber-400 font-mono mt-1">
                {formatINR(kpiData.totalRefundsPaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {kpiData.refundCount} refunded rides
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-emerald-400 uppercase">Verified Payouts</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {formatINR(kpiData.actualVerifiedPayoutsPaise)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Bank transfers executed
              </span>
            </div>
          </div>

          {/* Critical Governance Banner: Approvals vs Actual Payouts */}
          <div className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-300">
                Audited Safeguard: Settlement Approvals vs Actual Bank Payouts
              </div>
              <p className="text-slate-400 leading-relaxed">
                An approved settlement (<span className="text-sky-400 font-mono font-bold">SETTLEMENT_APPROVED</span>) represents verified platform authorization to release funds. It is strictly segregated from actual disbursements. A record is <span className="text-emerald-400 font-bold">NEVER</span> labeled as paid out until an official bank transaction confirmation reference has been recorded in the financial ledger.
              </p>
            </div>
          </div>

          {/* Quick Status Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Commission Policy Quick Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Active Commission Policy
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {activePolicy.policyName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Driver Share</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">{activePolicy.driverSharePercent}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Platform Comm</span>
                  <span className="font-mono text-cyan-400 font-bold text-sm">{activePolicy.platformCommissionPercent}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Airport Toll</span>
                  <span className="font-mono text-sky-400 font-bold text-sm">100% Pass-thru</span>
                </div>
              </div>
            </div>

            {/* Reconciliation Health Quick Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-sky-400" />
                  Reconciliation Health
                </span>
                {(!dbState.reconciliationDiscrepancies || dbState.reconciliationDiscrepancies.filter((d) => d.status === 'OPEN').length === 0) ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    0 OPEN DISCREPANCIES
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold">
                    {dbState.reconciliationDiscrepancies.filter((d) => d.status === 'OPEN').length} OPEN DISCREPANCIES
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-slate-800">
                Monitors orphan captures, provider confirmation mismatches, refund overruns, and duplicate references with zero data loss.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TRANSACTIONS */}
      {activeSubTab === 'transactions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-sky-400" />
                <span>Payment Transactions Management</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative transaction ledger with privacy-masked passenger identifiers
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadCsv('TRANSACTIONS')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search order ID, payment ID, or passenger..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
              {(['all', 'captured', 'created', 'failed', 'refunded'] as const).map((filterVal) => (
                <button
                  key={filterVal}
                  onClick={() => {
                    setTxFilter(filterVal);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg capitalize transition ${
                    txFilter === filterVal
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filterVal}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions Table */}
          {paginatedTransactions.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
              No transactions match the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                    <th className="pb-3 font-semibold">Order / Payment ID</th>
                    <th className="pb-3 font-semibold">Passenger (Masked)</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold text-right">Gross Fare</th>
                    <th className="pb-3 font-semibold text-right">Platform Comm</th>
                    <th className="pb-3 font-semibold text-right">Driver Net</th>
                    <th className="pb-3 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {paginatedTransactions.map((tx) => {
                    const isCaptured = tx.status === 'captured';
                    const isRefunded = tx.status === 'refunded' || tx.refundStatus === 'PROCESSED';
                    const isFailed = tx.status === 'failed';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/20">
                        <td className="py-3 font-sans">
                          <div className="font-mono text-white text-xs">{tx.razorpayOrderId}</div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {tx.razorpayPaymentId || 'Pending Provider ID'}
                          </span>
                        </td>
                        <td className="py-3 font-sans text-slate-200">
                          <div>{maskPassenger(tx.passengerName, tx.passengerId)}</div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Booking: {tx.bookingId.substring(0, 8)}...
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              isCaptured
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isRefunded
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : isFailed
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                            }`}
                          >
                            {tx.refundStatus ? `REFUND: ${tx.refundStatus}` : tx.status}
                          </span>
                        </td>
                        <td className="py-3 text-right font-bold text-white">
                          {formatINR(tx.amountPaise)}
                        </td>
                        <td className="py-3 text-right text-cyan-400">
                          {tx.platformCommissionPaise != null
                            ? formatINR(tx.platformCommissionPaise)
                            : formatINR(Math.round((tx.amountPaise * getCommissionPolicyForTimestamp(tx.createdAt).platformCommissionPercent) / 100))}
                        </td>
                        <td className="py-3 text-right text-emerald-400">
                          {tx.driverNetPayoutPaise != null
                            ? formatINR(tx.driverNetPayoutPaise)
                            : formatINR(tx.amountPaise - Math.round((tx.amountPaise * getCommissionPolicyForTimestamp(tx.createdAt).platformCommissionPercent) / 100))}
                        </td>
                        <td className="py-3 text-right text-slate-400 text-[10px]">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN') : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredTransactions.length)} of {filteredTransactions.length} records
              </div>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium"
                >
                  Prev
                </button>
                <span className="px-2 py-1 font-mono text-slate-300">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: REFUND LIFECYCLE */}
      {activeSubTab === 'refunds' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>4-Stage Refund Lifecycle Management</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  REQUESTED &rarr; SUBMITTED &rarr; PROCESSED (or FAILED). Strict provider confirmation barrier.
                </p>
              </div>

              <button
                onClick={() => handleDownloadCsv('REFUNDS')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Refunds CSV</span>
              </button>
            </div>

            {/* Provider Confirmation Barrier Banner */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-slate-200">Payment Gateway Confirmation Barrier:</span>
                <p className="text-slate-400 leading-relaxed">
                  A refund must never be marked <span className="text-emerald-400 font-mono font-bold">PROCESSED</span> prematurely without payment gateway (Razorpay) confirmation. Premature completion creates reconciliation balance errors and leads to duplicate debit attempts.
                </p>
              </div>
            </div>

            {/* Refunds List */}
            {refundRecords.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No refund requests recorded. When a cancellation or refund is initiated, it will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {refundRecords.map((r) => {
                  const status = r.refundStatus || (r.status === 'refunded' ? 'PROCESSED' : 'REQUESTED');
                  const isProcessed = status === 'PROCESSED';
                  const isFailed = status === 'FAILED';
                  const isSubmitted = status === 'SUBMITTED';

                  return (
                    <div
                      key={r.id}
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm font-mono">
                            {r.razorpayOrderId}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              isProcessed
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isFailed
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : isSubmitted
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-1 space-x-2">
                          <span>Passenger: {maskPassenger(r.passengerName, r.passengerId)}</span>
                          <span>•</span>
                          <span>Refund ID: {r.refundId || 'Pending Gateway ID'}</span>
                          <span>•</span>
                          <span>Reason: {r.refundReason || 'Customer requested'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-auto">
                        <div className="text-right">
                          <div className="font-mono text-amber-400 font-bold text-sm">
                            {formatINR(r.refundedAmountPaise || r.amountPaise)}
                          </div>
                          <span className="text-[10px] text-slate-500">Refund Amount</span>
                        </div>

                        {!isProcessed && !isFailed && (
                          <button
                            onClick={() => {
                              setSelectedRefund(r);
                              setTargetRefundStatus(isSubmitted ? 'PROCESSED' : 'SUBMITTED');
                            }}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow transition"
                          >
                            Manage Status
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Refund Status Transition Modal */}
          {selectedRefund && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedRefund(null);
              }}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Transition Refund Lifecycle</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Advance refund state for order <span className="font-mono text-sky-400">{selectedRefund.razorpayOrderId}</span>.
                  </p>
                </div>

                <form onSubmit={handleUpdateRefundStatus} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 text-[11px] font-mono uppercase mb-1">
                      Target Lifecycle State
                    </label>
                    <select
                      value={targetRefundStatus}
                      onChange={(e) => setTargetRefundStatus(e.target.value as RefundLifecycleStatus)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-sky-500 font-mono"
                    >
                      <option value="SUBMITTED">SUBMITTED (Sent to Razorpay)</option>
                      <option value="PROCESSED">PROCESSED (Confirmed by Gateway)</option>
                      <option value="FAILED">FAILED (Gateway Rejected / Bank Fail)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[11px] font-mono uppercase mb-1">
                      Gateway Reference / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. rzp_rfnd_12345 or gateway error message"
                      value={refundStatusReason}
                      onChange={(e) => setRefundStatusReason(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRefund(null)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition"
                    >
                      Confirm Transition
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: DRIVER LEDGER & FLEET SETTLEMENTS */}
      {activeSubTab === 'settlements' && (
        <div className="space-y-6">
          {/* Fleet Operator Settlements List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <span>Fleet Operator Settlements & Approvals ({dbState.operatorSettlements?.length || 0})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Super Admin approval required prior to batch disbursement.
                </p>
              </div>

              <button
                onClick={() => handleDownloadCsv('SETTLEMENTS')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Settlements CSV</span>
              </button>
            </div>

            {/* Blocked Automated Payouts Alert */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-start gap-3">
              <Ban className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Fleet Automated Bank Payouts Status: BLOCKED</span>
                <p className="text-slate-400 mt-1 leading-relaxed">
                  Automated Razorpay Route payouts for fleet accounts are currently blocked pending corporate GSTIN validation and multi-tenant escrow integration. Settlements require manual bank batch processing.
                </p>
              </div>
            </div>

            {(!dbState.operatorSettlements || dbState.operatorSettlements.length === 0) ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No weekly settlements generated yet. Operator settlements are created after weekly billing cycles.
              </div>
            ) : (
              <div className="space-y-3">
                {dbState.operatorSettlements.map((settlement) => {
                  const isProcessing = settlement.status === 'PROCESSING';
                  const isApproved = settlement.status === 'SETTLEMENT_APPROVED';
                  const isSettled = settlement.status === 'SETTLED';

                  return (
                    <div
                      key={settlement.id}
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm font-mono">{settlement.settlementCycle}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              isSettled
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isApproved
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {settlement.status}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-1 space-x-2">
                          <span>Org: {settlement.organizationId}</span>
                          <span>•</span>
                          <span>{settlement.completedTripsCount} trips</span>
                          <span>•</span>
                          <span>Gross: {formatINR(settlement.grossFaresPaise)}</span>
                          <span>•</span>
                          <span>Comm: -{formatINR(settlement.platformCommissionPaise)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-auto">
                        <div className="text-right">
                          <div className="font-mono text-emerald-400 font-bold text-sm">
                            {formatINR(settlement.netPayablePaise)}
                          </div>
                          <span className="text-[10px] text-slate-500">Net Payable</span>
                        </div>

                        {isProcessing && (
                          <button
                            onClick={() => handleApproveSettlement(settlement.id)}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow transition"
                          >
                            Approve Settlement
                          </button>
                        )}

                        {isApproved && (
                          <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded text-[11px] font-semibold">
                            Approved for Batch
                          </span>
                        )}

                        {isSettled && (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[11px] font-semibold">
                            Settled
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Driver Wallets Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>Driver Balances & Ledger ({dbState.driverProfiles?.length || 0})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  100% airport toll pass-through with zero commission deduction
                </p>
              </div>

              <button
                onClick={() => handleDownloadCsv('DRIVER_LEDGER')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Ledger CSV</span>
              </button>
            </div>

            {(!dbState.driverProfiles || dbState.driverProfiles.length === 0) ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No drivers registered in the database.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                      <th className="pb-3 font-semibold">Driver</th>
                      <th className="pb-3 font-semibold">Affiliation</th>
                      <th className="pb-3 font-semibold text-right">Rides</th>
                      <th className="pb-3 font-semibold text-right">Lifetime Earnings</th>
                      <th className="pb-3 font-semibold text-right">Available</th>
                      <th className="pb-3 font-semibold text-right">Accrued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {dbState.driverProfiles.map((driver) => {
                      const summary = db.getDriverWalletSummary(driver.id);
                      return (
                        <tr key={driver.id} className="hover:bg-slate-800/20">
                          <td className="py-3 font-sans font-medium text-white">
                            <div>{driver.fullName}</div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {driver.id.substring(0, 8)}...
                            </span>
                          </td>
                          <td className="py-3 text-slate-300 font-sans">
                            {driver.organizationName || 'Independent'}
                          </td>
                          <td className="py-3 text-right text-slate-200">
                            {summary.completedTripsCount}
                          </td>
                          <td className="py-3 text-right text-emerald-400 font-bold">
                            {formatINR(summary.lifetimeNetEarningsPaise)}
                          </td>
                          <td className="py-3 text-right text-sky-400">
                            {formatINR(summary.availableEarningsPaise)}
                          </td>
                          <td className="py-3 text-right text-amber-400">
                            {formatINR(summary.accruedEarningsPaise)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: COMMISSION POLICIES */}
      {activeSubTab === 'policies' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Commission Policy Governance</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict audit of platform commission rules and historical immutability
            </p>
          </div>

          {/* Zero Retroactive Recalculation Note */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Zero Retroactive Recalculation Invariant:</span>
              <p className="text-slate-400 mt-1 leading-relaxed">
                Platform policies govern trips created within their active window. Completed rides and ledger entries store an immutable rule snapshot. Modifying or switching policies will <span className="text-amber-400 font-bold">NEVER</span> recalculate historical completed rides or modify prior driver payouts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active 80/20 Policy */}
            <div className="p-5 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">{activePolicy.policyName}</h4>
                  <span className="text-[10px] text-slate-500 font-mono">ID: {activePolicy.policyId}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  ACTIVE GOVERNING
                </span>
              </div>
              <p className="text-xs text-slate-400">{activePolicy.approvalNotes}</p>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Driver</span>
                  <div className="text-emerald-400 font-bold">{activePolicy.driverSharePercent}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Platform</span>
                  <div className="text-cyan-400 font-bold">{activePolicy.platformCommissionPercent}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Toll Pass-thru</span>
                  <div className="text-sky-400 font-bold">100%</div>
                </div>
              </div>
            </div>

            {/* Proposed 85/15 Policy (Pending Sign-Off) */}
            {proposedPolicy && (
              <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{proposedPolicy.policyName}</h4>
                    <span className="text-[10px] text-slate-500 font-mono">ID: {proposedPolicy.policyId}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    PENDING BUSINESS SIGN-OFF
                  </span>
                </div>
                <p className="text-xs text-slate-400">{proposedPolicy.approvalNotes}</p>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">Driver</span>
                    <div className="text-slate-300 font-bold">{proposedPolicy.driverSharePercent}%</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">Platform</span>
                    <div className="text-slate-300 font-bold">{proposedPolicy.platformCommissionPercent}%</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">Status</span>
                    <div className="text-amber-400 font-bold text-[10px]">Unapproved</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 6: RECONCILIATION */}
      {activeSubTab === 'reconciliation' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-400" />
                <span>Financial Reconciliation Discrepancy Engine</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Surfaces orphan captures, missing provider confirmations, duplicate references, and refund overruns.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadCsv('RECONCILIATION')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Discrepancies CSV</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 pt-2">
            {(['ALL', 'OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const).map((filterVal) => (
              <button
                key={filterVal}
                onClick={() => setRecFilter(filterVal)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                  recFilter === filterVal
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 bg-slate-950 border border-slate-800 hover:text-white'
                }`}
              >
                {filterVal}
              </button>
            ))}
          </div>

          {/* Discrepancies Table */}
          {reconciliationDiscrepancies.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
              Zero discrepancies detected! All payment transactions, ledger entries, and refund states are in 100% mathematical balance.
            </div>
          ) : (
            <div className="space-y-3">
              {reconciliationDiscrepancies.map((disc) => {
                const isCritical = disc.severity === 'CRITICAL';
                const isHigh = disc.severity === 'HIGH';
                const isResolved = disc.status === 'RESOLVED';
                const isUnderReview = disc.status === 'UNDER_REVIEW';

                return (
                  <div
                    key={disc.id}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            isCritical
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : isHigh
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                          }`}
                        >
                          {disc.severity}
                        </span>
                        <span className="font-bold text-white font-mono">{disc.type}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            isResolved
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isUnderReview
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-red-500/10 text-red-400 border-red-500/30'
                          }`}
                        >
                          {disc.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1.5">{disc.description}</p>
                      <div className="text-slate-500 text-[10px] font-mono mt-1 space-x-2">
                        <span>Expected: {disc.expectedValue}</span>
                        <span>•</span>
                        <span>Actual: {disc.actualValue}</span>
                        {disc.resolutionNotes && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400">Resolution: {disc.resolutionNotes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="font-mono text-red-400 font-bold text-sm">
                          {formatINR(disc.discrepancyPaise || 0)}
                        </div>
                        <span className="text-[10px] text-slate-500">Difference</span>
                      </div>

                      {!isResolved && (
                        <div className="flex gap-2">
                          {!isUnderReview && (
                            <button
                              onClick={() => {
                                setSelectedDiscrepancy(disc);
                                handleResolveDiscrepancy('UNDER_REVIEW');
                              }}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                            >
                              Review
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedDiscrepancy(disc)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discrepancy Resolution Modal */}
          {selectedDiscrepancy && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedDiscrepancy(null);
              }}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Resolve Reconciliation Discrepancy</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Provide authoritative audit notes to resolve discrepancy{' '}
                    <span className="font-mono text-sky-400">{selectedDiscrepancy.id}</span>.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                  <div className="text-white font-mono">{selectedDiscrepancy.type}</div>
                  <div className="text-slate-400 text-[11px]">{selectedDiscrepancy.description}</div>
                  <div className="text-red-400 font-mono font-bold">
                    Discrepancy: {formatINR(selectedDiscrepancy.discrepancyPaise || 0)}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] font-mono uppercase mb-1">
                    Audit Resolution Notes *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter audit explanation (e.g., Confirmed with payment gateway log, credit issued manually)..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex gap-2 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDiscrepancy(null);
                      setResolutionNotes('');
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveDiscrepancy('RESOLVE')}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                  >
                    Confirm Resolution
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 7: SECURE CSV EXPORTS */}
      {activeSubTab === 'exports' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-sky-400" />
              <span>Secure Financial CSV Exports</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Production-grade CSV downloads protected against Spreadsheet Formula Injection (CWE-1236)
            </p>
          </div>

          {/* Security Notice */}
          <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/30 text-xs flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-sky-300">CWE-1236 Formula Injection Mitigation Verified</span>
              <p className="text-slate-400 mt-1 leading-relaxed">
                All cells beginning with <code className="text-sky-300 font-mono">=</code>, <code className="text-sky-300 font-mono">+</code>, <code className="text-sky-300 font-mono">-</code>, <code className="text-sky-300 font-mono">@</code>, tab, or carriage return are safely prefixed with a single quote (<code className="text-sky-300 font-mono">&apos;</code>). This prevents malicious formula execution when opened in Microsoft Excel or Google Sheets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="font-bold text-white text-xs">Transactions Ledger</div>
              <p className="text-[11px] text-slate-400">
                All captured, created, and refunded customer payments with paise breakdown.
              </p>
              <button
                onClick={() => handleDownloadCsv('TRANSACTIONS')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Transactions</span>
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="font-bold text-white text-xs">Refunds Audit Trail</div>
              <p className="text-[11px] text-slate-400">
                Itemized 4-stage refund lifecycle logs, gateway IDs, and cancellation reasons.
              </p>
              <button
                onClick={() => handleDownloadCsv('REFUNDS')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Refunds</span>
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="font-bold text-white text-xs">Driver Ledgers</div>
              <p className="text-[11px] text-slate-400">
                Driver trip earnings, platform fees, toll credits, and wallet balances.
              </p>
              <button
                onClick={() => handleDownloadCsv('DRIVER_LEDGER')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Driver Ledger</span>
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="font-bold text-white text-xs">Operator Settlements</div>
              <p className="text-[11px] text-slate-400">
                Weekly fleet billing cycle summaries, gross totals, and net payable.
              </p>
              <button
                onClick={() => handleDownloadCsv('SETTLEMENTS')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Settlements</span>
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="font-bold text-white text-xs">Reconciliation Discrepancies</div>
              <p className="text-[11px] text-slate-400">
                Audit list of discrepancies, severities, expected vs actual values, and resolution notes.
              </p>
              <button
                onClick={() => handleDownloadCsv('RECONCILIATION')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Discrepancies</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 8: FINANCIAL OPERATIONS & MONITORING */}
      {activeSubTab === 'monitoring' && (
        <div className="space-y-6">
          {/* Webhook & Cron Health KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Total Webhooks</span>
              <div className="text-lg font-bold text-white font-mono mt-1">
                {webhookList.length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Ingested events</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-emerald-400 uppercase">Completed Events</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {webhookList.filter((w) => w.status === 'COMPLETED' || w.status === 'PROCESSED').length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Deduplicated & verified</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-amber-400 uppercase">In Retry Queue</span>
              <div className="text-lg font-bold text-amber-400 font-mono mt-1">
                {webhookList.filter((w) => w.status === 'RETRY_SCHEDULED').length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Exponential backoff</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-red-400 uppercase">Dead-Letter / Review</span>
              <div className="text-lg font-bold text-red-400 font-mono mt-1">
                {webhookList.filter((w) => w.status === 'DEAD_LETTER' || w.status === 'MANUAL_REVIEW').length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Requires admin action</span>
            </div>
          </div>

          {/* Automated Reconciliation Scheduler Control Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Automated Reconciliation Scheduler</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scheduled hourly cron with non-overlapping execution lock and comprehensive audit scanning.
                </p>
              </div>

              <button
                onClick={handleTriggerReconciliation}
                disabled={isReconRunning}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition self-start sm:self-auto"
              >
                <Play className={`w-3.5 h-3.5 ${isReconRunning ? 'animate-spin' : ''}`} />
                <span>{isReconRunning ? 'Reconciling Datasets...' : 'Run Reconciliation Now'}</span>
              </button>
            </div>

            {/* Recent Reconciliation Runs Table */}
            {reconHistory.length === 0 ? (
              <div className="p-6 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No automated reconciliation runs logged yet. Click &quot;Run Reconciliation Now&quot; to execute an initial audit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                      <th className="pb-3 font-semibold">Job ID</th>
                      <th className="pb-3 font-semibold">Trigger</th>
                      <th className="pb-3 font-semibold">Duration</th>
                      <th className="pb-3 font-semibold text-right">Scanned</th>
                      <th className="pb-3 font-semibold text-right">Discrepancies</th>
                      <th className="pb-3 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reconHistory.slice(0, 5).map((job) => (
                      <tr key={job.jobId} className="hover:bg-slate-800/20">
                        <td className="py-2.5 font-mono text-white text-xs">{job.jobId}</td>
                        <td className="py-2.5 text-slate-300 font-sans">{job.trigger}</td>
                        <td className="py-2.5 text-slate-400">{job.durationMs ? `${job.durationMs}ms` : 'Running'}</td>
                        <td className="py-2.5 text-right text-slate-200">{job.recordsScanned}</td>
                        <td className="py-2.5 text-right text-red-400 font-bold">{job.discrepanciesDetected}</td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              job.status === 'SUCCESS'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Webhook Events & Failure Recovery Pipeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Webhook Ingestion & Recovery Pipeline</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Durable event storage, retry backoff scheduler, and manual review escalation.
                </p>
              </div>

              {/* Status Filter */}
              <div className="flex flex-wrap gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
                {(['ALL', 'COMPLETED', 'RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTER', 'MANUAL_REVIEW'] as const).map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setWebhookFilter(st)}
                      className={`px-2.5 py-1 rounded-lg capitalize font-mono text-[11px] transition ${
                        webhookFilter === st
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Webhook List */}
            {webhookList.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No webhook events recorded yet. Razorpay events delivered to /api/payments/webhook will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {webhookList
                  .filter((w) => webhookFilter === 'ALL' || w.status === webhookFilter)
                  .map((wh) => {
                    const isCompleted = wh.status === 'COMPLETED' || wh.status === 'PROCESSED';
                    const isDeadLetter = wh.status === 'DEAD_LETTER' || wh.status === 'MANUAL_REVIEW';
                    const isRetry = wh.status === 'RETRY_SCHEDULED';

                    return (
                      <div
                        key={wh.eventId}
                        className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white text-xs font-bold">{wh.eventId}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-300">
                              {wh.eventType}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                                isCompleted
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : isRetry
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : isDeadLetter
                                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                              }`}
                            >
                              {wh.status}
                            </span>
                          </div>
                          <div className="text-slate-400 text-[11px] mt-1 space-x-2">
                            <span>Retries: {wh.retryCount || 0} / {wh.maxRetries || 5}</span>
                            <span>•</span>
                            <span>Created: {new Date(wh.createdAt).toLocaleTimeString('en-IN')}</span>
                            {wh.errorMessage && (
                              <>
                                <span>•</span>
                                <span className="text-red-400">Error: {wh.errorMessage}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {wh.redactedPayload && (
                            <button
                              onClick={() => setSelectedWebhookPayload(wh.redactedPayload)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                            >
                              Payload
                            </button>
                          )}
                          {!isCompleted && (
                            <>
                              <button
                                onClick={() => handleRetryWebhook(wh.eventId)}
                                className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow transition"
                              >
                                Replay
                              </button>
                              {!isDeadLetter && (
                                <button
                                  onClick={() => handleFlagManualReview(wh.eventId)}
                                  className="px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
                                >
                                  Flag Review
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Redacted Payload Modal */}
          {selectedWebhookPayload && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedWebhookPayload(null);
              }}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white">Redacted Provider Webhook Payload</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    CWE-312 Scrubbed
                  </span>
                </div>

                <div className="flex-1 overflow-auto bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify(selectedWebhookPayload, null, 2)}
                  </pre>
                </div>

                <button
                  onClick={() => setSelectedWebhookPayload(null)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
