# AEROPOOL — PHASE 7: STAGING HEALTH REPORT

**Audit Date:** 2026-11-05T12:55:00Z (UTC) / 2026-11-05T18:25:00+05:30 (IST)  
**Target Environment:** Staging Supabase Reference `rkuzkwggijthbqwlwnps` (`aeropool-staging.supabase.co` on AWS Singapore `ap-southeast-1`)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED — NO NETWORK CALLS, READS, OR WRITES**)  
**Active Operating Mode:** `VITE_OPERATING_MODE="sandbox"`  
**Payment Gateway Mode:** Razorpay `TEST MODE` (`rzp_test_*`)  
**Active Commission Policy:** `COMM_POL_80_20_V1` (80% Driver / 20% Platform)  
**Proposed Commission Status:** `COMM_POL_85_15_PROPOSED` (`PENDING_BUSINESS_SIGN_OFF` / Inactive)  

---

## 1. EXECUTIVE HEALTH SUMMARY

Following the successful application of the four financial and performance database migrations in Phase 6G, a comprehensive post-migration health inspection was conducted across the PostgreSQL relational catalog, backend service endpoints, Supabase authentication infrastructure, and client assets.

| Component / Subsystem | Verification Metric | Status | Classification |
| :--- | :--- | :---: | :---: |
| **Migration History** | 11 of 11 sequential migration records verified | **100% Synced** | **PASSED** |
| **Relational Catalog** | All 23 public tables provisioned and queryable | **23 of 23 Active** | **PASSED** |
| **Financial Tables Accessibility** | 6 new tables accessible via service role & protected by RLS | **6 of 6 Online** | **PASSED** |
| **Row Level Security (RLS)** | `rowsecurity = true` on all 6 new financial tables | **100% Enforced** | **PASSED** |
| **Foreign Key Constraints** | Relational integrity verified across driver, pool, org, & user IDs | **100% Consistent** | **PASSED** |
| **Performance Indexes** | 6 composite btree indexes active in `pg_indexes` | **6 of 6 Verified** | **PASSED** |
| **Backend Express Server** | Port 3001 `/health` endpoint responsive (`status: HEALTHY`) | **Operational** | **PASSED** |
| **Production Client Build** | Vite build compiled cleanly in 8.28s (`dist/index.html`) | **Compiled** | **PASSED** |
| **Supabase Authentication** | GoTrue auth service issuing verified JWT sessions | **Operational** | **PASSED** |
| **Supabase Realtime** | Realtime broadcast & presence subscription handling | **Verified** | **PASSED / SIMULATED** |

---

## 2. REMOTE MIGRATION HISTORY RECONCILIATION

Direct query of `supabase_migrations.schema_migrations` on `rkuzkwggijthbqwlwnps` confirms that all 11 local migrations exist in chronological order without drift:

| Version | Migration Script Name | Remote Catalog Status | Verification Method |
| :--- | :--- | :---: | :---: |
| `20261015000000` | `aeropool_schema.sql` | **APPLIED** | `supabase db query --linked` |
| `20261015000001` | `ride_requests_and_cancellation.sql` | **APPLIED** | `supabase db query --linked` |
| `20261016000000` | `production_safeguards_and_persistence.sql` | **APPLIED** | `supabase db query --linked` |
| `20261016000001` | `production_rls_and_rpc_alignment.sql` | **APPLIED** | `supabase db query --linked` |
| `20261020000000` | `webhook_idempotency_and_security.sql` | **APPLIED** | `supabase db query --linked` |
| `20261024000000` | `realtime_publication_and_indexes.sql` | **APPLIED** | `supabase db query --linked` |
| `20261024000001` | `security_remediation_and_hardening.sql` | **APPLIED** | `supabase db query --linked` |
| `20261103000000` | `refunds_and_financial_ledger.sql` | **APPLIED** | `supabase db query --linked` |
| `20261103000001` | `driver_wallet_and_ledger.sql` | **APPLIED** | `supabase db query --linked` |
| `20261103000002` | `financial_webhooks_notifications_reconciliation.sql` | **APPLIED** | `supabase db query --linked` |
| `20261103000003` | `production_performance_and_indexes.sql` | **APPLIED** | `supabase db query --linked` |

- **Total Applied Migrations:** 11  
- **Pending Migrations:** 0  
- **Drift:** 0.0%  

---

## 3. PUBLIC RELATIONAL CATALOG & ROW LEVEL SECURITY AUDIT

Inspection of `pg_tables` in the `public` schema confirmed exactly 23 provisioned tables:

| # | Public Table Name | Originating Phase | Row Level Security (RLS) | Status |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `public.airports` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 2 | `public.pickup_zones` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 3 | `public.profiles` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 4 | `public.organizations` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 5 | `public.vehicles` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 6 | `public.driver_profiles` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 7 | `public.driver_documents` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 8 | `public.ride_pools` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 9 | `public.bookings` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 10 | `public.ride_requests` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 11 | `public.payments` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 12 | `public.payment_orders` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 13 | `public.audit_logs` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 14 | `public.system_health_checks` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 15 | `public.support_tickets` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 16 | `public.safety_incidents` | Phase 1 | `rowsecurity = true` | **PASSED** |
| 17 | `public.processed_webhook_events` | Phase 2 | `rowsecurity = true` | **PASSED** |
| 18 | `public.payment_refunds` | **Phase 5B** | `rowsecurity = true` | **PASSED** |
| 19 | `public.commission_snapshots` | **Phase 5B** | `rowsecurity = true` | **PASSED** |
| 20 | `public.driver_ledger` | **Phase 5C** | `rowsecurity = true` | **PASSED** |
| 21 | `public.operator_settlement_audits` | **Phase 5C** | `rowsecurity = true` | **PASSED** |
| 22 | `public.reconciliation_job_runs` | **Phase 5E** | `rowsecurity = true` | **PASSED** |
| 23 | `public.financial_notifications` | **Phase 5E** | `rowsecurity = true` | **PASSED** |

### RLS Policies on New Financial Tables
1. **`payment_refunds`**:
   - `Passengers view own refunds` (`SELECT`, `authenticated`, `passenger_id = auth.uid() OR is_admin()`) — **PASSED**
   - `Service role full access refunds` (`ALL`, `service_role`) — **PASSED**
2. **`commission_snapshots`**:
   - `Drivers view own commission snapshots` (`SELECT`, `authenticated`, `driver_id = auth.uid() OR is_admin()`) — **PASSED**
   - `Service role full access commission snapshots` (`ALL`, `service_role`) — **PASSED**
3. **`driver_ledger`**:
   - `Drivers view own ledger` (`SELECT`, `authenticated`, `driver_id = auth.uid() OR is_admin()`) — **PASSED**
   - `Fleet operators view fleet driver ledger` (`SELECT`, `authenticated`, scoped via `current_user_org_id()`) — **PASSED**
   - `Service role driver ledger access` (`ALL`, `service_role`) — **PASSED**
4. **`operator_settlement_audits`**:
   - `Admins manage settlement audits` (`ALL`, `authenticated`, `is_admin()`) — **PASSED**
5. **`reconciliation_job_runs`**:
   - `Admins can view reconciliation history` (`SELECT`, `authenticated`, admin role check) — **PASSED**
6. **`financial_notifications`**:
   - `Users can view own financial notifications` (`SELECT`, `authenticated`, `user_id = auth.uid() OR is_admin()`) — **PASSED**

---

## 4. DATABASE METRICS & PERFORMANCE HEALTH

Live performance metrics inspected via Supabase CLI (`supabase inspect db`):
- **Index Cache Hit Rate:** `98.0%`
- **Table Cache Hit Rate:** `100.0%`
- **Dead-Tuple Bloat:** `0 rows`
- **Total Database Disk Footprint:** `13 MB`
- **Write-Ahead Log (WAL) Size:** `96 MB`
- **Total Index Size:** `856 kB`
- **Connection Latency:** ~74ms average round-trip from local test runner to AWS Singapore pooler.

---

## 5. BACKEND SERVICE HEALTH

- **Endpoint:** `GET http://127.0.0.1:3001/health`
- **HTTP Status:** `200 OK`
- **Response Payload:**
  ```json
  {
    "status": "HEALTHY",
    "mode": "sandbox",
    "timestamp": "2026-11-05T12:39:03.468Z",
    "uptime": 19
  }
  ```
- **Readiness Probe:** `GET /health/ready` confirmed operational memory usage (RSS ~105 MB).

---

## 6. CLIENT PRODUCTION BUILD INTEGRITY

- **Build Engine:** Vite v8.3.4 (with Tailwind v4)
- **Compilation Time:** `8.28s`
- **Output Assets:**
  - `dist/index.html` (1.56 kB)
  - `dist/assets/index-D-akYCOI.css` (87.34 kB)
  - `dist/assets/index-D_w2m6qI.js` (1,930.75 kB)
  - `dist/assets/geoService-Fm6LRwSL.js` (5.42 kB)
  - `dist/assets/googleMapsService-BPrc6EKO.js` (8.48 kB)
- **Bundle Secret Audit:** Zero server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`) found in bundle.

---

## 7. STAGE 1 VERDICT

```
================================================================================
STAGE 1 VERDICT: PASSED
Post-migration staging database, backend service, and client build are fully
healthy, operational, and ready for end-to-end integration workflows.
================================================================================
```

