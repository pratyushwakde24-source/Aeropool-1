import {
  UserProfile,
  RidePool,
  Booking,
  DriverProfile,
  Vehicle,
  FleetOrganization,
  PaymentRecord,
  SafetyIncident,
  SupportTicket,
  AuditLog,
  AppNotification,
  RideStatus,
  VerificationStatus,
  DestinationPoint,
  RideRequest,
  OperatorSettlement,
  OperatorSettlementItem,
  LocationBreadcrumb,
  DriverCurrentLocation,
  LocationSource,
  NotificationType,
  NotificationCategory,
  VehicleCategory,
  DriverDocument,
  DriverLifecycleState,
  DriverLastLocation,
  RideOffer,
  DriverLedgerEntry,
  DriverWalletSummary,
  DriverWeeklyStatement,
  SettlementLifecycleStatus,
  ReconciliationDiscrepancy,
  FinancialExportType,
  RefundLifecycleStatus,
  RideType,
} from '../types';
import { calculateCommissionSplit } from './commissionEngine';
import { womenOnlyService } from './womenOnlyService';
import { PICKUP_ZONES, MUMBAI_DESTINATIONS, calculateHaversineDistanceKm } from './geoService';
import { normalizeLicenseNumber, validateLicenseNumber, areLicensesEqual } from '../utils/licenseNormalization';
import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from './supabaseClient';
import { getOperatingMode, OperatingMode } from './configService';

const DB_STORAGE_KEY = 'aeropool_production_store_v2';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministically maps any text slug (e.g. 'org-metrocab-mumbai') to an RFC-4122 compliant
 * UUID v4 string for seamless PostgreSQL UUID schema compatibility.
 */
export function ensureValidUuid(idOrSlug: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(idOrSlug)) {
    return idOrSlug;
  }
  let hash = 0;
  for (let i = 0; i < idOrSlug.length; i++) {
    hash = (hash << 5) - hash + idOrSlug.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const slugHex = Array.from(idOrSlug)
    .map((c) => c.charCodeAt(0).toString(16))
    .join('')
    .padEnd(24, '0')
    .slice(0, 24);
  return `${hex}-${slugHex.slice(0, 4)}-4${slugHex.slice(4, 7)}-8${slugHex.slice(7, 10)}-${slugHex.slice(10, 22)}`;
}

export interface DatabaseState {
  users: UserProfile[];
  currentUser: UserProfile | null;
  driverProfiles: DriverProfile[];
  vehicles: Vehicle[];
  organizations: FleetOrganization[];
  pools: RidePool[];
  bookings: Booking[];
  payments: PaymentRecord[];
  safetyIncidents: SafetyIncident[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  rideRequests: RideRequest[];
  operatorSettlements: OperatorSettlement[];
  rideOffers: RideOffer[];
  driverLedger: DriverLedgerEntry[];
  reconciliationDiscrepancies: ReconciliationDiscrepancy[];
}

// In-memory state synchronized with localStorage
class AeroPoolDatabase {
  private state: DatabaseState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): DatabaseState {
    const cleanInitialState: DatabaseState = {
      users: [],
      currentUser: null,
      driverProfiles: [],
      vehicles: [],
      organizations: [],
      pools: [],
      bookings: [],
      payments: [],
      safetyIncidents: [],
      supportTickets: [],
      auditLogs: [],
      notifications: [],
      rideRequests: [],
      operatorSettlements: [],
      rideOffers: [],
      driverLedger: [],
      reconciliationDiscrepancies: [],
    };

    try {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('aeropool_production_store_v1');
          localStorage.removeItem('aeropool_local_db');
        } catch {
          // ignore
        }

        const stored = localStorage.getItem(DB_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed.currentUser &&
            (parsed.currentUser.id === 'user-passenger-priya' ||
              parsed.currentUser.fullName === 'Priya Sharma' ||
              parsed.currentUser.email === 'priya.sharma@example.com')
          ) {
            parsed.currentUser = null;
          }
          if (Array.isArray(parsed.users)) {
            parsed.users = parsed.users.filter(
              (u: any) =>
                u.id !== 'user-passenger-priya' &&
                u.id !== 'user-driver-rajesh' &&
                u.id !== 'user-fleet-sunil' &&
                u.id !== 'user-admin-vikram' &&
                u.id !== 'user-support-anita'
            );
          }
          if (!parsed.rideRequests) parsed.rideRequests = [];
          if (!parsed.operatorSettlements) parsed.operatorSettlements = [];
          if (!parsed.rideOffers) parsed.rideOffers = [];
          if (!parsed.driverLedger) parsed.driverLedger = [];
          if (!parsed.reconciliationDiscrepancies) parsed.reconciliationDiscrepancies = [];
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using clean initial state', e);
    }

