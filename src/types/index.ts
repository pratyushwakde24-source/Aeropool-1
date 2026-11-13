export type UserRole = 'passenger' | 'driver' | 'fleet_operator' | 'admin' | 'support';

export type VerificationStatus = 'pending' | 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended';

export type RideStatus = 
  | 'REQUESTED' 
  | 'MATCHED' 
  | 'CONFIRMED' 
  | 'DRIVER_ASSIGNED' 
  | 'DRIVER_EN_ROUTE' 
  | 'DRIVER_ARRIVED' 
  | 'PICKUP_CONFIRMED' 
  | 'IN_PROGRESS' 
  | 'COMPLETED' 
  | 'CANCELLED';

export type RideType = 'SHARED_POOL' | 'PRIVATE' | 'WOMEN_ONLY_POOL';

export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded';

export type VehicleCategory = 'Sedan' | 'SUV' | 'EV' | 'XL';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  organizationId?: string; // For fleet operators & fleet drivers
  createdAt: string;
  genderSelfIdentified?: 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';
  isWomenOnlyEligible?: boolean;
  womenOnlyVerificationStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  womenOnlyVerifiedAt?: string;
}

export interface AirportTerminal {
  id: string;
  name: string;
  code: 'T1' | 'T2';
  description: string;
  airlines: string[];
}

export interface PickupZone {
  id: string;
  terminalCode: 'T1' | 'T2';
  name: string;
  pillar: string;
  floor: string;
  instructions: string;
  latitude: number;
  longitude: number;
}

export interface FlightDetails {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  scheduledArrival: string; // ISO string
  estimatedArrival: string; // ISO string
  terminal: 'T1' | 'T2';
  gate?: string;
  status: 'ON_TIME' | 'DELAYED' | 'LANDED' | 'EXPECTED';
  delayMinutes: number;
  isLiveFeed?: boolean;
  dataSource?: 'LIVE_RADAR' | 'PUBLISHED_TIMETABLE' | 'SYNTHESIZED';
}

export interface DestinationPoint {
  id: string;
  name: string;
  corridor: string; // e.g., 'South Mumbai', 'Western Suburbs', 'Navi Mumbai', 'Central'
  address: string;
  latitude: number;
  longitude: number;
  distanceKmFromCSMIA: number;
  estMinutesFromCSMIA: number;
}

export interface FareQuote {
  totalEstimatedFarePaise: number; // Stored in paise
  passengerShareFarePaise: number;
  individualBenchmarkFarePaise: number;
  savingsPaise: number;
  savingsPercentage: number;
  baseFarePaise: number;
  distanceFarePaise: number;
  timeFarePaise: number;
  airportTollPaise: number;
  platformFeePaise: number;
  gstPaise: number;
}

export interface RideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  flightDetails: FlightDetails;
  pickupZoneId: string;
  destination: DestinationPoint;
  seatsNeeded: number;
  luggageCount: number;
  maxWaitMinutes: number;
  rideType: RideType;
  isWomenOnlyEligible?: boolean;
  createdAt: string;
  status: 'PENDING' | 'MATCHED' | 'CANCELLED';
}

export interface PoolPassenger {
  bookingId: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  seatsBooked: number;
  luggageCount: number;
  destination: DestinationPoint;
  farePaidPaise: number;
  pickupOtp: string; // 4-digit code for driver verification
  status: 'CONFIRMED' | 'BOARDED' | 'DROPPED_OFF' | 'CANCELLED';
  isWomenOnlyEligible?: boolean;
}

export interface RidePool {
  id: string;
  airportCode: string;
  terminal: 'T1' | 'T2';
  pickupZone: PickupZone;
  targetCorridor: string;
  departureWindowStart: string;
  departureWindowEnd: string;
  vehicleCategory: VehicleCategory;
  totalSeats: number;
  availableSeats: number;
  totalLuggageCapacity: number;
  availableLuggage: number;
  status: RideStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedDriverRating?: number;
  assignedVehicleId?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  driverCurrentLocation?: DriverCurrentLocation;
  breadcrumbs?: LocationBreadcrumb[];
  isWomenOnlyPool?: boolean;
  poolCategory?: RideType;
  passengers: PoolPassenger[];
  stops: {
    stopId: string;
    type: 'PICKUP' | 'DROPOFF';
    passengerName: string;
    locationName: string;
    lat: number;
    lng: number;
    completed: boolean;
  }[];
  createdAt: string;
}

