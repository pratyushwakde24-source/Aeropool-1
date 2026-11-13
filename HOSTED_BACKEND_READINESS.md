# AeroPool — Hosted Backend & Remote Database Readiness Report

**Audit Date:** October 2026  
**Environment Target:** Hosted Supabase PostgreSQL (Project ID: `krxkxhieyqcytknixqdm`)  
**Operating Mode:** `sandbox`  
**Execution Authority:** Antigravity Engineering

---

## 1. Executive Summary & Verification Verdict

A live diagnostic probe was executed against the hosted Supabase infrastructure using the configured endpoint (`https://krxkxhieyqcytknixqdm.supabase.co`) and service credentials.

| Subsystem | Live Probe Status | Latency / Metric | Current Operational State |
| :--- | :---: | :---: | :--- |
| **GoTrue Authentication** | **OPERATIONAL** | 1024 ms | Remote endpoint responsive; JWT parsing and session management active. |
| **PostgreSQL Schema Tables** | **MIGRATIONS PENDING** | N/A | 17 required relational tables missing from remote database. |
| **RPC Stored Procedures** | **MIGRATIONS PENDING** | N/A | 5 atomic RPC functions (booking, cancellation, dispatch, status, webhook claim) pending. |
| **Persistence Engine** | **ACTIVE (Dual-Mode)** | < 1 ms | Operating on transactional capacity-locked store until approval. |
| **Local Docker Dependency** | **ELIMINATED** | 0 ms | Platform runs independently without local Docker daemon block. |

> [!IMPORTANT]
> **Database Deployment Policy Adherence:**  
> In strict accordance with User Working Rule 12, **no remote DDL, schema migrations, `supabase db push`, or data writes were performed**. The remote database remains untouched pending explicit review and approval of the deployment plan detailed below.

---

## 2. Remote Database vs Local Migrations Comparison

Comparison between the hosted PostgreSQL project and the 5 migration files in `supabase/migrations/`:

### Migration 1: `20261015000000_aeropool_schema.sql`
- **Scope:** Core relational foundation, enums (`user_role`, `ride_status`, `payment_status`, `vehicle_category`), extensions (`uuid-ossp`, `pgcrypto`).
- **Tables defined:** `profiles`, `organizations`, `vehicles`, `driver_profiles`, `driver_documents`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `safety_incidents`, `support_tickets`, `audit_logs`.
- **Remote DB Status:** **Pending**. Neither tables nor enums are yet deployed on remote PostgreSQL instance.

### Migration 2: `20261015000001_ride_requests_and_cancellation.sql`
- **Scope:** Passenger ride request ledger (`ride_requests`), multi-factor matching indexes (`idx_ride_requests_corridor`), RLS policies for passenger isolation, and atomic cancellation RPC (`cancel_booking_atomic`).
- **Remote DB Status:** **Pending**.

### Migration 3: `20261016000000_production_safeguards_and_persistence.sql`
- **Scope:** System health checks audit table (`system_health_checks`), idempotency columns (`idempotency_key` on `bookings` and `payments`), financial integrity constraints (`check_production_payment_id` preventing mock tokens in production), and atomic driver assignment RPC (`assign_driver_to_pool_atomic`).
- **Remote DB Status:** **Pending**.

### Migration 4: `20261016000001_production_rls_and_rpc_alignment.sql`
- **Scope:** RLS hardening on all tables, recursion-safe security definer helper functions (`get_auth_role()`, `is_admin()`, `is_staff()`, `current_user_org_id()`), column type safety alignment (`pickup_zones.id` as `TEXT`), metadata columns on `bookings` (`driver_name`, `vehicle_plate`, etc.), and 17-parameter atomic booking RPC (`book_ride_atomic`) dropping legacy 13-parameter signature.
- **Remote DB Status:** **Pending**.

### Migration 5: `20261020000000_webhook_idempotency_and_security.sql`
- **Scope:** Persistent webhook idempotency table (`processed_webhook_events`), server payment orders reconciliation table (`payment_orders`), RLS service-role isolation, and atomic transactional claim RPC (`claim_webhook_event_atomic`).
- **Remote DB Status:** **Pending**.

---

## 3. Remote Schema Inspection Findings

```
[LIVE PROBE RESULTS]
Target Supabase URL: https://krxkxhieyqcytknixqdm.supabase.co
Target Project Ref:  krxkxhieyqcytknixqdm
GoTrue Auth Health:  HTTP 200 OK (Responsive)

Table Audit (SELECT limit 1):
  ❌ Table 'airports'                  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'pickup_zones'              — 42P01 / PGRST205 (Not Found)
  ❌ Table 'profiles'                  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'organizations'             — 42P01 / PGRST205 (Not Found)
  ❌ Table 'vehicles'                  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'driver_profiles'           — 42P01 / PGRST205 (Not Found)
  ❌ Table 'driver_documents'          — 42P01 / PGRST205 (Not Found)
  ❌ Table 'ride_pools'                — 42P01 / PGRST205 (Not Found)
  ❌ Table 'bookings'                  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'payments'                  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'ride_requests'             — 42P01 / PGRST205 (Not Found)
  ❌ Table 'safety_incidents'          — 42P01 / PGRST205 (Not Found)
  ❌ Table 'support_tickets'           — 42P01 / PGRST205 (Not Found)
  ❌ Table 'system_health_checks'      — 42P01 / PGRST205 (Not Found)
  ❌ Table 'audit_logs'                — 42P01 / PGRST205 (Not Found)
  ❌ Table 'processed_webhook_events'  — 42P01 / PGRST205 (Not Found)
  ❌ Table 'payment_orders'            — 42P01 / PGRST205 (Not Found)
```

---

## 4. Supabase UI Restriction Compliance

- **User Interface Scrub:** The "Supabase / Database Status" button in the primary header and mobile navigation drawer has been completely removed.
- **Modal Decoupling:** `SupabaseStatusModal` is no longer imported or mounted in `App.tsx`.
- **Zero Exposure:** Database connection strings, Project IDs, and anonymous keys are never displayed anywhere in passenger, driver, fleet, or admin views.
- **Architecture Stance:** Supabase is strictly maintained as an internal backend dependency, preserving AeroPool as a clean, standalone mobility product.

---

## 5. Safe Migration Deployment Plan (Awaiting User Approval)

When approved by the user, migrations should be applied in this exact sequential order via Supabase SQL Editor or authorized deployment pipeline:

1. **Step 1:** Run `20261015000000_aeropool_schema.sql` (Creates extensions, enums, base tables, FKs, initial RLS).
2. **Step 2:** Run `20261015000001_ride_requests_and_cancellation.sql` (Adds `ride_requests` and `cancel_booking_atomic`).
3. **Step 3:** Run `20261016000000_production_safeguards_and_persistence.sql` (Adds `system_health_checks`, idempotency keys, `assign_driver_to_pool_atomic`).
4. **Step 4:** Run `20261016000001_production_rls_and_rpc_alignment.sql` (Applies security helper functions, aligns `pickup_zones.id` to TEXT, updates `book_ride_atomic` to 17 params).
5. **Step 5:** Run `20261020000000_webhook_idempotency_and_security.sql` (Creates `processed_webhook_events`, `payment_orders`, `claim_webhook_event_atomic`).
6. **Step 6 (Verification):** Run `npm run verify:db` to confirm all 15 tables and 4 RPCs return green.
