# AeroPool Phase 6D — Staging Schema & Migration History Reconciliation Report

**Document Date:** November 5, 2026  
**Audited Staging Database:** `rkuzkwggijthbqwlwnps` (`aeropool-staging.supabase.co`)  
**Host Region:** AWS Singapore (`aws-0-ap-southeast-1.pooler.supabase.com:5432`)  
**Protected Baseline Database:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED & UNACCESSED**)  
**Audit Methodology:** Authorized Read-Only PostgreSQL Catalog & Supabase CLI Inspection  
**Remote Execution Status:** **READ-ONLY AUDIT — ZERO MIGRATIONS, WRITES, OR DDL EXECUTED**  
**Final Phase 6D Verdict:** **READY FOR MIGRATION REVIEW (ALL MIGRATIONS PAUSED PENDING APPROVAL)**  

---

## 1. Executive Summary

A comprehensive, read-only reconciliation was conducted directly against the live PostgreSQL catalog and migration history of the approved staging project `rkuzkwggijthbqwlwnps`.

### Key Discoveries:
1. **Remote Migration State Identified:** Seven (7) migrations from Phase 1 through Phase 4 are currently applied to remote staging. Four (4) financial migrations (`20261103000000`, `20261103000001`, `20261103000002`, and `20261103000003`) remain **pending and unapplied**.
2. **PostgreSQL Catalog Schema Confirmed:** The absence of financial tables (`driver_ledger`, `operator_settlement_audits`, `payment_refunds`, `commission_snapshots`, `reconciliation_job_runs`, `financial_notifications`) was independently verified directly in the PostgreSQL catalog (`pg_class` / `table-stats`), confirming that their absence is due to pending migrations rather than a PostgREST cache desynchronization.
3. **Migration Dependency Chain Solved:** Performance migration `20261103000003` cannot be executed in isolation. When applied in the strict sequential order `00000 -> 00001 -> 00002 -> 00003`, all table dependencies (`driver_ledger`, `operator_settlement_audits`) are fully satisfied.
4. **Backup Classification:** The Phase 6C artifacts are definitively classified as **Logical Data Exports**, protecting transactional data but requiring DDL migrations and configuration for full disaster recovery.

---

## 2. Verified PostgreSQL Remote Staging Schema

Direct PostgreSQL catalog query (`supabase inspect db table-stats`) confirmed exactly **17 public tables** currently provisioned on the remote staging database:

| Public Table Name | Table Size | Index Size | Total Size | Est. Row Count | Catalog Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `public.processed_webhook_events` | 16 kB | 80 kB | 96 kB | 10 | **EXISTS** |
| `public.bookings` | 16 kB | 80 kB | 96 kB | 11 | **EXISTS** |
| `public.ride_pools` | 16 kB | 64 kB | 80 kB | 16 | **EXISTS** |
| `public.payments` | 16 kB | 64 kB | 80 kB | 11 | **EXISTS** |
| `public.profiles` | 16 kB | 32 kB | 48 kB | 7 | **EXISTS** |
| `public.airports` | 16 kB | 32 kB | 48 kB | 1 | **EXISTS** |
| `public.payment_orders` | 8,192 bytes | 32 kB | 40 kB | 0 | **EXISTS** |
| `public.ride_requests` | 8,192 bytes | 32 kB | 40 kB | 0 | **EXISTS** |
| `public.driver_profiles` | 8,192 bytes | 24 kB | 32 kB | 0 | **EXISTS** |
| `public.pickup_zones` | 16 kB | 16 kB | 32 kB | 3 | **EXISTS** |
| `public.audit_logs` | 16 kB | 16 kB | 32 kB | 8 | **EXISTS** |
| `public.vehicles` | 8,192 bytes | 24 kB | 32 kB | 0 | **EXISTS** |
| `public.system_health_checks` | 8,192 bytes | 16 kB | 24 kB | 0 | **EXISTS** |
| `public.organizations` | 8,192 bytes | 16 kB | 24 kB | 0 | **EXISTS** |
| `public.safety_incidents` | 8,192 bytes | 8,192 bytes | 16 kB | 0 | **EXISTS** |
| `public.driver_documents` | 8,192 bytes | 8,192 bytes | 16 kB | 0 | **EXISTS** |
| `public.support_tickets` | 8,192 bytes | 8,192 bytes | 16 kB | 0 | **EXISTS** |

