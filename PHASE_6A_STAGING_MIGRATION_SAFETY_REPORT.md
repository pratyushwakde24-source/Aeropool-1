# AeroPool Phase 6A — Database Migration Safety Review Report

**Document Date:** November 4, 2026  
**Audited Migration File:** `supabase/migrations/20261103000003_production_performance_and_indexes.sql`  
**Execution Status:** **LOCAL FILE ONLY — STRICTLY NOT EXECUTED ON REMOTE DATABASE**  
**Auditor:** FinTech Systems & Database Infrastructure Architect  
**Overall Migration Classification:** **FAILED (CRITICAL SCHEMA INCONSISTENCY — DO NOT EXECUTE)**  

---

## 1. Executive Summary & Critical Pre-Execution Finding

A thorough line-by-line static analysis of `supabase/migrations/20261103000003_production_performance_and_indexes.sql` against the existing local migration history (`20261015000000` through `20261103000002`) and the live database schema has identified **critical relational discrepancies**:

> [!CAUTION]
> **5 of the 9 index statements target tables that DO NOT EXIST in the PostgreSQL schema.**  
> If this migration script were executed on the active staging database (`rkuzkwggijthbqwlwnps`), the PostgreSQL transaction would immediately fail with fatal errors (`ERROR: relation does not exist`), halting the migration process.
> **Under no circumstances should this migration be run in its current state.**

---

## 2. Statement-by-Statement SQL Safety Analysis

Below is the exhaustive audit of every index definition in `20261103000003_production_performance_and_indexes.sql`:

| # | Statement in Migration File | Target Table & Columns | Schema Audit Finding | Safety Verdict |
| :- | :--- | :--- | :--- | :--- |
| **1** | `CREATE INDEX IF NOT EXISTS idx_location_breadcrumbs_pool_time ON location_breadcrumbs(pool_id, timestamp DESC);` | `location_breadcrumbs`<br>`(pool_id, timestamp DESC)` | **Table `location_breadcrumbs` does NOT exist in the schema.** Telemetry tracking was implemented via client state and simulated pings; no SQL table exists. Execution will abort with `relation "location_breadcrumbs" does not exist`. | **FAILED** |
| **2** | `CREATE INDEX IF NOT EXISTS idx_location_breadcrumbs_driver ON location_breadcrumbs(driver_id, timestamp DESC);` | `location_breadcrumbs`<br>`(driver_id, timestamp DESC)` | **Table `location_breadcrumbs` does NOT exist in the schema.** | **FAILED** |
| **3** | `CREATE INDEX IF NOT EXISTS idx_ride_pools_terminal_status_window ON ride_pools(terminal, status, departure_window_start, departure_window_end);` | `ride_pools`<br>`(terminal, status, departure_window_start, departure_window_end)` | Columns exist on `ride_pools`. Note: Partial overlap with existing indexes `idx_ride_pools_search(terminal, status, target_corridor)` and `idx_ride_pools_departure(departure_window_start, departure_window_end)`. | **READY WITH CONDITIONS** |
| **4** | `CREATE INDEX IF NOT EXISTS idx_bookings_passenger_lifecycle ON bookings(passenger_id, booking_status, created_at DESC);` | `bookings`<br>`(passenger_id, booking_status, created_at DESC)` | Columns exist on `bookings`. Refines existing index `idx_bookings_passenger(passenger_id, booking_status)`. | **READY** |
| **5** | `CREATE INDEX IF NOT EXISTS idx_driver_ledger_aggregation ON driver_ledger(driver_id, transaction_type, settlement_status);` | `driver_ledger`<br>`(driver_id, transaction_type, settlement_status)` | Columns exist on `driver_ledger` (created in `20261103000001_driver_wallet_and_ledger.sql`). Accelerates driver wallet aggregation queries. | **READY** |
| **6** | `CREATE INDEX IF NOT EXISTS idx_operator_settlements_org_cycle ON operator_settlements(organization_id, settlement_cycle);` | `operator_settlements`<br>`(organization_id, settlement_cycle)` | **Table `operator_settlements` does NOT exist.** In `20261103000001_driver_wallet_and_ledger.sql`, the table is named `operator_settlement_audits`, and its columns are `settlement_period_start`, `settlement_period_end`, etc. Execution will abort. | **FAILED** |
| **7** | `CREATE INDEX IF NOT EXISTS idx_system_audit_logs_actor_time ON system_audit_logs(actor_id, timestamp DESC);` | `system_audit_logs`<br>`(actor_id, timestamp DESC)` | **Table `system_audit_logs` does NOT exist.** In `20261015000000_aeropool_schema.sql`, the table is named `audit_logs`. Execution will abort. | **FAILED** |
| **8** | `CREATE INDEX IF NOT EXISTS idx_system_audit_logs_entity ON system_audit_logs(entity_type, entity_id);` | `system_audit_logs`<br>`(entity_type, entity_id)` | **Table `system_audit_logs` does NOT exist.** | **FAILED** |
| **9** | `CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_severity_status ON reconciliation_discrepancies(severity, status, detected_at DESC);` | `reconciliation_discrepancies`<br>`(severity, status, detected_at DESC)` | **Table `reconciliation_discrepancies` does NOT exist.** In `20261103000002_financial_webhooks_notifications_reconciliation.sql`, discrepancies are stored within `reconciliation_job_runs.discrepancy_summaries` (JSONB). Execution will abort. | **FAILED** |

---

## 3. Database Locking & Concurrency Assessment

