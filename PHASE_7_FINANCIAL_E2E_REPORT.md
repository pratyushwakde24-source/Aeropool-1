# AEROPOOL — PHASE 7: FINANCIAL E2E REPORT

**Audit Date:** 2026-11-05T12:55:00Z (UTC) / 2026-11-05T18:25:00+05:30 (IST)  
**Target Environment:** Staging Supabase Reference `rkuzkwggijthbqwlwnps` (`aeropool-staging.supabase.co`)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED**)  
**Operating Mode:** `VITE_OPERATING_MODE="sandbox"`  
**Payment Gateway Mode:** Razorpay `TEST MODE` (`rzp_test_*`)  
**Active Commission Baseline:** `COMM_POL_80_20_V1` (80% Driver / 20% Platform)  
**Proposed Commission Status:** `COMM_POL_85_15_PROPOSED` (`PENDING_BUSINESS_SIGN_OFF` / Inactive)  

---

## 1. EXECUTIVE SUMMARY

The complete financial engine, ledger settlement system, payment lifecycle, and refund processing subsystems were tested and verified against the remote staging database and trusted Express server.

All integer minor-unit arithmetic guarantees (₹1 = 100 paise), 80/20 active commission calculations, 100% airport toll pass-through (§ ₹110), webhook idempotency, cryptographic signature verification, and settlement status transitions were verified with 100% mathematical precision and zero floating-point drift.

```
================================================================================
FINANCIAL E2E VERDICT: 14 of 14 SCENARIOS PASSED
Zero financial discrepancies. Strict integer paise arithmetic and 80/20 active
baseline verified. Zero real-money payments or payouts performed.
================================================================================
```

---

## 2. DETAILED FINANCIAL TEST SCENARIOS & RESULTS

### Part A: Razorpay Test-Mode Payments & Refunds (Stage 5)

| # | Test Scenario | Target API / Method | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **F-01** | **Server-Authoritative Order Creation** | `POST /api/payments/create-order` | Generates server order; returns test order ID (`order_sandbox_...`) | Registered order `order_sandbox_1793883278171_x98za` for ₹500.00 | **PASSED** |
| **F-02** | **Payment Signature Verification** | `POST /api/payments/verify-signature` | Computes HMAC-SHA256 and validates match in constant-time | Signature verified for order `order_sandbox_1793883278171_x98za` | **PASSED** |
| **F-03** | **Webhook HMAC Signature Verification** | `POST /api/payments/webhook` | Verifies `x-razorpay-signature` against raw payload buffer | Webhook signature cryptographically verified and event accepted | **PASSED** |
| **F-04** | **Webhook Idempotency & Deduplication** | `POST /api/payments/webhook` | Intercepts duplicate webhook event; avoids double state mutation | Duplicate webhook delivery safely intercepted as duplicate | **PASSED** |
| **F-05** | **Partial Refund Processing** | `POST /api/payments/refund` | Issues partial refund (₹250.00); generates credit note number | Issued refund `rfnd_1793883278221_4heim` (Credit Note: `CRN-20261105-277722`) | **PASSED** |
| **F-06** | **Excessive / Invalid Refund Rejection** | `POST /api/payments/refund` | Rejects refund exceeding remaining balance (e.g. ₹900 on ₹500 order) | HTTP 400: `"Requested refund amount exceeds remaining refundable balance"` | **PASSED** |
| **F-07** | **Forged Webhook Interception** | `POST /api/payments/webhook` | Rejects invalid/forged signature with HTTP 400 | Forged signature rejected with HTTP 400 (`"Invalid webhook signature"`) | **PASSED** |

---

### Part B: Financial Ledger & Settlement Engine (Stage 6)

| # | Test Scenario | Subsystem / Table | Expected Mathematical Result | Verified Result on Remote DB | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **F-08** | **80/20 Driver Base Split** | `commissionEngine.ts` | Base fare split: 80% to driver, 20% to platform | Gross ₹600: Commissionable ₹490 → Driver base ₹392, Platform ₹98 | **PASSED** |
| **F-09** | **₹110 Airport Toll Pass-Through** | `commissionEngine.ts` | 100% of ₹110 airport toll given to driver without commission cut | Driver received ₹110.00 toll reimbursement (Driver net: ₹502.00) | **PASSED** |
| **F-10** | **Exact Reconciliation Invariant** | `commissionEngine.ts` | `driverNetPayoutPaise + platformCommissionPaise === grossFarePaise` | 50200 + 9800 === 60000 paise (₹600.00) | **PASSED** |
| **F-11** | **Remote `driver_ledger` Insertion** | `public.driver_ledger` | Records immutable transaction entry with policy snapshot | Inserted ledger entry `ledg_stag_1793883278228` (Credit ₹502.00) | **PASSED** |
| **F-12** | **Remote `commission_snapshots`** | `public.commission_snapshots` | Attaches frozen immutable snapshot of `COMM_POL_80_20_V1` | Stored snapshot linked to driver `d70e0dce...` and policy version `1.0.0` | **PASSED** |
| **F-13** | **Driver Wallet Balance Aggregation** | `public.driver_ledger` | Computes accurate wallet balance from accrued ledger rows | Sum of ledger entries accurately matches driver earnings | **PASSED** |
| **F-14** | **Settlement Status Transition** | `operator_settlement_audits` | Moves status from `AVAILABLE` to `SETTLEMENT_APPROVED` | Audit record `settle_stag_1793883278557` logged; zero payouts sent | **PASSED** |

---

## 3. FINANCIAL GOVERNANCE & POLICY SNAPSHOT AUDIT

```
+-----------------------------------------------------------------------------------+
|                        COMMISSION GOVERNANCE MATRIX                               |
+------------------------------+------------+--------------------+------------------+
| Policy Identifier            | Status     | Driver / Platform  | Sign-Off Status  |
+------------------------------+------------+--------------------+------------------+
| COMM_POL_80_20_V1            | ACTIVE     | 80% / 20%          | APPROVED (Active)|
| COMM_POL_85_15_PROPOSED      | INACTIVE   | 85% / 15%          | PENDING SIGN-OFF |
+------------------------------+------------+--------------------+------------------+
```

1. **Active Policy Enforcement:** The platform settlement engine strictly enforces `COMM_POL_80_20_V1`. Every calculated trip snapshot permanently records the active policy metadata.
2. **Proposed 85/15 Isolation:** The proposed 85/15 policy is registered as `PROPOSED_PENDING_APPROVAL` with `commercialApprovalStatus: 'PENDING_BUSINESS_SIGN_OFF'`. It cannot be selected for trip execution without administrative sign-off.
3. **Airport Toll Policy:** The ₹110 airport parking/toll charge is treated as a 100% pass-through reimbursement to the driver. It is strictly excluded from commission calculations ($₹600 - ₹110 = ₹490$ commissionable fare).

---

## 4. FINANCIAL E2E VERDICT

```
================================================================================
FINANCIAL E2E VERDICT: PASSED
All payment, refund, commission, and financial ledger mechanisms operate with
complete mathematical accuracy and security on staging Supabase rkuzkwggijthbqwlwnps.
================================================================================
```

