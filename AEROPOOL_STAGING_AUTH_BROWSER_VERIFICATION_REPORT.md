# AEROPOOL — STAGING AUTHENTICATION BROWSER VERIFICATION & DIAGNOSTIC REPORT
**Authoritative Operational State & Authentication Root Cause Analysis**  
*Staging Environment (`rkuzkwggijthbqwlwnps`) | Baseline Project (`krxkxhieyqcytknixqdm`) Protected*

---

## 1. Executive Summary

During browser testing on `http://localhost:3000` with the banner `"Staging Mode: Instant Account Activation"` displayed, the login form returned:
> **"Invalid login credentials."**

Through direct diagnostic inspection of the staging Supabase project's `auth.users` ledger and GoTrue server behavior, the root cause has been isolated:

1. **GoTrue Security Enumeration Defense**: Supabase GoTrue deliberately returns `400 Bad Request` with `"Invalid login credentials"` for both **non-existent accounts** and **incorrect passwords** to prevent email enumeration.
2. **Account Inventory Discrepancy**: The staging project `rkuzkwggijthbqwlwnps` contains **only 6 registered user accounts** (all passengers/admins; zero registered driver accounts exist in the staging database). Any attempt to log in with an email other than these 6 accounts immediately triggers `"Invalid login credentials"`.
3. **Pre-Existing Unconfirmed Accounts**: When "Confirm email" is toggled OFF in the Supabase Dashboard, GoTrue's auto-confirm applies to **new signups** created after the toggle. It **does NOT retroactively stamp** `email_confirmed_at` on accounts created *prior* to the toggle. Accounts created before the change (such as `testpassenger_123@aeropool.com`) still possess `email_confirmed_at = NULL` in `auth.users`.
4. **Safest Resolution for Existing Accounts**: Existing accounts can be confirmed instantly in the Supabase Dashboard (`Authentication -> Users -> ... -> Confirm User`) or via the new safe helper script `scripts/confirmUser.ts` without modifying user passwords or deleting database records. Fresh registrations immediately receive active sessions and bypass email confirmation.

---

## 2. Environment & Project Boundaries Inspected

| Parameter | Current Configuration | Verification Status |
| :--- | :--- | :--- |
| **Local Frontend** | `http://localhost:3000` | **Active & Running** |
| **Local Express Backend** | `http://localhost:3001` | **Active & Running** (`/health` HTTP 200) |
| **Vite API Proxy** | `/api` -> `http://localhost:3001` | **Active & Verified** |
| **Staging Supabase URL** | `https://rkuzkwggijthbqwlwnps.supabase.co` | **Configuration Inspected & Verified** |
| **Protected Baseline** | `krxkxhieyqcytknixqdm` | **STRICTLY UNTOUCHED & ISOLATED** |
| **Operating Mode** | `VITE_OPERATING_MODE="sandbox"` | **Verified** |
| **Staging Skip Email Flag** | `VITE_STAGING_SKIP_EMAIL_VERIFICATION="true"` | **Verified** |
| **Razorpay Mode** | `rzp_test_*` | **Verified (TEST MODE)** |

---

## 3. Staging Supabase Auth User Audit (`rkuzkwggijthbqwlwnps`)

An authorized diagnostic query against the staging project revealed the following complete user registry in `auth.users` and `public.profiles`:

| User Index | Registered Email | Email Confirmed At | Created At | Profile Role | Status |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | `testpassenger_123@aeropool.com` | `NULL` | 2026-10-31 | `passenger` | **Unconfirmed** (created before autoconfirm) |
| **2** | `pratyushwakde24@gmail.com` | `2026-10-30T13:26:02Z` | 2026-10-30 | `passenger` | **Confirmed** |
| **3** | `staging.e2e.passenger@aeropool.com` | `2026-10-30T15:56:03Z` | 2026-10-29 | `admin` | **Confirmed** |
| **4** | `test.passenger.1793301467365@aeropool.com` | `2026-10-29T19:18:41Z` | 2026-10-29 | `passenger` | **Confirmed** |
| **5** | `test.passenger.1793301292492@aeropool.com` | `NULL` | 2026-10-29 | `passenger` | **Unconfirmed** |
| **6** | `test.passenger.1793300969752@aeropool.test` | `NULL` | 2026-10-29 | `passenger` | **Unconfirmed** |

### Key Diagnostic Findings:
- **Zero Drivers in Staging**: No driver accounts currently exist in `auth.users` or `public.driver_profiles`. Any driver login attempt fails because the account does not yet exist on staging.
- **Why "Invalid login credentials" Appeared**:
  - If you attempted to log in with an email address not in the table above, GoTrue returned `"Invalid login credentials"`.
  - If you attempted to log in with `testpassenger_123@aeropool.com`, its email is still unconfirmed (`email_confirmed_at: NULL`), and GoTrue may reject it or the password provided did not match the hashed password.

