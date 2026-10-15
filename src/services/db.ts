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
} from '../types';
import { PICKUP_ZONES, MUMBAI_DESTINATIONS } from './geoService';
import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from './supabaseClient';

const DB_STORAGE_KEY = 'aeropool_production_store_v1';

export interface DatabaseState {
  users: UserProfile[];
  currentUser: UserProfile;
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
}

// Initial Seed Users for all 5 roles
export const SEED_USERS: UserProfile[] = [
  {
    id: 'user-passenger-priya',
    email: 'priya.sharma@example.com',
    fullName: 'Priya Sharma',
    phone: '+91 98201 44821',
    role: 'passenger',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'user-driver-rajesh',
    email: 'rajesh.patil@metrocab.in',
    fullName: 'Rajesh Patil',
    phone: '+91 98192 33104',
    role: 'driver',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    organizationId: 'org-metrocab-mumbai',
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: 'user-fleet-sunil',
    email: 'sunil.kadam@metrocab.in',
    fullName: 'Sunil Kadam',
    phone: '+91 98210 99823',
    role: 'fleet_operator',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    organizationId: 'org-metrocab-mumbai',
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
  },
  {
    id: 'user-admin-vikram',
    email: 'vikram.sethi@aeropool.in',
    fullName: 'Vikram Sethi (Platform Lead)',
    phone: '+91 98200 11002',
    role: 'admin',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 200 * 86400000).toISOString(),
  },
  {
    id: 'user-support-anita',
    email: 'anita.roy@aeropool.in',
    fullName: 'Anita Roy (Ops Support)',
    phone: '+91 98190 77452',
    role: 'support',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 150 * 86400000).toISOString(),
  },
];

export const SEED_ORGANIZATIONS: FleetOrganization[] = [
  {
    id: 'org-metrocab-mumbai',
    name: 'MetroCab Fleet Solutions LLP',
    businessRegNumber: 'MH-GST-27AABCM8291Q1Z4',
    contactEmail: 'operations@metrocab.in',
    contactPhone: '+91 22 2654 8890',
    status: 'approved',
    commissionRate: 15.0,
    totalVehicles: 8,
    activeDrivers: 6,
    totalTripsCompleted: 428,
    settledEarningsPaise: 48500000, // ₹4,85,000.00
    pendingSettlementPaise: 6240000, // ₹62,400.00
    joinedAt: new Date(Date.now() - 120 * 86400000).toISOString(),
  },
];

export const SEED_VEHICLES: Vehicle[] = [
  {
    id: 'veh-innova-8421',
    organizationId: 'org-metrocab-mumbai',
    plateNumber: 'MH 02 EE 8421',
    makeModel: 'Toyota Innova Crysta 2.4 VX',
    category: 'XL',
    seats: 6,
    luggageCapacity: 5,
    fuelType: 'Diesel',
    status: 'ACTIVE',
    assignedDriverId: 'user-driver-rajesh',
    assignedDriverName: 'Rajesh Patil',
  },
  {
    id: 'veh-ertiga-4190',
    organizationId: 'org-metrocab-mumbai',
    plateNumber: 'MH 03 DN 4190',
    makeModel: 'Maruti Suzuki Ertiga CNG',
    category: 'Sedan',
    seats: 4,
    luggageCapacity: 3,
    fuelType: 'CNG',
    status: 'ACTIVE',
  },
  {
    id: 'veh-nexon-ev-2980',
    organizationId: 'org-metrocab-mumbai',
    plateNumber: 'MH 01 EK 2980',
    makeModel: 'Tata Nexon EV Max Commercial',
    category: 'EV',
    seats: 4,
    luggageCapacity: 3,
    fuelType: 'EV',
    status: 'ACTIVE',
  },
];