1. **Table Locking Risks:**
   - All statements currently use standard `CREATE INDEX IF NOT EXISTS ...`.
   - In PostgreSQL, standard `CREATE INDEX` acquires a **`SHARE` lock** on the target table. While reads (`SELECT`) can continue, all write operations (`INSERT`, `UPDATE`, `DELETE`) are blocked until index construction completes.
   - For tables with active traffic (`bookings`, `ride_pools`, `driver_ledger`), running non-concurrent indexing on staging or production could cause query timeouts or transaction deadlocks.
2. **`CREATE INDEX CONCURRENTLY` Constraints:**
   - To avoid write blocking, production PostgreSQL indexes should use `CREATE INDEX CONCURRENTLY`.
   - **Crucial Caveat:** `CREATE INDEX CONCURRENTLY` cannot be executed inside a multi-statement transaction block (`BEGIN ... COMMIT`).
   - If migrations are applied via the Supabase CLI (`supabase db push` or `supabase migration up`), Supabase automatically wraps individual migration files in a single transaction. Running `CONCURRENTLY` inside an automated transactional migration tool will throw:  
     `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`.
   - **Resolution:** For staging, standard `CREATE INDEX` during an off-peak maintenance window is acceptable given current low record volumes (< 100,000 rows). For high-scale production, individual index statements must be applied outside of transaction blocks via direct connection pooling.

---

## 4. Dependencies, Ordering & Conflict Analysis

### 4.1. Migration Dependency Chain:
1. `20261015000000_aeropool_schema.sql`: Establishes core tables (`profiles`, `organizations`, `vehicles`, `driver_profiles`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `audit_logs`).
2. `20261015000001_ride_requests_and_cancellation.sql`: Adds `ride_requests`.
3. `20261016000000_production_safeguards_and_persistence.sql`: Adds `system_health_checks`.
4. `20261016000001_production_rls_and_rpc_alignment.sql`: RLS alignment.
5. `20261020000000_webhook_idempotency_and_security.sql`: Adds `processed_webhook_events` and `payment_orders`.
6. `20261024000000_realtime_publication_and_indexes.sql`: Adds Supabase Realtime publication.
7. `20261024000001_security_remediation_and_hardening.sql`: Security hardening and RPC functions.
8. `20261103000000_refunds_and_financial_ledger.sql`: Adds `payment_refunds` and `commission_snapshots`.
9. `20261103000001_driver_wallet_and_ledger.sql`: Adds `driver_ledger` and `operator_settlement_audits`.
10. `20261103000002_financial_webhooks_notifications_reconciliation.sql`: Adds `reconciliation_job_runs` and `financial_notifications`.
11. `20261103000003_production_performance_and_indexes.sql`: **Contains mismatched table names.**

### 4.2. Conflict & Duplication Analysis:
- `ride_pools`: Already possesses `idx_ride_pools_search(terminal, status, target_corridor)` and `idx_ride_pools_departure(departure_window_start, departure_window_end)`. Index #3 is redundant if the composite query doesn't strictly filter on all 4 fields simultaneously.
- `bookings`: Already possesses `idx_bookings_passenger(passenger_id, booking_status)`. Adding `created_at DESC` provides minor sorting optimization for trip history.

---

## 5. Destructive Statement & Financial Integrity Check

- **Destructive Statements:** Zero `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `ALTER TABLE ... DROP CONSTRAINT` statements are present. The file is non-destructive.
- **Financial / Authentication Data:** No mutations or modifications to financial balances, ledger rows, payment orders, or auth users are performed.
- **Data Integrity Risk:** Low risk of data corruption, but **high risk of migration failure** due to syntax errors on missing relations.

---

## 6. Recommended Corrective SQL Patch

Prior to any execution, `20261103000003_production_performance_and_indexes.sql` must be modified to align with the true schema:

```sql
-- ==============================================================================
-- AeroPool — Phase 6: Corrected Production Performance Indexes
-- ==============================================================================

-- 1. Ride Request Matching Composite Index
CREATE INDEX IF NOT EXISTS idx_ride_pools_terminal_status_window 
  ON public.ride_pools(terminal, status, departure_window_start, departure_window_end);

-- 2. Passenger Booking Lifecycle Composite Index
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_lifecycle 
  ON public.bookings(passenger_id, booking_status, created_at DESC);

-- 3. Driver Financial Ledger Aggregation Index
CREATE INDEX IF NOT EXISTS idx_driver_ledger_aggregation 
  ON public.driver_ledger(driver_id, transaction_type, settlement_status);

-- 4. Corrected Fleet Operator Settlement Audit Index
CREATE INDEX IF NOT EXISTS idx_settlement_audits_org_period 
  ON public.operator_settlement_audits(organization_id, settlement_period_start, settlement_period_end);

-- 5. Corrected Audit Trail Lookups (table is audit_logs, not system_audit_logs)
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time 
  ON public.audit_logs(actor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
  ON public.audit_logs(entity_type, entity_id);

-- 6. Corrected Reconciliation Job Index
CREATE INDEX IF NOT EXISTS idx_reconciliation_jobs_created 
  ON public.reconciliation_job_runs(status, created_at DESC);
```

---

## 7. Migration Safety Summary & Verdict

| Assessment Dimension | Rating | Description |
| :--- | :--- | :--- |
| **SQL Syntax Validity** | **FAILED** | 5 statements reference non-existent tables |
| **Data Safety & Non-Destructiveness** | **READY** | Zero DROP or data-altering statements |
| **Table Lock Safety** | **READY WITH CONDITIONS** | Standard `CREATE INDEX` acceptable for staging; requires low-traffic window |
| **Overall Migration Execution Verdict** | **BLOCKED** | Execution must be withheld until the migration file is patched and approved |