### Requested Relation Verification (Task 1 Check):
- `driver_ledger`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000001`).
- `operator_settlement_audits`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000001`).
- `payment_refunds`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000000`).
- `commission_snapshots`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000000`).
- `reconciliation_job_runs`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000002`).
- `financial_notifications`: **DOES NOT EXIST** on remote PostgreSQL (Pending migration `20261103000002`).
- `audit_logs`: **EXISTS** (8 rows, Primary Key: `id`, Index: `audit_logs_pkey`).
- `ride_pools`: **EXISTS** (16 rows, Primary Key: `id`, Indexes: `ride_pools_pkey`, `idx_ride_pools_search`, `idx_ride_pools_departure`, `idx_ride_pools_status_departure`).
- `bookings`: **EXISTS** (11 rows, Primary Key: `id`, Indexes: `bookings_pkey`, `idx_bookings_passenger`, `idx_bookings_pool`, `idx_bookings_pool_passenger`, `bookings_idempotency_key_key`).

---

## 3. Remote Migration History vs. Local Migration Inventory

Direct query of `supabase_migrations.schema_migrations` on the remote database (`supabase migration list --linked`) yielded the following definitive comparison:

| Migration File Prefix | Migration Title | Local Status | Remote Status | Applied Timestamp |
| :--- | :--- | :--- | :--- | :--- |
| `20261015000000` | `aeropool_schema.sql` | Present | **APPLIED** | `2026-10-15 00:00:00` |
| `20261015000001` | `ride_requests_and_cancellation.sql` | Present | **APPLIED** | `2026-10-15 00:00:01` |
| `20261016000000` | `production_safeguards_and_persistence.sql` | Present | **APPLIED** | `2026-10-16 00:00:00` |
| `20261016000001` | `production_rls_and_rpc_alignment.sql` | Present | **APPLIED** | `2026-10-16 00:00:01` |
| `20261020000000` | `webhook_idempotency_and_security.sql` | Present | **APPLIED** | `2026-10-20 00:00:00` |
| `20261024000000` | `realtime_publication_and_indexes.sql` | Present | **APPLIED** | `2026-10-24 00:00:00` |
| `20261024000001` | `security_remediation_and_hardening.sql` | Present | **APPLIED** | `2026-10-24 00:00:01` |
| `20261103000000` | `refunds_and_financial_ledger.sql` | Present | **PENDING** | *(Not applied)* |
| `20261103000001` | `driver_wallet_and_ledger.sql` | Present | **PENDING** | *(Not applied)* |
| `20261103000002` | `financial_webhooks_notifications_reconciliation.sql` | Present | **PENDING** | *(Not applied)* |
| `20261103000003` | `production_performance_and_indexes.sql` | Present | **PENDING** | *(Not applied)* |

### Reconciliation Analysis:
- **Zero Missing Entries:** There are no remote migrations that do not exist locally.
- **Zero Migration Divergence:** The remote migration history perfectly matches local migrations up to `20261024000001`.
- **Zero Ordering Conflicts:** All four pending migrations follow a strict chronological timestamp order (`20261103000000` through `20261103000003`).

---

## 4. Migration Dependency Architecture Map

Below is the dependency map for all four pending migrations:

```
[ Remote Staging Baseline (Phase 1–4 Schema) ]
  ├── profiles, airports, pickup_zones, ride_pools, bookings, payments, audit_logs
  │
  ▼
[ 1. Migration 20261103000000_refunds_and_financial_ledger.sql ]
  ├── CREATES: payment_refunds (FK -> payments, bookings, profiles)
  └── CREATES: commission_snapshots (FK -> bookings, ride_pools, driver_profiles)
  │
  ▼
[ 2. Migration 20261103000001_driver_wallet_and_ledger.sql ]
  ├── CREATES: driver_ledger (FK -> driver_profiles, ride_pools)
  └── CREATES: operator_settlement_audits (FK -> organizations, auth.users)
  │
  ▼
[ 3. Migration 20261103000002_financial_webhooks_notifications_reconciliation.sql ]
  ├── ALTERS:  processed_webhook_events (adds retry & error tracking columns)
  ├── CREATES: reconciliation_job_runs (FK -> auth.users)
  └── CREATES: financial_notifications (FK -> auth.users)
  │
  ▼
[ 4. Migration 20261103000003_production_performance_and_indexes.sql (Corrected) ]
  ├── INDEX: idx_ride_pools_terminal_status_window  ──> ON ride_pools (Baseline)
  ├── INDEX: idx_bookings_passenger_lifecycle        ──> ON bookings (Baseline)
  ├── INDEX: idx_driver_ledger_aggregation          ──> ON driver_ledger (Created in 00001)
  ├── INDEX: idx_settlement_audits_org_time          ──> ON operator_settlement_audits (Created in 00001)
  ├── INDEX: idx_audit_logs_actor_time               ──> ON audit_logs (Baseline)
  └── INDEX: idx_audit_logs_entity                   ──> ON audit_logs (Baseline)
