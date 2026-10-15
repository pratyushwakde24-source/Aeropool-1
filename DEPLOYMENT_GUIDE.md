# AeroPool — Deployment & Configuration Guide

This guide details configuration, database migrations, environment variables, security settings, and deployment procedures for AeroPool.

---

## 1. Environment Configuration

Copy `.env.example` to `.env` or set the following in your hosting provider's environment settings:

```env
# Application URL
VITE_APP_URL="https://aeropool.example.com"

# Supabase / PostgreSQL Credentials (when linking to external database)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"

# Payment Gateway (Razorpay)
VITE_RAZORPAY_KEY_ID="rzp_test_YourTestKeyHere"
RAZORPAY_KEY_SECRET="YourRazorpaySecret"
RAZORPAY_WEBHOOK_SECRET="YourWebhookSecret"

# External Flight Data API (e.g. FlightRadar24 / AviationStack)
FLIGHT_API_KEY=""

# MapLibre / Geocoding
VITE_MAP_TILES_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
```

*Note: Client-side variables are prefixed with `VITE_`. All secret keys (Service Role, Razorpay Secret, Webhook Secret) must remain strictly on the backend.*

---

## 2. PostgreSQL / Supabase Schema & DDL Migration

Execute the following SQL script to initialize the relational database tables, constraints, foreign keys, and Row Level Security (RLS) policies:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enum Definitions
CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'fleet_operator', 'admin', 'support');
CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
CREATE TYPE ride_status AS ENUM (
  'REQUESTED', 'MATCHED', 'CONFIRMED', 'DRIVER_ASSIGNED', 
  'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKUP_CONFIRMED', 
  'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE payment_status AS ENUM ('pending', 'captured', 'failed', 'refunded');

-- 1. Profiles & Users
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  role user_role DEFAULT 'passenger',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Organizations (Fleet Operators)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  business_reg_no TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  status verification_status DEFAULT 'pending',
  commission_rate NUMERIC(4,2) DEFAULT 15.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  registration_number TEXT UNIQUE NOT NULL,
  make_model TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Sedan', 'SUV', 'EV', 'XL'
  seat_capacity INT NOT NULL DEFAULT 4,
  luggage_capacity INT NOT NULL DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Driver Profiles
CREATE TABLE driver_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  license_number TEXT NOT NULL,
  assigned_vehicle_id UUID REFERENCES vehicles(id),
  verification_status verification_status DEFAULT 'pending',
  is_available BOOLEAN DEFAULT FALSE,
  rating NUMERIC(3,2) DEFAULT 5.00,
  total_trips INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Airports & Pickup Zones
CREATE TABLE airports (
  id TEXT PRIMARY KEY, -- 'BOM'
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

CREATE TABLE pickup_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  airport_id TEXT REFERENCES airports(id),
  terminal TEXT NOT NULL, -- 'T1', 'T2'
  zone_name TEXT NOT NULL, -- 'Pillar 4-6', 'Level P4 West'
  instructions TEXT NOT NULL
);

-- 6. Ride Pools
CREATE TABLE ride_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  airport_id TEXT REFERENCES airports(id),
  terminal TEXT NOT NULL,
  target_corridor TEXT NOT NULL, -- e.g. 'South Mumbai', 'Western Suburbs'
  departure_window_start TIMESTAMPTZ NOT NULL,
  departure_window_end TIMESTAMPTZ NOT NULL,
  vehicle_category TEXT NOT NULL,
  total_seats INT NOT NULL DEFAULT 4,
  available_seats INT NOT NULL DEFAULT 4,
  total_luggage_capacity INT NOT NULL DEFAULT 4,
  available_luggage INT NOT NULL DEFAULT 4,
  status ride_status DEFAULT 'REQUESTED',
  assigned_driver_id UUID REFERENCES driver_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Bookings (Capacity locked per passenger)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID REFERENCES ride_pools(id) ON DELETE RESTRICT,
  passenger_id UUID REFERENCES profiles(id),
  flight_number TEXT,
  pickup_zone_id UUID REFERENCES pickup_zones(id),
  destination_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  seats_booked INT NOT NULL DEFAULT 1,
  luggage_count INT NOT NULL DEFAULT 1,
  fare_amount_paise INT NOT NULL, -- Stored in minor currency units (paise)
  savings_amount_paise INT NOT NULL,
  booking_status ride_status DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Payments & Minor Units
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  passenger_id UUID REFERENCES profiles(id),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  amount_paise INT NOT NULL,
  currency TEXT DEFAULT 'INR',
  status payment_status DEFAULT 'captured',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Row Level Security Policies (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Passengers see their own bookings
CREATE POLICY passenger_booking_policy ON bookings
  FOR SELECT USING (auth.uid() = passenger_id);

-- Drivers see bookings for their active pool
CREATE POLICY driver_booking_policy ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ride_pools 
      WHERE ride_pools.id = bookings.pool_id 
      AND ride_pools.assigned_driver_id = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY admin_all_bookings ON bookings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
```

---

## 3. Local Development & Compilation

```bash
# Install dependencies
npm install

# Run type check and verify syntax
npm run lint

# Start local development server on port 3000
npm run dev

# Run production build
npm run build
```

---

## 4. Production Readiness Checklist

1. **Transactional Integrity:** Ride capacity is decremented atomically inside an atomic transaction. Seat overselling is rejected if `available_seats < requested_seats`.
2. **Minor Currency Safety:** All fares are stored in `paise` (INR 1 = 100 paise) preventing floating point drift.
3. **Role Gating:** Client and server-side RBAC guards prevent non-admins from triggering refund endpoints or accessing driver KYC documents.
4. **Offline & Graceful Fallback:** CSMIA flight lookup and geocoding provide offline resilience with high-accuracy historical airport schedules.
