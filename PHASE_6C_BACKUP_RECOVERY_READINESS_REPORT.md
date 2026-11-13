# AeroPool Phase 6C — Staging Backup & Recovery Readiness Audit Report

**Document Date:** November 4, 2026  
**Audited Staging Target:** `rkuzkwggijthbqwlwnps` (`aeropool-staging`)  
**Protected Baseline Target:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED & UNACCESSED**)  
**Audit Purpose:** Verify backup and disaster recovery readiness prior to any remote staging migration  
**Remote Execution Status:** **READ-ONLY AUDIT — ZERO REMOTE WRITES OR DDL EXECUTED**  
**Final Report Verdict:** **READY FOR REVIEW (REMOTE MIGRATION GATE: BLOCKED PENDING MANUAL BACKUP)**  

---

## 1. Verified Facts

Through direct, read-only static analysis of local configuration files, environment definitions, and migration files, the following facts have been independently established:

1. **Target Project Identity Confirmed:**
   - Active Staging Reference: `rkuzkwggijthbqwlwnps`
   - Active Project Name: `aeropool-staging`
   - Active Organization ID: `aaarowzyxaifrhsqjtbz`
   - Active Pooler Host: `aws-0-ap-southeast-1.pooler.supabase.com:5432` (AWS Singapore region)
   - Configuration Source: `supabase/.temp/linked-project.json`, `supabase/.temp/project-ref`, and `.env`
2. **Protected Baseline Complete Isolation:**
   - Protected Baseline ID: `krxkxhieyqcytknixqdm`
   - Status: **Zero references** in `.env`, `supabase/.temp/`, runtime code, or active configurations. It is completely isolated and protected.
3. **Phase 6B Migration Integrity & Hash:**
   - Target Migration: `supabase/migrations/20261103000003_production_performance_and_indexes.sql`
   - SHA-256 Hash: `4F0FE8F05A544B39A5355D9BDF581F8B29E61576DDF91D0B06C70AEF1600CDA7`
   - File Size: `2,928 bytes`
   - Last Modified: `2026-11-04 14:21:24 IST`
   - Contents: 6 valid composite indexes on verified existing tables (`ride_pools`, `bookings`, `driver_ledger`, `operator_settlement_audits`, `audit_logs`). Zero destructive statements.
4. **Git Repository State:**
   - Branch: `main`
   - No unrelated files modified during Phase 6B or 6C.
5. **Quality Gates Passed:**
   - TypeScript: `0 errors`
   - Automated Test Suite: `195 / 195 passing (100%)`
   - Vite Production Build: `Clean (8.67s)`

---

## 2. Unverified Items (Why the Migration Gate is BLOCKED)

In strict accordance with audit rules, we do not assume a backup exists merely because cloud infrastructure provides backup features. From our local environment, the following cannot be verified without browser access to the Supabase Cloud Console:

| Dimension | Verification Limitation | Impact on Staging Safety |
| :--- | :--- | :--- |
| **Active Snapshot Existence** | Management API tokens are not stored in repository; automated daily backup timestamps cannot be inspected via local CLI. | Unknown whether a snapshot has been taken within the last 24 hours. |
| **Point-in-Time Recovery (PITR)** | PITR is an optional Supabase add-on. Cannot determine from local files whether PITR is enabled for `rkuzkwggijthbqwlwnps`. | Without PITR, recovery relies on daily snapshots (up to a 24-hour data loss window). |
| **Snapshot Restore Verification** | No destructive restore test has been run against staging. | Restore integrity must be verified through manual dashboard inspection. |
| **Storage Bucket Backups** | Driver documents (`private-storage://`) and assets reside in cloud storage; bucket backup state is unverified locally. | Storage metadata is tied to database rows. |

---

## 3. Supabase Cloud Backup & PITR Capabilities (Read-Only Assessment)

Based on Supabase architecture on AWS Singapore (`aws-0-ap-southeast-1`):

1. **Daily Automated Backups:**
   - On Supabase Pro / Team plans, automated daily physical database backups are executed during low-traffic windows (typically 00:00–04:00 UTC) and retained for 7 to 30 days.
   - On Supabase Free tier, downloadable daily backup snapshots are not available in the dashboard; projects pause after inactivity.
2. **Point-In-Time Recovery (PITR):**
   - Continuously archives PostgreSQL Write-Ahead Logs (WAL) via WAL-G/pgBackRest to Amazon S3.
   - Allows point-in-time rollbacks to any second within the retention window (typically 7 days).
3. **Manual CLI / Dashboard SQL Exports:**
   - Independent of plan tier, complete schema and data dumps can be exported using `pg_dump` or `supabase db dump`.

---

## 4. Exact Manual Steps for the User to Create & Verify a Recoverable Backup

Before approving any remote migration against `rkuzkwggijthbqwlwnps`, execute the following steps:

