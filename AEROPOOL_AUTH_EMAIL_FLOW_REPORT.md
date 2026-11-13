# AEROPOOL — Authentication & Email Flow Report
**Staging Project:** `rkuzkwggijthbqwlwnps` (aeropool-staging, ap-southeast-1)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (Untouched & Protected)  
**Date:** 2 November 2026  
**Status:** Architecture Implemented & Documented

---

## 1. Overview of Complete Authentication & Email Architecture

AeroPool's email verification and recovery system operates with strict separation of roles, rigorous frontend rate-limit shielding, RFC 5322 structural email validation, and dedicated token callback routes.

```
                      ┌────────────────────────────────────────┐
                      │          AeroPool Frontend             │
                      │  (AuthModal / ForgotPasswordView)      │
                      └──────────────────┬─────────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │ 1. Client-Side Format & Cooldown Validation           │
             │    - RFC 5322 regex & domain structure check          │
             │    - Debounce & submit lockout (isLoading)            │
             │    - Local cooldown timer (prevent 429 loops)         │
             └───────────────────────────┬───────────────────────────┘
                                         │
                                         ▼ POST /auth/v1/(signup|resend|recover)
                      ┌────────────────────────────────────────┐
                      │         Supabase GoTrue Auth           │
                      │  (Target: rkuzkwggijthbqwlwnps)        │
                      └──────────────────┬─────────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │ 2. Custom SMTP Relay (Resend - smtp.resend.com:465)   │
             │    - Authenticated with Resend API Key                │
             │    - Sender: noreply@mail.aeropool.in                 │
             │    - Domain: DKIM signed + SPF aligned                │
             └───────────────────────────┬───────────────────────────┘
                                         │
                                         ▼ SMTP Dispatch
                      ┌────────────────────────────────────────┐
                      │         Recipient Mail Server          │
                      │  (Gmail / Outlook / Corporate MX)      │
                      │   - SPF Check: PASS                    │
                      │   - DKIM Verification: PASS            │
                      │   - DMARC Policy: PASS (p=none)        │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼ User clicks link with token
                      ┌────────────────────────────────────────┐
                      │    AeroPool Callback Router (App.tsx)  │
                      │   - detectSessionInUrl: true           │
                      │   - /auth/email-verified  (Confirmation)│
                      │   - /auth/reset-password  (Recovery)   │
                      └────────────────────────────────────────┘
```

---

## 2. Passenger Signup & Verification Flow

### 2.1 Step-by-Step Flow
1. **User Input:** Passenger enters legal name, phone (optional), email address, and password (≥6 chars).
2. **Client Validation:**
   - Validates RFC 5322 format: exactly one `@`, valid domain label with dots, no spaces.
   - Prevents duplicate clicks via `isLoading` flag and cooldown counters.
3. **Submission:** Calls `authService.signUp({ email, password, fullName, phone, role: 'passenger' })`.
   - Security: Public registration role is strictly enforced as `'passenger'` (any client tampering stripped).
4. **Supabase Response:**
   - When email confirmations are enabled: `data.user` is created, `data.session` is `null`.
5. **UI Transition:**
   - Instead of abruptly flipping to login, `AuthModal` enters `mode='email_confirmation'`.
   - Displays recipient email, clear 3-step action instructions, and spam folder guidance.
   - Accurately states that the send request was accepted, noting delivery depends on the provider.
6. **Email Reception:**
   - User receives branded dark navy/cyan email from `AeroPool <noreply@mail.[domain]>`.
   - Email includes primary CTA button and clean plaintext fallback URL.
7. **Verification Callback:**
   - User clicks `ConfirmationURL`.
   - Supabase processes `#access_token` via `detectSessionInUrl: true`.
   - `onAuthStateChange` fires `SIGNED_IN` / `USER_UPDATED`.
   - AeroPool detects hash `type=signup` and routes user to `/auth/email-verified`.
   - User clicks "Sign In to AeroPool" or proceeds straight to `/app/book` or `/app/dashboard`.

---

## 3. Commercial Driver Onboarding & KYC Flow

### 3.1 Strict Separation of Verification and Commercial Approval
> [!IMPORTANT]
> **Email confirmation NEVER automatically grants driver privileges.**
> Email confirmation solely proves possession of the email inbox. Commercial driving requires administrative background checks and document approvals.

