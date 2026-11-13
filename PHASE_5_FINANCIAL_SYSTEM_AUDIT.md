# AeroPool — Phase 5 Pre-Implementation Audit
# Complete Payments & Financial Management System

**Audit Date:** November 2026  
**Auditor:** Antigravity Senior Full-Stack & Financial Systems Engineer  
**Gateway Authority:** Razorpay Payment Gateway (Test Mode / Sandbox)  
**Target Environment:** Staging Supabase Project (`rkuzkwggijthbqwlwnps`)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (NEVER MODIFIED)  
**Operating Mode:** `sandbox`  
**Currency Standard:** Indian Rupee (INR) — Strict Integer Minor Units (Paise: ₹1 = 100 paise)

---

## 1. Executive Summary

Phase 5 addresses the complete, production-grade financial architecture for AeroPool: end-to-end payment lifecycle, server-authoritative Razorpay integration in TEST MODE, asynchronous webhook ingestion with durable idempotency, automated commission calculation, driver earnings ledger, instant passenger refunds with credit notes, GST-compliant tax invoicing, and a Super Admin Financial Management command center.

This audit evaluates the codebase across all seven financial pillars, cataloging working implementations to preserve and identifying architectural gaps to implement.

---

## 2. Inventory of Existing Financial Assets

| File Path | Role / Subsystem | Current Status | Preservation Stance |
| :--- | :--- | :--- | :--- |
| `server/index.ts` | Express backend payment routes | `/create-order`, `/verify-signature`, `/webhook` functional | **Preserve & Extend** with `/refund`, `/payout`, `/financial-summary` |
| `server/orderStore.ts` | Server-authoritative order registry | Implements order lifecycle, sandbox fallbacks, signature reconciliation | **Preserve & Extend** with refund state & commission ledger |
| `server/idempotencyStore.ts` | Durable webhook deduplication | Memory & PostgreSQL dual store for replay attack protection | **Preserve 100%** |
| `server/rateLimiter.ts` | Payment endpoint DoS guards | `paymentOrderLimiter`, `paymentVerifyLimiter`, `privilegedApiLimiter` | **Preserve 100%** |
| `src/services/paymentWebhookService.ts` | Cryptographic HMAC-SHA256 & timing-safe compare | `safeCompareSignatures`, `verifyRazorpayWebhook` | **Preserve 100%** |
| `src/services/pricingEngine.ts` | Deterministic paise arithmetic | `calculateRideFare`, `formatINR`, 5% GST, CSMIA cess | **Preserve & Reuse** as single source of truth |
| `src/components/RazorpayModal.tsx` | Passenger payment UI modal | Handles UPI/Card/Netbanking, test mode indicator, server handshake | **Preserve & Enhance** |
| `src/services/db.ts` | Transactional data store | Booking atomic reservation, payment records, weekly settlement generation, refund methods | **Preserve & Extend** |
| `src/views/PassengerBookingsView.tsx` | Invoices & Refund Receipts | Client-side GST invoice modal & credit note receipt | **Refactor** into shared reusable invoice service |
| `src/views/DriverDashboardView.tsx` | Driver earnings display | Shows net earnings, trip breakdown, 85% driver share | **Preserve & Link** to new financial ledger |
| `src/views/AdminDashboardView.tsx` | Admin payments tab | Basic payment table with individual refund button | **Transform** into full Financial Command Center |

---

## 3. Detailed Component Audit

### 3.1 Gateway Integration & Test Mode Safeguards
* **Credential Audit**:
  - `VITE_RAZORPAY_KEY_ID`: `rzp_test_placeholder` (verified starts with `rzp_test_`).
  - `RAZORPAY_KEY_SECRET`: `sandbox_secret_placeholder`.
  - `RAZORPAY_WEBHOOK_SECRET`: `sandbox_webhook_placeholder`.
* **Guardrails**:
  - `src/services/configService.ts` strictly identifies `isTestMode: true` and blocks live transactions.
  - `server/index.ts` refuses sandbox orders if `OPERATING_MODE === 'production'`.
  - In `sandbox` mode, synthetic simulation tokens (`simulated_valid_signature_token`) allow end-to-end testing without making external network calls if the Razorpay test API is unconfigured or rate-limited.
