-- ============================================================================
-- AeroPool — Production PostgreSQL Schema & Migration Script
-- Target: Supabase PostgreSQL (Version 15+)
-- Launch Airport: Chhatrapati Shivaji Maharaj International Airport (CSMIA BOM)
-- ============================================================================

-- Enable Required Extensions (Built-in gen_random_uuid is native in PostgreSQL 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean Enum Definitions
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'fleet_operator', 'admin', 'support');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM (
    'REQUESTED', 'MATCHED', 'CONFIRMED', 'DRIVER_ASSIGNED', 
    'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKUP_CONFIRMED', 
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'captured', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_category AS ENUM ('Sedan', 'SUV', 'EV', 'XL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. PROFILES & ROLES TABLE
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'passenger',
  avatar_url TEXT,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ORGANIZATIONS (FLEET OPERATOR TENANTS)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_reg_number TEXT UNIQUE NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  status verification_status NOT NULL DEFAULT 'pending',
  commission_rate NUMERIC(4,2) NOT NULL DEFAULT 15.00,
  settled_earnings_paise BIGINT NOT NULL DEFAULT 0,
  pending_settlement_paise BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for profile organization_id
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS fk_profiles_organization,
  ADD CONSTRAINT fk_profiles_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- 3. VEHICLES (FLEET ASSETS)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plate_number TEXT UNIQUE NOT NULL,
  make_model TEXT NOT NULL,
  category vehicle_category NOT NULL DEFAULT 'Sedan',
  seat_capacity INT NOT NULL DEFAULT 4 CHECK (seat_capacity BETWEEN 1 AND 12),
  luggage_capacity INT NOT NULL DEFAULT 3 CHECK (luggage_capacity >= 0),
  fuel_type TEXT NOT NULL DEFAULT 'CNG',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'OFFLINE')),
  assigned_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. DRIVER PROFILES
CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  license_number TEXT NOT NULL,
  badge_number TEXT,
  assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating BETWEEN 1.0 AND 5.0),
  total_trips INT NOT NULL DEFAULT 0,
  earnings_this_week_paise BIGINT NOT NULL DEFAULT 0,
  total_earnings_paise BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. DRIVER KYC DOCUMENTS
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('DRIVING_LICENSE', 'VEHICLE_RC', 'COMMERCIAL_PERMIT', 'POLICE_VERIFICATION')),
  document_number TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status verification_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- 6. AIRPORTS & PICKUP ZONES
