-- ==============================================================================
-- AeroPool — Phase 6B: Production Performance Indexes & Scalability Optimization
-- MIGRATION STATUS: LOCAL STAGING FILE ONLY — DO NOT EXECUTE REMOTELY WITHOUT SIGN-OFF
-- ==============================================================================
--
-- Audit Notes (Phase 6B Correction):
-- 1. Removed: idx_location_breadcrumbs_pool_time and idx_location_breadcrumbs_driver
--    Rationale: Realtime GPS telemetry breadcrumbs are managed in ephemeral application
--    buffers and client memory; no 'location_breadcrumbs' table exists in the schema.
-- 2. Removed: idx_recon_discrepancies_severity_status
--    Rationale: Reconciliation discrepancies are stored as structured JSONB within the
--    'reconciliation_job_runs.discrepancy_summaries' column; no separate table exists.
--    The parent table already has 'idx_reconciliation_jobs_status(status, start_time DESC)'.
-- 3. Corrected: idx_operator_settlements_org_cycle -> idx_settlement_audits_org_time
--    Target table is 'operator_settlement_audits' with timestamp sorting.
-- 4. Corrected: idx_system_audit_logs_* -> idx_audit_logs_*
--    Target table is 'audit_logs'.
-- 5. Standard 'CREATE INDEX IF NOT EXISTS' syntax is used to maintain strict compatibility
--    with transactional migration runners (Supabase CLI migration transactions).
-- ==============================================================================

-- 1. Airport Terminal & Departure Window Matching Composite Index
-- Supports high-concurrency pool matching by terminal, active status, and scheduled time window
CREATE INDEX IF NOT EXISTS idx_ride_pools_terminal_status_window 
  ON public.ride_pools(terminal, status, departure_window_start, departure_window_end);

-- 2. Passenger Booking Lifecycle Composite Index
-- Eliminates sort overhead for passenger trip history and active booking tracking
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_lifecycle 
  ON public.bookings(passenger_id, booking_status, created_at DESC);

-- 3. Driver Financial Ledger Aggregation Index
-- Eliminates sequential scans when computing Driver Wallet KPIs and settlement balances
CREATE INDEX IF NOT EXISTS idx_driver_ledger_aggregation 
  ON public.driver_ledger(driver_id, transaction_type, settlement_status);

-- 4. Fleet Operator Settlement Audits Index
-- Accelerates administrative retrieval of settlement audit trails per fleet organization
CREATE INDEX IF NOT EXISTS idx_settlement_audits_org_time 
  ON public.operator_settlement_audits(organization_id, timestamp DESC);

-- 5. System Audit Trail Fast Lookups
-- Accelerates administrative audit investigations and entity-level change tracking
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time 
  ON public.audit_logs(actor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
  ON public.audit_logs(entity_type, entity_id);