* **Finding**: The gateway layer is secure, compliant with User Rules 9 & 11, and strictly configured in TEST MODE.

### 3.2 Payment Order Creation & Signature Reconciliation
* **Order Creation (`POST /api/payments/create-order`)**:
  - Enforces positive integer amounts (`amountPaise` between 1 and 10,000,000).
  - Validates `currency === 'INR'`.
  - If Razorpay test credentials are functional, calls `https://api.razorpay.com/v1/orders`.
  - Automatically falls back to internal sandbox order generation (`order_sandbox_...`) with registration in `orderStore.ts`.
* **Signature Verification (`POST /api/payments/verify-signature`)**:
  - Disregards client claims; reconciles `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `bookingId`, `amountPaise`, and `currency`.
  - Uses `safeCompareSignatures()` (constant-time XOR comparison) to eliminate timing attacks and buffer overrun crashes.
  - Updates order status to `PAID` with ISO timestamp.

### 3.3 Asynchronous Webhooks & Idempotency
* **Incoming Webhook (`POST /api/payments/webhook`)**:
  - Reads raw unparsed byte buffer (`express.raw`) before JSON deserialization to ensure exact byte-level HMAC-SHA256 signature match.
  - Claims event through `webhookStore.claimEvent(eventId, eventType, payloadHash)`.
  - Replay attacks and duplicate retries return `200 OK` with `duplicate: true`, eliminating double-crediting.
* **Missing Functionality**:
  - Currently handles generic payment events; needs explicit event handlers for `payment.captured`, `payment.failed`, `refund.processed`, `refund.created`, `refund.failed`.

### 3.4 Commission Calculation & Split Engine
* **Current State**:
  - In `src/services/db.ts:1268`: driver share is hardcoded as `80%` of pool gross (`Math.round(totalGrossPaise * 0.8)`).
  - In `DriverDashboardView.tsx:631`: estimated payout displays `85%`.
  - In `db.ts:2415` (`generateWeeklyPayoutSettlement`): uses `org.commissionRate || 15%`.
* **Gaps Identified**:
  - Inconsistency between 80% and 85% driver splits across views.
  - No dedicated commission service that centralizes platform commission rate (15%), driver share (85%), airport fee handling, and GST calculation.
  - Missing dynamic commission tier support (e.g. peak airport hours, fleet organization contract tiers).

### 3.5 Driver Earnings & Payout Ledger
* **Current State**:
  - `driverProfiles` in `db.ts` tracks `earningsThisWeekPaise` and `totalEarningsPaise`.
  - `DriverDashboardView.tsx` shows total completed rides and calculated earnings.
  - Fleet organizations have weekly payout settlements generated via `generateWeeklyPayoutSettlement()`.
* **Gaps Identified**:
  - Individual drivers lack an itemized transaction ledger (Credit: trip fare, tip; Debit: payout withdrawal).
  - Drivers cannot download an itemized earnings statement or weekly payout receipt.
  - No explicit driver payout release workflow for admins in the UI.

### 3.6 Refunds & Cancellations Lifecycle
* **Current State**:
  - `db.cancelBooking()` triggers an automated 100% refund in sandbox mode when passenger cancels before vehicle pickup.
  - Admin dashboard has a manual "Refund" modal calling `db.processRefund(paymentId, amount, reason, actorId)`.
  - `PassengerBookingsView.tsx` renders a refund receipt (Credit Note `CRN-...`).
* **Gaps Identified**:
  - Backend lacks a dedicated `/api/payments/refund` endpoint with Razorpay REST API call (`/v1/payments/{id}/refund`).
  - No partial refund capability (e.g. 50% refund after driver arrival).
  - No tracking of refund state transitions (`INITIATED` -> `PROCESSED` -> `FAILED`).
  - No audit log event dispatched from server-side refund API.

### 3.7 Invoicing & GST Tax System
* **Current State**:
  - `PassengerBookingsView.tsx` has inline JSX for a printable tax invoice modal with GSTIN `27AABCM8291Q1Z4` and CGST 2.5% + SGST 2.5% breakdown.
* **Gaps Identified**:
  - Invoicing logic is coupled directly to `PassengerBookingsView.tsx` rather than being a modular service.
  - Invoices cannot be generated on the server or retrieved via an API endpoint.
  - Lacks a clean printable / downloadable format with proper corporate styling, SAC codes (SAC 996412 for passenger transport), and breakdown of base fare, toll cess, and platform fee.

### 3.8 Super Admin Financial Management Dashboard
* **Current State**:
  - `AdminDashboardView.tsx` contains a basic `payments` tab that lists raw payments with a simple refund button.
* **Gaps Identified**:
  - No high-level financial metrics (Total GMV, Platform Commission, Driver Payouts, Total Refunds, Net Margin).
  - No filtering by date range, payment status (`captured`, `refunded`, `failed`), payment method (UPI, Card, Netbanking), or search by Razorpay ID / passenger name.
  - No fleet settlement overview where Super Admin can inspect, verify, and approve weekly payout batches.
  - No CSV financial export for accounting and reconciliation.

---

## 4. Phase 5 Architectural Blueprint

To address all identified gaps while strictly reusing working code, Phase 5 will implement:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEROPOOL FINANCIAL ARCHITECTURE                     │
└────────────────────────────────────────────────────────────────────────┘

  1. PRICING & GST (Single Source of Truth)
     └─ src/services/pricingEngine.ts (Base + Distance + Toll + Fee + 5% GST)

  2. COMMISSION & SETTLEMENT ENGINE
     └─ src/services/commissionEngine.ts (Authoritative 85% Driver / 15% Platform Split)
     └─ Deterministic multi-corridor and airport toll accounting

  3. SERVER-SIDE PAYMENT & REFUND LIFECYCLE
     ├─ POST /api/payments/create-order (Existing, enhanced)
     ├─ POST /api/payments/verify-signature (Existing, enhanced)
     ├─ POST /api/payments/webhook (Enhanced with refund/failure event dispatch)
     ├─ POST /api/payments/refund (NEW: Server-authoritative refund with audit)
     └─ GET  /api/admin/financial-summary (NEW: Super Admin financial metrics)

  4. INVOICING & CREDIT NOTE SERVICE
     └─ src/services/invoiceService.ts (SAC 996412, GST breakdown, printable HTML)

  5. DRIVER EARNINGS & PAYOUT SYSTEM
     └─ Itemized ledger per trip in db.ts + downloadable payout slips

  6. SUPER ADMIN FINANCIAL COMMAND CENTER
     └─ Enhanced Tab in AdminDashboardView.tsx:
        ├─ KPI Metric Cards (GMV, Commission, Net Revenue, Refunds, Pending Payouts)
        ├─ Interactive Transaction Ledger with search & status filters
        ├─ One-Click Refund Modal with partial refund & reason tracking
        ├─ Fleet Operator Settlements review & batch payout approval
        └─ CSV Financial Export
```

---

## 5. Verification & Safety Criteria

1. **Razorpay Sandbox Compliance**: All transactions operate under `rzp_test_` keys or simulated sandbox tokens; zero real funds debited.
2. **Database Integrity**: Staging project `rkuzkwggijthbqwlwnps` only; protected baseline `krxkxhieyqcytknixqdm` untouched.
3. **Integer Arithmetic**: 100% of calculations executed in integer paise; floating-point currency representation strictly prohibited.
4. **Test Suite Coverage**: All 131 existing tests must pass, plus new Phase 5 automated tests covering commission splits, refunds, webhooks, and invoice generation.
5. **Type Safety & Build**: Zero TypeScript errors (`tsc --noEmit`) and successful Vite production build.

---

## 6. Audit Conclusion & Approval Recommendation

The existing financial foundation is exceptionally solid, particularly regarding server-authoritative order registration, constant-time signature verification, and raw webhook HMAC checking. 

Phase 5 will not replace or discard any working component; it will systematically layer the commission engine, refund endpoints, invoice generator, driver payout ledger, and the Super Admin financial command center on top of the validated core.