```

### Dependency Audit Conclusion:
- Migration `20261103000003` depends on tables created in `20261103000001` (`driver_ledger` and `operator_settlement_audits`).
- If executed sequentially in order (`00000 -> 00001 -> 00002 -> 00003`), **100% of referenced relations and columns exist**, and zero syntax or dependency errors will occur.

---

## 5. Audit of Phase 6C Backup Limitations

The backup artifacts produced in Phase 6C (`aeropool_staging_full_backup_*.json` and `aeropool_staging_restore_inserts_*.sql`) must be explicitly understood as **Logical Data Exports** and not comprehensive bare-metal database backups.

### 5.1. Protected Capabilities (What the Data Export Does Provide):
- **Transactional Row Recovery:** All 56 live rows across `profiles`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `audit_logs`, and `processed_webhook_events` can be re-inserted via the generated SQL file (`ON CONFLICT DO NOTHING`).
- **User Identity Recovery:** Basic user records (UUIDs, emails, roles, creation dates) are preserved.

### 5.2. Disaster Recovery Gaps (What is Missing for Full Infrastructure Restoration):
1. **Schema DDL:** The SQL insert dump contains zero `CREATE TABLE`, `ALTER TABLE`, or constraint statements. It assumes the schema already exists before running inserts.
2. **Row Level Security (RLS) Policies:** RLS rules defining passenger, driver, and administrator access boundaries are not included in the export.
3. **Database Functions & RPCs:** Procedural functions (e.g. `book_ride_atomic`) are not in the data export.
4. **Auth Password Hashes:** Supabase GoTrue manages encrypted password hashes internally; raw password hashes cannot be exported over REST APIs.
5. **Storage Objects:** File blobs stored in Amazon S3 buckets (`storage.objects`) are not backed up in the database dump.
6. **Extensions & System Catalogs:** Extensions (`pgcrypto`, `uuid-ossp`) are managed at the platform level.

> **Restoration Readiness Limitation:** A backup cannot be certified as fully restorable without a successful dry-run restore test in an isolated test database. Because no restore test has been executed, the Phase 6C export should be treated as a data safety net rather than a turn-key disaster recovery image.

---

## 6. Exact Pending Migration Sequence

If and when authorized by the user, the migrations must be applied in the following exact chronological sequence:

1. **Step 1:** Apply `supabase/migrations/20261103000000_refunds_and_financial_ledger.sql`
   - *Impact:* Creates `payment_refunds` and `commission_snapshots`.
2. **Step 2:** Apply `supabase/migrations/20261103000001_driver_wallet_and_ledger.sql`
   - *Impact:* Creates `driver_ledger` and `operator_settlement_audits`.
3. **Step 3:** Apply `supabase/migrations/20261103000002_financial_webhooks_notifications_reconciliation.sql`
   - *Impact:* Extends `processed_webhook_events` and creates `reconciliation_job_runs` and `financial_notifications`.
4. **Step 4:** Apply `supabase/migrations/20261103000003_production_performance_and_indexes.sql`
   - *Impact:* Creates 6 composite performance indexes on `ride_pools`, `bookings`, `driver_ledger`, `operator_settlement_audits`, and `audit_logs`.

---

## 7. Unverified Items

- **Remote DDL Execution Compatibility:** While all SQL statements have been statically verified, execution of these migrations on Supabase Cloud requires remote connectivity and DDL permissions that must be authorized by the user.
- **Remote Restore Dry-Run:** Full disaster recovery restoration has not been simulated against a separate database branch.

---

## 8. Final Safety Rule & Phase 6D Verdict

- **Final Verdict:** **READY FOR MIGRATION REVIEW**
- **Migration Execution Status:** **STRICTLY PAUSED / WITHHELD**
- **Safety Enforcement:**
  - Zero remote migrations have been executed.
  - Zero database writes or configuration alterations were performed.
  - Protected baseline `krxkxhieyqcytknixqdm` was never accessed.
  - Active staging project `rkuzkwggijthbqwlwnps` remains in an unmodified, stable state.

**Next Step Requiring User Authorization:**
> Review the pending migration sequence (`00000` -> `00001` -> `00002` -> `00003`) and grant explicit authorization when ready to proceed with controlled staging migration execution.

