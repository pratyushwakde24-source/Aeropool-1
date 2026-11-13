# AeroPool — Razorpay TEST MODE Payment & Webhook Verification Report

**Audit Date:** October 2026  
**Gateway Identifier:** Razorpay Standard Checkout (India)  
**Configured Client Key ID:** `rzp_test_...` (Length: 22 chars, verified Test Mode)  
**Operating Mode:** `sandbox`  
**Execution Authority:** Antigravity Engineering

---

## 1. Security Stance & Working Rule Compliance

In strict adherence to User Working Rules 9, 11, and 12:
- **TEST MODE ONLY:** `VITE_RAZORPAY_KEY_ID` begins with `rzp_test_`. Live merchant keys (`rzp_live_`) are forbidden until separately authorized.
- **No Real Charges:** No real money transactions, charges, or live bank refunds were initiated.
- **Server-Authoritative Orders:** Order creation is strictly performed via backend API (`/api/payments/create-order`) with amount and currency validated in integer minor units (paise).
- **Client Disregard:** Frontend payment callbacks are never accepted as proof of payment. Cryptographic signature reconciliation is performed on the server.

---

## 2. Payment Flow Architecture

```
1. Passenger selects ride pool & clicks "Proceed to Pay"
   │
   ▼
2. Client requests Server Order: POST /api/payments/create-order
   │ - Validates amountPaise (> 0, <= 10,000,000)
   │ - Validates currency == 'INR'
   │ - Registers ServerPaymentOrder (status: CREATED)
   │
   ▼
3. Razorpay Checkout opens with public rzp_test_* key
   │ - Passenger completes test payment via UPI / Card / Netbanking
   │
   ▼
4. Authoritative Verification: POST /api/payments/verify-signature
   │ - Server verifies HMAC-SHA256 signature using RAZORPAY_KEY_SECRET
   │ - Reconciles orderId, paymentId, bookingId, and amount
   │ - Confirms booking atomically in database
   │
   ▼
5. Asynchronous Webhook: POST /api/payments/webhook
   │ - Raw request buffer verified against x-razorpay-signature
   │ - Event claimed via durable idempotency store
   │ - Replay attacks detected and rejected
```

---

## 3. Webhook Idempotency & Raw Buffer Verification

The server webhook implementation in `server/index.ts` enforces the following production safeguards:
1. **Raw Body Parsing:** `express.raw({ type: 'application/json' })` ensures the exact incoming byte buffer is hashed before any JSON parsing alters character encoding or whitespace.
2. **Timing-Safe Comparison:** `safeCompareSignatures()` uses constant-time string comparison to prevent timing attacks.
3. **Durable Idempotency Store (`server/idempotencyStore.ts`):** Prevents duplicate event processing during network retries or replay attacks.

---

## 4. Automated Test Verification Results

| Test # | Test Description | Category | Result | Metric |
| :---: | :--- | :---: | :---: | :---: |
| **1** | Pricing Engine: Integer minor units (Paise) and deterministic savings | `PRICING` | **PASS** | 0.08ms |
| **20** | Operating Mode: Explicit sandbox tagging & mock payment protection | `SECURITY` | **PASS** | 0.02ms |
| **21** | Payment Webhook: HMAC-SHA256 signature verification & idempotency guard | `INTEGRATION` | **PASS** | 11.92ms |
| **25** | Payment Security: Server-side HMAC-SHA256 signature verification & sandbox isolation | `INTEGRATION` | **PASS** | 0.33ms |
| **31** | Payment Security: Constant-time signature comparison handles mismatched lengths | `SECURITY` | **PASS** | 1.81ms |
| **33** | Payment Integrity: Forged client payment success rejection & amount reconciliation | `SECURITY` | **PASS** | 0.44ms |
| **34** | Payment Integrity: Booking ID and currency mismatch detection | `SECURITY` | **PASS** | 0.03ms |
| **35** | Webhook Security: Durable event deduplication and replay attack blocking | `INTEGRATION` | **PASS** | 0.35ms |
| **45** | Razorpay Test Mode: Server-authoritative order registration & reconciliation | `SECURITY` | **PASS** | 0.76ms |