export type LocationSource = 'REAL_GPS' | 'SIMULATED_DEMO';

export interface LocationBreadcrumb {
  id: string;
  poolId: string;
  driverId: string;
  lat: number;
  lng: number;
  speedKmph?: number;
  heading?: number;
  accuracyMeters?: number;
  source: LocationSource;
  timestamp: string;
}

export interface DriverCurrentLocation {
  lat: number;
  lng: number;
  updatedAt: string;
  isSimulated?: boolean;
  source: LocationSource;
  speedKmph?: number;
  heading?: number;
  accuracyMeters?: number;
  isStale?: boolean;
}

export interface Booking {
  id: string;
  poolId: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  flightNumber: string;
  terminal: 'T1' | 'T2';
  pickupZoneName: string;
  pickupInstructions: string;
  destination: DestinationPoint;
  seatsBooked: number;
  luggageCount: number;
  farePaise: number;
  savingsPaise: number;
  paymentId: string;
  paymentStatus: PaymentStatus;
  bookingStatus: RideStatus;
  pickupOtp: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  rideType?: RideType;
  isWomenOnlyPool?: boolean;
  operatingMode?: 'development' | 'sandbox' | 'production';
  idempotencyKey?: string;
  createdAt: string;
}

export interface DriverDocument {
  id: string;
  type:
    | 'DRIVING_LICENSE'
    | 'DRIVING_LICENSE_FRONT'
    | 'DRIVING_LICENSE_BACK'
    | 'VEHICLE_RC'
    | 'COMMERCIAL_PERMIT'
    | 'POLICE_VERIFICATION'
    | 'VEHICLE_INSURANCE'
    | 'VEHICLE_PUC'
    | 'IDENTITY_PROOF';
  documentNumber: string;
  fileUrl: string;
  status: VerificationStatus;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  expiryDate?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  fileName?: string;
  downloadUrl?: string;
}

export type DriverLifecycleState =
  | 'OFFLINE'
  | 'GOING_ONLINE'
  | 'ONLINE_AVAILABLE'
  | 'RIDE_REQUEST_RECEIVED'
  | 'RIDE_ACCEPTED'
  | 'EN_ROUTE_PICKUP'
  | 'ARRIVED_PICKUP'
  | 'BOARDING_PASSENGERS'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'TEMPORARILY_UNAVAILABLE';

export interface DriverLastLocation {
  lat: number;
  lng: number;
  heading?: number;
  speedKmph?: number;
  accuracyMeters?: number;
  updatedAt: string;
  isStale?: boolean;
}

export interface RideOffer {
  id: string;
  poolId: string;
  driverId: string;
  driverName?: string;
  vehicleId: string;
  vehiclePlate?: string;
  terminal: 'T1' | 'T2';
  pickupZoneName: string;
  destinationName: string;
  corridor: string;
  passengerCount: number;
  totalSeatsBooked: number;
  estimatedEarningsPaise: number;
  offeredAt: string;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  rejectionReason?: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email: string;
  organizationId?: string;
  organizationName?: string;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  profilePhotoUrl?: string;
  emergencyContact?: string;
  residentialAddress?: string;
  licenseNumber?: string;
  licenseExpiryDate?: string;
  badgeNumber?: string;
  isAvailable: boolean;
  lifecycleState?: DriverLifecycleState;
  lastKnownLocation?: DriverLastLocation;
  lastGpsTimestamp?: string;
  gpsConsentGranted?: boolean;
  gpsConsentTimestamp?: string;
  rating: number;
  totalTrips: number;
  currentPoolId?: string;
  assignedVehicleId?: string;
  assignedVehicle?: {
    id: string;
    makeModel: string;
    plateNumber: string;
    category: VehicleCategory;
    color?: string;
    seats: number;
    luggageLimit: number;
    photoUrl?: string;
    rcNumber?: string;
    rcExpiryDate?: string;
    insuranceNumber?: string;
    insuranceExpiryDate?: string;
    pucNumber?: string;
    pucExpiryDate?: string;
  };
  documents: DriverDocument[];
  earningsThisWeekPaise: number;
  totalEarningsPaise: number;
}

