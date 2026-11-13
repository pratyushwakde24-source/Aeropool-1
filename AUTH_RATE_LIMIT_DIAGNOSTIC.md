# AEROPOOL — AUTHENTICATION & EMAIL RATE LIMIT DIAGNOSTIC REPORT

**Target Project:** `rkuzkwggijthbqwlwnps` (`aeropool-staging`, `ap-southeast-1`)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (**Confirmed Untouched & Protected**)  
**Audit Date:** October 30, 2026  
**Status:** **DIAGNOSED & REMEDIATED LOCALLY**  

---

## 1. THE VERIFIED CAUSE

### 1.1 Root Cause Breakdown

The error `email rate limit exceeded` is an authoritative HTTP 429 error returned directly by Supabase GoTrue Auth server (`POST https://rkuzkwggijthbqwlwnps.supabase.co/auth/v1/signup`).

```
[Browser / AuthModal] 
      │
      ▼ POST /auth/v1/signup
[Supabase GoTrue Auth]
      │
      ├─► Project setting: "Enable email confirmations" = TRUE
      ├─► Outgoing Mailer: Supabase Built-in Shared SMTP Relay
      ├─► Built-in Shared Mailer Quota: 3 to 4 emails / hour / project
      │
      └─► QUOTA EXCEEDED ──► HTTP 429: "email rate limit exceeded"
```

### 1.2 How the Quota Was Exhausted

1. **Automated Unit Test Suite (`src/tests/testSuite.ts`):**
   - Test 64 ("Security: Public Signup Role Escalation Prevention") previously called `authService.signUp()` twice per test run (`hacker-admin@example.com` and `hacker-support@example.com`).
   - Because `.env` was configured with live staging credentials, running `npm test` repeatedly dispatched real signup requests to the live Supabase GoTrue Auth API, generating confirmation emails and exhausting the project's hourly quota within seconds.
2. **Automated E2E Test Suite (`scripts/testStagingE2E.ts`):**
   - Prior iterations created timestamped accounts (`test.passenger.<timestamp>@aeropool.com`) on every run.
3. **Frontend Vulnerabilities in `AuthModal.tsx`:**
   - Lacked cooldown throttling: When a rate-limit error occurred, users could repeatedly click "Complete Registration", firing repeated 429 requests.
   - Raw error display: The UI displayed the cryptic message `"email rate limit exceeded"` without explaining that the project's email quota was exhausted.
   - No input preservation: Switching tabs or re-attempting risked losing form context.

### 1.3 What Remains Unconfirmed (Without Dashboard Access)

- **Exact Current Quota Window:** The exact minute when Supabase Cloud's rolling 1-hour window resets for project `rkuzkwggijthbqwlwnps`.
- **Remote Dashboard Policy Preference:** Whether you wish to disable email confirmations for staging testing or configure a custom SMTP service (e.g. Resend, SendGrid) to remove the free tier cap.

---

## 2. FILES CHANGED

### 1. `src/services/authService.ts`
- **Extended `AuthResponse` Interface:** Added `isRateLimited?: boolean`, `needsEmailConfirmation?: boolean`, and `retryAfterSeconds?: number`.
- **Error Normalization:** Intercepts GoTrue HTTP 429 and `/rate limit/i` errors in `signUp()` and `signIn()`, converting them into user-friendly messages with structured metadata.
- **Distinct Statuses:** Clearly separates credential errors, unconfirmed email notices, and rate-limit cooldowns.

### 2. `src/components/AuthModal.tsx`
- **Automated Cooldown Timer:** Added an active countdown timer (60s default) driven by `useEffect`.
- **Submission Lockout:** The submit button and `handleSubmit` handler strictly block repeated clicks while `isLoading` or `cooldownSeconds > 0`.
- **User-Friendly Rate-Limit Card:** Replaced raw error text with a dedicated amber notice card displaying:
  - Clear explanation: *"Email rate limit exceeded. The staging Supabase email quota has been reached for this hour."*
  - Live countdown: *"Cooldown active: Xs remaining"*
  - Direct shortcut: *"Already have an account? Sign In"*
- **Form State Preservation:** Inputs (`fullName`, `email`, `phone`, `password`) are preserved across error states and mode switches.
- **Truthful Confirmation:** Success is never claimed unless Supabase explicitly confirms account creation.

