-- ============================================================================
-- AeroPool — Phase 5C Migration: Driver Wallet & Financial Ledger Schema
-- Target: Supabase PostgreSQL (Version 15+)
-- Prepared: 2026-11-03
-- STATUS: LOCAL PREPARED MIGRATION ONLY (DO NOT APPLY REMOTELY WITHOUT APPROVAL)
-- ============================================================================

-- 1. DRIVER LEDGER TABLE (IMMUTABLE FINANCIAL ENTRIES)
CREATE TABLE IF NOT EXISTS driver_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_reference TEXT UNIQUE NOT NULL, -- e.g. ledg-179370...
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  pool_id UUID REFERENCES ride_pools(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'TRIP_EARNING',
      'TOLL_REIMBURSEMENT',
      'PLATFORM_FEE_DEDUCTION',
      'REFUND_ADJUSTMENT',
      'PAYOUT_SETTLEMENT'
    )
  ),
  gross_fare_paise BIGINT NOT NULL CHECK (gross_fare_paise >= 0),
  platform_commission_paise BIGINT NOT NULL CHECK (platform_commission_paise >= 0),
  toll_reimbursement_paise BIGINT NOT NULL DEFAULT 0 CHECK (toll_reimbursement_paise >= 0),
  driver_earnings_paise BIGINT NOT NULL CHECK (driver_earnings_paise >= 0),
  amount_paise BIGINT NOT NULL, -- Net delta (+ or -)
  currency TEXT NOT NULL DEFAULT 'INR',
  settlement_status TEXT NOT NULL DEFAULT 'ACCRUED' CHECK (
    settlement_status IN (
      'ACCRUED',
      'AVAILABLE',
      'SETTLEMENT_APPROVED',
      'PAYMENT_INITIATED',
      'PAYMENT_CONFIRMED',
      'SETTLED',
      'PROCESSING',
      'PENDING_VERIFICATION'
    )
  ),
  audit_reference TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  notes TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index to prevent duplicate earnings for the same completed ride pool
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_ledger_pool_unique
  ON driver_ledger(pool_id, transaction_type)
  WHERE pool_id IS NOT NULL AND transaction_type = 'TRIP_EARNING';

CREATE INDEX IF NOT EXISTS idx_driver_ledger_driver ON driver_ledger(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_ledger_created ON driver_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_ledger_status ON driver_ledger(settlement_status);

-- 2. OPERATOR SETTLEMENTS AUDIT & APPROVAL TRACKING
CREATE TABLE IF NOT EXISTS operator_settlement_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_audits_settlement ON operator_settlement_audits(settlement_id);

-- 3. ROW LEVEL SECURITY
ALTER TABLE driver_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_settlement_audits ENABLE ROW LEVEL SECURITY;

-- 3.1 DRIVER LEDGER POLICIES
-- Drivers can strictly only view their own ledger entries
DROP POLICY IF EXISTS "Drivers view own ledger" ON driver_ledger;
CREATE POLICY "Drivers view own ledger"
  ON driver_ledger
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin());

-- Fleet operators can view ledger entries for drivers in their fleet
DROP POLICY IF EXISTS "Fleet operators view fleet driver ledger" ON driver_ledger;
CREATE POLICY "Fleet operators view fleet driver ledger"
  ON driver_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM driver_profiles dp
      WHERE dp.id = driver_ledger.driver_id
        AND dp.organization_id = public.current_user_org_id()
        AND public.get_auth_role() = 'fleet_operator'
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role driver ledger access" ON driver_ledger;
CREATE POLICY "Service role driver ledger access"
  ON driver_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.2 SETTLEMENT AUDIT POLICIES
DROP POLICY IF EXISTS "Admins manage settlement audits" ON operator_settlement_audits;
CREATE POLICY "Admins manage settlement audits"
  ON operator_settlement_audits
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
