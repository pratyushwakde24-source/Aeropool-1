# AeroPool — Phase 6 Database Readiness & Optimization Report

**Document Version:** 1.0.0  
**Inspection Date:** November 4, 2026  
**Auditor:** Database Administrator & PostgreSQL Performance Engineer  
**Database Reference:** `rkuzkwggijthbqwlwnps.supabase.co` (PostgreSQL 15+)  
**Baseline Project Reference:** `krxkxhieyqcytknixqdm` (Untouched & Protected)  
**Migration Execution Status:** Local Files Staged; Remote Execution Pending Explicit Authorization  

---

## 1. Database Architecture & Schema Integrity Audit

AeroPool's relational database layer is structured across 11 systematic SQL migration modules. The database enforces strict ACID transactions, foreign key referential integrity, and minor-unit currency precision (integer paise).

### 1.1 Migration History & Lineage

| Migration File | Primary Functional Purpose | Remote Execution Status |
| :--- | :--- | :--- |
| `20261015000000_aeropool_schema.sql` | Core domain entities (users, pools, bookings, vehicles) | Baseline Applied |
| `20261015000001_ride_requests_and_cancellation.sql` | Ride requests, corridor matching & cancellation rules | Baseline Applied |
| `20261016000000_production_safeguards_and_persistence.sql` | Table constraints, atomic RPC wrappers, system health | Baseline Applied |
| `20261016000001_production_rls_and_rpc_alignment.sql` | Row-Level Security alignment and RPC security definers | Baseline Applied |
| `20261020000000_webhook_idempotency_and_security.sql` | Webhook idempotency and payment order tracking | Baseline Applied |
| `20261024000000_realtime_publication_and_indexes.sql` | Realtime publications (`gps:*`, `pool:*`) and indexes | Baseline Applied |
| `20261024000001_security_remediation_and_hardening.sql` | Security definer functions and search path protections | Baseline Applied |
| `20261103000000_refunds_and_financial_ledger.sql` | Refund lifecycle, credit notes & commission snapshots | Local Staged |
| `20261103000001_driver_wallet_and_ledger.sql` | Driver financial ledger and fleet settlement audits | Local Staged |
| `20261103000002_financial_webhooks_notifications_reconciliation.sql` | Webhook recovery, dead-letter, notification tables | Local Staged |
| `20261103000003_production_performance_and_indexes.sql` | High-concurrency composite indexes (Phase 6) | Local Staged |

---

## 2. Row-Level Security (RLS) & Tenant Isolation Review

### 2.1 Enforced Policies
1. **Passenger Isolation:**
   - Table `bookings`: Passengers can only select rows where `auth.uid() = passenger_id`.
   - Table `payment_orders`: Read access strictly restricted to the owning `passenger_id`.
   - Table `payment_refunds`: Passengers can only view refunds associated with their own `passenger_id`.
2. **Driver Isolation:**
   - Table `driver_ledger`: Drivers can only query ledger entries where `driver_id = auth.uid()`.
   - Table `location_breadcrumbs`: Write operations restricted to the authenticated driver assigned to the active pool.
3. **Fleet Tenant Isolation:**
   - Table `vehicles` and `driver_profiles`: Queries restricted to `organization_id = (SELECT tenant_id FROM app_metadata)`. Cross-operator data leakage is strictly blocked at the database engine level.
4. **Super Admin Access:**
   - Administrative endpoints utilize the secure `authMiddleware.ts` validating the `admin` role from JWT `app_metadata`. RLS bypass is granted exclusively through secure server RPCs executing under `SECURITY DEFINER` with fixed `search_path = public`.

---

## 3. High-Concurrency Performance Indexes Prepared (Phase 6)

In anticipation of production traffic spikes (up to 10,000 concurrent airport passengers and drivers), local migration script `20261103000003_production_performance_and_indexes.sql` was prepared with the following composite indexes:

```sql
-- 1. Optimized Route Telemetry & Breadcrumb Navigation Indexes
CREATE INDEX IF NOT EXISTS idx_location_breadcrumbs_pool_time 
  ON location_breadcrumbs(pool_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_location_breadcrumbs_driver 
  ON location_breadcrumbs(driver_id, timestamp DESC);

-- 2. Ride Request Matching Composite Indexes
CREATE INDEX IF NOT EXISTS idx_ride_pools_terminal_status_window 
  ON ride_pools(terminal, status, departure_window_start, departure_window_end);

-- 3. Passenger Booking Lifecycle Composite Index
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_lifecycle 
  ON bookings(passenger_id, booking_status, created_at DESC);

-- 4. Driver Financial Ledger Aggregation Index
CREATE INDEX IF NOT EXISTS idx_driver_ledger_aggregation 
  ON driver_ledger(driver_id, transaction_type, settlement_status);

-- 5. Fleet Operator Settlement Cycle Index
CREATE INDEX IF NOT EXISTS idx_operator_settlements_org_cycle 
  ON operator_settlements(organization_id, settlement_cycle);

-- 6. Audit Trail Fast Lookups
CREATE INDEX IF NOT EXISTS idx_system_audit_logs_actor_time 
  ON system_audit_logs(actor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_entity 
  ON system_audit_logs(entity_type, entity_id);

-- 7. Automated Reconciliation Discrepancy Index
CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_severity_status 
  ON reconciliation_discrepancies(severity, status, detected_at DESC);
```

### Performance Benefits:
* **Pool Search Latency:** Reduces terminal matching queries from $O(N)$ sequential table scans to $O(\log N)$ B-tree index seeks.
* **Driver Wallet KPI Computation:** Composite index `idx_driver_ledger_aggregation` eliminates full-table scans when calculating lifetime, weekly, and daily earnings.
* **Breadcrumb Polling:** Eliminates CPU spikes during live passenger tracking by indexing `(pool_id, timestamp DESC)`.

---

## 4. Query Performance & Anti-Pattern Inspection

| Inspection Item | Risk Identified | Codebase Guard / Remediation |
| :--- | :--- | :--- |
| **Unbounded Queries** | Endpoints fetching full tables | All order, refund, and notification endpoints enforce `limit` and `offset` pagination (`getPaginatedServerOrders`). |
| **N+1 Query Problem** | Loop queries for pool passengers | Solved via JSON aggregation in `advance_ride_status_atomic` and `book_ride_atomic` stored procedures. |
| **SQL Injection** | Dynamic SQL string concatenation | Zero raw SQL string interpolation in application services. PostgREST parameterization and strict TypeScript ORM types enforced. |
| **Integer Minor Units** | Floating-point rounding inaccuracies | Currency stored exclusively in integer paise (`BIGINT` / `INTEGER`). Floating-point money types are completely prohibited. |

---

## 5. Staging Migration Execution Runbook

When authorized by the project owner to execute remote migrations on staging (`rkuzkwggijthbqwlwnps`), the sequential execution command is:

```bash
# Verify project linkage (Staging Only)
npx supabase link --project-ref rkuzkwggijthbqwlwnps

# Apply staged financial and performance migrations
npx supabase db push
```

**MANDATORY SAFETY REMINDER:** Never run `supabase db push` against the baseline reference `krxkxhieyqcytknixqdm`.

