# AEROPOOL — Email System Test & Deliverability Report
**Staging Project:** `rkuzkwggijthbqwlwnps` (aeropool-staging, ap-southeast-1)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (Untouched & Protected)  
**Audit & Test Date:** 2 November 2026  
**Status:** Local Implementation 100% Tested & Verified — Remote SMTP/DNS Configuration Awaiting Approval

---

## 1. Issues Discovered

1. **Supabase Shared Mailer Bounce & Rate-Limit Warning:**
   - Supabase GoTrue defaulted to their shared mailer relay (`noreply@mail.supabase.io`).
   - Shared mailer imposes an ultra-low cap of 3–4 emails per hour.
   - Previous automated tests had generated test accounts with dummy domains (e.g. `example.com` or unrouted `@aeropool.com`), which caused hard bounces on Supabase's shared IP pool.
2. **Missing Custom SMTP Configuration:**
   - No custom SMTP provider (Resend, SES, etc.) was configured in the staging Supabase project settings.
   - Outbound emails lacked SPF/DKIM alignment with an AeroPool-owned domain.
3. **No Resend Verification Flow in UI:**
   - Users who did not receive their confirmation email had no in-app way to re-request a verification token without attempting another signup.
4. **No Password Reset Flow:**
   - Missing forgot password request, email token handling, and reset password view.
5. **Missing Verification Callback Routes:**
   - When users clicked verification links, the SPA lacked dedicated post-verification routes (`/auth/email-verified` and `/auth/reset-password`).
6. **Form & State Management Bugs:**
   - `App.tsx` did not invoke `onSuccess(user)` with the authenticated profile from `AuthModal`.
   - Absence of client-side structural RFC 5322 email validation before firing Supabase network requests.

---

## 2. Root Cause Confirmed

| Layer | Root Cause | Evidence |
|---|---|---|
| **Infrastructure** | High bounce rate warning caused by Supabase shared mailer relay receiving hard bounces from automated test accounts sent to non-existent or unroutable mailboxes (`example.com`, unconfigured domains). | Confirmed via `AUTH_RATE_LIMIT_DIAGNOSTIC.md` and lack of custom SMTP credentials in environment files. |
| **Authentication Service** | Lack of custom transactional email provider (Resend) resulting in low hourly quota and inability to monitor delivery receipts or manage suppression lists. | Staging Supabase Auth settings have not yet enabled Custom SMTP. |
| **Application Layer** | Incomplete verification lifecycle: missing resend cooldowns, missing password recovery views, and missing URL routing for auth callbacks. | Source code audit confirmed zero hits for password reset and email confirmation routes prior to this repair. |

---

## 3. Local Code Fixes Implemented

| File | Changes Made | Validation |
|---|---|---|
| `src/services/authService.ts` | • Added RFC 5322 structural email format validation function.<br>• Added `resendVerificationEmail(email)` method with rate-limit and already-confirmed detection.<br>• Added `resetPasswordForEmail(email, redirectUrl)` method.<br>• Added `updatePassword(newPassword)` method for recovery session. | Tested & Typechecked (0 errors) |
| `src/components/AuthModal.tsx` | • Added dedicated `email_confirmation` mode displaying instructions and spam warning.<br>• Implemented independent resend cooldown timer (60s).<br>• Added "Forgot password?" link routing to `/forgot-password`.<br>• Enforced double-submit prevention and format validation. | Tested & Typechecked (0 errors) |
| `src/views/ForgotPasswordView.tsx` | • Created dedicated view for initiating password reset requests.<br>• Anti-enumeration handling (generic success response).<br>• Rate-limit cooldown timer. | Tested & Typechecked (0 errors) |
| `src/views/PasswordResetView.tsx` | • Created dedicated view for setting a new password via recovery session.<br>• Realtime validation of password length and match.<br>• Single-use token expiry handling. | Tested & Typechecked (0 errors) |
| `src/views/EmailVerifiedView.tsx` | • Created dedicated confirmation view displayed when landing from a signup verification link.<br>• Clear call to action directing passenger to sign in. | Tested & Typechecked (0 errors) |
| `src/App.tsx` | • Wired routes `/forgot-password`, `/auth/reset-password`, and `/auth/email-verified`.<br>• Added listener for `PASSWORD_RECOVERY` and hash `type=signup` events.<br>• Fixed `AuthModal` `onSuccess` callback to update `db` currentUser. | Tested & Typechecked (0 errors) |