export const SEED_DRIVERS: DriverProfile[] = [
  {
    id: 'driver-prof-rajesh',
    userId: 'user-driver-rajesh',
    fullName: 'Rajesh Patil',
    phone: '+91 98192 33104',
    email: 'rajesh.patil@metrocab.in',
    organizationId: 'org-metrocab-mumbai',
    organizationName: 'MetroCab Fleet Solutions LLP',
    verificationStatus: 'approved',
    isAvailable: true,
    rating: 4.92,
    totalTrips: 184,
    currentPoolId: 'pool-bkc-south',
    assignedVehicle: {
      id: 'veh-innova-8421',
      makeModel: 'Toyota Innova Crysta (White)',
      plateNumber: 'MH 02 EE 8421',
      category: 'XL',
      seats: 6,
      luggageLimit: 5,
    },
    earningsThisWeekPaise: 3840000, // ₹38,400.00
    totalEarningsPaise: 24500000,
    documents: [
      {
        id: 'doc-dl-rajesh',
        type: 'DRIVING_LICENSE',
        documentNumber: 'MH-0220140089123',
        fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80',
        status: 'approved',
        submittedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 88 * 86400000).toISOString(),
      },
      {
        id: 'doc-rc-rajesh',
        type: 'VEHICLE_RC',
        documentNumber: 'RC-MH02EE8421-2022',
        fileUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=400&auto=format&fit=crop&q=80',
        status: 'approved',
        submittedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 88 * 86400000).toISOString(),
      },
      {
        id: 'doc-permit-rajesh',
        type: 'COMMERCIAL_PERMIT',
        documentNumber: 'MH-RTA-ALL-MAH-4991',
        fileUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=400&auto=format&fit=crop&q=80',
        status: 'approved',
        submittedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 88 * 86400000).toISOString(),
      },
    ],
  },
  {
    id: 'driver-prof-amit',
    userId: 'user-driver-amit',
    fullName: 'Amit Verma',
    phone: '+91 97690 12845',
    email: 'amit.verma@example.com',
    verificationStatus: 'under_review',
    isAvailable: false,
    rating: 5.0,
    totalTrips: 0,
    earningsThisWeekPaise: 0,
    totalEarningsPaise: 0,
    documents: [
      {
        id: 'doc-dl-amit',
        type: 'DRIVING_LICENSE',
        documentNumber: 'MH-0320190014290',
        fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80',
        status: 'under_review',
        submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'doc-rc-amit',
        type: 'VEHICLE_RC',
        documentNumber: 'RC-MH03DN4190-2023',
        fileUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=400&auto=format&fit=crop&q=80',
        status: 'under_review',
        submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ],
  },
];

