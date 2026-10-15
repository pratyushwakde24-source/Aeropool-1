export type UserRole = 'passenger' | 'driver' | 'fleet_operator' | 'admin' | 'support';

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

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
  rideType: 'SHARED_POOL' | 'PRIVATE';
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
  driverCurrentLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
    isSimulated?: boolean;
  };
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
  createdAt: string;
}

export interface DriverDocument {
  id: string;
  type: 'DRIVING_LICENSE' | 'VEHICLE_RC' | 'COMMERCIAL_PERMIT' | 'POLICE_VERIFICATION';
  documentNumber: string;
  fileUrl: string;
  status: VerificationStatus;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
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
  isAvailable: boolean;
  rating: number;
  totalTrips: number;
  currentPoolId?: string;
  assignedVehicle?: {
    id: string;
    makeModel: string;
    plateNumber: string;
    category: VehicleCategory;
    seats: number;
    luggageLimit: number;
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
  seats: number;
  luggageCapacity: number;
  fuelType: 'EV' | 'CNG' | 'Petrol' | 'Diesel';
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';
  assignedDriverId?: string;
  assignedDriverName?: string;
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
  createdAt: string;
  refundedAmountPaise?: number;
  refundReason?: string;
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

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  read: boolean;
  link?: string;
  createdAt: string;
}
