import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  FileText,
  Printer,
  CheckCircle2,
  Wrench,
  Ban,
  UserCheck,
  UserX,
  RotateCcw,
  Receipt,
  FileCheck2,
} from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { getActiveCommissionPolicy } from '../services/commissionEngine';
import { Vehicle, DriverProfile, OperatorSettlement, VehicleCategory } from '../types';

interface FleetDashboardViewProps {
  onNavigate: (route: string) => void;
}

export const FleetDashboardView: React.FC<FleetDashboardViewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'drivers' | 'settlements'>('vehicles');
  const [selectedSettlement, setSelectedSettlement] = useState<OperatorSettlement | null>(null);
  const [assignModalVehicle, setAssignModalVehicle] = useState<Vehicle | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [showRegisterVehicleModal, setShowRegisterVehicleModal] = useState(false);
  const [regPlateNumber, setRegPlateNumber] = useState('');
  const [regMakeModel, setRegMakeModel] = useState('');
  const [regCategory, setRegCategory] = useState<VehicleCategory>('Sedan');
  const [regSeats, setRegSeats] = useState(4);
  const [regLuggage, setRegLuggage] = useState(3);
  const [regFuelType, setRegFuelType] = useState<'EV' | 'CNG' | 'Petrol' | 'Diesel'>('CNG');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reactive DB subscription
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  const currentUser = db.getState().currentUser;

  if (!currentUser) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <Building2 className="w-12 h-12 text-slate-500 mx-auto" />
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400">Please sign in with an authorized fleet operator account.</p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const targetOrgId =
    currentUser.role === 'fleet_operator' && currentUser.organizationId
      ? currentUser.organizationId
      : currentUser.role === 'admin'
      ? db.getState().organizations[0]?.id || null
      : null;

  const fleetOrg = targetOrgId
    ? db.getState().organizations.find((o) => o.id === targetOrgId) || null
    : null;

  if (!fleetOrg) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">No Fleet Partner Organization Linked</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Your account <strong>({currentUser.fullName || currentUser.email})</strong> is not yet associated with a registered fleet partner organization.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => onNavigate('/fleet-partners')}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
            >
              Explore Fleet Partner Network
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="text-xs text-slate-400 hover:text-white transition py-2"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Retrieve data using tenant isolation methods
  const vehicleQuery = db.getVehiclesForTenant(currentUser.id, currentUser.role, fleetOrg.id);
  const driverQuery = db.getDriversForTenant(currentUser.id, currentUser.role, fleetOrg.id);
  const settlements = db.getSettlementsForTenant(currentUser.id, currentUser.role, fleetOrg.id);

  const allVehicles = vehicleQuery.vehicles || [];
  const allDrivers = driverQuery.drivers || [];
  const activeCommissionPolicy = getActiveCommissionPolicy();
  const operatorSharePercent = activeCommissionPolicy.driverSharePercent;
  const platformRatePercent = activeCommissionPolicy.platformCommissionPercent;

  const handleUpdateStatus = (
    vehicleId: string,
    newStatus: 'ACTIVE' | 'OFFLINE' | 'SERVICING'
  ) => {
    setActionFeedback(null);
    const res = db.updateVehicleStatus({
      vehicleId,
      status: newStatus,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    if (res.success && res.vehicle) {
      setActionFeedback({
        type: 'success',
        message: `Vehicle ${res.vehicle.plateNumber} status successfully changed to ${newStatus}.`,
      });
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Failed to update vehicle status.',
      });
    }
  };

  const handleOpenAssignModal = (vehicle: Vehicle) => {
    setAssignModalVehicle(vehicle);
    setSelectedDriverId('');
    setActionFeedback(null);
  };

  const handleConfirmDriverAssignment = () => {
    if (!assignModalVehicle || !selectedDriverId) return;
    setIsSubmitting(true);
    setActionFeedback(null);

    const res = db.assignDriverToVehicle({
      vehicleId: assignModalVehicle.id,
      driverId: selectedDriverId,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    setIsSubmitting(false);
    if (res.success && res.vehicle) {
      setActionFeedback({
        type: 'success',
        message: `Driver successfully assigned to ${res.vehicle.plateNumber}.`,
      });
      setAssignModalVehicle(null);
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Failed to assign driver.',
      });
    }
  };

  const handleUnassignDriver = (vehicleId: string) => {
    setActionFeedback(null);
    const res = db.unassignDriverFromVehicle({
      vehicleId,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    if (res.success && res.vehicle) {
      setActionFeedback({
        type: 'success',
        message: `Driver successfully unassigned from ${res.vehicle.plateNumber}.`,
      });
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Failed to unassign driver.',
      });
    }
  };

  const handleGenerateSettlement = (cycle: string) => {
    setActionFeedback(null);
    const res = db.generateWeeklySettlement({
      organizationId: fleetOrg.id,
      settlementCycle: cycle,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    if (res.success && res.settlement) {
      setActionFeedback({
        type: 'success',
        message: res.isExisting
          ? `Settlement statement for ${cycle} already generated (${res.settlement.settlementReference}). Showing existing verified report.`
          : `Weekly settlement ${res.settlement.settlementReference} generated successfully for ${formatINR(res.settlement.netPayablePaise)} net payable.`,
      });
      setSelectedSettlement(res.settlement);
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Failed to generate weekly settlement.',
      });
    }
  };

  const handleRegisterVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPlateNumber.trim() || !regMakeModel.trim()) {
      setActionFeedback({
        type: 'error',
        message: 'Please provide both registration plate number and make/model.',
      });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);

    const res = db.registerVehicle({
      organizationId: fleetOrg.id,
      plateNumber: regPlateNumber.trim(),
      makeModel: regMakeModel.trim(),
      category: regCategory,
      seats: Number(regSeats) || 4,
      luggageCapacity: Number(regLuggage) || 3,
      fuelType: regFuelType,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    setIsSubmitting(false);

    if (res.success && res.vehicle) {
      setActionFeedback({
        type: 'success',
        message: `Commercial vehicle ${res.vehicle.plateNumber} (${res.vehicle.makeModel}) registered successfully to ${fleetOrg.name}.`,
      });
      setShowRegisterVehicleModal(false);
      setRegPlateNumber('');
      setRegMakeModel('');
      setRegSeats(4);
      setRegLuggage(3);
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Failed to register commercial vehicle.',
      });
    }
  };

  // Eligible drivers for assignment (must be approved and belong to this fleet)
  const eligibleDrivers = allDrivers.filter(
    (d) => d.verificationStatus === 'approved' && d.organizationId === fleetOrg.id
  );

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

        {/* Global Action Feedback Alert */}
        {actionFeedback && (
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white font-mono text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Fleet KPI Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Total Vehicles</div>
            <div className="text-xl font-bold text-white font-mono">{allVehicles.length}</div>
            <div className="text-[11px] text-emerald-400 font-medium">
              {allVehicles.filter((v) => v.status === 'ACTIVE').length} Active for Dispatch
            </div>
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
            <div className="text-xl font-bold text-white font-mono">{operatorSharePercent}%</div>
            <div className="text-[11px] text-slate-400">{platformRatePercent}% Platform Take-Rate ({activeCommissionPolicy.status})</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'vehicles'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Vehicle Inventory ({allVehicles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'drivers'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Driver Roster ({allDrivers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'settlements'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Weekly Financial Settlements ({settlements.length})</span>
          </button>
        </div>

        {/* TAB 1: VEHICLES */}
        {activeTab === 'vehicles' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">Commercial Vehicle Inventory</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Restricted to {fleetOrg.name} (Tenant Boundary Enforced).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">
                  {allVehicles.filter((v) => v.status === 'ACTIVE').length} / {allVehicles.length} Dispatch Ready
                </span>
                <button
                  onClick={() => setShowRegisterVehicleModal(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Vehicle</span>
                </button>
              </div>
            </div>

            {allVehicles.length === 0 ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <Car className="w-10 h-10 text-slate-500 mx-auto" />
                <h3 className="text-sm font-bold text-white">No Vehicles Registered</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No commercial vehicles are currently bound to this fleet partner tenant.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {allVehicles.map((veh) => {
                  const isAssigned = Boolean(veh.assignedDriverId);
                  return (
                    <div
                      key={veh.id}
                      className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between hover:border-slate-700 transition"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                            {veh.plateNumber}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                              veh.status === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : veh.status === 'SERVICING' || veh.status === 'MAINTENANCE'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-slate-700/30 text-slate-400 border-slate-700'
                            }`}
                          >
                            {veh.status}
                          </span>
                        </div>

                        <div>
                          <div className="text-sm font-bold text-slate-200">{veh.makeModel}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Class: <strong className="text-sky-400">{veh.category}</strong> • Fuel: {veh.fuelType}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Capacity: {veh.seats} Passengers, {veh.luggageCapacity} Luggage
                          </div>
                        </div>

                        {/* Driver Binding Strip */}
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                          <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
                            <span>Assigned Driver:</span>
                            {isAssigned ? (
                              <button
                                onClick={() => handleUnassignDriver(veh.id)}
                                className="text-[10px] text-red-400 hover:text-red-300 font-semibold"
                              >
                                Unbind
                              </button>
                            ) : null}
                          </div>

                          {isAssigned ? (
                            <div className="flex items-center gap-2 text-white font-medium">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">{veh.assignedDriverName || 'Assigned'}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 italic">No driver assigned</span>
                              <button
                                onClick={() => handleOpenAssignModal(veh)}
                                className="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] font-semibold transition"
                              >
                                Assign
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Change Control Strip */}
                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
                        <span className="text-slate-400">Set Status:</span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={veh.status === 'ACTIVE'}
                            onClick={() => handleUpdateStatus(veh.id, 'ACTIVE')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                              veh.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-slate-400 hover:text-white bg-slate-800'
                            }`}
                          >
                            Active
                          </button>
                          <button
                            disabled={veh.status === 'OFFLINE'}
                            onClick={() => handleUpdateStatus(veh.id, 'OFFLINE')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                              veh.status === 'OFFLINE'
                                ? 'bg-slate-700 text-white'
                                : 'text-slate-400 hover:text-white bg-slate-800'
                            }`}
                          >
                            Offline
                          </button>
                          <button
                            disabled={veh.status === 'SERVICING'}
                            onClick={() => handleUpdateStatus(veh.id, 'SERVICING')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                              veh.status === 'SERVICING'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'text-slate-400 hover:text-white bg-slate-800'
                            }`}
                          >
                            Servicing
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DRIVERS */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Authorized Driver Roster</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Commercial PSV Badge holders certified for CSMIA Mumbai airport operations.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {allDrivers.length} Roster Drivers
              </span>
            </div>

            <div className="space-y-3">
              {allDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white shrink-0">
                      {driver.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{driver.fullName}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ★ {driver.rating}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">({driver.totalTrips} Trips)</span>
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                        {driver.phone} • Assigned:{' '}
                        <strong className="text-sky-400">
                          {driver.assignedVehicle?.plateNumber || 'No vehicle assigned'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="sm:text-right">
                      <div className="font-mono text-emerald-400 font-bold text-sm">
                        {formatINR(driver.earningsThisWeekPaise)}
                      </div>
                      <div className="text-[10px] text-slate-500">Gross Driver Payout (80%)</div>
                    </div>

                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                        driver.verificationStatus === 'approved'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      }`}
                    >
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
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white">Automated Weekly Bank Settlements</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Direct commercial disbursement to MetroCab HDFC Current Account (••• 8821).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateSettlement('2026-W42')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Generate Current Week Settlement (W42)</span>
                  </button>
                </div>
              </div>

              {/* Settlement History List */}
              <div className="space-y-4">
                {settlements.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400">
                    No weekly settlement statements generated yet. Click above to generate cycle statement.
                  </div>
                ) : (
                  settlements.map((st) => (
                    <div
                      key={st.id}
                      className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-4 hover:border-slate-700 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white font-mono">{st.settlementReference}</span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                                st.status === 'SETTLED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                              }`}
                            >
                              {st.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Cycle: <strong className="text-slate-200">{st.settlementCycle}</strong> • Period:{' '}
                            {new Date(st.periodStart).toLocaleDateString('en-IN')} –{' '}
                            {new Date(st.periodEnd).toLocaleDateString('en-IN')}
                          </div>
                        </div>

                        <div className="sm:text-right">
                          <div className="text-xs text-slate-400">Net Operator Payable (85%)</div>
                          <div className="text-lg font-bold font-mono text-emerald-400">
                            {formatINR(st.netPayablePaise)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Gross: {formatINR(st.grossFaresPaise)} • Platform Take (15%): {formatINR(st.platformCommissionPaise)}
                          </div>
                        </div>
                      </div>

                      {/* Breakdown summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2.5 bg-slate-900 rounded-lg">
                          <div className="text-[10px] text-slate-400">Completed Trips</div>
                          <div className="font-bold text-white font-mono">{st.completedTripsCount} Trips</div>
                        </div>
                        <div className="p-2.5 bg-slate-900 rounded-lg">
                          <div className="text-[10px] text-slate-400">Gross Pool Revenue</div>
                          <div className="font-bold text-white font-mono">{formatINR(st.grossFaresPaise)}</div>
                        </div>
                        <div className="p-2.5 bg-slate-900 rounded-lg">
                          <div className="text-[10px] text-slate-400">Platform Commission (15%)</div>
                          <div className="font-bold text-rose-400 font-mono">-{formatINR(st.platformCommissionPaise)}</div>
                        </div>
                        <div className="p-2.5 bg-slate-900 rounded-lg">
                          <div className="text-[10px] text-slate-400">Disbursement Account</div>
                          <div className="font-bold text-slate-300 truncate">{st.bankAccountMasked || 'HDFC ••• 8821'}</div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          {st.verifiedPaymentId ? (
                            <span>Verified Transaction: <strong className="font-mono text-slate-400">{st.verifiedPaymentId}</strong></span>
                          ) : (
                            <span>Awaiting automated weekly bank ACH clearance</span>
                          )}
                        </span>

                        <button
                          onClick={() => setSelectedSettlement(st)}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Itemized Statement</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Driver Assignment Modal */}
      {assignModalVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setAssignModalVehicle(null);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl p-6 sm:p-7 max-w-md w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Assign Driver to Vehicle</h3>
                  <p className="text-xs text-slate-400 font-mono">{assignModalVehicle.plateNumber} ({assignModalVehicle.makeModel})</p>
                </div>
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setAssignModalVehicle(null)}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-300 font-semibold">
                Select Approved Roster Driver:
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
              >
                <option value="" disabled>Choose an approved driver...</option>
                {eligibleDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} ({d.phone}) • ★{d.rating} {d.assignedVehicleId ? `[Assigned: ${d.assignedVehicle?.plateNumber}]` : '[Unassigned]'}
                  </option>
                ))}
              </select>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                Only PSV badge holders with verified KYC documents belonging to <strong>{fleetOrg.name}</strong> are eligible for airport assignment.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
              <button
                disabled={isSubmitting}
                onClick={() => setAssignModalVehicle(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={!selectedDriverId || isSubmitting}
                onClick={handleConfirmDriverAssignment}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition"
              >
                {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Settlement Statement Modal */}
      {selectedSettlement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSettlement(null);
          }}
        >
          <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 max-w-2xl w-full space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{selectedSettlement.organizationName}</h3>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                    {selectedSettlement.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  Settlement Ref: {selectedSettlement.settlementReference} • GSTIN: {fleetOrg.businessRegNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedSettlement(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Settlement Cycle:</span>
                <div className="font-bold text-slate-800">{selectedSettlement.settlementCycle}</div>
              </div>
              <div>
                <span className="text-slate-500">Period:</span>
                <div className="font-medium text-slate-700">
                  {new Date(selectedSettlement.periodStart).toLocaleDateString('en-IN')} –{' '}
                  {new Date(selectedSettlement.periodEnd).toLocaleDateString('en-IN')}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Disbursement Account:</span>
                <div className="font-mono text-slate-700">{selectedSettlement.bankAccountMasked}</div>
              </div>
              <div>
                <span className="text-slate-500">Generation Timestamp:</span>
                <div className="font-mono text-slate-700">
                  {new Date(selectedSettlement.generatedAt).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Itemized Trips Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Itemized Completed Trips Breakdown ({selectedSettlement.itemizedTrips.length})
              </h4>
              <div className="border rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Trip Corridor</th>
                      <th className="p-2.5">Vehicle / Driver</th>
                      <th className="p-2.5 text-right">Gross Fare</th>
                      <th className="p-2.5 text-right">Platform ({platformRatePercent}%)</th>
                      <th className="p-2.5 text-right">Operator Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-mono">
                    {selectedSettlement.itemizedTrips.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400 italic font-sans">
                          No individual trips in this settlement period.
                        </td>
                      </tr>
                    ) : (
                      selectedSettlement.itemizedTrips.map((trip, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-sans font-medium text-slate-800">{trip.corridor}</td>
                          <td className="p-2.5 font-sans">{trip.vehiclePlate} ({trip.driverName.split(' ')[0]})</td>
                          <td className="p-2.5 text-right">{formatINR(trip.grossFarePaise)}</td>
                          <td className="p-2.5 text-right text-rose-600">-{formatINR(trip.platformFeePaise)}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-700">{formatINR(trip.operatorSharePaise)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Financial Summary */}
            <div className="border-t border-b py-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Gross Passenger Fares:</span>
                <span className="font-mono font-semibold">{formatINR(selectedSettlement.grossFaresPaise)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Platform Commission ({platformRatePercent.toFixed(1)}%):</span>
                <span className="font-mono text-rose-600">-{formatINR(selectedSettlement.platformCommissionPaise)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t text-sm">
                <span>Net Operator Payout Amount (INR):</span>
                <span className="font-mono text-emerald-800">{formatINR(selectedSettlement.netPayablePaise, true)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              This statement constitutes an official commercial settlement voucher between AeroPool Technologies Pvt. Ltd. and {selectedSettlement.organizationName}.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.warn('Print preview blocked in iframe:', e);
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Commercial Vehicle Modal */}
      {showRegisterVehicleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setShowRegisterVehicleModal(false);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Register Commercial Vehicle</h3>
                  <p className="text-xs text-slate-400 font-mono">Bound to {fleetOrg.name}</p>
                </div>
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setShowRegisterVehicleModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterVehicle} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">License Plate Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="MH 01 EE 1234"
                    value={regPlateNumber}
                    onChange={(e) => setRegPlateNumber(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Make & Model *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maruti Ertiga CNG"
                    value={regMakeModel}
                    onChange={(e) => setRegMakeModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Vehicle Category *</label>
                  <select
                    value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value as VehicleCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Sedan">Sedan (Dzire, Etios)</option>
                    <option value="SUV">SUV (Innova, Carens)</option>
                    <option value="EV">EV (Tigor EV, Nexon EV)</option>
                    <option value="XL">XL (Tempo, Traveler)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Fuel Type *</label>
                  <select
                    value={regFuelType}
                    onChange={(e) => setRegFuelType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CNG">CNG (Clean Fuel)</option>
                    <option value="EV">Electric (Zero Emission)</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Passenger Seating Capacity *</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    required
                    value={regSeats}
                    onChange={(e) => setRegSeats(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Luggage Space (Bags) *</label>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    required
                    value={regLuggage}
                    onChange={(e) => setRegLuggage(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tenant Isolation Safeguard</span>
                </div>
                <p>
                  This vehicle will be exclusively bound to <strong>{fleetOrg.name}</strong>. Cross-organization access and unassigned driver dispatch are strictly blocked by RLS policies.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowRegisterVehicleModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Registering...' : 'Register Vehicle'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