export const SEED_POOLS: RidePool[] = [
  {
    id: 'pool-bkc-south',
    airportCode: 'BOM',
    terminal: 'T2',
    pickupZone: PICKUP_ZONES[0], // T2 Level P4 East
    targetCorridor: 'Bandra - BKC - Kurla',
    departureWindowStart: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    departureWindowEnd: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    vehicleCategory: 'XL',
    totalSeats: 6,
    availableSeats: 3,
    totalLuggageCapacity: 5,
    availableLuggage: 3,
    status: 'DRIVER_EN_ROUTE',
    assignedDriverId: 'driver-prof-rajesh',
    assignedDriverName: 'Rajesh Patil',
    assignedDriverPhone: '+91 98192 33104',
    assignedDriverRating: 4.92,
    assignedVehicleId: 'veh-innova-8421',
    vehicleModel: 'Toyota Innova Crysta (White)',
    vehiclePlate: 'MH 02 EE 8421',
    driverCurrentLocation: {
      lat: 19.0945,
      lng: 72.8715,
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    },
    passengers: [
      {
        bookingId: 'book-seed-01',
        passengerId: 'user-arjun-kapoor',
        passengerName: 'Arjun Kapoor',
        passengerPhone: '+91 98330 11920',
        seatsBooked: 1,
        luggageCount: 1,
        destination: MUMBAI_DESTINATIONS[0], // BKC
        farePaidPaise: 42000, // ₹420.00
        pickupOtp: '4821',
        status: 'CONFIRMED',
      },
      {
        bookingId: 'book-seed-02',
        passengerId: 'user-neha-singh',
        passengerName: 'Neha Singh',
        passengerPhone: '+91 98110 55432',
        seatsBooked: 1,
        luggageCount: 1,
        destination: MUMBAI_DESTINATIONS[1], // Bandra West
        farePaidPaise: 48000, // ₹480.00
        pickupOtp: '7914',
        status: 'CONFIRMED',
      },
    ],
    stops: [
      {
        stopId: 'stop-pickup-1',
        type: 'PICKUP',
        passengerName: 'All Passengers',
        locationName: 'T2 Level P4 East, Bay 4 (AeroPool Lounge)',
        lat: 19.0972,
        lng: 72.8752,
        completed: false,
      },
      {
        stopId: 'stop-drop-1',
        type: 'DROPOFF',
        passengerName: 'Arjun Kapoor',
        locationName: 'Bandra Kurla Complex (BKC G Block)',
        lat: 19.0662,
        lng: 72.8688,
        completed: false,
      },
      {
        stopId: 'stop-drop-2',
        type: 'DROPOFF',
        passengerName: 'Neha Singh',
        locationName: 'Bandra West (Linking Road)',
        lat: 19.0596,
        lng: 72.8295,
        completed: false,
      },
    ],
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
  {
    id: 'pool-western-suburbs',
    airportCode: 'BOM',
    terminal: 'T2',
    pickupZone: PICKUP_ZONES[1], // T2 Level P7
    targetCorridor: 'Western Suburbs (Central)',
    departureWindowStart: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    departureWindowEnd: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
    vehicleCategory: 'Sedan',
    totalSeats: 4,
    availableSeats: 3,
    totalLuggageCapacity: 3,
    availableLuggage: 2,
    status: 'CONFIRMED',
    vehicleModel: 'Maruti Suzuki Ertiga CNG',
    vehiclePlate: 'MH 03 DN 4190',
    passengers: [
      {
        bookingId: 'book-seed-03',
        passengerId: 'user-rohit-mehra',
        passengerName: 'Rohit Mehra',
        passengerPhone: '+91 98200 44109',
        seatsBooked: 1,
        luggageCount: 1,
        destination: MUMBAI_DESTINATIONS[5], // Andheri West
        farePaidPaise: 38000,
        pickupOtp: '3391',
        status: 'CONFIRMED',
      },
    ],
    stops: [
      {
        stopId: 'stop-p7-pickup',
        type: 'PICKUP',
        passengerName: 'All Passengers',
        locationName: 'T2 Level P7 Shared Ride Hub',
        lat: 19.0965,
        lng: 72.8739,
        completed: false,
      },
      {
        stopId: 'stop-andheri-drop',
        type: 'DROPOFF',
        passengerName: 'Rohit Mehra',
        locationName: 'Andheri West (Lokhandwala)',
        lat: 19.1411,
        lng: 72.8265,
        completed: false,
      },
    ],
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'pool-t1-dom',
    airportCode: 'BOM',
    terminal: 'T1',
    pickupZone: PICKUP_ZONES[2], // T1 Curbside
    targetCorridor: 'South-Central Business District',
    departureWindowStart: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
    departureWindowEnd: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
    vehicleCategory: 'Sedan',
    totalSeats: 4,
    availableSeats: 4,
    totalLuggageCapacity: 3,
    availableLuggage: 3,
    status: 'REQUESTED',
    passengers: [],
    stops: [],
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];

export const SEED_BOOKINGS: Booking[] = [
  {
    id: 'book-seed-01',
    poolId: 'pool-bkc-south',
    passengerId: 'user-arjun-kapoor',
    passengerName: 'Arjun Kapoor',
    passengerPhone: '+91 98330 11920',
    flightNumber: '6E 5312',
    terminal: 'T2',
    pickupZoneName: 'T2 Level P4 East (AeroPool Lounge)',
    pickupInstructions: 'Exit Gate 5 or 6, take escalator to P4. Follow AeroPool signs to Pillar 4-6.',
    destination: MUMBAI_DESTINATIONS[0],
    seatsBooked: 1,
    luggageCount: 1,
    farePaise: 42000,
    savingsPaise: 28000,
    paymentId: 'pay-seed-01',
    paymentStatus: 'captured',
    bookingStatus: 'DRIVER_EN_ROUTE',
    pickupOtp: '4821',
    driverId: 'driver-prof-rajesh',
    driverName: 'Rajesh Patil',
    driverPhone: '+91 98192 33104',
    vehicleModel: 'Toyota Innova Crysta (White)',
    vehiclePlate: 'MH 02 EE 8421',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
];

export const SEED_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay-seed-01',
    bookingId: 'book-seed-01',
    passengerId: 'user-arjun-kapoor',
    passengerName: 'Arjun Kapoor',
    amountPaise: 42000,
    currency: 'INR',
    razorpayOrderId: 'order_BOM_9921_AK',
    razorpayPaymentId: 'pay_BOM_sandbox_482910',
    status: 'captured',
    paymentMethod: 'UPI',
    isSandbox: true,
    createdAt: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
  },
];

export const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-01',
    userId: 'user-passenger-priya',
    title: 'Welcome to AeroPool CSMIA',
    message: 'Your Mumbai airport shared-ride account is verified. Enter your flight number to match with co-passengers.',
    type: 'INFO',
    read: false,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-02',
    userId: 'user-driver-rajesh',
    title: 'Pool Assigned (BKC Corridor)',
    message: 'New ride pool assigned at T2 Level P4 East. 2 passengers confirmed.',
    type: 'SUCCESS',
    read: true,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

export const SEED_TICKETS: SupportTicket[] = [
  {
    id: 'ticket-101',
    userId: 'user-passenger-priya',
    userName: 'Priya Sharma',
    userRole: 'passenger',
    subject: 'Terminal 1 pickup pillar question',
    category: 'BOOKING_ISSUE',
    priority: 'MEDIUM',
    status: 'OPEN',
    messages: [
      {
        senderId: 'user-passenger-priya',
        senderName: 'Priya Sharma',
        message: 'Where is the designated waiting area if our flight lands at T1 after midnight?',
        timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
];

export const SEED_INCIDENTS: SafetyIncident[] = [
  {
    id: 'inc-01',
    bookingId: 'book-seed-01',
    reporterId: 'user-arjun-kapoor',
    reporterRole: 'passenger',
    reporterName: 'Arjun Kapoor',
    incidentType: 'ROUTE_DEVIATION',
    description: 'Driver took Western Express Highway flyover due to heavy traffic at Milan Subway, saving 10 mins.',
    severity: 'LOW',
    status: 'RESOLVED',
    resolutionNotes: 'Verified with GPS breadcrumbs. Route deviation was safe and authorized to avoid gridlock.',
    reportedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    actorId: 'system',
    actorName: 'AeroPool Match Engine',
    actorRole: 'admin',
    action: 'CREATE_POOL',
    entityType: 'POOL',
    entityId: 'pool-bkc-south',
    details: 'Initiated shared pool for T2 Bandra-BKC corridor with 6 seats.',
    timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-002',
    actorId: 'user-driver-rajesh',
    actorName: 'Rajesh Patil',
    actorRole: 'driver',
    action: 'ACCEPT_DISPATCH',
    entityType: 'POOL',
    entityId: 'pool-bkc-south',
    details: 'Driver Rajesh Patil accepted dispatch offer with vehicle MH 02 EE 8421.',
    timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
  },
];

// In-memory state synchronized with localStorage
class AeroPoolDatabase {
  private state: DatabaseState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): DatabaseState {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(DB_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.pools && parsed.currentUser) {
            if (!parsed.rideRequests) parsed.rideRequests = [];
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using initial seed data', e);
    }

    const initialState: DatabaseState = {
      users: SEED_USERS,
      currentUser: SEED_USERS[0], // Start as Passenger Priya
      driverProfiles: SEED_DRIVERS,
      vehicles: SEED_VEHICLES,
      organizations: SEED_ORGANIZATIONS,
      pools: SEED_POOLS,
      bookings: SEED_BOOKINGS,
      payments: SEED_PAYMENTS,
      safetyIncidents: SEED_INCIDENTS,
      supportTickets: SEED_TICKETS,
      auditLogs: SEED_AUDIT_LOGS,
      notifications: SEED_NOTIFICATIONS,
      rideRequests: [],
    };
    this.saveState(initialState);
    return initialState;
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
  }): { success: boolean; booking?: Booking; error?: string } {
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

    const bookingId = `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paymentId = `pay-${Date.now()}`;
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
      razorpayOrderId: `order_BOM_${bookingId.slice(-6)}`,
      razorpayPaymentId: `pay_BOM_${Math.random().toString(36).substring(2, 9)}`,
      status: 'captured',
      paymentMethod: params.paymentMethod,
      isSandbox: true,
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
          p_pool_id: pool.id,
          p_passenger_id: params.passengerId,
          p_seats: params.seats,
          p_luggage: params.luggage,
          p_flight_number: params.flightNumber,
          p_destination_name: params.destination.name,
          p_destination_address: params.destination.address,
          p_destination_corridor: params.destination.corridor,
          p_destination_lat: params.destination.latitude,
          p_destination_lng: params.destination.longitude,
          p_fare_paise: params.farePaise,
          p_savings_paise: params.savingsPaise,
          p_payment_method: params.paymentMethod,
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
    rideType: 'SHARED_POOL' | 'PRIVATE';
    paymentMethod: 'UPI' | 'Card' | 'Netbanking';
  }): { success: boolean; booking?: Booking; pool?: RidePool; error?: string } {
    const poolId = `pool-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const bookingId = `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paymentId = `pay-${Date.now()}`;
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
      totalSeats,
      availableSeats: totalSeats - params.seats,
      totalLuggageCapacity: totalLuggage,
      availableLuggage: totalLuggage - params.luggage,
      status: 'CONFIRMED',
      assignedDriverId: availableDriver.id,
      assignedDriverName: availableDriver.fullName,
      assignedDriverPhone: availableDriver.phone,
      assignedDriverRating: availableDriver.rating,
      vehicleModel: availableDriver.assignedVehicle?.makeModel || 'Toyota Innova Crysta',
      vehiclePlate: availableDriver.assignedVehicle?.plateNumber || 'MH 02 EE 8421',
      driverCurrentLocation: {
        lat: 19.0968,
        lng: 72.8745,
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
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
      driverId: availableDriver.id,
      driverName: availableDriver.fullName,
      driverPhone: availableDriver.phone,
      vehicleModel: availableDriver.assignedVehicle?.makeModel || 'Toyota Innova Crysta',
      vehiclePlate: availableDriver.assignedVehicle?.plateNumber || 'MH 02 EE 8421',
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
      razorpayOrderId: `order_BOM_${bookingId.slice(-6)}`,
      razorpayPaymentId: `pay_BOM_${Math.random().toString(36).substring(2, 9)}`,
      status: 'captured',
      paymentMethod: params.paymentMethod,
      isSandbox: true,
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

    // If completed, add driver earnings
    if (nextStatus === 'COMPLETED' && pool.assignedDriverId) {
      const driver = this.state.driverProfiles.find((d) => d.id === pool.assignedDriverId);
      if (driver) {
        const totalPoolFarePaise = pool.passengers.reduce((sum, p) => sum + p.farePaidPaise, 0);
        // Driver gets 80% of pool gross, platform fee/commission is 20%
        const driverSharePaise = Math.round(totalPoolFarePaise * 0.80);
        driver.totalTrips += 1;
        driver.earningsThisWeekPaise += driverSharePaise;
        driver.totalEarningsPaise += driverSharePaise;
      }
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
   * Cancel a passenger booking and release seat capacity back to pool
   */
  public cancelBooking(
    bookingId: string,
    reason: string,
    actorId: string,
    actorRole?: UserProfile['role']
  ): { success: boolean; error?: string } {
    const booking = this.state.bookings.find((b) => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    // Security & RBAC Enforcement: Passenger can only cancel their own booking
    if (actorRole && actorRole === 'passenger' && booking.passengerId !== actorId) {
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
   * Process refund from Admin / Support console
   */
  public processRefund(paymentId: string, amountPaise: number, reason: string, adminId: string) {
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
    reason?: string
  ) {
    const driver = this.state.driverProfiles.find((d) => d.id === driverId);
    if (!driver) return { success: false, error: 'Driver not found' };

    const doc = driver.documents.find((d) => d.id === docId);
    if (!doc) return { success: false, error: 'Document not found' };

    doc.status = status;
    doc.reviewedAt = new Date().toISOString();
    if (reason) doc.rejectionReason = reason;

    // If all docs approved, approve driver profile
    const allApproved = driver.documents.every((d) => d.status === 'approved');
    if (allApproved) {
      driver.verificationStatus = 'approved';
      driver.isAvailable = true;
    } else if (status === 'rejected') {
      driver.verificationStatus = 'rejected';
      driver.isAvailable = false;
    }

    this.state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: 'admin',
      actorName: 'Super Admin',
      actorRole: 'admin',
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
   * Reset store to initial demo state
   */
  public resetToDemoData() {
    localStorage.removeItem(DB_STORAGE_KEY);
    this.state = this.loadState();
    this.notify();
  }
}

export const db = new AeroPoolDatabase();