export interface Vehicle {
  id: string;
  organizationId: string;
  plateNumber: string;
  makeModel: string;
  category: VehicleCategory;
  color?: string;
  seats: number;
  luggageCapacity: number;
  fuelType: 'EV' | 'CNG' | 'Petrol' | 'Diesel';
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE' | 'SERVICING';
  photoUrl?: string;
  rcNumber?: string;
  rcExpiryDate?: string;
  insuranceExpiryDate?: string;
  pucExpiryDate?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
}

export interface OperatorSettlementItem {
  poolId: string;
  completedAt: string;
  corridor: string;
  vehiclePlate: string;
  driverName: string;
  passengerCount: number;
  grossFarePaise: number;
  operatorSharePaise: number;
  platformFeePaise: number;
}


export type SettlementLifecycleStatus =
  | 'ACCRUED'
  | 'AVAILABLE'
  | 'SETTLEMENT_APPROVED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_CONFIRMED'
  | 'SETTLED'
  | 'PROCESSING'
  | 'PENDING_VERIFICATION';

export type DriverTransactionType =
  | 'TRIP_EARNING'
  | 'TOLL_REIMBURSEMENT'
  | 'PLATFORM_FEE_DEDUCTION'
  | 'REFUND_ADJUSTMENT'
  | 'PAYOUT_SETTLEMENT';

export interface DriverLedgerEntry {
  id: string;
  driverId: string;
  poolId?: string;
  bookingId?: string;
  transactionType: DriverTransactionType;
  grossFarePaise: number;
  platformCommissionPaise: number;
  tollReimbursementPaise: number;
  driverEarningsPaise: number;
  amountPaise: number;
  currency: 'INR';
  timestamp: string;
  settlementStatus: SettlementLifecycleStatus;
  auditReference: string;
  policyId: string;
  policyVersion: string;
  notes?: string;
  isSandbox: boolean;
}

export interface DriverWalletSummary {
  driverId: string;
  lifetimeGrossPaise: number;
  lifetimeNetEarningsPaise: number;
  lifetimeCommissionDeductedPaise: number;
  lifetimeTollReimbursementsPaise: number;
  todayEarningsPaise: number;
  weeklyEarningsPaise: number;
  monthlyEarningsPaise: number;
  accruedEarningsPaise: number;
  availableEarningsPaise: number;
  approvedEarningsPaise: number;
  paidOutEarningsPaise: number;
  refundAdjustmentsPaise: number;
  completedTripsCount: number;
  recentTransactions: DriverLedgerEntry[];
}

export interface DriverWeeklyStatement {
  statementId: string;
  driverId: string;
  driverName: string;
  reportingPeriod: {
    cycle: string;
    startDate: string;
    endDate: string;
  };
  completedTripsCount: number;
  grossFaresPaise: number;
  platformCommissionPaise: number;
  tollReimbursementsPaise: number;
  refundAdjustmentsPaise: number;
  netEarningsPaise: number;
  settlementStatus: SettlementLifecycleStatus;
  policySnapshot: {
    policyId: string;
    driverSharePercent: number;
    platformCommissionPercent: number;
    commercialApprovalStatus: string;
  };
  itemizedEntries: DriverLedgerEntry[];
  generatedAt: string;
  documentHash: string;
}

export interface OperatorSettlement {
  id: string;
  organizationId: string;
  organizationName: string;
  settlementCycle: string; // e.g. "2026-W42"
  periodStart: string;
  periodEnd: string;
  completedTripsCount: number;
  grossFaresPaise: number;
  platformCommissionPaise: number;
  netPayablePaise: number;
  adjustmentsPaise: number;
  status: SettlementLifecycleStatus;
  settlementReference: string;
  bankAccountMasked?: string;
  itemizedTrips: OperatorSettlementItem[];
  generatedAt: string;
  settledAt?: string;
  verifiedPaymentId?: string;
}