1. **Driver Signup:**
   - Driver registers as normal through the platform. Initial public role is strictly `'passenger'`.
2. **Email Verification:**
   - Driver verifies email address following the standard verification procedure.
3. **KYC Onboarding:**
   - Driver navigates to `/driver/kyc` (DriverKYCView).
   - Fills out commercial licence details, Maharashtra PSV taxi driver badge number, vehicle plate, category, seat/luggage capacity.
   - Uploads photo and compliance documents (DL, Commercial Permit, Vehicle RC, Police Clearance).
4. **Administrative Verification:**
   - Status remains `under_review` / `draft`.
   - Only an authorized AeroPool admin via `/api/admin/verify-kyc` can approve the KYC and update the user's role to `'driver'`.
   - This ensures full safety and CSMIA airport compliance.

---

## 4. Resend Verification Email Flow & Rate Limiting

### 4.1 Resend Handling
- **Dedicated Method:** `authService.resendVerificationEmail(email)` invokes `supabase.auth.resend({ type: 'signup', email })`.
- **UI State Machine:**
  - Disabled during active send (`resendLoading`).
  - Active countdown timer (`resendCooldown`, 60s cooldown).
  - Handles distinct response categories:
    - **Accepted:** Shows success banner confirming email was re-queued.
    - **Already Verified:** Informs user their account is already verified and flips to sign-in.
    - **Rate Limited:** Displays countdown and Supabase retry recommendation.
    - **Invalid Address:** Rejects malformed addresses before calling Supabase.
- **Truth in Messaging:**
  - Distinguishes clearly between *"Request accepted"* vs *"Delivered"*.
  - Eliminates misleading claims of confirmed inbox arrival until webhooks or provider receipts are available.

---

## 5. Password Reset & Recovery Flow

### 5.1 Architecture & Implementation
- **Forgot Password Initiation (`/forgot-password`):**
  - Clean view where user submits their account email.
  - Calls `authService.resetPasswordForEmail(email, redirectUrl)`.
  - Anti-Enumeration: Always displays success message to avoid revealing whether an account exists.
- **Email Link Structure:**
  - Supabase generates a single-use recovery token directed to `${window.location.origin}/auth/reset-password`.
- **Token Recovery & Password Update (`/auth/reset-password`):**
  - Supabase client automatically validates token and fires `PASSWORD_RECOVERY` auth event.
  - Displays password change form with confirmation input and length checks (≥6 characters).
  - Calls `authService.updatePassword(newPassword)` which executes `supabase.auth.updateUser`.
  - On success, confirms update and directs user to sign in with new credentials.

---

## 6. Redirect URLs & URL Allow-List Matrix

| Environment | Purpose | Target URL |
|---|---|---|
| **Local Development** | Site URL / Dev Testing | `http://localhost:3000` |
| **Local Development** | Email Callback Allow-list | `http://localhost:3000/**` |
| **Staging Deployment**| Site URL / Staging UAT | `https://[staging-domain].vercel.app` |
| **Staging Deployment**| Email Callback Allow-list | `https://[staging-domain].vercel.app/**` |
| **Recovery Route**    | Password Reset Handler | `/auth/reset-password` |
| **Confirmation Route**| Signup Verification Handler| `/auth/email-verified` |

---

## 7. Delivery Status Accuracy Matrix

| System State | What Supabase Reports | What AeroPool UI Displays |
|---|---|---|
| Request submitted to API | `data.user` returned, session null | *"Verification email requested. Check your inbox and spam folder."* |
| Custom SMTP accepted | HTTP 200 OK | *"Verification email re-queued. Delivery depends on provider."* |
| Provider Rate-Limited | HTTP 429 `"rate limit exceeded"` | *"Email rate limit exceeded. Please wait Xs before retrying."* |
| Already Confirmed | Error `"email already confirmed"` | *"Your email address is already verified. Please sign in."* |
| Invalid Email Format | Blocked locally before API call | *"Please enter a valid email address (e.g. name@example.com)."* |
| Hard Bounce (Provider Level)| Provider logs (Resend / SES) | Recorded in provider suppression list. No automatic retry. |

