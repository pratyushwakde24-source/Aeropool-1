# AeroPool Phase 6 — Staging & Production Deployment Preparation Guide

**Document Version:** 1.0.0  
**Status:** DRAFT / APPROVED FOR STAGING RUNBOOK  
**Platform Scope:** AeroPool Airport Ride-Sharing SaaS (CSMIA BOM Corridor)  
**Security Classification:** Highly Confidential Internal Runbook  

---

## 1. Executive Deployment Architecture

AeroPool is structured as a decoupled two-tier application:
1. **Frontend:** React 19 + TypeScript + Vite Single-Page Application (SPA) with Tailwind CSS styling and Leaflet/Lucide UI elements.
2. **Backend API:** Node.js Express 5 server providing payment order creation, webhook handling (HMAC-SHA256 signature verification), centralized commission calculations, driver wallet & ledger management, Super Admin financial command center, and background reconciliation scheduler.
3. **Database & Auth:** Supabase PostgreSQL instance with Row Level Security (RLS), real-time subscriptions, and authentication.

```
                      [ Client Browsers & Mobile Viewports ]
                                        │
                                        │ HTTPS (Port 443)
                                        ▼
                           [ CDN Edge / Reverse Proxy ]
                           (Cloudflare / AWS CloudFront)
                                 │              │
                       Static SPA assets    API Proxy (/api, /health)
                                 │              │
                                 ▼              ▼
                    [ Frontend Static Host ]   [ Backend Application Server ]
                    (Vercel / Cloudflare)     (Render / Fly.io / AWS ECS)
                                                        │
                                                        │ Secure Service Role / RLS
                                                        ▼
                                             [ Supabase Managed DB ]
                                             (Approved Staging Project)
```

---

## 2. Infrastructure Hosting Recommendations

### 2.1. Frontend Hosting (SPA)
* **Tier 1 Recommendation:** **Vercel** or **Cloudflare Pages**
  * **Build Command:** `npm run build`
  * **Output Directory:** `dist`
  * **Single Page Application Routing:** Configure rewrite rule `/* -> /index.html` (HTTP 200).
  * **Headers:** Enforce HTTP Strict Transport Security (`max-age=31536000; includeSubDomains`), `X-Frame-Options: SAMEORIGIN`, and `X-Content-Type-Options: nosniff`.
  * **Environment Variables:** Only client-safe variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`, `VITE_OPERATING_MODE`).

### 2.2. Backend Application Server
* **Tier 1 Recommendation:** **Render**, **Railway**, or **Fly.io** (or **AWS ECS Fargate** with persistent containers)
* **Critical Requirement:** **Persistent Container Execution.**
  * *Notice:* AeroPool includes an in-memory background reconciliation cron scheduler (`setInterval` in `server/index.ts`). Serverless functions (like AWS Lambda or Vercel Serverless Functions) with ephemeral lifecycles will freeze or cancel scheduled runs. A long-running container service or dedicated worker is required.
* **Health Probes:**
  * **Liveness:** `GET /health` (expects HTTP 200 `{"status":"ok"}`)
  * **Readiness:** `GET /health/ready` or `GET /api/health/readiness` (expects HTTP 200 `{"status":"READY","mode":"sandbox",...}`)
* **Reverse Proxy Header Forwarding:** Ensure host forwards `X-Forwarded-For` and `X-Forwarded-Proto` for accurate rate-limiting by `express-rate-limit`.

---

## 3. Database Environment Isolation & Runbook

### 3.1. Target Supabase Reference Guard
* **Approved Staging Project ID:** `rkuzkwggijthbqwlwnps` (`https://rkuzkwggijthbqwlwnps.supabase.co`)
* **PROTECTED BASELINE PROJECT ID:** `krxkxhieyqcytknixqdm`
  * ⚠️ **STRICT SAFETY RULE:** Under NO circumstances should any automated CI/CD pipeline, staging credential, or developer script connect to or execute migrations against `krxkxhieyqcytknixqdm`.

### 3.2. Migration Execution Procedure
All migrations reside locally in `supabase/migrations/`:
1. `20261102000000_financial_foundation.sql` (Phase 5B foundation)
2. `20261103000001_driver_wallet_and_ledger.sql` (Phase 5C driver ledger)
3. `20261103000002_financial_reconciliation_and_monitoring.sql` (Phase 5E reconciliation)
4. `20261103000003_production_performance_and_indexes.sql` (Phase 6 performance indexes)