### Option A: Via Supabase Dashboard (Recommended)
1. Navigate to: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/database/backups/scheduled`
2. Inspect the **Scheduled Backups** list:
   - Verify that the latest backup status is **Completed**.
   - Note the exact UTC timestamp of the latest snapshot.
   - Click **Download** if available to store a local copy of the snapshot (`.dump` / `.sql`).
3. Navigate to **Point in time (PITR)** tab:
   - Check if PITR is **Enabled** or **Not Enabled**.
   - If enabled, note the earliest available restore time.
4. If on Free tier or no fresh snapshot exists within 4 hours, trigger a manual export via SQL Editor or CLI (Option B).

### Option B: Via Local Terminal using `pg_dump` (Zero-Risk Snapshot)
If you have `pg_dump` installed locally, run this command to produce an immediate point-in-time snapshot of the public schema:

```bash
pg_dump "postgresql://postgres.rkuzkwggijthbqwlwnps:[YOUR_DB_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --schema=public \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  -f "aeropool_staging_backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql"
```

---

## 5. Restoration Procedure & Data-Loss Window Analysis

### 5.1. Restoration Procedure
If migration `20261103000003` were to fail or cause unexpected locking:

1. **Targeted DDL Rollback (Fastest & Zero Data Loss):**
   - Because migration `20261103000003` only creates indexes, a rollback does **not require a database restore**.
   - Executing the following SQL immediately drops all newly created indexes with zero data loss:
     ```sql
     DROP INDEX IF EXISTS public.idx_ride_pools_terminal_status_window;
     DROP INDEX IF EXISTS public.idx_bookings_passenger_lifecycle;
     DROP INDEX IF EXISTS public.idx_driver_ledger_aggregation;
     DROP INDEX IF EXISTS public.idx_settlement_audits_org_time;
     DROP INDEX IF EXISTS public.idx_audit_logs_actor_time;
     DROP INDEX IF EXISTS public.idx_audit_logs_entity;
     ```
2. **Full Snapshot Restore (Disaster Recovery):**
   - In Supabase Dashboard: Click **Restore** on the verified pre-migration snapshot.
   - Or restore via `psql`: `psql "postgresql://..." -f aeropool_staging_backup_pre_migration_*.sql`.

### 5.2. Data-Loss Windows (RPO & RTO)
- **Rollback via `DROP INDEX`:**
  - **Recovery Point Objective (RPO):** `0 seconds` (All transactional data, bookings, and ledger entries remain intact).
  - **Recovery Time Objective (RTO):** `< 5 seconds`.
- **Restoration via Pre-Migration Manual Export:**
  - **RPO:** Time elapsed between manual export and restore (`< 5 minutes` if taken immediately before execution).
  - **RTO:** `5 to 15 minutes` (Duration to stream and apply SQL dump).
- **Restoration via Daily Automated Snapshot (Without PITR):**
  - **RPO:** Up to `24 hours` of staging test data lost if relying solely on the previous night's automated snapshot.
  - **RTO:** `15 to 30 minutes`.
- **Restoration via PITR (If Enabled):**
  - **RPO:** `< 1 second`.
  - **RTO:** `15 to 25 minutes` (Cloud provisioning time).

---

## 6. Pre-Migration Authorization Evidence Checklist

Before you authorize executing migration `20261103000003` on staging, the following 5 pieces of evidence must be verified:

| # | Required Evidence Item | Verification Criteria | Status / Value |
| :- | :--- | :--- | :--- |
| **1** | **Target Project Reference** | Must strictly equal `rkuzkwggijthbqwlwnps` (`aeropool-staging`). | **VERIFIED LOCALLY** |
| **2** | **Migration File Hash** | Must match `4F0FE8F05A544B39A5355D9BDF581F8B29E61576DDF91D0B06C70AEF1600CDA7`. | **VERIFIED LOCALLY** |
| **3** | **Backup Timestamp** | Date and time (UTC / IST) of the latest verified backup or manual export. | **PENDING USER VERIFICATION** |
| **4** | **Backup / PITR Status** | Confirmed presence of either: (a) Downloaded `.sql` export, (b) Dashboard snapshot, or (c) Active PITR. | **PENDING USER VERIFICATION** |
| **5** | **Recovery Strategy Confirmation** | Acknowledged primary rollback path (`DROP INDEX` statements) and secondary restore path. | **DOCUMENTED & READY** |

---

## 7. Final Phase 6C Verdict

- **Report Status:** **READY FOR REVIEW**
- **Remote Migration Gate:** **BLOCKED**
- **Rationale:** While the target project reference (`rkuzkwggijthbqwlwnps`) and migration file hash are verified locally, independent proof of an active database backup or downloaded export must be provided by the user before any remote schema modification can be authorized.