export interface FleetOrganization {
  id: string;
  name: string;
  businessRegNumber: string;
  contactEmail: string;
  contactPhone: string;
  status: VerificationStatus;
  commissionRate: number; // e.g. 15%
  totalVehicles: number;
  activeDrivers: number;
  totalTripsCompleted: number;
  settledEarningsPaise: number;
  pendingSettlementPaise: number;
  joinedAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  passengerId: string;
  passengerName: string;
  amountPaise: number;
  currency: 'INR';
  razorpayOrderId: string;
  razorpayPaymentId: string;
  status: PaymentStatus;
  paymentMethod: 'UPI' | 'Card' | 'Netbanking';
  isSandbox: boolean;
  operatingMode?: 'development' | 'sandbox' | 'production';
  idempotencyKey?: string;
  createdAt: string;
  refundedAmountPaise?: number;
  refundReason?: string;
  refundStatus?: RefundLifecycleStatus;
  refundId?: string;
  platformCommissionPaise?: number;
  driverNetPayoutPaise?: number;
}

export interface SafetyIncident {
  id: string;
  bookingId?: string;
  reporterId: string;
  reporterRole: UserRole;
  reporterName: string;
  incidentType: 'EMERGENCY_SOS' | 'ROUTE_DEVIATION' | 'DRIVER_BEHAVIOR' | 'VEHICLE_ISSUE' | 'LOST_PROPERTY';
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  resolutionNotes?: string;
  reportedAt: string;
  resolvedAt?: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  subject: string;
  category: 'BOOKING_ISSUE' | 'REFUND_REQUEST' | 'FARE_QUERY' | 'DRIVER_PARTNER' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  messages: {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: 'BOOKING' | 'POOL' | 'DRIVER' | 'FLEET' | 'PAYMENT' | 'SETTING';
  entityId: string;
  details: string;
  timestamp: string;
}

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
export type NotificationCategory = 'FLIGHT' | 'DISPATCH' | 'TRIP' | 'SETTLEMENT' | 'SYSTEM' | 'PAYMENT' | 'REFUND' | 'RECONCILIATION';

export interface AppNotification {
  id: string;
  userId: string;
  userRole?: UserRole;
  category?: NotificationCategory;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  isRead?: boolean; // Dual compatibility for read state checks
  link?: string;
  createdAt: string;
  eventId?: string; // Idempotency deduplication key
  isPushDelivered?: boolean; // In-app vs external push distinction
  metadata?: Record<string, any>;
}

export type RefundLifecycleStatus = 'REQUESTED' | 'SUBMITTED' | 'PROCESSED' | 'FAILED';

export type ReconciliationDiscrepancyType =
  | 'ORPHAN_PROVIDER_CAPTURE'
  | 'INTERNAL_CAPTURE_WITHOUT_PROVIDER'
  | 'DUPLICATE_PAYMENT_REFERENCE'
  | 'REFUND_OVERRUN'
  | 'MISSING_DRIVER_LEDGER_ENTRY'
  | 'DUPLICATE_DRIVER_LEDGER_ENTRY'
  | 'UNVERIFIED_SETTLEMENT_PAYOUT';

export interface ReconciliationDiscrepancy {
  id: string;
  type: ReconciliationDiscrepancyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  entityId: string;
  description: string;
  expectedValue: string;
  actualValue: string;
  discrepancyPaise?: number;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export type FinancialExportType = 'TRANSACTIONS' | 'REFUNDS' | 'DRIVER_LEDGER' | 'SETTLEMENTS' | 'RECONCILIATION';

export type DriverSettlementRecord = OperatorSettlement;


export interface WomenOnlyPoolConfig {
  enabled: boolean;
  nighttimeStartHour: number; // e.g. 20 (8:00 PM)
  nighttimeEndHour: number;   // e.g. 6 (6:00 AM)
  timezone: string;          // e.g. 'Asia/Kolkata'
  eligibleAirports: string[]; // e.g. ['BOM']
  eligiblePickupZones: string[];
  allowDaytimeBooking: boolean;
  requireOptInVerification: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface WomenOnlyVerificationRecord {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  status: 'pending' | 'verified' | 'rejected';
  optInTimestamp: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  selfDeclarationConfirmed: boolean;
}