    this.saveState(cleanInitialState);
    return cleanInitialState;
  }

  private saveState(state: DatabaseState) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public getOperatingMode(): OperatingMode {
    return getOperatingMode();
  }

  public getPersistenceDiagnostics() {
    const mode = getOperatingMode();
    const dbConfigured = isSupabaseConfigured();
    return {
      operatingMode: mode,
      isProduction: mode === 'production',
      isSandbox: mode === 'sandbox',
      isDevelopment: mode === 'development',
      isDatabaseConnected: dbConfigured,
      storageEngine: dbConfigured
        ? 'Supabase PostgreSQL (ACID Cloud)'
        : 'Offline Local Transactional Store (Capacity-Locked)',
      safeguardsActive: true,
      allowsMockPayments: mode !== 'production',
      allowsSimulatedGPS: mode !== 'production',
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveState(this.state);
    this.listeners.forEach((l) => l());
  }

  /**
   * Switch active user / role (Passenger, Driver, Fleet, Admin, Support)
   */
  public setCurrentUser(user: UserProfile | null) {
    this.state.currentUser = user;
    if (user && !this.state.users.some((u) => u.id === user.id)) {
      this.state.users.push(user);
    }
    this.saveState(this.state);
    this.notify();
  }

  /**
   * User Profile: Update profile details with strict role & tenant escalation protections.
   * Disallows non-admins from changing role or organizationId.
   */
  public updateUserProfile(params: {
    targetUserId: string;
    actorId: string;
    actorRole: UserProfile['role'];
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
    role?: UserProfile['role'];
    organizationId?: string;
  }): { success: boolean; user?: UserProfile; error?: string } {
    const user = this.state.users.find((u) => u.id === params.targetUserId);
    if (!user) return { success: false, error: 'User profile not found.' };

    // Identity check: Non-admins can only update their own profile
    if (params.actorRole !== 'admin' && params.actorId !== params.targetUserId) {
      return { success: false, error: 'Unauthorized: You can only update your own profile.' };
    }

    // Role escalation prevention
    if (params.role !== undefined && params.role !== user.role) {
      if (params.actorRole !== 'admin') {
        return { success: false, error: 'Security Notice: Unauthorized role escalation. Users cannot alter their own account role.' };
      }
      user.role = params.role;
    }

    // Organization escalation prevention
    if (params.organizationId !== undefined && params.organizationId !== user.organizationId) {
      if (params.actorRole !== 'admin') {
        return { success: false, error: 'Security Notice: Unauthorized organization modification. Users cannot alter their organization membership.' };
      }
      user.organizationId = params.organizationId;
    }

    if (params.fullName !== undefined) user.fullName = params.fullName.trim();
    if (params.phone !== undefined) user.phone = params.phone.trim();
    if (params.avatarUrl !== undefined) user.avatarUrl = params.avatarUrl;

    if (this.state.currentUser && this.state.currentUser.id === user.id) {
      this.state.currentUser = { ...user };
    }

    this.saveState(this.state);
    this.notify();
    return { success: true, user };
  }

  public resetStore() {
    const cleanState: DatabaseState = {
      users: [],
      currentUser: null,
      driverProfiles: [],
      vehicles: [],
      organizations: [],
      pools: [],
      bookings: [],
      payments: [],
      safetyIncidents: [],
      supportTickets: [],
      auditLogs: [],
      notifications: [],
      rideRequests: [],
      operatorSettlements: [],
      rideOffers: [],
      driverLedger: [],
      reconciliationDiscrepancies: [],
    };
    this.state = cleanState;
    this.saveState(cleanState);
    this.notify();
  }

  public initTestFixtures(fixtures: {
    users?: UserProfile[];
    currentUser?: UserProfile | null;
    driverProfiles?: DriverProfile[];
    vehicles?: Vehicle[];
    organizations?: FleetOrganization[];
    pools?: RidePool[];
    bookings?: Booking[];
    payments?: PaymentRecord[];
    safetyIncidents?: SafetyIncident[];
    supportTickets?: SupportTicket[];
    auditLogs?: AuditLog[];
    notifications?: AppNotification[];
    operatorSettlements?: OperatorSettlement[];
    rideOffers?: RideOffer[];
    driverLedger?: DriverLedgerEntry[];
    reconciliationDiscrepancies?: ReconciliationDiscrepancy[];
  }) {
    this.state = {
      users: fixtures.users ? [...fixtures.users] : [],
      currentUser: fixtures.currentUser !== undefined ? fixtures.currentUser : (fixtures.users?.[0] || null),
      driverProfiles: fixtures.driverProfiles ? [...fixtures.driverProfiles] : [],
      vehicles: fixtures.vehicles ? [...fixtures.vehicles] : [],
      organizations: fixtures.organizations ? [...fixtures.organizations] : [],
      pools: fixtures.pools ? [...fixtures.pools] : [],
      bookings: fixtures.bookings ? [...fixtures.bookings] : [],
      payments: fixtures.payments ? [...fixtures.payments] : [],
      safetyIncidents: fixtures.safetyIncidents ? [...fixtures.safetyIncidents] : [],
      supportTickets: fixtures.supportTickets ? [...fixtures.supportTickets] : [],
      auditLogs: fixtures.auditLogs ? [...fixtures.auditLogs] : [],
      notifications: fixtures.notifications ? [...fixtures.notifications] : [],
      rideRequests: [],
      operatorSettlements: fixtures.operatorSettlements ? [...fixtures.operatorSettlements] : [],
      rideOffers: fixtures.rideOffers ? [...fixtures.rideOffers] : [],
      driverLedger: fixtures.driverLedger ? [...fixtures.driverLedger] : [],
      reconciliationDiscrepancies: fixtures.reconciliationDiscrepancies ? [...fixtures.reconciliationDiscrepancies] : [],
    };
    this.saveState(this.state);
    this.notify();
  }

  public switchUser(userId: string) {
    const user = this.state.users.find((u) => u.id === userId);
    if (user) {
      this.state.currentUser = user;
      this.notify();
    }
  }

  /**
   * Row-Level Security: Retrieve bookings strictly scoped to the requesting user role.
   * Passengers can only view their own bookings.
   * Drivers can only view bookings for pools assigned to their vehicle/account.
   * Fleet operators can only view bookings serviced by their fleet's vehicles.
   * Admins and Support operators can view all bookings.
   */
  public getBookingsForUser(userId: string, role: UserProfile['role']): Booking[] {
    if (role === 'admin' || role === 'support') {
      return [...this.state.bookings];
    }
    if (role === 'passenger') {
      return this.state.bookings.filter((b) => b.passengerId === userId);
    }
    if (role === 'driver') {
      const assignedPoolIds = this.state.pools
        .filter((p) => p.assignedDriverId === userId)
        .map((p) => p.id);
      return this.state.bookings.filter(
        (b) => b.driverId === userId || assignedPoolIds.includes(b.poolId)
      );
    }
    if (role === 'fleet_operator') {
      const user = this.state.users.find((u) => u.id === userId);
      const orgId = user?.organizationId;
      if (!orgId) return [];
      const orgDriverIds = this.state.driverProfiles
        .filter((d) => d.organizationId === orgId)
        .map((d) => d.id);
      return this.state.bookings.filter((b) => b.driverId && orgDriverIds.includes(b.driverId));
    }
    return [];
  }

  /**
   * Row-Level Security: Retrieve single booking with strict access validation.
   * Prevents passengers from reading or tracking another passenger's private booking.
   */
  public getBookingById(
    bookingId: string,
    requestingUserId: string,
    requestingUserRole: UserProfile['role']
  ): { success: boolean; booking?: Booking; error?: string } {
    const booking = this.state.bookings.find((b) => b.id === bookingId);
    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    // Role-based Access Control
    if (requestingUserRole === 'admin' || requestingUserRole === 'support') {
      return { success: true, booking };
    }

    if (requestingUserRole === 'passenger') {
      if (booking.passengerId !== requestingUserId) {
        return {
          success: false,
          error: 'Security Notice: Access restricted. You do not have permission to view another passenger’s booking records.',
        };
      }
      return { success: true, booking };
    }

    if (requestingUserRole === 'driver') {
      const pool = this.state.pools.find((p) => p.id === booking.poolId);
      if (booking.driverId === requestingUserId || pool?.assignedDriverId === requestingUserId) {
        return { success: true, booking };
      }
      return {
        success: false,
        error: 'Security Notice: Driver access restricted to assigned trips only.',
      };
    }

    if (requestingUserRole === 'fleet_operator') {
      const user = this.state.users.find((u) => u.id === requestingUserId);
      const orgDriver = this.state.driverProfiles.find((d) => d.id === booking.driverId);
      if (user?.organizationId && orgDriver?.organizationId === user.organizationId) {
        return { success: true, booking };
      }
      return {
        success: false,
        error: 'Security Notice: Access restricted to vehicles and drivers in your fleet.',
      };
    }

    return { success: false, error: 'Unauthorized.' };
  }

  /**
   * Row-Level Security: Retrieve ride requests scoped to the passenger or ops team.
   */
  public getRideRequestsForUser(userId: string, role: UserProfile['role']): RideRequest[] {
    if (role === 'admin' || role === 'support') {
      return [...(this.state.rideRequests || [])];
    }
    return (this.state.rideRequests || []).filter((r) => r.passengerId === userId);
  }

  /**
   * Row-Level Security: Retrieve vehicles strictly scoped to the fleet organization.
   * Prevents cross-tenant vehicle data leakage between competing fleet operators.
   */
  public getVehiclesForOrg(orgId: string): Vehicle[] {
    if (!orgId) return [];
    return this.state.vehicles.filter((v) => v.organizationId === orgId);
  }

  /**
   * Row-Level Security: Retrieve drivers strictly scoped to the fleet organization.
   */
  public getDriversForOrg(orgId: string): DriverProfile[] {
    if (!orgId) return [];
    return this.state.driverProfiles.filter((d) => d.organizationId === orgId);
  }

  /**
   * ATOMIC TRANSACTION: Book a seat in a ride pool
   * Guarantees capacity lock: will NOT oversell seats or exceed luggage room.
   */
  public bookRideAtomic(params: {
    poolId: string;
    passengerId: string;
    passengerName: string;
    passengerPhone: string;
    flightNumber: string;
    destination: DestinationPoint;
    seats: number;
    luggage: number;
    farePaise: number;
    savingsPaise: number;
    paymentMethod: 'UPI' | 'Card' | 'Netbanking';
    paymentId?: string;
    razorpayOrderId?: string;
    idempotencyKey?: string;
    rideType?: RideType;
    isWomenOnlyEligible?: boolean;
  }): { success: boolean; booking?: Booking; error?: string } {
    const mode = getOperatingMode();

    // Production Persistence & Security Safeguards
    if (mode === 'production') {
      if (!isSupabaseConfigured() || !supabase) {
        return {
          success: false,
          error: 'Database unavailable: In production mode, bookings must be persisted to the verified PostgreSQL database. Offline fallback storage is prohibited in production.',
        };
      }
      if (params.paymentId && params.paymentId.startsWith('pay_BOM_')) {
        return {
          success: false,
          error: 'Payment validation error: Mock sandbox payment IDs (pay_BOM_*) cannot be captured as real collected payments in production mode.',
        };
      }
    }

    // Idempotency check: if key already exists, return confirmed booking without double-booking
    if (params.idempotencyKey) {
      const existing = this.state.bookings.find((b) => b.idempotencyKey === params.idempotencyKey);
      if (existing) {
        return { success: true, booking: existing };
      }
    }

    if (params.seats <= 0) {
      return { success: false, error: 'Invalid seat count. Seats requested must be at least 1.' };
    }
    if (params.luggage < 0) {
      return { success: false, error: 'Invalid luggage count. Luggage cannot be negative.' };
    }

    const pool = this.state.pools.find((p) => p.id === params.poolId);
    if (!pool) {
      return { success: false, error: 'Ride pool was not found or has expired.' };
    }

    // Atomic Capacity Check
    if (pool.availableSeats < params.seats) {
      return {
        success: false,
        error: `Insufficient seats remaining in pool (requested ${params.seats}, only ${pool.availableSeats} left).`,
      };
    }
    if (pool.availableLuggage < params.luggage) {
      return {
        success: false,
        error: `Insufficient luggage room remaining (requested ${params.luggage}, only ${pool.availableLuggage} left).`,
      };
    }

    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {
      return { success: false, error: 'This pool is no longer accepting passengers.' };
    }

    // Strict Women-Only Pool Integrity Verification
    const isPoolWomenOnly = Boolean(pool.isWomenOnlyPool || pool.poolCategory === 'WOMEN_ONLY_POOL');
    const requestedRideType = params.rideType;

    if (isPoolWomenOnly) {
      const isEligible = Boolean(
        params.isWomenOnlyEligible ||
        womenOnlyService.isPassengerEligible(params.passengerId)
      );
      if (!isEligible) {
        return {
          success: false,
          error: 'Women-Only Pool restriction: Only verified women passengers can book seats in this pool.',
        };
      }

      // Double-check all existing passengers to ensure no ineligible co-passenger exists
      const hasIneligible = pool.passengers.some((p) => p.isWomenOnlyEligible === false);
      if (hasIneligible) {
        return {
          success: false,
          error: 'Integrity violation: Ineligible passenger detected in Women-Only Pool. Booking transaction aborted.',
        };
      }
    } else {
      if (requestedRideType === 'WOMEN_ONLY_POOL') {
        return {
          success: false,
          error: 'Downgrade prohibited: Cannot place Women-Only ride booking into a standard mixed-gender pool.',
        };
      }
    }

    const bookingId = `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paymentId = params.paymentId || `pay-${Date.now()}`;
    const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // 1. Decrement capacity atomically
    pool.availableSeats -= params.seats;
    pool.availableLuggage -= params.luggage;

    // 2. Add passenger to pool
    pool.passengers.push({
      bookingId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      passengerPhone: params.passengerPhone,
      seatsBooked: params.seats,
      luggageCount: params.luggage,
      destination: params.destination,
      farePaidPaise: params.farePaise,
      pickupOtp,
      status: 'CONFIRMED',
      isWomenOnlyEligible: isPoolWomenOnly ? true : Boolean(params.isWomenOnlyEligible),
    });

    // 3. Add drop-off stop to pool if not present
    pool.stops.push({
      stopId: `stop-drop-${bookingId}`,
      type: 'DROPOFF',
      passengerName: params.passengerName,
      locationName: params.destination.name,
      lat: params.destination.latitude,
      lng: params.destination.longitude,
      completed: false,
    });

    // If pool was in REQUESTED, advance to CONFIRMED
    if (pool.status === 'REQUESTED') {
      pool.status = 'CONFIRMED';
    }

    // 4. Create Booking
    const newBooking: Booking = {
      id: bookingId,
      poolId: pool.id,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      passengerPhone: params.passengerPhone,
      flightNumber: params.flightNumber,
      terminal: pool.terminal,
      pickupZoneName: pool.pickupZone.name,
      pickupInstructions: pool.pickupZone.instructions,
      destination: params.destination,
      seatsBooked: params.seats,
      luggageCount: params.luggage,
      farePaise: params.farePaise,
      savingsPaise: params.savingsPaise,
      paymentId,
      paymentStatus: 'captured',
      bookingStatus: pool.status,
      pickupOtp,
      driverId: pool.assignedDriverId,
      driverName: pool.assignedDriverName,
      driverPhone: pool.assignedDriverPhone,
      vehicleModel: pool.vehicleModel,
      vehiclePlate: pool.vehiclePlate,
      operatingMode: mode,
      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,
      rideType: requestedRideType || (isPoolWomenOnly ? 'WOMEN_ONLY_POOL' : 'SHARED_POOL'),
      isWomenOnlyPool: isPoolWomenOnly,
      createdAt: new Date().toISOString(),
    };
    this.state.bookings.unshift(newBooking);

    // 5. Create Payment record
    const newPayment: PaymentRecord = {
      id: paymentId,
      bookingId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      amountPaise: params.farePaise,
      currency: 'INR',
      razorpayOrderId: params.razorpayOrderId || `order_BOM_${bookingId.slice(-6)}`,
      razorpayPaymentId: params.paymentId || (mode === 'production' ? '' : `pay_BOM_${Math.random().toString(36).substring(2, 9)}`),
      status: 'captured',
      paymentMethod: params.paymentMethod,
      isSandbox: mode !== 'production',
      operatingMode: mode,
      idempotencyKey: params.idempotencyKey || `idem-${paymentId}`,
      createdAt: new Date().toISOString(),
    };
    this.state.payments.unshift(newPayment);

    // 6. Audit Log
    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.passengerId,
      actorName: params.passengerName,
      actorRole: 'passenger',
      action: 'BOOK_SEAT',
      entityType: 'BOOKING',
      entityId: bookingId,
      details: `Booked ${params.seats} seat(s) in pool ${pool.id} for ${params.destination.name}. Fare ₹${(params.farePaise / 100).toFixed(2)}.`,
      timestamp: new Date().toISOString(),
    });

    // 7. Notification
    this.state.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: params.passengerId,
      title: 'Booking Confirmed!',
      message: `Your shared ride to ${params.destination.name} is confirmed. Pickup at ${pool.pickupZone.name}. OTP: ${pickupOtp}`,
      type: 'SUCCESS',
      read: false,
      createdAt: new Date().toISOString(),
    });

    // 8. If Supabase is connected, propagate atomic booking transaction to PostgreSQL
    if (supabase && isSupabaseConfigured()) {
      Promise.resolve(
        supabase.rpc('book_ride_atomic', {
          p_pool_id: ensureValidUuid(pool.id),
          p_passenger_id: ensureValidUuid(params.passengerId),
          p_seats: params.seats,
          p_luggage: params.luggage,
          p_flight_number: params.flightNumber,
          p_destination_name: params.destination.name,
          p_destination_address: params.destination.address || '',
          p_destination_corridor: params.destination.corridor,
          p_destination_lat: params.destination.latitude,
          p_destination_lng: params.destination.longitude,
          p_fare_paise: params.farePaise,
          p_savings_paise: params.savingsPaise,
          p_payment_method: params.paymentMethod,
          p_payment_id: params.paymentId || null,
          p_razorpay_order_id: params.razorpayOrderId || null,
          p_idempotency_key: params.idempotencyKey || null,
          p_operating_mode: mode,
          p_passenger_name: params.passengerName || null,
          p_passenger_phone: params.passengerPhone || null,
        })
      )
        .then((res) => {
          if (res?.error) console.warn('Supabase book_ride_atomic RPC notice:', res.error.message);
        })
        .catch((err: unknown) => console.warn('Supabase book sync exception:', err));
    }

    this.notify();
    return { success: true, booking: newBooking };
  }

  /**
   * ATOMIC ASYNC TRANSACTION: Invokes Supabase book_ride_atomic RPC in production,
   * or delegates to local capacity-locked store when unconfigured.
   */
  public async bookRideAtomicAsync(params: {
    poolId: string;
    passengerId: string;
    passengerName: string;
    passengerPhone: string;
    flightNumber: string;
    destination: DestinationPoint;
    seats: number;
    luggage: number;
    farePaise: number;
    savingsPaise: number;
    paymentMethod: 'UPI' | 'Card' | 'Netbanking';
    paymentId?: string;
    razorpayOrderId?: string;
    idempotencyKey?: string;
    rideType?: RideType;
    isWomenOnlyEligible?: boolean;
  }): Promise<{ success: boolean; booking?: Booking; error?: string }> {
    const mode = getOperatingMode();

    // 1. Caller Authorization & Identity Spoofing Protection:
    // A passenger can only book rides for their own authenticated profile, unless an admin
    if (!this.state.currentUser) {
      return {
        success: false,
        error: 'Unauthorized: Authentication required to book a ride.',
      };
    }
    if (this.state.currentUser.id !== params.passengerId && this.state.currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: You can only book rides for your own authenticated profile.',
      };
    }

    // 2. Fare Integrity Safeguard:
    // Disallow zero, negative, or below-threshold fares (minimum ₹150.00 / 15,000 paise base fare)
    if (params.farePaise <= 0 || params.farePaise < 15000) {
      return {
        success: false,
        error: `Invalid fare: Fare ₹${(params.farePaise / 100).toFixed(2)} is below the minimum airport corridor fare of ₹150.00.`,
      };
    }

    if (mode === 'production') {
      if (!isSupabaseConfigured() || !supabase) {
        return {
          success: false,
          error: 'Database unavailable: In production mode, bookings must be persisted to the verified PostgreSQL database. Offline fallback storage is prohibited in production.',
        };
      }
      if (params.paymentId && params.paymentId.startsWith('pay_BOM_')) {
        return {
          success: false,
          error: 'Payment validation error: Mock sandbox payment IDs (pay_BOM_*) cannot be captured as real collected payments in production mode.',
        };
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('book_ride_atomic', {
          p_pool_id: ensureValidUuid(params.poolId),
          p_passenger_id: ensureValidUuid(params.passengerId),
          p_seats: params.seats,
          p_luggage: params.luggage,
          p_flight_number: params.flightNumber,
          p_destination_name: params.destination.name,
          p_destination_address: params.destination.address || '',
          p_destination_corridor: params.destination.corridor,
          p_destination_lat: params.destination.latitude,
          p_destination_lng: params.destination.longitude,
          p_fare_paise: params.farePaise,
          p_savings_paise: params.savingsPaise,
          p_payment_method: params.paymentMethod,
          p_payment_id: params.paymentId || null,
          p_razorpay_order_id: params.razorpayOrderId || null,
          p_idempotency_key: params.idempotencyKey || null,
          p_operating_mode: mode,
          p_passenger_name: params.passengerName || null,
          p_passenger_phone: params.passengerPhone || null,
        });

        if (error) {
          if (mode === 'production') {
            return { success: false, error: `Database persistence error: ${error.message}` };
          }
          console.warn('Supabase book_ride_atomic RPC returned error, using local fallback:', error.message);
        } else if (data && !data.success) {
          if (mode === 'production') {
            return { success: false, error: data.error || 'Seat reservation rejected' };
          }
          console.warn('Supabase book_ride_atomic returned unsuccessful, using local fallback:', data.error);
          return this.bookRideAtomic(params);
        } else if (data && data.success) {
          const pool = this.state.pools.find((p) => p.id === params.poolId);
          if (pool && !data.is_duplicate) {
            pool.availableSeats = Math.max(0, pool.availableSeats - params.seats);
            pool.availableLuggage = Math.max(0, pool.availableLuggage - params.luggage);
          }

          const confirmedBooking: Booking = {
            id: data.booking_id,
            poolId: params.poolId,
            passengerId: params.passengerId,
            passengerName: params.passengerName,
            passengerPhone: params.passengerPhone,
            flightNumber: params.flightNumber,
            terminal: pool?.terminal || 'T2',
            pickupZoneName: pool?.pickupZone.name || 'CSMIA Pickup Hub',
            pickupInstructions: pool?.pickupZone.instructions || 'Proceed to designated pillar',
            destination: params.destination,
            seatsBooked: params.seats,
            luggageCount: params.luggage,
            farePaise: params.farePaise,
            savingsPaise: params.savingsPaise,
            paymentId: data.payment_id || params.paymentId || `pay-${Date.now()}`,
            paymentStatus: 'captured',
            bookingStatus: 'CONFIRMED',
            pickupOtp: data.pickup_otp,
            operatingMode: mode,
            idempotencyKey: params.idempotencyKey,
            createdAt: new Date().toISOString(),
          };

          if (!this.state.bookings.some((b) => b.id === confirmedBooking.id)) {
            this.state.bookings.unshift(confirmedBooking);
            this.saveState(this.state);
            this.notify();
          }

          return { success: true, booking: confirmedBooking };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database communication failed';
        if (mode === 'production') {
          return { success: false, error: `Critical persistence failure: ${msg}` };
        }
      }
    }

    return this.bookRideAtomic(params);
  }

  /**
   * Save a ride request to the persistent ledger
   */
  public createRideRequest(request: RideRequest): RideRequest {
    if (!this.state.rideRequests) {
      this.state.rideRequests = [];
    }
    this.state.rideRequests.unshift(request);

    // If Supabase is connected, persist to remote PostgreSQL ride_requests table
    if (supabase && isSupabaseConfigured()) {
      Promise.resolve(
        supabase.from('ride_requests').insert({
          id: request.id,
          passenger_id: request.passengerId,
          passenger_name: request.passengerName,
          passenger_phone: request.passengerPhone,
          flight_number: request.flightDetails.flightNumber,
          airline: request.flightDetails.airline,
          origin_airport: request.flightDetails.origin,
          terminal: request.flightDetails.terminal,
          pickup_zone_id: request.pickupZoneId,
          destination_name: request.destination.name,
          destination_address: request.destination.address,
          destination_corridor: request.destination.corridor,
          destination_lat: request.destination.latitude,
          destination_lng: request.destination.longitude,
          seats_needed: request.seatsNeeded,
          luggage_count: request.luggageCount,
          max_wait_minutes: request.maxWaitMinutes,
          ride_type: request.rideType,
          status: request.status,
          created_at: request.createdAt,
        })
      )
        .then((res) => {
          if (res?.error) console.warn('Supabase ride_requests insert error:', res.error.message);
        })
        .catch((err: unknown) => console.warn('Supabase ride_requests sync exception:', err));
    }

    this.notify();
    return request;
  }

  /**
   * ATOMIC INITIATION: Create a brand new pool (or private ride) and book the initial passenger
   */
  public createPoolAndBookAtomic(params: {
    terminal: 'T1' | 'T2';
    pickupZoneId: string;
    targetCorridor: string;
    readyTimeIso: string;
    maxWaitMinutes: number;
    passengerId: string;
    passengerName: string;
    passengerPhone: string;
    flightNumber: string;
    destination: DestinationPoint;
    seats: number;
    luggage: number;
    farePaise: number;
    savingsPaise: number;
    rideType: RideType;
    isWomenOnlyEligible?: boolean;
    paymentMethod: 'UPI' | 'Card' | 'Netbanking';
    paymentId?: string;
    razorpayOrderId?: string;
    idempotencyKey?: string;
  }): { success: boolean; booking?: Booking; pool?: RidePool; error?: string } {
    const mode = getOperatingMode();

    // Production Persistence & Security Safeguards
    if (mode === 'production') {
      if (!isSupabaseConfigured() || !supabase) {
        return {
          success: false,
          error: 'Database unavailable: In production mode, bookings and pools must be persisted to the verified PostgreSQL database. Offline fallback storage is prohibited in production.',
        };
      }
      if (params.paymentId && params.paymentId.startsWith('pay_BOM_')) {
        return {
          success: false,
          error: 'Payment validation error: Mock sandbox payment IDs (pay_BOM_*) cannot be captured as real collected payments in production mode.',
        };
      }
    }

    // Idempotency check
    if (params.idempotencyKey) {
      const existing = this.state.bookings.find((b) => b.idempotencyKey === params.idempotencyKey);
      if (existing) {
        const pool = this.state.pools.find((p) => p.id === existing.poolId);
        return { success: true, booking: existing, pool };
      }
    }

    if (params.rideType === 'WOMEN_ONLY_POOL') {
      const isEligible = Boolean(
        params.isWomenOnlyEligible ||
        womenOnlyService.isPassengerEligible(params.passengerId)
      );
      if (!isEligible) {
        return {
          success: false,
          error: 'Women-Only Pool restriction: Only verified women passengers can initiate a Women-Only pool.',
        };
      }
    }

    const poolId = `pool-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const bookingId = `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paymentId = params.paymentId || `pay-${Date.now()}`;
    const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();

    const selectedZone = PICKUP_ZONES.find((z) => z.id === params.pickupZoneId) || PICKUP_ZONES[0];
    const totalSeats = params.rideType === 'PRIVATE' ? params.seats : Math.max(4, params.seats + 2);
    const totalLuggage = params.rideType === 'PRIVATE' ? params.luggage : Math.max(3, params.luggage + 1);

    // Auto-assign first available approved driver from fleet
    const availableDriver = this.state.driverProfiles.find(
      (d) => d.verificationStatus === 'approved' && d.isAvailable
    ) || this.state.driverProfiles[0];

    const departureWindowStart = params.readyTimeIso;
    const departureWindowEnd = new Date(
      new Date(params.readyTimeIso).getTime() + (params.rideType === 'PRIVATE' ? 10 : params.maxWaitMinutes) * 60000
    ).toISOString();

    const newPool: RidePool = {
      id: poolId,
      airportCode: 'BOM',
      terminal: params.terminal,
      pickupZone: selectedZone,
      targetCorridor: params.targetCorridor,
      departureWindowStart,
      departureWindowEnd,
      vehicleCategory: totalSeats > 4 ? 'XL' : 'Sedan',
      isWomenOnlyPool: params.rideType === 'WOMEN_ONLY_POOL',
      poolCategory: params.rideType,
      totalSeats,
      availableSeats: totalSeats - params.seats,
      totalLuggageCapacity: totalLuggage,
      availableLuggage: totalLuggage - params.luggage,
      status: 'CONFIRMED',
      assignedDriverId: availableDriver?.id,
      assignedDriverName: availableDriver?.fullName,
      assignedDriverPhone: availableDriver?.phone,
      assignedDriverRating: availableDriver?.rating,
      vehicleModel: availableDriver?.assignedVehicle?.makeModel || 'Toyota Innova Crysta',
      vehiclePlate: availableDriver?.assignedVehicle?.plateNumber || 'MH 02 EE 8421',
      driverCurrentLocation: availableDriver?.lastKnownLocation
        ? {
            lat: availableDriver.lastKnownLocation.lat,
            lng: availableDriver.lastKnownLocation.lng,
            speedKmph: availableDriver.lastKnownLocation.speedKmph,
            heading: availableDriver.lastKnownLocation.heading,
            accuracyMeters: availableDriver.lastKnownLocation.accuracyMeters,
            updatedAt: availableDriver.lastKnownLocation.updatedAt,
            source: 'REAL_GPS',
          }
        : undefined,
      passengers: [
        {
          bookingId,
          passengerId: params.passengerId,
          passengerName: params.passengerName,
          passengerPhone: params.passengerPhone,
          seatsBooked: params.seats,
          luggageCount: params.luggage,
          destination: params.destination,
          farePaidPaise: params.farePaise,
          pickupOtp,
          status: 'CONFIRMED',
          isWomenOnlyEligible: params.isWomenOnlyEligible ?? (params.rideType === 'WOMEN_ONLY_POOL'),
        },
      ],
      stops: [
        {
          stopId: `stop-pickup-${poolId}`,
          type: 'PICKUP',
          passengerName: 'All Passengers',
          locationName: selectedZone.name,
          lat: selectedZone.latitude,
          lng: selectedZone.longitude,
          completed: false,
        },
        {
          stopId: `stop-drop-${bookingId}`,
          type: 'DROPOFF',
          passengerName: params.passengerName,
          locationName: params.destination.name,
          lat: params.destination.latitude,
          lng: params.destination.longitude,
          completed: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    this.state.pools.unshift(newPool);

    const newBooking: Booking = {
      id: bookingId,
      poolId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      passengerPhone: params.passengerPhone,
      flightNumber: params.flightNumber,
      terminal: params.terminal,
      pickupZoneName: selectedZone.name,
      pickupInstructions: selectedZone.instructions,
      destination: params.destination,
      seatsBooked: params.seats,
      luggageCount: params.luggage,
      farePaise: params.farePaise,
      savingsPaise: params.savingsPaise,
      paymentId,
      paymentStatus: 'captured',
      bookingStatus: 'CONFIRMED',
      pickupOtp,
      driverId: availableDriver?.id,
      driverName: availableDriver?.fullName,
      driverPhone: availableDriver?.phone,
      vehicleModel: availableDriver?.assignedVehicle?.makeModel || 'Toyota Innova Crysta',
      vehiclePlate: availableDriver?.assignedVehicle?.plateNumber || 'MH 02 EE 8421',
      operatingMode: mode,
      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,
      rideType: params.rideType,
      isWomenOnlyPool: params.rideType === 'WOMEN_ONLY_POOL',
      createdAt: new Date().toISOString(),
    };

    this.state.bookings.unshift(newBooking);

    const newPayment: PaymentRecord = {
      id: paymentId,
      bookingId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      amountPaise: params.farePaise,
      currency: 'INR',
      razorpayOrderId: params.razorpayOrderId || `order_BOM_${bookingId.slice(-6)}`,
      razorpayPaymentId: params.paymentId || (mode === 'production' ? '' : `pay_BOM_${Math.random().toString(36).substring(2, 9)}`),
      status: 'captured',
      paymentMethod: params.paymentMethod,
      isSandbox: mode !== 'production',
      operatingMode: mode,
      idempotencyKey: params.idempotencyKey || `idem-${paymentId}`,
      createdAt: new Date().toISOString(),
    };

    this.state.payments.unshift(newPayment);

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.passengerId,
      actorName: params.passengerName,
      actorRole: 'passenger',
      action: params.rideType === 'PRIVATE' ? 'BOOK_PRIVATE_RIDE' : 'INITIATE_POOL',
      entityType: 'POOL',
      entityId: poolId,
      details: `Initiated ${params.rideType} to ${params.destination.name} (${params.seats} seat(s)). Fare ₹${(params.farePaise / 100).toFixed(2)}.`,
      timestamp: new Date().toISOString(),
    });

    this.state.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: params.passengerId,
      title: params.rideType === 'PRIVATE' ? 'Private Ride Confirmed!' : 'New Pool Initiated!',
      message: `Your ride to ${params.destination.name} is confirmed. Pickup at ${selectedZone.name}. OTP: ${pickupOtp}`,
      type: 'SUCCESS',
      read: false,
      createdAt: new Date().toISOString(),
    });

    this.notify();
    return { success: true, booking: newBooking, pool: newPool };
  }

  /**
   * ATOMIC ASYNC INITIATION: Creates new pool in Supabase/PostgreSQL and books initial passenger
   */
  public async createPoolAndBookAtomicAsync(params: {
    terminal: 'T1' | 'T2';
    pickupZoneId: string;
    targetCorridor: string;
    readyTimeIso: string;
    maxWaitMinutes: number;
    passengerId: string;
    passengerName: string;
    passengerPhone: string;
    flightNumber: string;
    destination: DestinationPoint;
    seats: number;
    luggage: number;
    farePaise: number;
    savingsPaise: number;
    rideType: RideType;
    isWomenOnlyEligible?: boolean;
    paymentMethod: 'UPI' | 'Card' | 'Netbanking';
    paymentId?: string;
    razorpayOrderId?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; booking?: Booking; pool?: RidePool; error?: string }> {
    const mode = getOperatingMode();

    if (mode === 'production') {
      if (!isSupabaseConfigured() || !supabase) {
        return {
          success: false,
          error: 'Database unavailable: In production mode, bookings and pools must be persisted to PostgreSQL.',
        };
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        let newPoolId = generateUuid();
        const departureWindowStart = params.readyTimeIso;
        const departureWindowEnd = new Date(
          new Date(params.readyTimeIso).getTime() + params.maxWaitMinutes * 60000
        ).toISOString();

        // 1. Try atomic authorized RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc('request_ride_pool_atomic', {
          p_airport_code: 'BOM',
          p_terminal: params.terminal,
          p_pickup_zone_id: params.pickupZoneId,
          p_target_corridor: params.targetCorridor,
          p_departure_window_start: departureWindowStart,
          p_departure_window_end: departureWindowEnd,
          p_vehicle_category: 'Sedan',
          p_seats: params.seats,
          p_luggage: params.luggage,
          p_passenger_id: ensureValidUuid(params.passengerId),
        });

        if (!rpcError && rpcData && rpcData.success && rpcData.pool_id) {
          newPoolId = rpcData.pool_id;
        } else {
          // 2. Fallback to direct INSERT under RLS policy
          const { error: poolInsertError } = await supabase.from('ride_pools').insert({
            id: newPoolId,
            airport_code: 'BOM',
            terminal: params.terminal,
            pickup_zone_id: params.pickupZoneId,
            target_corridor: params.targetCorridor,
            departure_window_start: departureWindowStart,
            departure_window_end: departureWindowEnd,
            vehicle_category: 'Sedan',
            total_seats: params.rideType === 'PRIVATE' ? params.seats : Math.max(4, params.seats + 2),
            available_seats: params.rideType === 'PRIVATE' ? params.seats : Math.max(4, params.seats + 2),
            total_luggage_capacity: params.rideType === 'PRIVATE' ? params.luggage : Math.max(3, params.luggage + 1),
            available_luggage: params.rideType === 'PRIVATE' ? params.luggage : Math.max(3, params.luggage + 1),
            status: 'REQUESTED',
          });

          if (poolInsertError && mode === 'production') {
            return { success: false, error: `Pool creation error: ${poolInsertError.message}` };
          }
        }

        const bookResult = await this.bookRideAtomicAsync({
          poolId: newPoolId,
          passengerId: params.passengerId,
          passengerName: params.passengerName,
          passengerPhone: params.passengerPhone,
          flightNumber: params.flightNumber,
          destination: params.destination,
          seats: params.seats,
          luggage: params.luggage,
          farePaise: params.farePaise,
          savingsPaise: params.savingsPaise,
          paymentMethod: params.paymentMethod,
          paymentId: params.paymentId,
          razorpayOrderId: params.razorpayOrderId,
          idempotencyKey: params.idempotencyKey,
          rideType: params.rideType,
          isWomenOnlyEligible: params.isWomenOnlyEligible,
        });

        if (!bookResult.success) {
          if (mode === 'production') {
            return { success: false, error: bookResult.error };
          }
          return this.createPoolAndBookAtomic(params);
        }

        const pool = this.state.pools.find((p) => p.id === newPoolId);
        return { success: true, booking: bookResult.booking, pool };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        if (mode === 'production') return { success: false, error: msg };
      }
    }

    return this.createPoolAndBookAtomic(params);
  }

  /**
   * Update ride pool lifecycle status with validation
   */
  public updateRideStatus(
    poolId: string,
    nextStatus: RideStatus,
    actorId: string,
    actorRole: 'driver' | 'admin' | 'support'
  ): { success: boolean; error?: string } {
    const pool = this.state.pools.find((p) => p.id === poolId);
    if (!pool) return { success: false, error: 'Pool not found' };

    // Caller authorization check: only assigned driver or operations/support staff can update status
    if (actorRole !== 'admin' && actorRole !== 'support') {
      const caller = this.state.users.find((u) => u.id === actorId);
      if (caller && caller.role === 'passenger') {
        return {
          success: false,
          error: 'Unauthorized: Passengers cannot advance ride status.',
        };
      }
      const driverProf = pool.assignedDriverId
        ? this.state.driverProfiles.find(
            (d) => d && (d.id === pool.assignedDriverId || d.userId === pool.assignedDriverId)
          )
        : null;
      const matchesDriver =
        Boolean(pool.assignedDriverId) &&
        (pool.assignedDriverId === actorId ||
          (Boolean(driverProf) && (driverProf!.id === actorId || driverProf!.userId === actorId)));
      if (!matchesDriver) {
        return {
          success: false,
          error: 'Unauthorized: Only the assigned driver or operations staff can update trip status.',
        };
      }
    }

    const validTransitions: Record<RideStatus, RideStatus[]> = {
      REQUESTED: ['MATCHED', 'CONFIRMED', 'CANCELLED'],
      MATCHED: ['CONFIRMED', 'DRIVER_ASSIGNED', 'CANCELLED'],
      CONFIRMED: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'CANCELLED'],
      DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE', 'CANCELLED'],
      DRIVER_EN_ROUTE: ['DRIVER_ARRIVED', 'CANCELLED'],
      DRIVER_ARRIVED: ['PICKUP_CONFIRMED', 'CANCELLED'],
      PICKUP_CONFIRMED: ['IN_PROGRESS'],
      IN_PROGRESS: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[pool.status];
    if (!allowed || !allowed.includes(nextStatus)) {
      return {
        success: false,
        error: `Illegal state transition from ${pool.status} to ${nextStatus}.`,
      };
    }

    pool.status = nextStatus;

    // Synchronize passenger bookings
    this.state.bookings.forEach((b) => {
      if (b.poolId === poolId && b.bookingStatus !== 'CANCELLED') {
        b.bookingStatus = nextStatus;
      }
    });

    // If completed, authoritatively record driver trip earnings in immutable financial ledger
    if (nextStatus === 'COMPLETED' && pool.assignedDriverId) {
      const totalPoolFarePaise = pool.passengers.reduce((sum, p) => sum + p.farePaidPaise, 0);
      this.recordDriverTripEarnings({
        poolId: pool.id,
        driverId: pool.assignedDriverId,
        grossFarePaise: totalPoolFarePaise,
        airportTollPaise: 0,
      });
      const driver = this.state.driverProfiles.find((d) => d.id === pool.assignedDriverId);
      if (driver) {
        driver.totalTrips = (driver.totalTrips || 0) + 1;
      }
    }

    // Dispatch automated event notifications with deterministic eventId deduplication
    if (nextStatus === 'DRIVER_ARRIVED') {
      pool.passengers.forEach((p) => {
        if (p.status !== 'CANCELLED') {
          this.createNotification({
            userId: p.passengerId,
            userRole: 'passenger',
            category: 'TRIP',
            title: 'Driver Arrived at Terminal',
            message: `Your driver ${pool.assignedDriverName || 'Driver'} has arrived at ${pool.pickupZone.name} (${pool.pickupZone.pillar}). Please proceed for boarding with OTP ${p.pickupOtp}.`,
            type: 'SUCCESS',
            eventId: `evt-arrived-${pool.id}-${p.passengerId}`,
          });
        }
      });
    } else if (nextStatus === 'COMPLETED') {
      pool.passengers.forEach((p) => {
        if (p.status !== 'CANCELLED') {
          this.createNotification({
            userId: p.passengerId,
            userRole: 'passenger',
            category: 'TRIP',
            title: 'Trip Completed',
            message: `You have safely arrived at ${p.destination.name}. Thank you for pooling with AeroPool CSMIA!`,
            type: 'SUCCESS',
            eventId: `evt-completed-${pool.id}-${p.passengerId}`,
          });
        }
      });
    }

    // Audit log
    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId,
      actorName: actorRole.toUpperCase(),
      actorRole,
      action: 'UPDATE_STATUS',
      entityType: 'POOL',
      entityId: poolId,
      details: `Advanced pool state to ${nextStatus}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true };
  }

  /**
   * ATOMIC ASYNC STATUS TRANSITION: Invokes Supabase advance_ride_status_atomic RPC
   */
  public async advanceRideStatusAsync(
    poolId: string,
    nextStatus: RideStatus,
    actorId: string,
    actorRole: 'driver' | 'admin' | 'support' = 'driver'
  ): Promise<{ success: boolean; error?: string }> {
    const mode = getOperatingMode();

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('advance_ride_status_atomic', {
          p_pool_id: ensureValidUuid(poolId),
          p_actor_id: ensureValidUuid(actorId),
          p_new_status: nextStatus,
        });

        if (error) {
          if (mode === 'production') {
            return { success: false, error: `Database status error: ${error.message}` };
          }
        } else if (data && !data.success) {
          return { success: false, error: data.error };
        } else if (data && data.success) {
          return this.updateRideStatus(poolId, nextStatus, actorId, actorRole);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Status update failed';
        if (mode === 'production') return { success: false, error: msg };
      }
    }

    return this.updateRideStatus(poolId, nextStatus, actorId, actorRole);
  }

  /**
   * ATOMIC DRIVER ASSIGNMENT: Verifies driver KYC status and vehicle eligibility
   */
  public assignDriverToPool(params: {
    poolId: string;
    driverId: string;
    vehicleId: string;
    actorId: string;
  }): { success: boolean; error?: string } {
    const pool = this.state.pools.find((p) => p.id === params.poolId);
    if (!pool) return { success: false, error: 'Ride pool not found' };
    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {
      return { success: false, error: 'Cannot assign driver to a concluded pool' };
    }

    // Caller authorization check
    const caller = this.state.users.find((u) => u.id === params.actorId);
    const callerRole = caller
      ? caller.role
      : params.actorId.toLowerCase().includes('admin')
      ? 'admin'
      : (this.state.currentUser?.role || 'admin');
    if (callerRole === 'passenger') {
      return { success: false, error: 'Unauthorized: Passengers cannot assign dispatch resources.' };
    }

    const driver = this.state.driverProfiles.find((d) => d.id === params.driverId || d.userId === params.driverId);
    if (!driver) return { success: false, error: 'Driver profile not found' };
    if (driver.verificationStatus !== 'approved') {
      return { success: false, error: 'Driver KYC is not approved' };
    }

    const vehicle = this.state.vehicles.find((v) => v.id === params.vehicleId);
    if (!vehicle) return { success: false, error: 'Vehicle not found' };
    if (vehicle.status !== 'ACTIVE') {
      return { success: false, error: 'Vehicle is offline or in maintenance' };
    }

    // Multi-tenant check: driver and vehicle must belong to same organization
    if (driver.organizationId && vehicle.organizationId && driver.organizationId !== vehicle.organizationId) {
      return {
        success: false,
        error: 'Multi-tenant violation: Driver and vehicle do not belong to the same fleet organization.',
      };
    }

    // Fleet operator boundary check: fleet operator can only assign within their own org
    if (caller && caller.role === 'fleet_operator' && caller.organizationId && driver.organizationId !== caller.organizationId) {
      return {
        success: false,
        error: 'Tenant isolation violation: Fleet operators can only assign drivers and vehicles within their own organization.',
      };
    }

    // Vehicle seating capacity check against active pool passenger seats
    const bookedPassengerSeats = pool.passengers
      .filter((p) => p.status !== 'CANCELLED')
      .reduce((sum, p) => sum + p.seatsBooked, 0);
    if (vehicle.seats < bookedPassengerSeats) {
      return {
        success: false,
        error: `Vehicle capacity exceeded: Assigned vehicle has ${vehicle.seats} seats, but pool requires ${bookedPassengerSeats} seats.`,
      };
    }

    pool.assignedDriverId = params.driverId;
    pool.assignedDriverName = driver.fullName || 'Assigned Driver';
    pool.assignedDriverPhone = driver.phone || '+91 98000 00000';
    pool.vehiclePlate = vehicle.plateNumber;
    pool.vehicleModel = vehicle.makeModel;
    pool.status = 'DRIVER_ASSIGNED';

    driver.isAvailable = false;
    driver.assignedVehicleId = params.vehicleId;

    this.state.bookings.forEach((b) => {
      if (b.poolId === params.poolId && b.bookingStatus !== 'CANCELLED') {
        b.driverId = params.driverId;
        b.driverName = pool.assignedDriverName;
        b.driverPhone = pool.assignedDriverPhone;
        b.vehiclePlate = vehicle.plateNumber;
        b.vehicleModel = vehicle.makeModel;
        b.bookingStatus = 'DRIVER_ASSIGNED';
      }
    });

    // Dispatch automated event notification to pool passengers
    pool.passengers.forEach((p) => {
      if (p.status !== 'CANCELLED') {
        this.createNotification({
          userId: p.passengerId,
          userRole: 'passenger',
          category: 'DISPATCH',
          title: 'Driver Assigned to Your Pool',
          message: `${driver.fullName} (${vehicle.makeModel} • ${vehicle.plateNumber}) has been assigned to your airport pool.`,
          type: 'INFO',
          eventId: `evt-driver-assigned-${params.poolId}-${p.passengerId}`,
        });
      }
    });

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: 'System Dispatcher',
      actorRole: 'admin',
      action: 'ASSIGN_DRIVER',
      entityType: 'POOL',
      entityId: params.poolId,
      details: `Assigned driver ${params.driverId} and vehicle ${vehicle.plateNumber} to pool ${params.poolId}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true };
  }

  /**
   * ATOMIC ASYNC DRIVER ASSIGNMENT: Invokes Supabase assign_driver_to_pool_atomic RPC
   */
  public async assignDriverToPoolAsync(params: {
    poolId: string;
    driverId: string;
    vehicleId: string;
    actorId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const mode = getOperatingMode();

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('assign_driver_to_pool_atomic', {
          p_pool_id: ensureValidUuid(params.poolId),
          p_driver_id: ensureValidUuid(params.driverId),
          p_vehicle_id: ensureValidUuid(params.vehicleId),
          p_actor_id: ensureValidUuid(params.actorId),
        });

        if (error) {
          if (mode === 'production') {
            return { success: false, error: `Database driver assignment error: ${error.message}` };
          }
        } else if (data && !data.success) {
          return { success: false, error: data.error };
        } else if (data && data.success) {
          return this.assignDriverToPool(params);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Driver assignment failed';
        if (mode === 'production') return { success: false, error: msg };
      }
    }

    return this.assignDriverToPool(params);
  }

  /**
   * Cancel a passenger booking and release seat capacity back to pool
   */
  public cancelBooking(
    bookingId: string,
    reason: string,
    actorId: string,
    actorRole?: UserProfile['role']
  ): { success: boolean; error?: string } {
    const mode = getOperatingMode();
    if (mode === 'production' && (!isSupabaseConfigured() || !supabase)) {
      return {
        success: false,
        error: 'Database unavailable: In production mode, cancellations must be persisted to the verified PostgreSQL database.',
      };
    }

    const booking = this.state.bookings.find((b) => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    // Security & RBAC Enforcement: Only the booking owner or authorized admin/support staff can cancel
    const isStaff = actorRole === 'admin' || actorRole === 'support';
    if (!isStaff && booking.passengerId !== actorId) {
      return {
        success: false,
        error: 'Unauthorized: You do not have permission to cancel another passenger’s booking.',
      };
    }

    if (booking.bookingStatus === 'COMPLETED' || booking.bookingStatus === 'IN_PROGRESS') {
      return { success: false, error: 'Cannot cancel an active or completed trip.' };
    }

    if (booking.bookingStatus === 'CANCELLED') {
      return { success: false, error: 'Booking is already cancelled.' };
    }

    booking.bookingStatus = 'CANCELLED';

    // Release capacity back to pool
    const pool = this.state.pools.find((p) => p.id === booking.poolId);
    if (pool) {
      pool.availableSeats += booking.seatsBooked;
      pool.availableLuggage += booking.luggageCount;
      const passengerIdx = pool.passengers.findIndex((p) => p.bookingId === bookingId);
      if (passengerIdx !== -1) {
        pool.passengers[passengerIdx].status = 'CANCELLED';
      }
    }

    // Process automatic refund in sandbox
    const payment = this.state.payments.find((p) => p.bookingId === bookingId);
    if (payment) {
      payment.status = 'refunded';
      payment.refundedAmountPaise = payment.amountPaise;
      payment.refundReason = reason || 'Customer requested cancellation prior to pickup';
    }

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId,
      actorName: booking.passengerName,
      actorRole: 'passenger',
      action: 'CANCEL_BOOKING',
      entityType: 'BOOKING',
      entityId: bookingId,
      details: `Booking cancelled: ${reason}. Capacity released: ${booking.seatsBooked} seats.`,
      timestamp: new Date().toISOString(),
    });

    // If Supabase is connected, propagate cancellation to remote PostgreSQL
    if (supabase && isSupabaseConfigured()) {
      Promise.resolve(
        supabase.rpc('cancel_booking_atomic', {
          p_booking_id: bookingId,
          p_passenger_id: actorId,
          p_reason: reason,
        })
      )
        .then((res) => {
          if (res?.error) console.warn('Supabase remote cancel sync:', res.error.message);
        })
        .catch((err: unknown) => console.warn('Supabase cancel sync exception:', err));
    }

    this.notify();
    return { success: true };
  }

  /**
   * ATOMIC ASYNC CANCELLATION: Invokes Supabase cancel_booking_atomic RPC
   */
  public async cancelBookingAsync(
    bookingId: string,
    reason: string,
    actorId: string,
    actorRole?: UserProfile['role']
  ): Promise<{ success: boolean; error?: string }> {
    const mode = getOperatingMode();

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('cancel_booking_atomic', {
          p_booking_id: ensureValidUuid(bookingId),
          p_passenger_id: ensureValidUuid(actorId),
          p_reason: reason,
        });

        if (error) {
          if (mode === 'production') {
            return { success: false, error: `Database cancellation error: ${error.message}` };
          }
        } else if (data && !data.success) {
          if (mode === 'production') {
            return { success: false, error: data.error };
          }
          // In sandbox mode, if remote record is missing, fall back to local transactional store
          return this.cancelBooking(bookingId, reason, actorId, actorRole);
        } else if (data && data.success) {
          return this.cancelBooking(bookingId, reason, actorId, actorRole);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Cancellation failed';
        if (mode === 'production') return { success: false, error: msg };
      }
    }

    return this.cancelBooking(bookingId, reason, actorId, actorRole);
  }

  /**
   * Process refund from Admin / Support console
   */
  public processRefund(
    paymentId: string,
    amountPaise: number,
    reason: string,
    adminId: string,
    adminRole: UserProfile['role'] = 'admin'
  ) {
    if (adminRole !== 'admin' && adminRole !== 'support') {
      return { success: false, error: 'Unauthorized: Only administrators or support personnel can process refunds.' };
    }

    const payment = this.state.payments.find((p) => p.id === paymentId);
    if (!payment) return { success: false, error: 'Payment record not found' };

    payment.status = 'refunded';
    payment.refundedAmountPaise = amountPaise;
    payment.refundReason = reason;

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: adminId,
      actorName: 'Admin / Support',
      actorRole: 'admin',
      action: 'PROCESS_REFUND',
      entityType: 'PAYMENT',
      entityId: paymentId,
      details: `Refunded ₹${(amountPaise / 100).toFixed(2)} to passenger ${payment.passengerName}. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true };
  }

  /**
   * Update Driver KYC document status
   */
  public verifyDriverDocument(
    driverId: string,
    docId: string,
    status: VerificationStatus,
    reason?: string,
    actorId = 'admin',
    actorRole: UserProfile['role'] = 'admin'
  ) {
    if (actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can review and approve driver KYC documents.' };
    }

    const driver = this.state.driverProfiles.find((d) => d.id === driverId);
    if (!driver) return { success: false, error: 'Driver not found' };

    const doc = driver.documents.find((d) => d.id === docId);
    if (!doc) return { success: false, error: 'Document not found' };

    doc.status = status;
    doc.reviewedAt = new Date().toISOString();
    if (reason) doc.rejectionReason = reason;

    // If all docs approved, approve driver profile and legitimately promote linked user account to driver
    const allApproved = driver.documents.every((d) => d.status === 'approved');
    if (allApproved) {
      driver.verificationStatus = 'approved';
      driver.isAvailable = true;
      const linkedUser = this.state.users.find((u) => u.id === driver.userId);
      if (linkedUser) {
        linkedUser.role = 'driver';
      }
      if (this.state.currentUser && this.state.currentUser.id === driver.userId) {
        this.state.currentUser.role = 'driver';
      }
    } else if (status === 'rejected') {
      driver.verificationStatus = 'rejected';
      driver.isAvailable = false;
      if (reason) {
        driver.rejectionReason = reason;
      }
    }

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId,
      actorName: actorRole === 'admin' ? 'Super Admin' : 'Staff',
      actorRole,
      action: 'VERIFY_DOCUMENT',
      entityType: 'DRIVER',
      entityId: driverId,
      details: `Updated document ${doc.documentNumber} to ${status}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true };
  }

  /**
   * System Audit Log: Appends an immutable audit log entry to the state ledger.
   */
  public createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AuditLog {
    if (!this.state.auditLogs) {
      this.state.auditLogs = [];
    }
    const entry: AuditLog = {
      id: log.id || `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      timestamp: log.timestamp || new Date().toISOString(),
    };
    this.state.auditLogs.unshift(entry);
    this.notify();
    return entry;
  }

  /**
   * Driver Onboarding: Submit or update driver profile and compliance documents
   */
  public submitDriverApplication(params: {
    userId: string;
    fullName: string;
    phone: string;
    email: string;
    organizationId?: string;
    licenseNumber: string;
    licenseExpiryDate?: string;
    badgeNumber?: string;
    residentialAddress?: string;
    emergencyContact?: string;
    profilePhotoUrl?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    vehicleCategory?: VehicleCategory;
    vehicleColor?: string;
    vehicleRcNumber?: string;
    vehicleRcExpiryDate?: string;
    vehicleInsuranceNumber?: string;
    vehicleInsuranceExpiryDate?: string;
    vehiclePucNumber?: string;
    vehiclePucExpiryDate?: string;
    vehiclePhotoUrl?: string;
    seatCapacity?: number;
    luggageCapacity?: number;
    documents?: Array<{
      type: DriverDocument['type'];
      documentNumber: string;
      fileUrl: string;
      expiryDate?: string;
      fileSizeBytes?: number;
      mimeType?: string;
      fileName?: string;
      downloadUrl?: string;
    }>;
    isDraft?: boolean;
  }): { success: boolean; driver?: DriverProfile; error?: string } {
    const user = this.state.users.find((u) => u.id === params.userId);
    if (!user) return { success: false, error: 'User account not found.' };

    const validation = validateLicenseNumber(params.licenseNumber);
    const cleanLicense = validation.isValid ? validation.canonical : normalizeLicenseNumber(params.licenseNumber);
    const cleanPlate = params.vehiclePlate ? params.vehiclePlate.trim().toUpperCase() : '';

    // Enforce rigorous format validation on final submission
    if (!params.isDraft) {
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }
    }

    // Security Check: Duplicate Driving Licence Number prevention (using canonical normalization)
    if (cleanLicense) {
      const existingLicenseDriver = this.state.driverProfiles.find(
        (d) => d.userId !== params.userId && areLicensesEqual(d.licenseNumber, cleanLicense)
      );
      if (existingLicenseDriver) {
        return {
          success: false,
          error: `Commercial Driving Licence "${cleanLicense}" is already registered to another driver account (${existingLicenseDriver.fullName}).`,
        };
      }
    }

    // Security Check: Duplicate Vehicle Plate Number prevention
    if (cleanPlate) {
      const existingPlateDriver = this.state.driverProfiles.find(
        (d) =>
          d.userId !== params.userId &&
          d.assignedVehicle?.plateNumber?.trim().toUpperCase() === cleanPlate
      );
      if (existingPlateDriver) {
        return {
          success: false,
          error: `Vehicle plate number "${cleanPlate}" is already assigned to another driver (${existingPlateDriver.fullName}).`,
        };
      }
    }

    // Compliance Check: Document Expiry Validation (only enforced on final submission)
    if (!params.isDraft) {
      const today = new Date().toISOString().split('T')[0];

      if (params.licenseExpiryDate && params.licenseExpiryDate < today) {
        return {
          success: false,
          error: `Driving licence expired on ${params.licenseExpiryDate}. Please renew your licence before submitting onboarding.`,
        };
      }
      if (params.vehicleRcExpiryDate && params.vehicleRcExpiryDate < today) {
        return {
          success: false,
          error: `Vehicle RC expired on ${params.vehicleRcExpiryDate}. A valid commercial registration certificate is required.`,
        };
      }
      if (params.vehicleInsuranceExpiryDate && params.vehicleInsuranceExpiryDate < today) {
        return {
          success: false,
          error: `Commercial vehicle insurance policy expired on ${params.vehicleInsuranceExpiryDate}.`,
        };
      }
      if (params.vehiclePucExpiryDate && params.vehiclePucExpiryDate < today) {
        return {
          success: false,
          error: `Vehicle Pollution Under Control (PUC) certificate expired on ${params.vehiclePucExpiryDate}.`,
        };
      }
    }

    const status: VerificationStatus = params.isDraft ? 'draft' : 'under_review';
    let driver = this.state.driverProfiles.find((d) => d.userId === params.userId);

    const docItems: DriverDocument[] = (params.documents || []).map((doc, idx) => ({
      id: `doc-${Date.now()}-${idx}`,
      type: doc.type,
      documentNumber: doc.documentNumber.trim().toUpperCase(),
      fileUrl: doc.fileUrl,
      status: (params.isDraft ? 'draft' : 'under_review') as VerificationStatus,
      submittedAt: new Date().toISOString(),
      expiryDate: doc.expiryDate,
      fileSizeBytes: doc.fileSizeBytes,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
      downloadUrl: doc.downloadUrl,
    }));

    if (driver) {
      driver.fullName = params.fullName || driver.fullName;
      driver.phone = params.phone || driver.phone;
      driver.email = params.email || driver.email;
      driver.organizationId = params.organizationId || driver.organizationId;
      driver.licenseNumber = cleanLicense || driver.licenseNumber;
      driver.licenseExpiryDate = params.licenseExpiryDate || driver.licenseExpiryDate;
      driver.badgeNumber = params.badgeNumber || driver.badgeNumber;
      driver.residentialAddress = params.residentialAddress || driver.residentialAddress;
      driver.emergencyContact = params.emergencyContact || driver.emergencyContact;
      driver.profilePhotoUrl = params.profilePhotoUrl || driver.profilePhotoUrl;
      driver.verificationStatus = status;
      driver.rejectionReason = undefined;

      if (cleanPlate) {
        driver.assignedVehicle = {
          id: driver.assignedVehicle?.id || `veh-${Date.now()}`,
          plateNumber: cleanPlate,
          makeModel: params.vehicleModel || 'Commercial Vehicle',
          category: params.vehicleCategory || 'Sedan',
          color: params.vehicleColor || driver.assignedVehicle?.color || 'Yellow/Black',
          seats: params.seatCapacity || 4,
          luggageLimit: params.luggageCapacity || 3,
          photoUrl: params.vehiclePhotoUrl || driver.assignedVehicle?.photoUrl,
          rcNumber: params.vehicleRcNumber || driver.assignedVehicle?.rcNumber,
          rcExpiryDate: params.vehicleRcExpiryDate || driver.assignedVehicle?.rcExpiryDate,
          insuranceNumber: params.vehicleInsuranceNumber || driver.assignedVehicle?.insuranceNumber,
          insuranceExpiryDate: params.vehicleInsuranceExpiryDate || driver.assignedVehicle?.insuranceExpiryDate,
          pucNumber: params.vehiclePucNumber || driver.assignedVehicle?.pucNumber,
          pucExpiryDate: params.vehiclePucExpiryDate || driver.assignedVehicle?.pucExpiryDate,
        };
      }

      if (docItems.length > 0) {
        // Merge or replace documents
        driver.documents = docItems;
      }
    } else {
      driver = {
        id: `driver-${Date.now()}`,
        userId: params.userId,
        fullName: params.fullName,
        phone: params.phone,
        email: params.email,
        organizationId: params.organizationId,
        verificationStatus: status,
        isAvailable: false,
        licenseNumber: cleanLicense,
        licenseExpiryDate: params.licenseExpiryDate,
        badgeNumber: params.badgeNumber,
        residentialAddress: params.residentialAddress,
        emergencyContact: params.emergencyContact,
        profilePhotoUrl: params.profilePhotoUrl,
        rating: 5.0,
        totalTrips: 0,
        earningsThisWeekPaise: 0,
        totalEarningsPaise: 0,
        assignedVehicle: cleanPlate
          ? {
              id: `veh-${Date.now()}`,
              plateNumber: cleanPlate,
              makeModel: params.vehicleModel || 'Commercial Vehicle',
              category: params.vehicleCategory || 'Sedan',
              color: params.vehicleColor || 'Yellow/Black',
              seats: params.seatCapacity || 4,
              luggageLimit: params.luggageCapacity || 3,
              photoUrl: params.vehiclePhotoUrl,
              rcNumber: params.vehicleRcNumber,
              rcExpiryDate: params.vehicleRcExpiryDate,
              insuranceNumber: params.vehicleInsuranceNumber,
              insuranceExpiryDate: params.vehicleInsuranceExpiryDate,
              pucNumber: params.vehiclePucNumber,
              pucExpiryDate: params.vehiclePucExpiryDate,
            }
          : undefined,
        documents: docItems,
      };
      this.state.driverProfiles.push(driver);
    }

    // Security check: Public onboarding MUST NEVER self-escalate user.role to 'driver' or 'admin'
    // User remains 'passenger' until approved by an administrator!

    this.notify();
    return { success: true, driver };
  }

  /**
   * Administrative KYC Review: Approve, reject, or suspend a driver application
   */
  public adminReviewDriverApplication(params: {
    driverId: string;
    status: 'approved' | 'rejected' | 'suspended';
    reason?: string;
    adminId: string;
    adminRole: UserProfile['role'];
  }): { success: boolean; driver?: DriverProfile; error?: string } {
    if (params.adminRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only platform administrators can review driver applications.' };
    }

    const driver = this.state.driverProfiles.find(
      (d) => d.id === params.driverId || d.userId === params.driverId
    );
    if (!driver) return { success: false, error: 'Driver profile not found.' };

    if (params.status === 'rejected' && !params.reason?.trim()) {
      return { success: false, error: 'Rejection reason is required when rejecting a driver application.' };
    }
    if (params.status === 'suspended' && !params.reason?.trim()) {
      return { success: false, error: 'Suspension reason is required when suspending a driver.' };
    }

    driver.verificationStatus = params.status;

    if (params.status === 'approved') {
      driver.rejectionReason = undefined;
      driver.suspensionReason = undefined;
      driver.isAvailable = true;
      driver.documents.forEach((d) => {
        d.status = 'approved';
        d.reviewedAt = new Date().toISOString();
      });

      // Promote linked user profile role to 'driver'
      const user = this.state.users.find((u) => u.id === driver.userId);
      if (user) user.role = 'driver';
      if (this.state.currentUser && this.state.currentUser.id === driver.userId) {
        this.state.currentUser.role = 'driver';
      }

      // Ensure vehicle is in vehicles fleet
      if (driver.assignedVehicle) {
        const existingVeh = this.state.vehicles.find((v) => v.plateNumber === driver.assignedVehicle?.plateNumber);
        if (!existingVeh) {
          this.state.vehicles.push({
            id: driver.assignedVehicle.id,
            organizationId: driver.organizationId || this.state.organizations[0]?.id || 'org-metrocab-mumbai',
            plateNumber: driver.assignedVehicle.plateNumber,
            makeModel: driver.assignedVehicle.makeModel,
            category: driver.assignedVehicle.category,
            seats: driver.assignedVehicle.seats,
            luggageCapacity: driver.assignedVehicle.luggageLimit,
            fuelType: 'CNG',
            status: 'ACTIVE',
            assignedDriverId: driver.id,
            assignedDriverName: driver.fullName,
            color: driver.assignedVehicle.color,
            rcNumber: driver.assignedVehicle.rcNumber,
            rcExpiryDate: driver.assignedVehicle.rcExpiryDate,
            insuranceExpiryDate: driver.assignedVehicle.insuranceExpiryDate,
            pucExpiryDate: driver.assignedVehicle.pucExpiryDate,
            photoUrl: driver.assignedVehicle.photoUrl,
          });
        }
      }
    } else if (params.status === 'rejected') {
      driver.isAvailable = false;
      driver.rejectionReason = params.reason;
      driver.documents.forEach((d) => {
        if (d.status === 'under_review' || d.status === 'submitted') {
          d.status = 'rejected';
          d.rejectionReason = params.reason;
          d.reviewedAt = new Date().toISOString();
        }
      });
    } else if (params.status === 'suspended') {
      driver.isAvailable = false;
      driver.suspensionReason = params.reason;
    }

    // In-app notification for the driver partner
    this.state.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: driver.userId,
      title:
        params.status === 'approved'
          ? 'Driver Partner Application Approved! 🚀'
          : params.status === 'rejected'
          ? 'KYC Document Verification Required ⚠️'
          : 'Driver Partner Account Suspended 🛑',
      message:
        params.status === 'approved'
          ? 'Congratulations! Your commercial driver credentials and vehicle have been verified. You can now go online to accept airport pool trips.'
          : params.status === 'rejected'
          ? `Your application was not approved. Reason: ${params.reason}. Please update your documents to resubmit.`
          : `Your driver account has been suspended. Reason: ${params.reason}. Contact airport operations for support.`,
      type: params.status === 'approved' ? 'SUCCESS' : 'ALERT',
      createdAt: new Date().toISOString(),
      read: false,
    });

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.adminId,
      actorName: 'Administrator',
      actorRole: 'admin',
      action: 'ADMIN_REVIEW_DRIVER',
      entityType: 'DRIVER',
      entityId: driver.id,
      details: `Driver ${driver.fullName} application updated to ${params.status.toUpperCase()}.${params.reason ? ' Reason: ' + params.reason : ''}`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, driver };
  }

  /**
   * Driver GPS Location Sharing Consent
   */
  public updateDriverGpsConsent(
    driverId: string,
    consentGranted: boolean,
    actorId: string
  ): { success: boolean; error?: string } {
    const driver = this.state.driverProfiles.find(
      (d) => d.id === driverId || d.userId === driverId
    );
    if (!driver) return { success: false, error: 'Driver profile not found.' };

    if (driver.userId !== actorId && driver.id !== actorId) {
      const actor = this.state.users.find((u) => u.id === actorId);
      if (actor?.role !== 'admin') {
        return { success: false, error: 'Unauthorized: You can only update your own GPS consent preferences.' };
      }
    }

    driver.gpsConsentGranted = consentGranted;
    driver.gpsConsentTimestamp = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  /**
   * Fleet Operator / Admin: Register new vehicle
   */
  public registerVehicle(params: {
    organizationId: string;
    plateNumber: string;
    makeModel: string;
    category: VehicleCategory;
    seats: number;
    luggageCapacity: number;
    fuelType: Vehicle['fuelType'];
    actorId: string;
    actorRole: UserProfile['role'];
  }): { success: boolean; vehicle?: Vehicle; error?: string } {
    const actor = this.state.users.find((u) => u.id === params.actorId);
    if (!actor) return { success: false, error: 'Actor user not found.' };

    if (params.actorRole === 'fleet_operator') {
      if (!actor.organizationId || actor.organizationId !== params.organizationId) {
        return { success: false, error: 'Security Notice: Cannot register vehicle for another organization.' };
      }
    } else if (params.actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for vehicle registration.' };
    }

    const cleanPlate = params.plateNumber.toUpperCase().trim();
    const existing = this.state.vehicles.find((v) => v.plateNumber === cleanPlate);
    if (existing) {
      return { success: false, error: `Vehicle with registration plate ${cleanPlate} already exists.` };
    }

    const newVehicle: Vehicle = {
      id: `veh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      organizationId: params.organizationId,
      plateNumber: cleanPlate,
      makeModel: params.makeModel,
      category: params.category,
      seats: params.seats,
      luggageCapacity: params.luggageCapacity,
      fuelType: params.fuelType,
      status: 'ACTIVE',
    };

    this.state.vehicles.push(newVehicle);

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: actor.fullName,
      actorRole: params.actorRole,
      action: 'REGISTER_VEHICLE',
      entityType: 'FLEET',
      entityId: newVehicle.id,
      details: `Registered vehicle ${cleanPlate} (${params.makeModel}, ${params.seats} seats).`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, vehicle: newVehicle };
  }

  /**
   * Report emergency SOS or safety incident
   */
  public reportSafetyIncident(params: {
    bookingId?: string;
    reporterId: string;
    reporterRole: UserProfile['role'];
    reporterName: string;
    incidentType: SafetyIncident['incidentType'];
    description: string;
    severity: SafetyIncident['severity'];
  }): SafetyIncident {
    const incident: SafetyIncident = {
      id: `inc-${Date.now()}`,
      bookingId: params.bookingId,
      reporterId: params.reporterId,
      reporterRole: params.reporterRole,
      reporterName: params.reporterName,
      incidentType: params.incidentType,
      description: params.description,
      severity: params.severity,
      status: 'OPEN',
      reportedAt: new Date().toISOString(),
    };

    this.state.safetyIncidents.unshift(incident);

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.reporterId,
      actorName: params.reporterName,
      actorRole: params.reporterRole,
      action: 'REPORT_SAFETY_INCIDENT',
      entityType: 'BOOKING',
      entityId: params.bookingId || incident.id,
      details: `[${params.severity}] ${params.incidentType}: ${params.description}`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return incident;
  }

  /**
   * Fleet Operator: Retrieve vehicles scoped by tenant organization
   */
  public getVehiclesForTenant(
    actorId: string,
    actorRole: UserProfile['role'],
    tenantOrgId?: string
  ): { success: boolean; vehicles?: Vehicle[]; error?: string } {
    const actor = this.state.users.find((u) => u.id === actorId);
    if (!actor) return { success: false, error: 'User not found' };

    let orgId = tenantOrgId;
    if (actorRole === 'fleet_operator') {
      if (!actor.organizationId) {
        return { success: false, error: 'User is not associated with any fleet organization' };
      }
      if (tenantOrgId && tenantOrgId !== actor.organizationId) {
        return {
          success: false,
          error: 'Security Notice: Cross-tenant access forbidden. You cannot access vehicles of another organization.',
        };
      }
      orgId = actor.organizationId;
    } else if (actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for fleet management' };
    }

    const vehicles = this.state.vehicles.filter((v) => !orgId || v.organizationId === orgId);
    return { success: true, vehicles };
  }

  /**
   * Fleet Operator: Retrieve drivers scoped by tenant organization
   */
  public getDriversForTenant(
    actorId: string,
    actorRole: UserProfile['role'],
    tenantOrgId?: string
  ): { success: boolean; drivers?: DriverProfile[]; error?: string } {
    const actor = this.state.users.find((u) => u.id === actorId);
    if (!actor) return { success: false, error: 'User not found' };

    let orgId = tenantOrgId;
    if (actorRole === 'fleet_operator') {
      if (!actor.organizationId) {
        return { success: false, error: 'User is not associated with any fleet organization' };
      }
      if (tenantOrgId && tenantOrgId !== actor.organizationId) {
        return {
          success: false,
          error: 'Security Notice: Cross-tenant access forbidden. You cannot access drivers of another organization.',
        };
      }
      orgId = actor.organizationId;
    } else if (actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for fleet management' };
    }

    const drivers = this.state.driverProfiles.filter((d) => !orgId || d.organizationId === orgId);
    return { success: true, drivers };
  }

  /**
   * Fleet Operator: Update vehicle status (ACTIVE, OFFLINE, SERVICING, MAINTENANCE)
   */
  public updateVehicleStatus(params: {
    vehicleId: string;
    status: 'ACTIVE' | 'OFFLINE' | 'SERVICING' | 'MAINTENANCE';
    actorId: string;
    actorRole: UserProfile['role'];
  }): { success: boolean; vehicle?: Vehicle; error?: string } {
    const vehicle = this.state.vehicles.find((v) => v.id === params.vehicleId);
    if (!vehicle) return { success: false, error: 'Vehicle not found' };

    const actor = this.state.users.find((u) => u.id === params.actorId);
    if (!actor) return { success: false, error: 'Actor user not found' };

    if (params.actorRole === 'fleet_operator') {
      if (!actor.organizationId || actor.organizationId !== vehicle.organizationId) {
        return {
          success: false,
          error: 'Security Notice: Cannot modify vehicle belonging to another organization.',
        };
      }
    } else if (params.actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for fleet vehicle modification' };
    }

    // Check if vehicle is currently engaged in an active trip
    if (params.status !== 'ACTIVE') {
      const activeTrip = this.state.pools.find(
        (p) =>
          (p.assignedVehicleId === vehicle.id || (p.assignedDriverId && vehicle.assignedDriverId === p.assignedDriverId)) &&
          ['IN_PROGRESS', 'PICKUP_CONFIRMED', 'DRIVER_ARRIVED', 'DRIVER_EN_ROUTE'].includes(p.status)
      );
      if (activeTrip) {
        return {
          success: false,
          error: `Cannot change status to ${params.status}: Vehicle is currently assigned to active trip #${activeTrip.id.slice(-6)} (${activeTrip.status}). Conclude trip before taking vehicle offline.`,
        };
      }
    }

    const oldStatus = vehicle.status;
    vehicle.status = params.status;

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: actor.fullName,
      actorRole: params.actorRole,
      action: 'UPDATE_VEHICLE_STATUS',
      entityType: 'FLEET',
      entityId: vehicle.id,
      details: `Vehicle ${vehicle.plateNumber} status updated from ${oldStatus} to ${params.status}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, vehicle };
  }

  /**
   * Fleet Operator: Assign an eligible driver to a vehicle
   */
  public assignDriverToVehicle(params: {
    vehicleId: string;
    driverId: string;
    actorId: string;
    actorRole: UserProfile['role'];
  }): { success: boolean; vehicle?: Vehicle; error?: string } {
    const vehicle = this.state.vehicles.find((v) => v.id === params.vehicleId);
    if (!vehicle) return { success: false, error: 'Vehicle not found' };

    const driver = this.state.driverProfiles.find((d) => d.id === params.driverId || d.userId === params.driverId);
    if (!driver) return { success: false, error: 'Driver profile not found' };

    const actor = this.state.users.find((u) => u.id === params.actorId);
    if (!actor) return { success: false, error: 'Actor user not found' };

    if (params.actorRole === 'fleet_operator') {
      if (!actor.organizationId || actor.organizationId !== vehicle.organizationId) {
        return { success: false, error: 'Security Notice: Cannot assign vehicle of another fleet organization.' };
      }
      if (driver.organizationId !== actor.organizationId) {
        return { success: false, error: 'Security Notice: Cannot assign a driver from another fleet organization.' };
      }
    } else if (params.actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for vehicle driver assignment' };
    }

    if (driver.verificationStatus !== 'approved') {
      return { success: false, error: 'Driver KYC verification is not approved. Only verified drivers can be assigned.' };
    }

    // Check active trip
    const activeDriverTrip = this.state.pools.find(
      (p) =>
        (p.assignedDriverId === driver.id || p.assignedDriverId === driver.userId) &&
        ['IN_PROGRESS', 'PICKUP_CONFIRMED', 'DRIVER_ARRIVED', 'DRIVER_EN_ROUTE'].includes(p.status)
    );
    if (activeDriverTrip) {
      return { success: false, error: 'Driver is currently on an active trip and cannot be reassigned.' };
    }

    // If vehicle already has a driver, clear previous driver
    if (vehicle.assignedDriverId && vehicle.assignedDriverId !== driver.id) {
      const prevDriver = this.state.driverProfiles.find((d) => d.id === vehicle.assignedDriverId);
      if (prevDriver) {
        prevDriver.assignedVehicleId = undefined;
        prevDriver.assignedVehicle = undefined;
      }
    }

    // If driver already has another vehicle, clear previous vehicle
    if (driver.assignedVehicleId && driver.assignedVehicleId !== vehicle.id) {
      const prevVeh = this.state.vehicles.find((v) => v.id === driver.assignedVehicleId);
      if (prevVeh) {
        prevVeh.assignedDriverId = undefined;
        prevVeh.assignedDriverName = undefined;
      }
    }

    vehicle.assignedDriverId = driver.id;
    vehicle.assignedDriverName = driver.fullName;
    driver.assignedVehicleId = vehicle.id;
    driver.assignedVehicle = {
      id: vehicle.id,
      makeModel: vehicle.makeModel,
      plateNumber: vehicle.plateNumber,
      category: vehicle.category,
      seats: vehicle.seats,
      luggageLimit: vehicle.luggageCapacity,
    };

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: actor.fullName,
      actorRole: params.actorRole,
      action: 'ASSIGN_DRIVER_VEHICLE',
      entityType: 'FLEET',
      entityId: vehicle.id,
      details: `Assigned driver ${driver.fullName} (${driver.phone}) to vehicle ${vehicle.plateNumber}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, vehicle };
  }

  /**
   * Fleet Operator: Unassign driver from vehicle
   */
  public unassignDriverFromVehicle(params: {
    vehicleId: string;
    actorId: string;
    actorRole: UserProfile['role'];
  }): { success: boolean; vehicle?: Vehicle; error?: string } {
    const vehicle = this.state.vehicles.find((v) => v.id === params.vehicleId);
    if (!vehicle) return { success: false, error: 'Vehicle not found' };

    const actor = this.state.users.find((u) => u.id === params.actorId);
    if (!actor) return { success: false, error: 'Actor user not found' };

    if (params.actorRole === 'fleet_operator') {
      if (!actor.organizationId || actor.organizationId !== vehicle.organizationId) {
        return { success: false, error: 'Security Notice: Cannot modify vehicle of another fleet organization.' };
      }
    } else if (params.actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role' };
    }

    if (!vehicle.assignedDriverId) {
      return { success: false, error: 'Vehicle has no assigned driver.' };
    }

    // Check active trip
    const activeTrip = this.state.pools.find(
      (p) =>
        (p.assignedVehicleId === vehicle.id || (p.assignedDriverId && vehicle.assignedDriverId === p.assignedDriverId)) &&
        ['IN_PROGRESS', 'PICKUP_CONFIRMED', 'DRIVER_ARRIVED', 'DRIVER_EN_ROUTE'].includes(p.status)
    );
    if (activeTrip) {
      return { success: false, error: 'Cannot unassign driver while vehicle has an active trip in progress.' };
    }

    const driver = this.state.driverProfiles.find((d) => d.id === vehicle.assignedDriverId);
    if (driver) {
      driver.assignedVehicleId = undefined;
      driver.assignedVehicle = undefined;
    }

    const oldDriverName = vehicle.assignedDriverName;
    vehicle.assignedDriverId = undefined;
    vehicle.assignedDriverName = undefined;

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: actor.fullName,
      actorRole: params.actorRole,
      action: 'UNASSIGN_DRIVER_VEHICLE',
      entityType: 'FLEET',
      entityId: vehicle.id,
      details: `Unassigned driver ${oldDriverName || ''} from vehicle ${vehicle.plateNumber}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, vehicle };
  }

  /**
   * Fleet Operator: Generate weekly payout settlement (idempotent, integer paise)
   */
  public generateWeeklySettlement(params: {
    organizationId: string;
    settlementCycle: string;
    actorId: string;
    actorRole: UserProfile['role'];
    verifiedPaymentId?: string;
  }): { success: boolean; settlement?: OperatorSettlement; error?: string; isExisting?: boolean } {
    const actor = this.state.users.find((u) => u.id === params.actorId);
    if (!actor) return { success: false, error: 'Actor user not found' };

    if (params.actorRole === 'fleet_operator') {
      if (!actor.organizationId || actor.organizationId !== params.organizationId) {
        return { success: false, error: 'Security Notice: Cross-tenant settlement generation forbidden.' };
      }
    } else if (params.actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for settlement generation' };
    }

    const org = this.state.organizations.find((o) => o.id === params.organizationId);
    if (!org) return { success: false, error: 'Fleet organization not found' };

    // Idempotency check: if settlement already exists for this cycle, return it
    if (!this.state.operatorSettlements) this.state.operatorSettlements = [];
    const existing = this.state.operatorSettlements.find(
      (s) => s.organizationId === params.organizationId && s.settlementCycle === params.settlementCycle
    );
    if (existing) {
      return { success: true, settlement: existing, isExisting: true };
    }

    // Find drivers & vehicles for org
    const orgDriverIds = this.state.driverProfiles
      .filter((d) => d.organizationId === params.organizationId)
      .map((d) => d.id);
    const orgVehicleIds = this.state.vehicles
      .filter((v) => v.organizationId === params.organizationId)
      .map((v) => v.id);

    // Completed pools for this fleet
    const completedPools = this.state.pools.filter(
      (p) =>
        p.status === 'COMPLETED' &&
        ((p.assignedDriverId && orgDriverIds.includes(p.assignedDriverId)) ||
          (p.assignedVehicleId && orgVehicleIds.includes(p.assignedVehicleId)))
    );

    const commissionRate = org.commissionRate || 15;
    const itemizedTrips: OperatorSettlementItem[] = completedPools.map((p) => {
      const grossFare = p.passengers.reduce((sum, pass) => sum + pass.farePaidPaise, 0);
      const platformFee = Math.round(grossFare * (commissionRate / 100));
      const operatorShare = grossFare - platformFee;
      return {
        poolId: p.id,
        completedAt: p.createdAt,
        corridor: p.targetCorridor,
        vehiclePlate: p.vehiclePlate || 'MH 02 EE 8421',
        driverName: p.assignedDriverName || 'Fleet Driver',
        passengerCount: p.passengers.length,
        grossFarePaise: grossFare,
        operatorSharePaise: operatorShare,
        platformFeePaise: platformFee,
      };
    });

    const grossFaresPaise = itemizedTrips.reduce((sum, t) => sum + t.grossFarePaise, 0);
    const platformCommissionPaise = itemizedTrips.reduce((sum, t) => sum + t.platformFeePaise, 0);
    const netPayablePaise = grossFaresPaise - platformCommissionPaise;

    // Check payment verification: only mark SETTLED if verified payment record exists
    const hasVerifiedPayment = Boolean(params.verifiedPaymentId);
    const settlementStatus: OperatorSettlement['status'] = hasVerifiedPayment ? 'SETTLED' : 'PROCESSING';

    const settlementRef = `STL-${org.id.slice(-6).toUpperCase()}-${params.settlementCycle.replace('-', '')}`;

    const newSettlement: OperatorSettlement = {
      id: `set-${params.organizationId}-${params.settlementCycle.toLowerCase()}`,
      organizationId: params.organizationId,
      organizationName: org.name,
      settlementCycle: params.settlementCycle,
      periodStart: new Date(Date.now() - 7 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      completedTripsCount: itemizedTrips.length,
      grossFaresPaise,
      platformCommissionPaise,
      netPayablePaise,
      adjustmentsPaise: 0,
      status: settlementStatus,
      settlementReference: settlementRef,
      bankAccountMasked: 'HDFC Current •••• 8821',
      itemizedTrips,
      generatedAt: new Date().toISOString(),
      settledAt: hasVerifiedPayment ? new Date().toISOString() : undefined,
      verifiedPaymentId: params.verifiedPaymentId,
    };

    this.state.operatorSettlements.unshift(newSettlement);

    // Notify fleet operator users of the new weekly payout settlement
    const orgOperators = this.state.users.filter((u) => u.organizationId === params.organizationId);
    orgOperators.forEach((op) => {
      this.createNotification({
        userId: op.id,
        userRole: 'fleet_operator',
        category: 'SETTLEMENT',
        title: 'Weekly Payout Settlement Ready',
        message: `Settlement statement ${settlementRef} for cycle ${params.settlementCycle} (Net Payable: ₹${(netPayablePaise / 100).toFixed(2)}) has been generated.`,
        type: 'INFO',
        eventId: `evt-settlement-gen-${newSettlement.id}-${op.id}`,
      });
    });

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: params.actorId,
      actorName: actor.fullName,
      actorRole: params.actorRole,
      action: 'GENERATE_SETTLEMENT',
      entityType: 'FLEET',
      entityId: newSettlement.id,
      details: `Generated settlement ${settlementRef} for ${org.name}: Gross ₹${(grossFaresPaise / 100).toFixed(2)}, Net Payable ₹${(netPayablePaise / 100).toFixed(2)}.`,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { success: true, settlement: newSettlement, isExisting: false };
  }

  /**
   * Fleet Operator: Retrieve settlements strictly scoped by tenant
   */
  public getSettlementsForTenant(
    actorId: string,
    actorRole: UserProfile['role'],
    tenantOrgId?: string
  ): OperatorSettlement[] {
    const actor = this.state.users.find((u) => u.id === actorId);
    if (!actor) return [];

    let orgId = tenantOrgId;
    if (actorRole === 'fleet_operator') {
      if (!actor.organizationId) return [];
      if (tenantOrgId && tenantOrgId !== actor.organizationId) return [];
      orgId = actor.organizationId;
    } else if (actorRole !== 'admin') {
      return [];
    }

    if (!this.state.operatorSettlements) this.state.operatorSettlements = [];
    return this.state.operatorSettlements.filter((s) => !orgId || s.organizationId === orgId);
  }

  /**
   * Driver GPS Telemetry: Record timestamped breadcrumb update with coordinate validation,
   * 30-second freshness policy, anti-spoofing jump detection, and active trip protection.
   */
  public recordDriverLocationBreadcrumb(params: {
    poolId?: string;
    driverId: string;
    lat: number;
    lng: number;
    speedKmph?: number;
    heading?: number;
    accuracyMeters?: number;
    source: LocationSource;
    timestamp?: string | number;
    actorId?: string;
    actorRole?: UserProfile['role'];
  }): { success: boolean; breadcrumb?: LocationBreadcrumb; driverCurrentLocation?: DriverCurrentLocation; error?: string } {
    // 1. Coordinate range validation
    if (
      typeof params.lat !== 'number' ||
      typeof params.lng !== 'number' ||
      isNaN(params.lat) ||
      isNaN(params.lng) ||
      params.lat < -90 ||
      params.lat > 90 ||
      params.lng < -180 ||
      params.lng > 180
    ) {
      return { success: false, error: 'Invalid geographic coordinates: Latitude must be between -90 and 90, Longitude between -180 and 180.' };
    }

    // 2. Timestamp freshness validation: Reject stale (older than 30s) or future forged timestamps
    const updateMs = params.timestamp
      ? typeof params.timestamp === 'number'
        ? params.timestamp
        : new Date(params.timestamp).getTime()
      : Date.now();
    const currentMs = Date.now();
    if (isNaN(updateMs)) {
      return { success: false, error: 'Invalid location timestamp format.' };
    }
    if (currentMs - updateMs > 30000 || updateMs - currentMs > 5000) {
      return { success: false, error: 'Stale or invalid GPS timestamp rejected. Telemetry must be recorded in real-time within 30 seconds.' };
    }

    // Resolve driver profile
    const driver = this.state.driverProfiles.find(
      (d) => d.id === params.driverId || d.userId === params.driverId
    );

    // 3. Driver Authorization Check: Actor must be the assigned driver or admin
    const effectiveRole = params.actorRole || 'driver';
    if (effectiveRole === 'driver') {
      // Verify that actorId (if supplied) matches this driver's identity
      if (params.actorId) {
        const matchesActor =
          (driver && (driver.id === params.actorId || driver.userId === params.actorId)) ||
          params.driverId === params.actorId;
        if (!matchesActor) {
          return { success: false, error: 'Security Notice: Driver identity spoofing detected. You cannot broadcast GPS telemetry for another driver.' };
        }
      }

      // Verify driver approval & explicit location consent
      if (driver) {
        if (driver.verificationStatus !== 'approved') {
          return { success: false, error: 'Unauthorized: Driver KYC is not approved. Unapproved drivers cannot broadcast live location.' };
        }
        if (driver.gpsConsentGranted === false) {
          return { success: false, error: 'Consent required: Driver has not granted explicit location sharing consent.' };
        }
      }
    } else if (effectiveRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for broadcasting driver telemetry.' };
    }

    // 4. Anti-spoofing check: Reject impossible coordinate jumps / teleportation (> 200 km/h over elapsed time)
    if (driver?.lastKnownLocation) {
      const prevMs = new Date(driver.lastKnownLocation.updatedAt).getTime();
      const timeDiffMs = updateMs - prevMs;
      const distKm = calculateHaversineDistanceKm(
        driver.lastKnownLocation.lat,
        driver.lastKnownLocation.lng,
        params.lat,
        params.lng
      );
      if (timeDiffMs > 1000) {
        const timeDiffHours = timeDiffMs / 3600000;
        const impliedSpeed = distKm / timeDiffHours;
        if (impliedSpeed > 200 && distKm > 1.0 && timeDiffMs < 300000) {
          return {
            success: false,
            error: `Suspicious coordinate jump detected (${Math.round(impliedSpeed)} km/h). Telemetry rejected to prevent GPS spoofing.`,
          };
        }
      } else if (distKm > 5.0) {
        // Impossible jump: moving > 5km in under 1 second
        return {
          success: false,
          error: 'Suspicious coordinate jump detected. Telemetry rejected to prevent GPS spoofing.',
        };
      }
    }

    const nowIso = new Date(updateMs).toISOString();
    const speedKmph = params.speedKmph !== undefined ? Math.max(0, Math.round(params.speedKmph)) : 0;
    const heading = params.heading !== undefined ? params.heading : 0;
    const accuracyMeters = params.accuracyMeters !== undefined ? Math.round(params.accuracyMeters) : 5;

    // Update driver profile latest location and transition GOING_ONLINE -> ONLINE_AVAILABLE
    if (driver) {
      driver.lastKnownLocation = {
        lat: params.lat,
        lng: params.lng,
        speedKmph,
        heading,
        accuracyMeters,
        updatedAt: nowIso,
        isStale: false,
      };
      driver.lastGpsTimestamp = nowIso;
      if (driver.lifecycleState === 'GOING_ONLINE') {
        driver.lifecycleState = 'ONLINE_AVAILABLE';
        driver.isAvailable = true;
      }
    }

    let breadcrumb: LocationBreadcrumb | undefined;
    let currentLocation: DriverCurrentLocation = {
      lat: params.lat,
      lng: params.lng,
      updatedAt: nowIso,
      isSimulated: params.source === 'SIMULATED_DEMO',
      source: params.source,
      speedKmph,
      heading,
      accuracyMeters,
      isStale: false,
    };

    // If poolId is provided, update the active pool trip
    if (params.poolId) {
      const pool = this.state.pools.find((p) => p.id === params.poolId);
      if (!pool) return { success: false, error: 'Pool not found' };

      // Active Trip State Check: Concluded trips cannot accept live location sharing
      if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {
        return {
          success: false,
          error: `Location sharing rejected: Pool trip has already ${pool.status.toLowerCase()}. Live telemetry is closed for privacy.`,
        };
      }

      if (effectiveRole === 'driver') {
        if (!pool.assignedDriverId) {
          return { success: false, error: 'Security Notice: Pool trip does not have an assigned driver. Telemetry broadcast rejected.' };
        }
        const isAssignedToPool =
          pool.assignedDriverId === params.driverId ||
          (driver && (pool.assignedDriverId === driver.id || pool.assignedDriverId === driver.userId));
        if (!isAssignedToPool) {
          return { success: false, error: 'Security Notice: Only the assigned driver can broadcast GPS telemetry for this trip.' };
        }
      }

      breadcrumb = {
        id: `bcr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        poolId: params.poolId,
        driverId: params.driverId,
        lat: params.lat,
        lng: params.lng,
        speedKmph,
        heading,
        accuracyMeters,
        source: params.source,
        timestamp: nowIso,
      };

      if (!pool.breadcrumbs) pool.breadcrumbs = [];
      pool.breadcrumbs.push(breadcrumb);
      if (pool.breadcrumbs.length > 50) {
        pool.breadcrumbs = pool.breadcrumbs.slice(-50);
      }
      pool.driverCurrentLocation = currentLocation;
    }

    this.notify();
    return { success: true, breadcrumb, driverCurrentLocation: currentLocation };
  }

  /**
   * Location Access Control: Retrieve driver telemetry scoped by booking authorization & trip lifecycle.
   * Redacts live coordinates when trip is concluded (COMPLETED / CANCELLED).
   * Freshness threshold: 30 seconds.
   */
  public getPoolLocationTelemetry(
    poolId: string,
    actorId: string,
    actorRole: UserProfile['role']
  ): {
    success: boolean;
    driverCurrentLocation?: DriverCurrentLocation;
    breadcrumbs?: LocationBreadcrumb[];
    isConcluded?: boolean;
    isStale?: boolean;
    error?: string;
  } {
    const pool = this.state.pools.find((p) => p.id === poolId);
    if (!pool) return { success: false, error: 'Pool not found' };

    // 1. Authorization: Actor must be a passenger in this pool, the assigned driver, the fleet operator, or admin
    if (actorRole === 'passenger') {
      const isMember = pool.passengers.some((p) => p.passengerId === actorId && p.status !== 'CANCELLED');
      if (!isMember) {
        return {
          success: false,
          error: 'Security Notice: Access Denied. You are not an authorized passenger on this active trip.',
        };
      }
    } else if (actorRole === 'driver') {
      const driver = this.state.driverProfiles.find((d) => d.userId === actorId || d.id === actorId);
      if (!driver || (pool.assignedDriverId && pool.assignedDriverId !== driver.id && pool.assignedDriverId !== driver.userId)) {
        return { success: false, error: 'Security Notice: You are not assigned to this pool.' };
      }
    } else if (actorRole === 'fleet_operator') {
      const actor = this.state.users.find((u) => u.id === actorId);
      const vehicle = this.state.vehicles.find((v) => v.id === pool.assignedVehicleId);
      if (!actor?.organizationId || !vehicle || vehicle.organizationId !== actor.organizationId) {
        return { success: false, error: 'Security Notice: Cross-tenant location tracking forbidden.' };
      }
    } else if (actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized role for tracking telemetry.' };
    }

    // 2. Trip-End Location Privacy: If trip has completed or cancelled, stop sharing live driver telemetry
    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {
      return {
        success: true,
        isConcluded: true,
        breadcrumbs: [],
        driverCurrentLocation: undefined,
      };
    }

    const currentLoc = pool.driverCurrentLocation;
    let isStale = false;
    if (currentLoc) {
      const ageMs = Date.now() - new Date(currentLoc.updatedAt).getTime();
      isStale = ageMs > 30000; // Phase 4 rule: 30 seconds freshness policy
    }

    return {
      success: true,
      isConcluded: false,
      isStale,
      driverCurrentLocation: currentLoc ? { ...currentLoc, isStale } : undefined,
      breadcrumbs: pool.breadcrumbs || [],
    };
  }

  /**
   * Notification Center: Create in-app notification with event deduplication (idempotency)
   */
  public createNotification(params: {
    userId: string;
    userRole?: UserProfile['role'];
    category?: NotificationCategory;
    title: string;
    message: string;
    type: NotificationType;
    link?: string;
    eventId?: string;
    isPushDelivered?: boolean;
    metadata?: Record<string, any>;
  }): { success: boolean; notification: AppNotification; isDuplicate: boolean } {
    if (!this.state.notifications) this.state.notifications = [];

    // Deduplication check: If eventId is provided, check if already exists for this user
    if (params.eventId) {
      const existing = this.state.notifications.find(
        (n) => n.userId === params.userId && n.eventId === params.eventId
      );
      if (existing) {
        return { success: true, notification: existing, isDuplicate: true };
      }
    }

    const newNotification: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: params.userId,
      userRole: params.userRole,
      category: params.category || 'SYSTEM',
      title: params.title,
      message: params.message,
      type: params.type,
      read: false,
      isRead: false,
      link: params.link,
      createdAt: new Date().toISOString(),
      eventId: params.eventId,
      isPushDelivered: params.isPushDelivered || false,
      metadata: params.metadata,
    };

    this.state.notifications.unshift(newNotification);
    if (this.state.notifications.length > 200) {
      this.state.notifications = this.state.notifications.slice(0, 200);
    }

    this.notify();
    return { success: true, notification: newNotification, isDuplicate: false };
  }

  /**
   * Notification Center: Retrieve notifications scoped by user & role
   */
  public getNotificationsForUser(userId: string, role?: UserProfile['role']): AppNotification[] {
    if (!this.state.notifications) this.state.notifications = [];
    if (role === 'admin') {
      return [...this.state.notifications];
    }
    return this.state.notifications.filter((n) => n.userId === userId);
  }

  /**
   * Notification Center: Mark single notification as read
   */
  public markNotificationAsRead(notifId: string, userId: string): boolean {
    if (!this.state.notifications) return false;
    const notif = this.state.notifications.find((n) => n.id === notifId && (n.userId === userId || this.state.currentUser?.role === 'admin'));
    if (notif) {
      notif.read = true;
      notif.isRead = true;
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Notification Center: Mark all notifications as read for user
   */
  public markAllNotificationsAsRead(userId: string): number {
    if (!this.state.notifications) return 0;
    let count = 0;
    this.state.notifications.forEach((n) => {
      if ((n.userId === userId || this.state.currentUser?.role === 'admin') && (!n.read || !n.isRead)) {
        n.read = true;
        n.isRead = true;
        count++;
      }
    });
    if (count > 0) this.notify();
    return count;
  }

  /**
   * Notification Center: Clear single notification
   */
  public clearNotification(notifId: string, userId: string): boolean {
    if (!this.state.notifications) return false;
    const initialLen = this.state.notifications.length;
    this.state.notifications = this.state.notifications.filter(
      (n) => !(n.id === notifId && (n.userId === userId || this.state.currentUser?.role === 'admin'))
    );
    if (this.state.notifications.length < initialLen) {
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * =========================================================================
   * PHASE 4: REAL-TIME DRIVER AVAILABILITY, MATCHING, OFFERS, AND OPERATIONS
   * =========================================================================
   */

  /**
   * Driver Availability Lifecycle: Enforces all 10 strict backend eligibility conditions.
   * Toggling online cannot succeed on frontend state alone.
   */
  public setDriverAvailability(params: {
    driverId: string;
    targetState: 'ONLINE' | 'OFFLINE';
    actorId: string;
    actorRole?: UserProfile['role'];
    currentLat?: number;
    currentLng?: number;
  }): {
    success: boolean;
    lifecycleState?: DriverLifecycleState;
    failedConditions?: string[];
    error?: string;
  } {
    const driver = this.state.driverProfiles.find(
      (d) => d.id === params.driverId || d.userId === params.driverId
    );
    if (!driver) {
      return { success: false, error: 'Driver profile not found.' };
    }

    const effectiveRole = params.actorRole || 'driver';
    if (effectiveRole === 'driver' && params.actorId) {
      if (driver.userId !== params.actorId && driver.id !== params.actorId) {
        return { success: false, error: 'Security Notice: You can only modify your own driver availability.' };
      }
    } else if (effectiveRole !== 'admin' && effectiveRole !== 'fleet_operator') {
      return { success: false, error: 'Unauthorized role to update driver availability.' };
    }

    // OFFLINE transition
    if (params.targetState === 'OFFLINE') {
      driver.isAvailable = false;
      driver.lifecycleState = 'OFFLINE';

      // Cancel/expire any pending offers for this driver
      if (this.state.rideOffers) {
        this.state.rideOffers.forEach((offer) => {
          if (offer.driverId === driver.id && offer.status === 'PENDING') {
            offer.status = 'CANCELLED';
            offer.rejectionReason = 'Driver went offline';
          }
        });
      }

      this.notify();
      return { success: true, lifecycleState: 'OFFLINE' };
    }

    // ONLINE transition: strictly evaluate all 10 eligibility conditions
    const failedConditions: string[] = [];

    // Condition 1: Authenticated account
    const user = this.state.users.find((u) => u.id === driver.userId);
    if (!user) {
      failedConditions.push('Condition 1 Failed: Linked authenticated user account not found.');
    }

    // Condition 2: Approved driver KYC
    if (driver.verificationStatus !== 'approved') {
      failedConditions.push(
        `Condition 2 Failed: Driver KYC is ${driver.verificationStatus.toUpperCase()}. Only approved drivers may go online.`
      );
    }

    // Condition 3: Active approved vehicle
    const vehicle =
      (driver.assignedVehicle?.id && this.state.vehicles.find((v) => v.id === driver.assignedVehicle?.id)) ||
      (driver.assignedVehicle?.plateNumber && this.state.vehicles.find((v) => v.plateNumber === driver.assignedVehicle?.plateNumber)) ||
      this.state.vehicles.find((v) => v.assignedDriverId === driver.id || v.assignedDriverId === driver.userId);

    if (!vehicle || vehicle.status !== 'ACTIVE') {
      failedConditions.push('Condition 3 Failed: No active approved vehicle assigned to this driver.');
    }

    // Condition 4: Valid vehicle registration
    const regNumber = vehicle?.plateNumber || driver.assignedVehicle?.plateNumber;
    if (!regNumber || regNumber.trim().length < 6) {
      failedConditions.push('Condition 4 Failed: Assigned vehicle lacks a valid RTO registration plate.');
    }

    // Condition 5: Valid vehicle capacity
    const seatCap = vehicle?.seats || driver.assignedVehicle?.seats || 0;
    if (seatCap < 1) {
      failedConditions.push('Condition 5 Failed: Vehicle seating capacity must be at least 1 seat.');
    }

    // Condition 6: Authorized fleet relationship where applicable
    if (driver.organizationId) {
      const org = this.state.organizations.find((o) => o.id === driver.organizationId);
      if (!org || org.status === 'suspended') {
        failedConditions.push('Condition 6 Failed: Fleet organization is suspended or invalid.');
      }
    }

    // Condition 7: Explicit GPS and availability consent
    if (!driver.gpsConsentGranted) {
      failedConditions.push('Condition 7 Failed: Explicit GPS and location tracking consent must be granted.');
    }

    // Condition 8: Valid recent device location
    // If coordinates are explicitly provided now, record them
    if (typeof params.currentLat === 'number' && typeof params.currentLng === 'number') {
      const locRes = this.recordDriverLocationBreadcrumb({
        driverId: driver.id,
        lat: params.currentLat,
        lng: params.currentLng,
        source: 'REAL_GPS',
        timestamp: Date.now(),
        actorId: params.actorId,
        actorRole: effectiveRole,
      });
      if (!locRes.success) {
        failedConditions.push(`Condition 8 Failed: ${locRes.error}`);
      }
    }

    const hasFreshGps =
      driver.lastKnownLocation &&
      Date.now() - new Date(driver.lastKnownLocation.updatedAt).getTime() <= 30000;

    // Condition 9: No conflicting active ride
    const conflictingPool = this.state.pools.find(
      (p) =>
        (p.assignedDriverId === driver.id || p.assignedDriverId === driver.userId) &&
        (p.status === 'DRIVER_ASSIGNED' ||
          p.status === 'DRIVER_EN_ROUTE' ||
          p.status === 'DRIVER_ARRIVED' ||
          p.status === 'PICKUP_CONFIRMED' ||
          p.status === 'IN_PROGRESS')
    );
    if (conflictingPool) {
      failedConditions.push(`Condition 9 Failed: Driver has an active conflicting trip (${conflictingPool.id}).`);
    }

    // Condition 10: Account not suspended
    if (driver.verificationStatus === 'suspended' || driver.verificationStatus === 'rejected') {
      failedConditions.push(`Condition 10 Failed: Driver account is ${driver.verificationStatus.toUpperCase()}.`);
    }

    if (failedConditions.length > 0) {
      return {
        success: false,
        failedConditions,
        error: `Cannot go online. Eligibility criteria failed:\n• ${failedConditions.join('\n• ')}`,
      };
    }

    // If all conditions pass, determine state based on GPS freshness
    let nextState: DriverLifecycleState = 'ONLINE_AVAILABLE';
    if (!hasFreshGps) {
      // Transition to GOING_ONLINE until the first genuine GPS ping arrives
      nextState = 'GOING_ONLINE';
      driver.isAvailable = false; // Not yet dispatchable until GPS locks
    } else {
      driver.isAvailable = true;
    }

    driver.lifecycleState = nextState;
    this.notify();
    return { success: true, lifecycleState: nextState };
  }

  /**
   * Driver Matching Engine: Search genuine approved, online, fresh GPS drivers near pickup.
   * ABSOLUTE ZERO FAKE DRIVERS: If none match, returns an honest empty array [].
   */
  public findEligibleDriversForPickup(params: {
    pickupLat: number;
    pickupLng: number;
    maxRadiusKm?: number;
    vehicleCategory?: VehicleCategory;
    terminal?: 'T1' | 'T2';
    minSeats?: number;
  }): Array<{
    driver: DriverProfile;
    vehicle?: Vehicle;
    distanceKm: number;
    estimatedPickupMinutes: number;
  }> {
    const maxRadius = params.maxRadiusKm ?? 15;
    const minSeats = params.minSeats ?? 1;
    const now = Date.now();

    const candidates: Array<{
      driver: DriverProfile;
      vehicle?: Vehicle;
      distanceKm: number;
      estimatedPickupMinutes: number;
    }> = [];

    for (const d of this.state.driverProfiles) {
      // 1. Must be approved and online
      if (d.verificationStatus !== 'approved') continue;
      if (!d.isAvailable || d.lifecycleState !== 'ONLINE_AVAILABLE') continue;

      // 2. Fresh GPS within 30 seconds
      if (!d.lastKnownLocation) continue;
      const ageMs = now - new Date(d.lastKnownLocation.updatedAt).getTime();
      if (ageMs > 30000) continue;

      // 3. Must have active vehicle with sufficient seats
      const veh =
        (d.assignedVehicle?.id && this.state.vehicles.find((v) => v.id === d.assignedVehicle?.id)) ||
        (d.assignedVehicle?.plateNumber && this.state.vehicles.find((v) => v.plateNumber === d.assignedVehicle?.plateNumber)) ||
        this.state.vehicles.find((v) => v.assignedDriverId === d.id || v.assignedDriverId === d.userId);

      const seatCap = veh?.seats || d.assignedVehicle?.seats || 0;
      if (seatCap < minSeats) continue;

      if (params.vehicleCategory && veh?.category && veh.category !== params.vehicleCategory) {
        continue;
      }

      // 4. Must not have active conflicting ride
      const hasActiveRide = this.state.pools.some(
        (p) =>
          (p.assignedDriverId === d.id || p.assignedDriverId === d.userId) &&
          (p.status === 'DRIVER_ASSIGNED' ||
            p.status === 'DRIVER_EN_ROUTE' ||
            p.status === 'DRIVER_ARRIVED' ||
            p.status === 'PICKUP_CONFIRMED' ||
            p.status === 'IN_PROGRESS')
      );
      if (hasActiveRide) continue;

      // 5. Calculate real geospatial distance
      const distKm = calculateHaversineDistanceKm(
        d.lastKnownLocation.lat,
        d.lastKnownLocation.lng,
        params.pickupLat,
        params.pickupLng
      );

      if (distKm <= maxRadius) {
        // Realistic city pickup speed (~25 km/h) + 2 min dispatch buffer
        const etaMin = Math.max(3, Math.round((distKm / 25) * 60) + 2);
        candidates.push({
          driver: d,
          vehicle: veh,
          distanceKm: Math.round(distKm * 10) / 10,
          estimatedPickupMinutes: etaMin,
        });
      }
    }

    // Rank candidates by pickup distance and ETA ascending
    candidates.sort((a, b) => a.distanceKm - b.distanceKm || a.estimatedPickupMinutes - b.estimatedPickupMinutes);

    return candidates;
  }

  /**
   * Ride Offer Lifecycle: Create genuine offer with 45-second expiration timer
   */
  public createRideOffer(params: {
    poolId: string;
    driverId: string;
    actorId?: string;
  }): { success: boolean; offer?: RideOffer; error?: string } {
    this.expireStaleOffers();

    const pool = this.state.pools.find((p) => p.id === params.poolId);
    if (!pool) return { success: false, error: 'Pool trip not found.' };

    if (pool.assignedDriverId) {
      return { success: false, error: 'Pool trip is already assigned to a driver.' };
    }

    const driver = this.state.driverProfiles.find(
      (d) => d.id === params.driverId || d.userId === params.driverId
    );
    if (!driver) return { success: false, error: 'Driver not found.' };

    if (driver.verificationStatus !== 'approved') {
      return { success: false, error: 'Driver is not approved for ride offers.' };
    }

    if (!driver.isAvailable || driver.lifecycleState !== 'ONLINE_AVAILABLE') {
      return { success: false, error: `Driver is currently ${driver.lifecycleState || 'unavailable'}.` };
    }

    // Prevent duplicate pending offers for this pool
    const existingOffer = this.state.rideOffers.find(
      (o) => o.poolId === pool.id && o.status === 'PENDING'
    );
    if (existingOffer) {
      return { success: false, error: 'A pending ride offer already exists for this pool.' };
    }

    const veh =
      (driver.assignedVehicle?.id && this.state.vehicles.find((v) => v.id === driver.assignedVehicle?.id)) ||
      (driver.assignedVehicle?.plateNumber && this.state.vehicles.find((v) => v.plateNumber === driver.assignedVehicle?.plateNumber)) ||
      this.state.vehicles.find((v) => v.assignedDriverId === driver.id);

    const now = Date.now();
    const offeredAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 45000).toISOString(); // 45 seconds timeout

    const grossPaise = pool.passengers.reduce((sum, p) => sum + p.farePaidPaise, 0);
    const earningsPaise = Math.round(grossPaise * 0.85);

    const offer: RideOffer = {
      id: `offer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      poolId: pool.id,
      driverId: driver.id,
      driverName: driver.fullName,
      vehicleId: veh?.id || driver.assignedVehicle?.id || 'veh-assigned',
      vehiclePlate: veh?.plateNumber || driver.assignedVehicle?.plateNumber || 'MH-02-EE-0000',
      terminal: pool.terminal,
      pickupZoneName: pool.pickupZone?.name || 'Terminal Pickup Zone',
      destinationName: pool.passengers[0]?.destination?.name || 'Mumbai Destination',
      corridor: pool.targetCorridor || 'Western Suburbs',
      passengerCount: pool.passengers.length,
      totalSeatsBooked: pool.passengers.reduce((sum, p) => sum + p.seatsBooked, 0),
      estimatedEarningsPaise: earningsPaise,
      offeredAt,
      expiresAt,
      status: 'PENDING',
    };

    this.state.rideOffers.push(offer);
    driver.lifecycleState = 'RIDE_REQUEST_RECEIVED';

    // Send in-app notification to driver
    this.createNotification({
      userId: driver.userId,
      title: 'New Ride Request Available',
      message: `Pickup at ${offer.terminal} - ${offer.pickupZoneName} for ${offer.passengerCount} passengers. Est. earnings: ₹${(earningsPaise / 100).toFixed(0)}.`,
      type: 'INFO',
      category: 'DISPATCH',
      link: '/driver',
    });

    this.notify();
    return { success: true, offer };
  }

  /**
   * Ride Offer Response: Driver accepts or rejects incoming offer.
   * Concurrency Safe: First acceptance wins atomically; competing offers cancelled.
   */
  public respondToRideOffer(params: {
    offerId: string;
    driverId: string;
    response: 'ACCEPT' | 'REJECT';
    reason?: string;
    actorId?: string;
  }): { success: boolean; error?: string; offer?: RideOffer } {
    this.expireStaleOffers();

    const offer = this.state.rideOffers.find((o) => o.id === params.offerId);
    if (!offer) return { success: false, error: 'Ride offer not found.' };

    if (offer.status !== 'PENDING') {
      return { success: false, error: `Ride offer has already been ${offer.status.toLowerCase()}.` };
    }

    if (Date.now() > new Date(offer.expiresAt).getTime()) {
      offer.status = 'EXPIRED';
      this.notify();
      return { success: false, error: 'Ride offer expired before response.' };
    }

    const driver = this.state.driverProfiles.find(
      (d) => d.id === params.driverId || d.userId === params.driverId
    );
    if (!driver) return { success: false, error: 'Driver profile not found.' };

    if (offer.driverId !== driver.id && offer.driverId !== driver.userId) {
      return { success: false, error: 'Security Notice: You are not authorized to respond to this ride offer.' };
    }

    if (params.response === 'REJECT') {
      offer.status = 'REJECTED';
      offer.rejectionReason = params.reason || 'Declined by driver';
      driver.lifecycleState = 'ONLINE_AVAILABLE';

      // Cascade to next eligible driver if pool is still unassigned
      const pool = this.state.pools.find((p) => p.id === offer.poolId);
      if (pool && !pool.assignedDriverId) {
        const nextCandidates = this.findEligibleDriversForPickup({
          pickupLat: pool.pickupZone?.latitude || 19.0896,
          pickupLng: pool.pickupZone?.longitude || 72.8656,
          vehicleCategory: pool.vehicleCategory,
          terminal: pool.terminal,
          minSeats: pool.passengers.reduce((sum, p) => sum + p.seatsBooked, 0),
        }).filter((c) => c.driver.id !== driver.id && c.driver.userId !== driver.userId);

        if (nextCandidates.length > 0) {
          this.createRideOffer({
            poolId: pool.id,
            driverId: nextCandidates[0].driver.id,
          });
        }
      }

      this.notify();
      return { success: true, offer };
    }

    // ACCEPT: Atomic confirmation
    const pool = this.state.pools.find((p) => p.id === offer.poolId);
    if (!pool) return { success: false, error: 'Pool trip not found.' };

    if (pool.assignedDriverId && pool.assignedDriverId !== driver.id) {
      offer.status = 'CANCELLED';
      offer.rejectionReason = 'Trip was assigned to another driver.';
      driver.lifecycleState = 'ONLINE_AVAILABLE';
      this.notify();
      return { success: false, error: 'Ride offer no longer available: another driver was assigned.' };
    }

    // Atomically assign driver to pool
    const assignRes = this.assignDriverToPool({
      poolId: pool.id,
      driverId: driver.id,
      vehicleId: offer.vehicleId,
      actorId: params.actorId || driver.userId,
    });

    if (!assignRes.success) {
      return { success: false, error: assignRes.error || 'Failed to assign driver to pool.' };
    }

    offer.status = 'ACCEPTED';
    driver.lifecycleState = 'RIDE_ACCEPTED';

    // Cancel all other pending offers for this pool
    this.state.rideOffers.forEach((o) => {
      if (o.poolId === pool.id && o.id !== offer.id && o.status === 'PENDING') {
        o.status = 'CANCELLED';
        o.rejectionReason = 'Pool trip assigned to another driver.';
      }
    });

    // Notify passengers that their driver is on the way
    pool.passengers.forEach((pass) => {
      this.createNotification({
        userId: pass.passengerId,
        title: 'Driver Confirmed for Your AeroPool',
        message: `${driver.fullName} in ${offer.vehiclePlate} has been assigned to your ride. Live GPS tracking is now active.`,
        type: 'INFO',
        category: 'TRIP',
        link: `/track/${pool.id}`,
      });
    });

    this.notify();
    return { success: true, offer };
  }

  /**
   * Stale Offer Expiration Sweeper
   */
  public expireStaleOffers(): number {
    if (!this.state.rideOffers) return 0;
    const now = Date.now();
    let expiredCount = 0;

    for (const offer of this.state.rideOffers) {
      if (offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() <= now) {
        offer.status = 'EXPIRED';
        offer.rejectionReason = 'Offer timed out after 45 seconds with no response.';
        expiredCount++;

        // Revert driver state if they were awaiting this offer
        const driver = this.state.driverProfiles.find((d) => d.id === offer.driverId);
        if (driver && driver.lifecycleState === 'RIDE_REQUEST_RECEIVED') {
          driver.lifecycleState = 'ONLINE_AVAILABLE';
        }

        // Cascade offer to next candidate if pool is still unassigned
        const pool = this.state.pools.find((p) => p.id === offer.poolId);
        if (pool && !pool.assignedDriverId) {
          const nextCandidates = this.findEligibleDriversForPickup({
            pickupLat: pool.pickupZone?.latitude || 19.0896,
            pickupLng: pool.pickupZone?.longitude || 72.8656,
            vehicleCategory: pool.vehicleCategory,
            terminal: pool.terminal,
            minSeats: pool.passengers.reduce((sum, p) => sum + p.seatsBooked, 0),
          }).filter((c) => c.driver.id !== offer.driverId);

          if (nextCandidates.length > 0) {
            this.createRideOffer({
              poolId: pool.id,
              driverId: nextCandidates[0].driver.id,
            });
          }
        }
      }
    }

    if (expiredCount > 0) this.notify();
    return expiredCount;
  }

  /**
   * Operational Metrics: Authoritative operational figures derived from authentic DB state
   */
  public getOperationalMetrics() {
    this.expireStaleOffers();
    const now = Date.now();

    const onlineDrivers = this.state.driverProfiles.filter(
      (d) => d.verificationStatus === 'approved' && d.isAvailable
    );

    const freshGpsDrivers = onlineDrivers.filter((d) => {
      if (!d.lastKnownLocation) return false;
      return now - new Date(d.lastKnownLocation.updatedAt).getTime() <= 30000;
    });

    const staleGpsDrivers = onlineDrivers.filter((d) => {
      if (!d.lastKnownLocation) return true;
      return now - new Date(d.lastKnownLocation.updatedAt).getTime() > 30000;
    });

    const activeOffers = (this.state.rideOffers || []).filter((o) => o.status === 'PENDING');
    const acceptedAssignments = this.state.pools.filter((p) => !!p.assignedDriverId).length;
    const unassignedPools = this.state.pools.filter(
      (p) => !p.assignedDriverId && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
    ).length;

    const activeTrips = this.state.pools.filter(
      (p) =>
        p.status === 'DRIVER_ASSIGNED' ||
        p.status === 'DRIVER_EN_ROUTE' ||
        p.status === 'DRIVER_ARRIVED' ||
        p.status === 'PICKUP_CONFIRMED' ||
        p.status === 'IN_PROGRESS'
    ).length;

    const completedTrips = this.state.pools.filter((p) => p.status === 'COMPLETED').length;

    const matchingFailures = (this.state.rideOffers || []).filter(
      (o) => (o.status === 'EXPIRED' || o.status === 'REJECTED') && !this.state.pools.find((p) => p.id === o.poolId)?.assignedDriverId
    ).length;

    return {
      onlineEligibleDrivers: onlineDrivers.length,
      freshGpsDrivers: freshGpsDrivers.length,
      staleGpsDrivers: staleGpsDrivers.length,
      activeRideOffers: activeOffers.length,
      acceptedAssignments,
      unassignedPools,
      activeTrips,
      completedTrips,
      matchingFailures,
    };
  }


  /**
   * Authoritatively records trip earnings in the driver financial ledger (idempotent, integer paise)
   */
  public recordDriverTripEarnings(params: {
    poolId: string;
    driverId: string;
    grossFarePaise: number;
    airportTollPaise?: number;
    platformFeePaise?: number;
  }): DriverLedgerEntry {
    if (!this.state.driverLedger) {
      this.state.driverLedger = [];
    }

    // Idempotency check: if TRIP_EARNING entry for this pool already exists, return it
    const existing = this.state.driverLedger.find(
      (e) => e.poolId === params.poolId && e.transactionType === 'TRIP_EARNING'
    );
    if (existing) {
      return existing;
    }

    const split = calculateCommissionSplit({
      grossFarePaise: params.grossFarePaise,
      airportTollPaise: params.airportTollPaise || 0,
      platformFeePaise: params.platformFeePaise || 0,
      poolId: params.poolId,
      driverId: params.driverId,
    });

    const entry: DriverLedgerEntry = {
      id: `drv_led_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      driverId: params.driverId,
      poolId: params.poolId,
      transactionType: 'TRIP_EARNING',
      grossFarePaise: split.grossFarePaise,
      platformCommissionPaise: split.platformCommissionPaise,
      tollReimbursementPaise: split.driverTollReimbursementPaise,
      driverEarningsPaise: split.driverNetPayoutPaise,
      amountPaise: split.driverNetPayoutPaise,
      currency: 'INR',
      timestamp: new Date().toISOString(),
      settlementStatus: 'AVAILABLE',
      auditReference: `SPLIT_${split.policySnapshot.policyId}_${params.poolId}`,
      policyId: split.policySnapshot.policyId,
      policyVersion: split.policySnapshot.version,
      notes: `Pool ride earnings (${split.policySnapshot.driverSharePercent}% driver share, toll ₹${(split.driverTollReimbursementPaise / 100).toFixed(0)})`,
      isSandbox: true,
    };

    this.state.driverLedger.unshift(entry);

    // Update driver profile running totals
    const driver = this.state.driverProfiles.find((d) => d.id === params.driverId);
    if (driver) {
      driver.earningsThisWeekPaise = (driver.earningsThisWeekPaise || 0) + split.driverNetPayoutPaise;
      driver.totalEarningsPaise = (driver.totalEarningsPaise || 0) + split.driverNetPayoutPaise;
    }

    this.saveState(this.state);
    this.notify();
    return entry;
  }

  /**
   * Retrieves driver ledger entries sorted by timestamp descending
   */
  public getDriverLedger(driverId: string): DriverLedgerEntry[] {
    if (!this.state.driverLedger) return [];
    return this.state.driverLedger
      .filter((e) => e.driverId === driverId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Aggregates authoritative driver wallet metrics across time windows and settlement states
   */
  public getDriverWalletSummary(driverId: string): DriverWalletSummary {
    const entries = this.getDriverLedger(driverId);
    const nowMs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const weekAgoMs = nowMs - 7 * 86400000;
    const monthAgoMs = nowMs - 30 * 86400000;

    let lifetimeGrossPaise = 0;
    let lifetimeNetEarningsPaise = 0;
    let lifetimeCommissionDeductedPaise = 0;
    let lifetimeTollReimbursementsPaise = 0;
    let todayEarningsPaise = 0;
    let weeklyEarningsPaise = 0;
    let monthlyEarningsPaise = 0;
    let accruedEarningsPaise = 0;
    let availableEarningsPaise = 0;
    let approvedEarningsPaise = 0;
    let paidOutEarningsPaise = 0;
    let refundAdjustmentsPaise = 0;
    const completedPoolIds = new Set<string>();

    for (const e of entries) {
      const eTime = new Date(e.timestamp).getTime();
      lifetimeGrossPaise += e.grossFarePaise || 0;
      lifetimeNetEarningsPaise += e.driverEarningsPaise || 0;
      lifetimeCommissionDeductedPaise += e.platformCommissionPaise || 0;
      lifetimeTollReimbursementsPaise += e.tollReimbursementPaise || 0;

      if (e.poolId) {
        completedPoolIds.add(e.poolId);
      }

      if (eTime >= todayStartMs) {
        todayEarningsPaise += e.driverEarningsPaise || 0;
      }
      if (eTime >= weekAgoMs) {
        weeklyEarningsPaise += e.driverEarningsPaise || 0;
      }
      if (eTime >= monthAgoMs) {
        monthlyEarningsPaise += e.driverEarningsPaise || 0;
      }

      if (e.settlementStatus === 'ACCRUED') {
        accruedEarningsPaise += e.amountPaise || 0;
      } else if (e.settlementStatus === 'AVAILABLE') {
        availableEarningsPaise += e.amountPaise || 0;
      } else if (e.settlementStatus === 'SETTLEMENT_APPROVED') {
        approvedEarningsPaise += e.amountPaise || 0;
      } else if (e.settlementStatus === 'SETTLED') {
        paidOutEarningsPaise += e.amountPaise || 0;
      }

      if (e.transactionType === 'REFUND_ADJUSTMENT') {
        refundAdjustmentsPaise += Math.abs(e.amountPaise || 0);
      }
    }

    return {
      driverId,
      lifetimeGrossPaise,
      lifetimeNetEarningsPaise,
      lifetimeCommissionDeductedPaise,
      lifetimeTollReimbursementsPaise,
      todayEarningsPaise,
      weeklyEarningsPaise,
      monthlyEarningsPaise,
      accruedEarningsPaise,
      availableEarningsPaise,
      approvedEarningsPaise,
      paidOutEarningsPaise,
      refundAdjustmentsPaise,
      completedTripsCount: completedPoolIds.size,
      recentTransactions: entries.slice(0, 50),
    };
  }

  /**
   * Super Admin approval of a weekly operator settlement
   */
  public approveSettlement(
    settlementId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ): { success: boolean; settlement?: OperatorSettlement; error?: string } {
    if (actorRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only Super Administrators can approve settlements.' };
    }

    if (!this.state.operatorSettlements) {
      this.state.operatorSettlements = [];
    }

    const settlement = this.state.operatorSettlements.find((s) => s.id === settlementId);
    if (!settlement) {
      return { success: false, error: `Settlement not found: ${settlementId}` };
    }

    if (settlement.status !== 'PROCESSING') {
      return {
        success: false,
        error: `Cannot approve settlement with status '${settlement.status}'. Only 'PROCESSING' settlements can be approved.`,
      };
    }

    settlement.status = 'SETTLEMENT_APPROVED';

    // Transition any driver ledger entries for this cycle/pools to SETTLEMENT_APPROVED
    if (this.state.driverLedger && settlement.itemizedTrips) {
      const poolIds = settlement.itemizedTrips.map((t) => t.poolId);
      for (const entry of this.state.driverLedger) {
        if (entry.poolId && poolIds.includes(entry.poolId) && entry.settlementStatus === 'AVAILABLE') {
          entry.settlementStatus = 'SETTLEMENT_APPROVED';
        }
      }
    }

    this.createAuditLog({
      action: 'SETTLEMENT_BATCH_APPROVED',
      actorId,
      actorName: 'Super Admin',
      actorRole: 'admin',
      entityType: 'FLEET',
      entityId: settlementId,
      details: JSON.stringify({
        settlementId,
        organizationId: settlement.organizationId,
        cycle: settlement.settlementCycle,
        netPayablePaise: settlement.netPayablePaise,
        notes: notes || 'Approved by Super Admin',
      }),
    });

    this.saveState(this.state);
    this.notify();
    return { success: true, settlement };
  }

  /**
   * Reset store to initial demo state
   */

  /**
   * Retrieves reconciliation discrepancies with optional status filtering
   */
  public getReconciliationDiscrepancies(statusFilter?: string): ReconciliationDiscrepancy[] {
    if (!this.state.reconciliationDiscrepancies) {
      this.state.reconciliationDiscrepancies = [];
    }
    this.runLocalReconciliationAudit();
    if (statusFilter && statusFilter !== 'ALL') {
      return this.state.reconciliationDiscrepancies.filter((d) => d.status === statusFilter);
    }
    return this.state.reconciliationDiscrepancies;
  }

  /**
   * Resolves or transitions a reconciliation discrepancy
   */
  public resolveReconciliationDiscrepancy(
    id: string,
    actorId: string,
    notes: string,
    action: 'RESOLVE' | 'UNDER_REVIEW' = 'RESOLVE'
  ): { success: boolean; discrepancy?: ReconciliationDiscrepancy; error?: string } {
    if (!this.state.reconciliationDiscrepancies) {
      this.state.reconciliationDiscrepancies = [];
    }
    const item = this.state.reconciliationDiscrepancies.find((d) => d.id === id);
    if (!item) {
      return { success: false, error: `Discrepancy not found: ${id}` };
    }

    const previousStatus = item.status;
    item.status = action === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'RESOLVED';
    if (item.status === 'RESOLVED') {
      item.resolvedAt = new Date().toISOString();
      item.resolvedBy = actorId;
    }
    item.resolutionNotes = notes;

    this.createAuditLog({
      action: `RECONCILIATION_DISCREPANCY_${item.status}`,
      actorId,
      actorName: 'Super Admin',
      actorRole: 'admin',
      entityType: 'PAYMENT',
      entityId: id,
      details: JSON.stringify({
        discrepancyId: id,
        previousStatus,
        newStatus: item.status,
        notes,
      }),
    });

    this.saveState(this.state);
    this.notify();
    return { success: true, discrepancy: item };
  }

  /**
   * Audits state for payment and settlement reconciliation discrepancies
   */
  public runLocalReconciliationAudit(): ReconciliationDiscrepancy[] {
    if (!this.state.reconciliationDiscrepancies) {
      this.state.reconciliationDiscrepancies = [];
    }
    const discs = this.state.reconciliationDiscrepancies;
    const payments = this.state.payments || [];
    const settlements = this.state.operatorSettlements || [];
    const ledger = this.state.driverLedger || [];
    const paymentIdMap = new Map<string, string[]>();

    // 1. Audit payments for duplicates and captures without provider ID
    for (const p of payments) {
      if (p.razorpayPaymentId) {
        const existing = paymentIdMap.get(p.razorpayPaymentId) || [];
        existing.push(p.id);
        paymentIdMap.set(p.razorpayPaymentId, existing);
      }

      // Check capture without provider ID
      if (p.status === 'captured' && (!p.razorpayPaymentId || p.razorpayPaymentId.startsWith('mock_'))) {
        const discId = `disc_capture_mock_${p.id}`;
        if (!discs.some((d) => d.id === discId)) {
          discs.push({
            id: discId,
            type: 'INTERNAL_CAPTURE_WITHOUT_PROVIDER',
            severity: 'HIGH',
            status: 'OPEN',
            entityId: p.id,
            description: `Payment ${p.id} for booking ${p.bookingId} has captured status with unverified provider ID ${p.razorpayPaymentId || 'null'}.`,
            expectedValue: 'Verified Razorpay Payment ID (pay_...)',
            actualValue: p.razorpayPaymentId || 'null',
            discrepancyPaise: p.amountPaise,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Check refund overrun
      if (p.refundedAmountPaise && p.refundedAmountPaise > p.amountPaise) {
        const discId = `disc_refund_overrun_${p.id}`;
        if (!discs.some((d) => d.id === discId)) {
          discs.push({
            id: discId,
            type: 'REFUND_OVERRUN',
            severity: 'CRITICAL',
            status: 'OPEN',
            entityId: p.id,
            description: `Payment ${p.id} refund total (${p.refundedAmountPaise} paise) exceeds original captured amount (${p.amountPaise} paise).`,
            expectedValue: `<= ${p.amountPaise} paise`,
            actualValue: `${p.refundedAmountPaise} paise`,
            discrepancyPaise: p.refundedAmountPaise - p.amountPaise,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    // 2. Audit duplicate provider payment IDs
    for (const [payId, paymentIds] of paymentIdMap.entries()) {
      if (paymentIds.length > 1 && !payId.startsWith('pay_BOM_TEST')) {
        const discId = `disc_dup_pay_${payId}`;
        if (!discs.some((d) => d.id === discId)) {
          discs.push({
            id: discId,
            type: 'DUPLICATE_PAYMENT_REFERENCE',
            severity: 'CRITICAL',
            status: 'OPEN',
            entityId: payId,
            description: `Payment ID ${payId} is mapped to multiple internal records: ${paymentIds.join(', ')}.`,
            expectedValue: 'Single payment mapping',
            actualValue: `${paymentIds.length} mappings`,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    // 3. Audit unverified settlement payouts
    for (const s of settlements) {
      if (s.status === 'SETTLED' && !s.verifiedPaymentId) {
        const discId = `disc_unverified_settlement_${s.id}`;
        if (!discs.some((d) => d.id === discId)) {
          discs.push({
            id: discId,
            type: 'UNVERIFIED_SETTLEMENT_PAYOUT',
            severity: 'HIGH',
            status: 'OPEN',
            entityId: s.id,
            description: `Settlement ${s.id} is marked SETTLED without verified banking payment reference.`,
            expectedValue: 'Verified payment confirmation ID',
            actualValue: 'Undefined / Unverified',
            discrepancyPaise: s.netPayablePaise,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return discs;
  }

  /**
   * Generates secure CSV exports with formula injection safeguards (CWE-1236)
   */
  public exportFinancialCsv(type: FinancialExportType, records?: any[]): string {
    const sanitize = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).trim();
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    if (type === 'TRANSACTIONS') {
      const data = records || this.state.payments;
      const headers = ['Payment ID', 'Booking ID', 'Passenger Name', 'Amount (INR)', 'Status', 'Order ID', 'Provider Pay ID', 'Created At'];
      const rows = data.map((p) => [
        sanitize(p.id),
        sanitize(p.bookingId),
        sanitize(p.passengerName),
        sanitize((p.amountPaise / 100).toFixed(2)),
        sanitize(p.status),
        sanitize(p.razorpayOrderId),
        sanitize(p.razorpayPaymentId || 'N/A'),
        sanitize(p.createdAt),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    if (type === 'DRIVER_LEDGER') {
      const data = records || this.state.driverLedger;
      const headers = ['Ledger ID', 'Driver ID', 'Pool ID', 'Type', 'Gross (INR)', 'Commission (INR)', 'Toll Reimbursement (INR)', 'Driver Net (INR)', 'Status', 'Timestamp'];
      const rows = data.map((e) => [
        sanitize(e.id),
        sanitize(e.driverId),
        sanitize(e.poolId || 'N/A'),
        sanitize(e.transactionType),
        sanitize((e.grossFarePaise / 100).toFixed(2)),
        sanitize((e.platformCommissionPaise / 100).toFixed(2)),
        sanitize((e.tollReimbursementPaise / 100).toFixed(2)),
        sanitize((e.driverEarningsPaise / 100).toFixed(2)),
        sanitize(e.settlementStatus || 'AVAILABLE'),
        sanitize(e.timestamp),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    if (type === 'SETTLEMENTS') {
      const data = records || this.state.operatorSettlements;
      const headers = ['Settlement ID', 'Org ID', 'Cycle', 'Period Start', 'Period End', 'Trips', 'Gross (INR)', 'Commission (INR)', 'Net Payable (INR)', 'Status'];
      const rows = data.map((s) => [
        sanitize(s.id),
        sanitize(s.organizationId),
        sanitize(s.settlementCycle),
        sanitize(s.periodStart),
        sanitize(s.periodEnd),
        sanitize(s.completedTripsCount),
        sanitize((s.grossFaresPaise / 100).toFixed(2)),
        sanitize((s.platformCommissionPaise / 100).toFixed(2)),
        sanitize((s.netPayablePaise / 100).toFixed(2)),
        sanitize(s.status),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    if (type === 'RECONCILIATION') {
      const data = records || this.getReconciliationDiscrepancies();
      const headers = ['Discrepancy ID', 'Type', 'Severity', 'Status', 'Entity ID', 'Description', 'Expected', 'Actual', 'Discrepancy (INR)', 'Detected At', 'Resolved At', 'Resolved By'];
      const rows = data.map((d) => [
        sanitize(d.id),
        sanitize(d.type),
        sanitize(d.severity),
        sanitize(d.status),
        sanitize(d.entityId),
        sanitize(d.description),
        sanitize(d.expectedValue),
        sanitize(d.actualValue),
        sanitize(d.discrepancyPaise ? (d.discrepancyPaise / 100).toFixed(2) : '0.00'),
        sanitize(d.detectedAt),
        sanitize(d.resolvedAt || 'Open'),
        sanitize(d.resolvedBy || 'Unresolved'),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    return '';
  }


  /**
   * Updates refund lifecycle status for a payment record
   */
  public updateRefundStatus(
    paymentId: string,
    status: RefundLifecycleStatus,
    reason?: string,
    actorId: string = 'admin'
  ): { success: boolean; payment?: PaymentRecord; error?: string } {
    const payment = this.state.payments.find((p) => p.id === paymentId);
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    payment.refundStatus = status;
    if (reason) payment.refundReason = reason;
    if (status === 'PROCESSED') {
      payment.status = 'refunded';
      payment.refundedAmountPaise = payment.amountPaise;
    }

    this.createAuditLog({
      action: `REFUND_STATUS_${status}`,
      actorId,
      actorName: 'Super Admin',
      actorRole: 'admin',
      entityType: 'PAYMENT',
      entityId: paymentId,
      details: JSON.stringify({
        paymentId,
        newRefundStatus: status,
        reason: reason || null,
      }),
    });

    this.saveState(this.state);
    this.notify();
    return { success: true, payment };
  }

  public runReconciliationAudit(): ReconciliationDiscrepancy[] {
    return this.runLocalReconciliationAudit();
  }

  public setReconciliationUnderReview(id: string, actorId: string = 'admin', notes: string = 'Under review') {
    return this.resolveReconciliationDiscrepancy(id, actorId, notes, 'UNDER_REVIEW');
  }

  public approveOperatorSettlement(settlementId: string, actorId: string = 'admin', notes?: string) {
    return this.approveSettlement(settlementId, actorId, 'admin', notes);
  }

  public generateFinancialCsv(type: FinancialExportType, records?: any[]): string {
    return this.exportFinancialCsv(type, records);
  }

  public resetToDemoData() {
    localStorage.removeItem(DB_STORAGE_KEY);
    this.state = this.loadState();
    this.notify();
  }
}

export const db = new AeroPoolDatabase();