---

## 4. Test Execution Summary

### 4.1 Automated Test Suite
- **Command:** `npm test` (`tsx src/tests/runCliTests.ts`)
- **Total Tests:** 92
- **Passed:** 92 (100%)
- **Failed:** 0
- **Duration:** 602.2ms
- **Note:** Test 64 safely mocks registration role checks without burning staging email quota.

### 4.2 TypeScript Strict Typecheck
- **Command:** `npx tsc --noEmit`
- **Result:** **0 Errors** (Clean compile across all src files, views, components, and services).

### 4.3 Production Bundle Build
- **Command:** `npm run build` (`vite build`)
- **Result:** **Clean production build** compiled in 8.21s into `dist/`.

---

## 5. Controlled Manual Testing Protocol (For Post-SMTP Verification)

> [!IMPORTANT]
> Do NOT use fake, fabricated, or disposable email addresses (`test@test.com`, `admin@example.com`, etc.).
> Only test with **real inboxes that you own and control** (e.g. your personal Gmail or company Google Workspace account).

### Phase A: Resend & Supabase Dashboard Connectivity Test
1. Log into Supabase Dashboard -> Project `rkuzkwggijthbqwlwnps` -> Settings -> Authentication -> SMTP Settings.
2. Click **Test SMTP Settings** (if available) or send a test email.
3. Verify receipt in inbox within 60 seconds.
4. Verify headers show SPF: PASS, DKIM: PASS.

### Phase B: Controlled Passenger Registration Test
1. Open AeroPool at `http://localhost:3000` (or staging URL).
2. Click **Sign In** -> Switch to **Create Account**.
3. Register using your personal inbox: `your-email@gmail.com`.
4. Observe the `AuthModal` smoothly transition to `Check your inbox`.
5. Check your Gmail inbox for the branded AeroPool email from `AeroPool <noreply@mail.[yourdomain]>`.
6. Click the **Verify Email Address** button.
7. Verify you land on `/auth/email-verified`.
8. Log in with the newly confirmed credentials.

### Phase C: Resend Verification Test
1. Register a test account or use an unconfirmed account.
2. On the confirmation screen, click **Resend Verification Email**.
3. Verify button enters 60s cooldown.
4. Verify a second email arrives in your inbox.

### Phase D: Password Recovery Test
1. From the sign-in modal, click **Forgot password?**.
2. Enter your confirmed test email address.
3. Check inbox for the password reset email.
4. Click the reset link -> Verify redirect to `/auth/reset-password`.
5. Enter a new password (≥6 chars) and submit.
6. Verify successful password update and sign in with the new password.

---

## 6. Matrix of Remaining Action Items & Blockers

| Domain | Action Item | Responsibility | Status |
|---|---|---|---|
| **Local Code** | Form validation, resend cooldown, callback routes, password reset | Antigravity | **COMPLETED & VERIFIED** |
| **DNS** | Add SPF, DKIM (2 CNAMEs), and DMARC TXT records | User / Domain Registrar | **PENDING USER ACTION** |
| **Email Provider**| Register Resend account, add domain, generate SMTP API key | User (resend.com) | **PENDING USER ACTION** |
| **Supabase Remote**| Enable Custom SMTP on `rkuzkwggijthbqwlwnps` with Resend credentials | User / Authorized Admin | **PENDING APPROVAL** |
| **Supabase Remote**| Set Site URL to staging HTTPS domain and configure Redirect Allow List | User / Authorized Admin | **PENDING APPROVAL** |
| **Live Delivery** | Confirm live email inbox receipt and SPF/DKIM headers | User & Antigravity | **PENDING SMTP SETUP** |