#### Safe Execution Steps:
1. **Pre-Migration Backup:** In Supabase Dashboard -> Database -> Backups, trigger a manual snapshot before applying schema changes.
2. **Maintenance Window:** Execute migrations during low-traffic hours (02:00–04:00 IST).
3. **Dry-Run Validation:** Execute scripts against local or staging branch first.
4. **Sequential Application:** Apply migrations strictly in timestamp order.
5. **Index Verification:** Verify that high-concurrency indexes (`idx_route_telemetry_driver_time`, `idx_pool_rides_driver_status`, `idx_financial_transactions_user_created`) build concurrently where supported.
6. **Rollback Plan:** Each migration file contains dedicated rollback comments. In case of failure, revert DDL and restore the pre-migration snapshot.

---

## 4. Environment Variables Checklist & Governance

Before triggering staging or production deployment, verify all environment variables across backend and frontend platforms.

### 4.1. Frontend Variables (Bundled into Client JS)
| Variable Name | Environment | Required | Description / Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_OPERATING_MODE` | Staging / Prod | YES | Operating mode (`sandbox` in staging; `production` once authorized). |
| `VITE_SUPABASE_URL` | Staging / Prod | YES | Public Supabase API URL (`https://rkuzkwggijthbqwlwnps.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Staging / Prod | YES | Public anonymous API key (secured by RLS). |
| `VITE_RAZORPAY_KEY_ID` | Staging / Prod | YES | Razorpay Key ID (`rzp_test_*` in staging; `rzp_live_*` in production). |
| `VITE_API_URL` | Staging / Prod | OPTIONAL | Base URL for Express backend proxy (defaults to relative or localhost in dev). |

### 4.2. Backend Variables (Server-Only Secrets — NEVER Expose to Client)
| Variable Name | Required | Description / Governance Policy |
| :--- | :--- | :--- |
| `PORT` | YES | Listening port (e.g., `3001` or provided by hosting container). |
| `NODE_ENV` | YES | `production` in live staging and production containers. |
| `RAZORPAY_KEY_ID` | YES | Razorpay Key ID (`rzp_test_*` for staging; `rzp_live_*` for production). |
| `RAZORPAY_KEY_SECRET` | YES | Secret key for order generation and HMAC verification. Never prefixed with `VITE_`. |
| `RAZORPAY_WEBHOOK_SECRET` | YES | Webhook signature verification secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | High-privilege key for ledger operations, payouts, and webhooks. Server-side only. |
| `DATABASE_URL` | YES | Direct PostgreSQL connection string with SSL mode (`sslmode=require`). |

> **Automated Environment Guard:** `server/envValidator.ts` validates that no `VITE_` prefixed variables contain backend secrets and prevents boot if live keys are detected in sandbox mode.

---

## 5. Network, HTTPS & Domain Configuration

1. **DNS Architecture:**
   * Frontend: `app.aeropool.in` or `staging.aeropool.in` -> CNAME to frontend host.
   * Backend API: `api.aeropool.in` or `api-staging.aeropool.in` -> CNAME / A record to application server.
2. **SSL / TLS Certificate:** Enforce TLS 1.3 minimum. SSL auto-provisioned via Let's Encrypt / Cloudflare Edge Certificates.
3. **CORS Whitelist (`server/index.ts`):** Ensure `CORS_ORIGIN` matches exact staging/production frontend origins.
4. **Webhook Endpoint:** Razorpay Dashboard webhook URL must point to `https://api.aeropool.in/api/v1/payments/webhook` with event subscriptions:
   * `payment.captured`
   * `payment.failed`
   * `refund.processed`
   * `refund.failed`

---

## 6. Disaster Recovery, Health Monitoring & Rollback Runbook

### 6.1. Health & Observability Metrics
- **Automated Health Probes:** Configure monitoring (e.g. BetterStack, Datadog, UptimeKuma) to poll `GET https://api.aeropool.in/health/ready` every 60 seconds.
- **Alert Triggers:**
  - HTTP 504 on 15s timeout threshold.
  - Gateway status !== `OPERATIONAL`.
  - Memory RSS > 500MB on Node process.
  - Discrepancy detected in `/api/v1/admin/financial/reconciliation/run`.

### 6.2. Rollback Runbook
In the event of a catastrophic staging or production anomaly:
1. **Traffic Cutoff:** Toggle maintenance banner on frontend edge CDN.
2. **Deployment Rollback:** Roll back git release tag to previous known-good deployment commit via hosting control panel.
3. **Database State Verification:** Query `financial_reconciliation_audit` to ensure zero half-committed transactions.
4. **Post-Incident Recovery:** If database schema changes caused failure, apply targeted down-migration or restore pre-migration point-in-time backup.