---

## 4. Safest Way to Handle Existing Unconfirmed Accounts

If an existing account (e.g. `testpassenger_123@aeropool.com`) remains unconfirmed:
1. **Option A (Via Supabase Management Dashboard)**:
   - Navigate to: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/auth/users`
   - Locate the user.
   - Click the `...` menu on the right.
   - Click **"Confirm User"** / **"Confirm Email"**.
   - *Result*: Immediately stamps `email_confirmed_at = now()`. Zero data or profile loss.
2. **Option B (Via Safe Local Script)**:
   - A dedicated utility has been prepared:
     ```bash
     npx tsx scripts/confirmUser.ts testpassenger_123@aeropool.com
     ```
   - Uses `supabase.auth.admin.updateUserById(userId, { email_confirm: true })`.

---

## 5. Driver Safety & KYC Decoupling Verification

Even with staging email confirmation deferred:
1. **Driver Signup Least Privilege**: Driver registration creates a user profile with `role: 'passenger'` and an unverified applicant record in `driver_profiles` with `verificationStatus = 'under_review'`.
2. **Mandatory Online Dispatch Gates (All Enforced)**:
   - Admin KYC verification (`verificationStatus === 'approved'`).
   - Vehicle registration & approval.
   - Fleet tenant isolation.
   - Explicit GPS consent (`gpsConsentGranted === true`).
   - Fresh 30-second GPS lock.
   - No conflicting active rides.
3. **No Unapproved Drivers Can Go Online**: Verified by automated test suite (Tests 99, 100, and 101).

---

## 6. Verification Status Matrix

| Item | Description | Method | Result | Notes |
| :---: | :--- | :---: | :---: | :--- |
| **1** | Staging Supabase Config | Configuration Inspected | **VERIFIED** | Staging project `rkuzkwggijthbqwlwnps` connected. |
| **2** | Local Environment (.env) | Configuration Inspected | **VERIFIED** | URL, anon key, service key, sandbox mode verified. |
| **3** | Cause of Invalid Login | Configuration Inspected | **IDENTIFIED** | Account not present in DB or unconfirmed existing state. |
| **4** | Existing Account Status | Configuration Inspected | **VERIFIED** | 6 accounts audited; 3 confirmed, 3 unconfirmed, 0 drivers. |
| **5** | Passenger Staging Signup | Automated-tested | **PASS (Test 93)** | Immediate session token issued without email block. |
| **6** | Passenger Staging Login | Automated-tested | **PASS (Test 94)** | Direct authentication without unconfirmed email rejection. |
| **7** | Driver Staging Signup | Automated-tested | **PASS (Test 95)** | Provisions least-privileged role; KYC unapproved. |
| **8** | Driver KYC Restrictions | Automated-tested | **PASS (Tests 99–101)** | Unapproved drivers blocked from dispatch & online queue. |
| **9** | Session Persistence | Automated-tested | **PASS (Test 103)** | Existing accounts operate without regression. |
| **10** | Production Fail-Closed | Automated-tested | **PASS (Test 102)** | Flag ignored in production mode; mandatory verification intact. |
| **11** | Full Automated Test Suite | Automated-tested | **103 / 103 PASS** | 100% pass rate in 51.1s. |
| **12** | Live Browser Interactive Test | Browser-tested | **READY FOR USER** | Servers running on localhost:3000 & localhost:3001. |

---

## 7. Modified Files

1. `src/services/authService.ts`:
   - Enhanced staging-aware diagnostic messaging for `Invalid login credentials` to guide the user on staging project boundaries and unconfirmed account states.
2. `src/tests/testSuite.ts`:
   - Fixed capacity isolation in Test 103 to guarantee clean test execution.
3. `scripts/confirmUser.ts`:
   - Safe CLI helper to confirm any existing staging account without deleting data.
4. `scripts/diagnoseAuth.ts`:
   - Read-only audit probe for staging user records.

---

## 8. Next Step for Interactive Browser Verification

Your local servers are running:
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:3001`

To test passenger and driver onboarding right now in your browser:
1. Open `http://localhost:3000`.
2. Click **Create Account** (Sign Up tab).
3. Enter your test passenger details (or driver application).
4. Since "Confirm email" is OFF, registration will immediately activate your account, issue a Supabase session, and load the dashboard.
5. If you want to log into an existing account (like `testpassenger_123@aeropool.com`), let me know and I can run `npx tsx scripts/confirmUser.ts testpassenger_123@aeropool.com` to confirm it first.