### 3. `src/tests/testSuite.ts`
- **Local Test Spy (Test 64):** Intercepts `supabase.auth.signUp` during architectural unit tests to verify that client-asserted privileged roles (`admin`, `support`) are stripped and defaulted to `passenger`, without sending live HTTP requests or burning staging email quotas.

### 4. `scripts/testStagingE2E.ts`
- **Baseline Safeguard:** Added an explicit assertion terminating execution if `SUPABASE_URL` contains the protected baseline `krxkxhieyqcytknixqdm`.
- **Deterministic Test Identity:** Replaced timestamped accounts with `staging.e2e.passenger@aeropool.com`.
- **Account Reuse:** Checks `adminClient.auth.admin.listUsers()` to reuse existing test credentials, completely eliminating disposable account churn.
- **Zero Outgoing Emails:** Uses `adminClient.auth.admin.createUser({ email_confirm: true })` (only if the user does not exist), completely bypassing email sending.

---

## 3. LOCAL VALIDATION RESULTS

| Test / Check | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Local Test Suite** | `npm test` | **70 / 70 PASS (100%)** | Execution time: **65.4ms**; 0 outbound requests |
| **TypeScript Typecheck** | `npm run lint` | **0 Errors (`tsc --noEmit`)** | Strict type safety verified |
| **Production Build** | `npm run build` | **Clean Build (`vite build`)** | `dist/` bundle compiled in 3.51s |
| **Live Staging E2E** | `npx tsx scripts/testStagingE2E.ts` | **14 / 14 PASS (100%)** | Reused controlled test user; zero disposable churn |
| **Vite Dev Server** | `http://localhost:3000` | **HTTP 200 OK** | Hot-reloaded with new rate-limit UI |
| **Express Backend** | `http://localhost:3001` | **HTTP 200 OK** | `/health` status: `HEALTHY` (`sandbox` mode) |

---

## 4. STAGING DASHBOARD ACTIONS YOU CAN PERFORM MANUALLY

To manage email rate limits on the hosted Supabase staging project `rkuzkwggijthbqwlwnps`, inspect the following settings in your Supabase Dashboard:

### 4.1 Option A: Disable Email Confirmations for Staging (Recommended for Rapid Testing)

If you are testing locally or in staging, disabling email confirmations allows instant registration and sign-in without relying on outgoing emails:

1. Open **Supabase Dashboard**:  
   `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/auth/providers`
2. Select **Email** under **Auth Providers**.
3. Toggle **Enable email confirmations** to **OFF**.
4. Click **Save**.
5. **Effect:** Every new signup is immediately verified; `data.session` is returned instantly; zero emails are sent; the rate limit error is completely avoided.

---

### 4.2 Option B: Configure Custom SMTP (Recommended for Staging with Email Flow)

If you need to test the real email verification flow, Supabase recommends connecting a custom SMTP provider (free tiers available):

1. Open **Project Settings -> Authentication**:  
   `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/settings/auth`
2. Scroll to **SMTP Settings**.
3. Toggle **Enable Custom SMTP** to **ON**.
4. Enter your provider's credentials:
   - **Provider examples:** Resend, SendGrid, Amazon SES, Postmark, Mailgun.
   - **Sender Email:** e.g., `noreply@yourdomain.com` or `auth@aeropool.com`
   - **Host & Port:** (e.g., `smtp.resend.com`, Port `587` or `465`)
   - **Username & Password:** Your provider's API key.
5. Click **Save**.
6. **Effect:** Removes the 3-4 emails/hour limit and applies your custom provider's quota (e.g., Resend allows 3,000 emails/month free).

---

### 4.3 Inspecting Rate Limits & Auth Logs

1. **Rate Limits Inspection:**
   - URL: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/settings/auth`
   - Scroll to **Rate Limits** to view current rate limits for emails per hour, signups per hour, and anonymous logins.
2. **Auth Logs Inspection:**
   - URL: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/logs/auth-logs`
   - Filter by status `429` to inspect the exact timestamp of rate-limited events and verify when the rolling hourly window clears.

---

## 5. BASELINE & PAYMENT SAFETY VERIFICATION

- **Protected Baseline Project (`krxkxhieyqcytknixqdm`):** Confirmed untouched, unlinked, and safeguarded with explicit runtime assertions.
- **Payment Gateway Mode:** Verified in **TEST MODE ONLY** (`rzp_test_...`, `isSandbox: true`).
- **No Remote Writes:** No database migrations or schema modifications were executed.
