import React, { useState } from 'react';
import {
  Wallet,
  Calendar,
  FileText,
  Printer,
  X,
  AlertCircle,
  Coins,
  TrendingUp,
  Receipt,
  Car,
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { getActiveCommissionPolicy } from '../services/commissionEngine';
import {
  generateDriverWeeklyStatement,
  renderDriverStatementHtml,
} from '../services/invoiceService';
import { DriverWeeklyStatement, DriverLedgerEntry } from '../types';

interface DriverWalletCardProps {
  driverId: string;
  driverName: string;
}

export const DriverWalletCard: React.FC<DriverWalletCardProps> = ({ driverId, driverName }) => {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedStatement, setSelectedStatement] = useState<DriverWeeklyStatement | null>(null);

  const wallet = db.getDriverWalletSummary(driverId);
  const activePolicy = getActiveCommissionPolicy();

  // Filter transactions based on date filter
  const nowMs = Date.now();
  const filteredTransactions = wallet.recentTransactions.filter((tx: DriverLedgerEntry) => {
    const txMs = new Date(tx.timestamp).getTime();
    if (dateFilter === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return txMs >= todayStart.getTime();
    }
    if (dateFilter === 'week') return txMs >= nowMs - 7 * 86400000;
    if (dateFilter === 'month') return txMs >= nowMs - 30 * 86400000;
    return true;
  });

  const handleGenerateStatement = () => {
    const now = new Date();
    const cycle = `${now.getFullYear()}-W${Math.ceil((now.getDate() + 6) / 7)}`;
    const statement = generateDriverWeeklyStatement({
      driverId,
      driverName,
      cycle,
      startDate: new Date(nowMs - 7 * 86400000).toISOString(),
      endDate: now.toISOString(),
      entries: wallet.recentTransactions,
      policySnapshot: {
        policyId: activePolicy.policyId,
        driverSharePercent: activePolicy.driverSharePercent,
        platformCommissionPercent: activePolicy.platformCommissionPercent,
        commercialApprovalStatus: activePolicy.commercialApprovalStatus,
      },
    });
    setSelectedStatement(statement);
  };

  const handlePrintStatement = () => {
    if (!selectedStatement) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(renderDriverStatementHtml(selectedStatement));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const getStatusBadge = (status: DriverLedgerEntry['settlementStatus']) => {
    switch (status) {
      case 'ACCRUED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Accrued</span>;
      case 'AVAILABLE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">Available</span>;
      case 'SETTLEMENT_APPROVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Approved</span>;
      case 'PAYMENT_CONFIRMED':
      case 'SETTLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Paid Out</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-800">{status}</span>;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header with Statement Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Driver Earnings Wallet & Financial Ledger</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Database-backed earnings, airport toll pass-through, commission breakdowns & weekly settlement tracking.
          </p>
        </div>

        <button
          onClick={handleGenerateStatement}
          className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition shrink-0"
        >
          <FileText className="w-4 h-4 text-emerald-400" />
          <span>Weekly Earnings Statement</span>
        </button>
      </div>

      {/* Primary Wallet Balances Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Available for Settlement</span>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {formatINR(wallet.availableEarningsPaise)}
          </div>
          <span className="text-[10px] text-slate-500">Ready for weekly cycle</span>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Accrued (Pending Reconciliation)</span>
          <div className="text-xl font-bold font-mono text-amber-400">
            {formatINR(wallet.accruedEarningsPaise)}
          </div>
          <span className="text-[10px] text-slate-500">Current cycle rides</span>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Settlement Approved</span>
          <div className="text-xl font-bold font-mono text-cyan-400">
            {formatINR(wallet.approvedEarningsPaise)}
          </div>
          <span className="text-[10px] text-slate-500">Admin approved for transfer</span>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Total Lifetime Paid Out</span>
          <div className="text-xl font-bold font-mono text-slate-200">
            {formatINR(wallet.paidOutEarningsPaise)}
          </div>
          <span className="text-[10px] text-slate-500">Confirmed bank settlements</span>
        </div>
      </div>

      {/* Period Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800/60 text-xs">
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Today's Net</span>
          <div className="font-mono font-bold text-slate-200">{formatINR(wallet.todayEarningsPaise)}</div>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Last 7 Days</span>
          <div className="font-mono font-bold text-slate-200">{formatINR(wallet.weeklyEarningsPaise)}</div>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Last 30 Days</span>
          <div className="font-mono font-bold text-slate-200">{formatINR(wallet.monthlyEarningsPaise)}</div>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Toll Reimbursements</span>
          <div className="font-mono font-bold text-sky-400">{formatINR(wallet.lifetimeTollReimbursementsPaise)}</div>
        </div>
      </div>

      {/* Active Commission Policy Notice Banner */}
      <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            Active Settlement Rate: <strong className="text-white">{activePolicy.driverSharePercent}% Driver Payout</strong> / {activePolicy.platformCommissionPercent}% Platform Take • Airport Toll: 100% Pass-Through
          </span>
        </div>
        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
          {activePolicy.commercialApprovalStatus}
        </span>
      </div>

      {/* Filterable Transaction Ledger Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-slate-400" />
            <span>Itemized Financial Ledger ({filteredTransactions.length})</span>
          </h3>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
            {(['all', 'today', 'week', 'month'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition ${
                  dateFilter === filter
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
            <Car className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-xs font-semibold text-slate-300">No Transactions Found</div>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              No financial ledger entries exist for the selected period. Complete commercial airport trips to record earnings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] font-mono text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Date & ID</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Gross Fare</th>
                  <th className="p-3 text-right">Commission</th>
                  <th className="p-3 text-right">Toll</th>
                  <th className="p-3 text-right">Driver Net</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {filteredTransactions.map((tx: DriverLedgerEntry) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                    <td className="p-3">
                      <div className="font-mono text-slate-300 text-[11px]">
                        {new Date(tx.timestamp).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: '2-digit',
                        })}{' '}
                        {new Date(tx.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">{tx.id.slice(-8)}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] text-slate-300">
                        {tx.transactionType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">
                      {formatINR(tx.grossFarePaise)}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-400">
                      -{formatINR(tx.platformCommissionPaise)}
                    </td>
                    <td className="p-3 text-right font-mono text-sky-400">
                      +{formatINR(tx.tollReimbursementPaise)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      {formatINR(tx.driverEarningsPaise)}
                    </td>
                    <td className="p-3 text-center">{getStatusBadge(tx.settlementStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Weekly Statement Modal */}
      {selectedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-400" />
                  <span>Weekly Driver Statement</span>
                </h3>
                <span className="text-xs font-mono text-slate-400">{selectedStatement.statementId}</span>
              </div>
              <button
                onClick={() => setSelectedStatement(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-500">Driver Partner</span>
                  <div className="font-bold text-white">{selectedStatement.driverName}</div>
                </div>
                <div>
                  <span className="text-slate-500">Settlement Cycle</span>
                  <div className="font-bold text-white">{selectedStatement.reportingPeriod.cycle}</div>
                </div>
                <div>
                  <span className="text-slate-500">Completed Trips</span>
                  <div className="font-mono text-emerald-400 font-bold">{selectedStatement.completedTripsCount}</div>
                </div>
                <div>
                  <span className="text-slate-500">Status</span>
                  <div className="font-mono text-sky-400 font-bold">{selectedStatement.settlementStatus}</div>
                </div>
              </div>

              {/* Itemized summary */}
              <div className="space-y-1.5 p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Gross Pool Fares:</span>
                  <span className="text-white font-bold">{formatINR(selectedStatement.grossFaresPaise, true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Platform Commission ({selectedStatement.policySnapshot.platformCommissionPercent}%):</span>
                  <span className="text-rose-400">-{formatINR(selectedStatement.platformCommissionPaise, true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Airport Toll Reimbursements:</span>
                  <span className="text-sky-400">+{formatINR(selectedStatement.tollReimbursementsPaise, true)}</span>
                </div>
                {selectedStatement.refundAdjustmentsPaise > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Refund Adjustments:</span>
                    <span className="text-rose-400">-{formatINR(selectedStatement.refundAdjustmentsPaise, true)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold text-emerald-400">
                  <span>Net Payable Earnings:</span>
                  <span>{formatINR(selectedStatement.netEarningsPaise, true)}</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
                Statement checksum: <span className="font-mono text-slate-300">{selectedStatement.documentHash}</span>.
                Pertains to verified commercial mobility operations at CSMIA Airport Mumbai. Bank payout transfer is subject to Super Admin batch approval.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedStatement(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={handlePrintStatement}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
