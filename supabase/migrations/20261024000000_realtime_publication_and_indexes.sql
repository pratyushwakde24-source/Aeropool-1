-- ============================================================================
-- AeroPool — Migration: Realtime Publications, Composite Indexes & Storage Hardening
-- Target: Supabase PostgreSQL (Version 15+)
-- Version: 20261024000000
-- ============================================================================

-- 1. ENABLE REPLICA IDENTITY FULL FOR REALTIME SUBSCRIPTIONS
-- Ensures complete row payloads are delivered on UPDATE/DELETE events
ALTER TABLE IF EXISTS bookings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS ride_pools REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS driver_profiles REPLICA IDENTITY FULL;

-- 2. ENABLE SUPABASE REALTIME PUBLICATION
-- Adds key operational tables to the Supabase Realtime broadcast publication idempotently
DO $$ 
DECLARE
  v_pub_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO v_pub_exists;
  IF v_pub_exists THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ride_pools') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE ride_pools;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'driver_profiles') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE driver_profiles;
    END IF;
  END IF;
END $$;

-- 3. HIGH-FREQUENCY QUERY INDEXES
CREATE INDEX IF NOT EXISTS idx_bookings_pool_passenger 
  ON bookings(pool_id, passenger_id);

CREATE INDEX IF NOT EXISTS idx_ride_pools_status_departure 
  ON ride_pools(status, departure_window_start);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_org_available 
  ON driver_profiles(organization_id, is_available);

CREATE INDEX IF NOT EXISTS idx_payments_booking_status 
  ON payments(booking_id, status);
