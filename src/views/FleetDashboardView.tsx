import React, { useState } from 'react';
import {
  Building2,
  Car,
  Users,
  TrendingUp,
  DollarSign,
  Plus,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { Vehicle, DriverProfile } from '../types';

interface FleetDashboardViewProps {
  onNavigate: (route: string) => void;
}

export const FleetDashboardView: React.FC<FleetDashboardViewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'drivers' | 'settlements'>('vehicles');

  const fleetOrg = db.getState().organizations[0]; // MetroCab Fleet Solutions LLP
  const allVehicles = db.getState().vehicles.filter((v) => v.organizationId === fleetOrg.id);
  const allDrivers = db.getState().driverProfiles.filter((d) => d.organizationId === fleetOrg.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Fleet Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xl">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">{fleetOrg.name}</h1>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Licensed Fleet Partner</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Reg No: {fleetOrg.businessRegNumber} • Dedicated CSMIA Commercial Fleet
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400">Total Settled Earnings</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {formatINR(fleetOrg.settledEarningsPaise)}
            </div>
            <div className="text-[11px] text-amber-400 font-medium mt-0.5">
              Pending Next Payout: {formatINR(fleetOrg.pendingSettlementPaise)}
            </div>
          </div>
        </div>

        {/* Fleet KPI Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Total Vehicles</div>
            <div className="text-xl font-bold text-white font-mono">{allVehicles.length}</div>
            <div className="text-[11px] text-emerald-400 font-medium">100% Inspected</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Rostered Drivers</div>
            <div className="text-xl font-bold text-white font-mono">{allDrivers.length}</div>
            <div className="text-[11px] text-sky-400 font-medium">All PSV Badge Holders</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Trips Completed</div>
            <div className="text-xl font-bold text-white font-mono">{fleetOrg.totalTripsCompleted}</div>
            <div className="text-[11px] text-slate-400">CSMIA Airport Transit</div>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Operator Share</div>
            <div className="text-xl font-bold text-white font-mono">85%</div>
            <div className="text-[11px] text-slate-400">15% Platform Take-Rate</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'vehicles' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Vehicle Inventory ({allVehicles.length})
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'drivers' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Driver Roster ({allDrivers.length})
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'settlements' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Weekly Financial Settlements
          </button>
        </div>

        {/* TAB 1: VEHICLES */}
        {activeTab === 'vehicles' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Commercial Vehicle Inventory</h2>
              <span className="text-xs text-slate-400">Restricted to {fleetOrg.name} (Tenant Isolated)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {allVehicles.map((veh) => (
                <div key={veh.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {veh.plateNumber}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {veh.status}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-200">{veh.makeModel}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Class: {veh.category} • Fuel: {veh.fuelType}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Capacity: {veh.seats} Seats, {veh.luggageCapacity} Bags</span>
                    <span className="text-sky-400 font-semibold">{veh.assignedDriverName || 'Unassigned'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: DRIVERS */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Authorized Driver Roster</h2>
            </div>

            <div className="space-y-3">
              {allDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-white">
                      {driver.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{driver.fullName}</span>
                        <span className="text-[10px] text-emerald-400 font-normal">★ {driver.rating}</span>
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                        {driver.phone} • Assigned: {driver.assignedVehicle?.plateNumber || 'No vehicle'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold">{formatINR(driver.earningsThisWeekPaise)}</div>
                      <div className="text-[10px] text-slate-500">This Week</div>
                    </div>

                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px] uppercase font-bold">
                      {driver.verificationStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SETTLEMENTS */}
        {activeTab === 'settlements' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Automated Weekly Bank Settlement</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct transfer via NEFT/RTGS to MetroCab HDFC Current Account (••• 8821).
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                Cycle: Weekly Every Monday
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Total Pooled Passenger Gross (Last 7 Days):</span>
                <span className="font-mono font-bold text-white">₹73,410.00</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Platform Coordination Fee (15%):</span>
                <span className="font-mono text-slate-400">- ₹11,010.00</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-sm text-emerald-400 pt-2">
                <span>Net Transfer Amount:</span>
                <span className="font-mono">₹62,400.00</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