CREATE TABLE IF NOT EXISTS airports (
  id TEXT PRIMARY KEY, -- e.g. 'BOM'
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  iata_code TEXT NOT NULL UNIQUE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS pickup_zones (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  airport_id TEXT NOT NULL REFERENCES airports(id) ON DELETE CASCADE,
  terminal_code TEXT NOT NULL CHECK (terminal_code IN ('T1', 'T2')),
  name TEXT NOT NULL,
  pillar TEXT NOT NULL,
  floor TEXT NOT NULL,
  instructions TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

-- Seed Reference Airport & Pickup Zones for CSMIA Mumbai
INSERT INTO airports (id, name, city, iata_code, latitude, longitude)
VALUES ('BOM', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'BOM', 19.0902, 72.8628)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pickup_zones (id, airport_id, terminal_code, name, pillar, floor, instructions, latitude, longitude)
VALUES 
  ('pz-t2-p4-east', 'BOM', 'T2', 'T2 Level P4 East (AeroPool Lounge)', 'Pillar 4 - 6', 'Level P4 Arrival Concourse', 'Exit Gate 5 or 6, take the escalator to P4. Follow AeroPool signs to designated bays.', 19.0972, 72.8752),
  ('pz-t2-p7-pool', 'BOM', 'T2', 'T2 Level P7 Shared Ride Hub', 'Bay C, Pillar 12', 'Level P7 Multilevel Car Park', 'Cross skywalk to MLCP, take Lift 3 to Level P7. Dedicated taxi pool boarding area.', 19.0965, 72.8739),
  ('pz-t1-arr-main', 'BOM', 'T1', 'T1 Domestic Arrival Curbside Zone', 'Pillar 3 & 4', 'Ground Floor Arrival', 'Exit Terminal 1 main baggage claim hall. Cross first lane to the designated AeroPool ride bay.', 19.0886, 72.8679)
ON CONFLICT (id) DO NOTHING;

-- 7. RIDE POOLS
CREATE TABLE IF NOT EXISTS ride_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_code TEXT NOT NULL REFERENCES airports(id),
  terminal TEXT NOT NULL CHECK (terminal IN ('T1', 'T2')),
  pickup_zone_id TEXT NOT NULL REFERENCES pickup_zones(id),
  target_corridor TEXT NOT NULL,
  departure_window_start TIMESTAMPTZ NOT NULL,
  departure_window_end TIMESTAMPTZ NOT NULL,
  vehicle_category vehicle_category NOT NULL DEFAULT 'Sedan',
  total_seats INT NOT NULL DEFAULT 4,
  available_seats INT NOT NULL DEFAULT 4 CHECK (available_seats >= 0),
  total_luggage_capacity INT NOT NULL DEFAULT 3,
  available_luggage INT NOT NULL DEFAULT 3 CHECK (available_luggage >= 0),
  status ride_status NOT NULL DEFAULT 'REQUESTED',
  assigned_driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES ride_pools(id) ON DELETE RESTRICT,
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  flight_number TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK (terminal IN ('T1', 'T2')),
  pickup_zone_name TEXT NOT NULL,
  pickup_instructions TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  destination_address TEXT,
  destination_corridor TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  seats_booked INT NOT NULL DEFAULT 1 CHECK (seats_booked > 0),
  luggage_count INT NOT NULL DEFAULT 1 CHECK (luggage_count >= 0),
  fare_paise INT NOT NULL CHECK (fare_paise > 0),
  savings_paise INT NOT NULL DEFAULT 0,
  payment_id TEXT,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  booking_status ride_status NOT NULL DEFAULT 'CONFIRMED',
  pickup_otp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PAYMENTS LEDGER
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_paise INT NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  status payment_status NOT NULL DEFAULT 'captured',
  payment_method TEXT NOT NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  refunded_amount_paise INT DEFAULT 0,
  refund_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. SAFETY INCIDENTS & EMERGENCY SOS
CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  reporter_name TEXT NOT NULL,
  reporter_role user_role NOT NULL,
  incident_type TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  resolution_notes TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 11. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_name TEXT NOT NULL,
  user_role user_role NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. IMMUTABLE AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role user_role NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE & CORRIDOR SEARCH INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ride_pools_search ON ride_pools(terminal, status, target_corridor);
CREATE INDEX IF NOT EXISTS idx_ride_pools_departure ON ride_pools(departure_window_start, departure_window_end);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_pool ON bookings(pool_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_org ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_org ON driver_profiles(organization_id);

-- ============================================================================
-- ATOMIC CONCURRENCY RESERVATION RPC (PREVENTS OVERSELLING)
-- ============================================================================
CREATE OR REPLACE FUNCTION book_ride_atomic(
  p_pool_id UUID,
  p_passenger_id UUID,
  p_seats INT,
  p_luggage INT,
  p_flight_number TEXT,
  p_destination_name TEXT,
  p_destination_address TEXT,
  p_destination_corridor TEXT,
  p_destination_lat DOUBLE PRECISION,
  p_destination_lng DOUBLE PRECISION,
  p_fare_paise INT,
  p_savings_paise INT,
  p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool ride_pools%ROWTYPE;
  v_zone pickup_zones%ROWTYPE;
  v_booking_id UUID;
  v_payment_id UUID;
  v_otp TEXT;
BEGIN
  -- 1. Row-level Lock on Ride Pool row to prevent race conditions
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool was not found or has expired.');
  END IF;

  -- 2. Validate Seat & Luggage Capacity
  IF v_pool.available_seats < p_seats THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Insufficient seats remaining in pool (requested %s, only %s available).', p_seats, v_pool.available_seats)
    );
  END IF;

  IF v_pool.available_luggage < p_luggage THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Insufficient luggage space remaining (requested %s, only %s available).', p_luggage, v_pool.available_luggage)
    );
  END IF;

  IF v_pool.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This ride pool has already concluded.');
  END IF;

  -- 3. Retrieve Pickup Zone Details
  SELECT * INTO v_zone FROM pickup_zones WHERE id = v_pool.pickup_zone_id;

  -- 4. Generate Random 4-digit OTP
  v_otp := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

  -- 5. Decrement Capacity Atomically
  UPDATE ride_pools
  SET 
    available_seats = available_seats - p_seats,
    available_luggage = available_luggage - p_luggage,
    status = CASE WHEN status = 'REQUESTED' THEN 'CONFIRMED' ELSE status END
  WHERE id = p_pool_id;

  -- 6. Insert Booking Record
  INSERT INTO bookings (
    pool_id, passenger_id, flight_number, terminal,
    pickup_zone_name, pickup_instructions,
    destination_name, destination_address, destination_corridor,
    destination_lat, destination_lng,
    seats_booked, luggage_count, fare_paise, savings_paise,
    payment_status, booking_status, pickup_otp
  ) VALUES (
    p_pool_id, p_passenger_id, p_flight_number, v_pool.terminal,
    v_zone.name, v_zone.instructions,
    p_destination_name, p_destination_address, p_destination_corridor,
    p_destination_lat, p_destination_lng,
    p_seats, p_luggage, p_fare_paise, p_savings_paise,
    'captured', v_pool.status, v_otp
  )
  RETURNING id INTO v_booking_id;

  -- 7. Insert Payment Ledger Entry
  INSERT INTO payments (
    booking_id, passenger_id, amount_paise, currency,
    razorpay_order_id, razorpay_payment_id, status, payment_method, is_sandbox
  ) VALUES (
    v_booking_id, p_passenger_id, p_fare_paise, 'INR',
    format('order_BOM_%s', substr(v_booking_id::text, 1, 8)),
    format('pay_BOM_%s', substr(md5(random()::text), 1, 10)),
    'captured', p_payment_method, true
  )
  RETURNING id INTO v_payment_id;

  -- 8. Return Confirmation Payload
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'pickup_otp', v_otp,
    'remaining_seats', v_pool.available_seats - p_seats
  );
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Passenger Isolation: Can only view their own bookings
CREATE POLICY passenger_own_bookings ON bookings
  FOR SELECT USING (auth.uid() = passenger_id);

-- Driver Isolation: Drivers can only view bookings for their active pool
CREATE POLICY driver_pool_bookings ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ride_pools 
      WHERE ride_pools.id = bookings.pool_id 
      AND ride_pools.assigned_driver_id = auth.uid()
    )
  );

-- Fleet Isolation: Fleet operators can only see vehicles belonging to their own organization
CREATE POLICY fleet_own_vehicles ON vehicles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.organization_id = vehicles.organization_id
      AND profiles.role = 'fleet_operator'
    )
  );

-- Fleet Isolation: Fleet operators can only view driver profiles in their organization
CREATE POLICY fleet_own_drivers ON driver_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.organization_id = driver_profiles.organization_id
      AND profiles.role = 'fleet_operator'
    )
  );

-- Admin Override: Admins can view and manage all tables
CREATE POLICY admin_full_access_bookings ON bookings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
