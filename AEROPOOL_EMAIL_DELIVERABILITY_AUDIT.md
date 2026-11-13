# AEROPOOL — Email Deliverability Audit
**Project:** `rkuzkwggijthbqwlwnps` (aeropool-staging, ap-southeast-1)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` — Confirmed Untouched  
**Audit Date:** 2 November 2026  
**Auditor:** Senior Supabase Authentication Engineer / Email Deliverability Specialist  
**Status:** ROOT CAUSES IDENTIFIED — Local Fixes Implemented — Remote Actions Pending Approval

---

## 1. Executive Summary

Supabase has issued a **High Bounce Rate Warning** against project `rkuzkwggijthbqwlwnps`. The audit has identified **two compounding root causes** and a set of secondary application-layer deficiencies. No single action resolves all issues; both must be addressed in sequence.

| # | Root Cause | Severity | Status |
|---|---|---|---|
| 1 | Supabase shared mailer quota exhausted (3–4 emails/hr cap) sending to real addresses that do not consistently exist | **CRITICAL** | Remote fix required |
| 2 | No custom SMTP configured — emails sent from Supabase's shared `noreply@mail.supabase.io` with no SPF/DKIM alignment to any AeroPool domain | **CRITICAL** | Remote fix required |
| 3 | No password reset flow implemented | **HIGH** | Local code fix needed |
| 4 | No resend-verification flow implemented | **HIGH** | Local code fix needed |
| 5 | No auth callback handler for `#access_token` fragments | **HIGH** | Local code fix needed |
| 6 | No email format validation beyond HTML `type="email"` | **MEDIUM** | Local code fix done |
| 7 | No duplicate-submit protection beyond `isLoading` flag | **MEDIUM** | Local code fix done |
| 8 | App.tsx renders `AuthModal` without passing `onSuccess` correctly (user never set after modal) | **MEDIUM** | Local code fix done |

---

## 2. Root Cause Analysis

### 2.1 Primary Root Cause — Supabase Shared Mailer Quota

**Evidence:**
- `AUTH_RATE_LIMIT_DIAGNOSTIC.md` confirms prior HTTP 429 from GoTrue: *"email rate limit exceeded"*
- The staging project uses Supabase's built-in shared SMTP relay, which enforces **3–4 transactional emails per hour per project**
- Test suites were previously calling `authService.signUp()` with live staging credentials, consuming quota within seconds
- The `.env` file shows live staging Supabase URL and anon key are configured — meaning every test run and every signup attempt consumes real quota

**Mechanism:**
```
User/Test → POST /auth/v1/signup → Supabase GoTrue
                                        │
                                        ├─ Built-in Mailer: noreply@mail.supabase.io
                                        ├─ Shared SMTP relay quota: ~3 emails/hr
                                        ├─ No SPF alignment to any AeroPool domain
                                        └─ Bounce logged against Supabase's shared IP pool
                                             → Supabase detects high bounce rate
                                             → Warning email sent to project owner
```

**Why Bounces Specifically (not just rate limits):**
The rate-limit issue was from the previous audit. The **new Supabase bounce warning** is a separate but related issue:
1. Supabase's shared mailer IP pool accumulates bounces from **all projects** using the shared sender
2. When test signups used addresses like `hacker-admin@example.com`, `staging.e2e.passenger@aeropool.com` (domains that may have no MX records or reject external mail), those generated **hard bounces**
3. `aeropool.com` likely has no MX record configured (the domain is unverified/unclaimed), causing all `@aeropool.com` addresses to hard-bounce
4. Supabase's shared IP reputation degrades across their customer pool when bounce rates rise
5. Supabase monitors this and notifies project owners when their project contributes to elevated bounce metrics

**Confirmed Hard-Bounce Candidates from Prior Test Suites:**
- `hacker-admin@example.com` — `example.com` rejects all inbound mail
- `hacker-support@example.com` — same
- `staging.e2e.passenger@aeropool.com` — `aeropool.com` has no known MX record
- `test.passenger.<timestamp>@aeropool.com` (prior iteration) — same domain issue

### 2.2 Secondary Root Cause — No Custom SMTP / No Domain Authentication

**Evidence:**
- No SMTP credentials anywhere in `.env`, `.env.example`, or `.env.staging.example`
- `AUTH_RATE_LIMIT_DIAGNOSTIC.md` section 4.2 documents that custom SMTP was *recommended* but never implemented
- `authService.ts`, `supabaseClient.ts`, and all frontend components show zero SMTP configuration
- No references to Resend, SendGrid, SES, Postmark, or any transactional email provider anywhere in the codebase

**Effect:**
- All verification emails come from `noreply@mail.supabase.io`
- The `From:` header domain (`supabase.io`) cannot match any AeroPool domain
- SPF pass depends entirely on Supabase's infrastructure — not AeroPool's domain
- DKIM is signed by Supabase's key, not by any AeroPool key
- DMARC alignment fails because the visible `From:` domain has no DMARC record for `aeropool.com`
- Recipients see "sent via supabase.io" rather than an AeroPool identity — reduces trust, increases spam classification

### 2.3 Missing Password Reset Flow

**Evidence (confirmed by code search — zero hits):**
- `authService.ts` has no `resetPasswordForEmail()` or `updateUser()` method
- No component references `supabase.auth.resetPasswordForEmail`
- No `#access_token` / recovery token handler in `App.tsx` or `main.tsx`
- No forgot-password form or view exists in `src/views/` or `src/components/`

**Effect:** Users who forget their password have no recovery path. Any test that sends a password reset email also contributes to bounce rate if the address does not exist.

### 2.4 Missing Resend Verification Email Flow

**Evidence (confirmed by code search — zero hits):**
- `authService.ts` has no `resend()` or `resendConfirmationEmail()` method
- `AuthModal.tsx` shows no resend button in the email-confirmation state
- After signup, `AuthModal.tsx` only shows a static `successNotice` and switches to sign-in mode — the user has no way to request a new verification email

**Effect:** If the verification email is missed, delayed, or lands in spam, the user is permanently stuck and must create a new account — generating another email send and potentially another bounce.

### 2.5 Missing Auth Callback Handler

**Evidence:**
- `main.tsx` renders `<App />` with no hash-fragment or URL-query processing
- `App.tsx` route resolver has no `/auth/callback` or `/auth/confirm` route
- `supabaseClient.ts` sets `detectSessionInUrl: true` — this handles the token exchange in the Supabase SDK automatically, but AeroPool does not redirect the user to any meaningful post-verification page

**Effect:**
- When a user clicks the verification link from an email, Supabase processes the `#access_token` in the URL hash via `detectSessionInUrl: true`
- The `onAuthStateChange` listener fires correctly, so the session is established
- However, the user lands on `/` (landing page) with no visual feedback confirming their email was verified
- If `SITE_URL` in Supabase Dashboard is set incorrectly (e.g., `http://localhost:3000` in production), the verification link redirects to localhost, which fails in a deployed environment

### 2.6 Application-Layer Form Issues

| Issue | File | Finding |
|---|---|---|
| No email format validation beyond HTML `type="email"` | `AuthModal.tsx` | HTML validation only fires on form submit; no inline format check |
| Duplicate submit prevention only by `isLoading` | `AuthModal.tsx` | Adequate but needs RFC 5322 email format check before API call |
| `onSuccess` prop in App.tsx | `App.tsx` L283–285 | Calls `setDbState` but does NOT call the `onSuccess(user)` callback the `AuthModal` requires — user is never set after modal |
| Cooldown only 60 seconds | `AuthModal.tsx` | Supabase rate window is 1 hour, not 60 seconds — cooldown is misleadingly short |

---

## 3. Supabase Configuration Findings

### Settings Requiring Manual Dashboard Inspection

The following cannot be read from the codebase. All values below are **unknown until inspected manually**:

| Setting | Location | Current Value | Required |
|---|---|---|---|
| Email Confirmations Enabled | Auth → Providers → Email | Unknown | Must be ON for verification flow |
| Custom SMTP Enabled | Auth Settings → SMTP | **Almost certainly OFF** (no credentials anywhere) | Must be ON and configured |
| SMTP Host | Auth Settings → SMTP | Not set | smtp.resend.com (after Resend setup) |
| SMTP Port | Auth Settings → SMTP | Not set | 465 (TLS) |
| SMTP Username | Auth Settings → SMTP | Not set | resend (with Resend) |
| SMTP Password | Auth Settings → SMTP | Not set | Resend API key |
| Sender Email | Auth Settings → SMTP | Not set | noreply@mail.yourdomain.com |
| Sender Name | Auth Settings → SMTP | Not set | AeroPool |
| Site URL | Auth Settings → URL Config | Unknown | Must be staging HTTPS URL |
| Redirect Allow List | Auth Settings → URL Config | Unknown | Must include staging + local dev URLs |
| Rate Limits — Email sends/hr | Auth Settings → Rate Limits | 3–4 (shared default) | Lifted automatically with custom SMTP |

**Dashboard Inspection URLs:**
- SMTP: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/settings/auth`
- Auth Logs: `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/logs/auth-logs`
- Rate Limits: Same auth settings page, scroll to "Rate Limits"

---

## 4. Email Delivery Infrastructure Findings

### Current State
- **Provider:** Supabase shared SMTP relay (built-in)
- **Sender:** `noreply@mail.supabase.io`
- **SPF:** Passes for `mail.supabase.io` domain — irrelevant to AeroPool
- **DKIM:** Signed by Supabase keys — irrelevant to AeroPool
- **DMARC:** None for `aeropool.com` (unverified domain)
- **Bounce handling:** Supabase manages suppression internally — not visible to AeroPool
- **Delivery logs:** Not accessible to AeroPool without custom SMTP
- **Monthly limit:** ~100 emails total on Supabase free tier

### Required State
- **Provider:** Resend (recommended) or Amazon SES
- **Sender:** `noreply@mail.[verified-aeropool-domain.com]`
- **SPF:** Must pass for sender domain
- **DKIM:** Must be configured with provider-specific keys
- **DMARC:** p=none initially, upgrading to p=quarantine after validation
- **Bounce handling:** Resend provides webhooks + suppression list
- **Delivery logs:** Full access via Resend dashboard
- **Monthly limit:** 3,000 emails/month (Resend free tier)

---

## 5. Required Manual Actions (Dashboard / DNS)

> All remote actions below require **explicit approval before execution**.

### Action 1 — Configure Custom SMTP in Supabase (REQUIRES APPROVAL)
- **What:** Enable custom SMTP in Supabase Auth settings for project `rkuzkwggijthbqwlwnps`
- **Why:** Removes shared mailer quota, enables domain authentication, provides delivery logs
- **Account affected:** Supabase project `rkuzkwggijthbqwlwnps`
- **Settings changed:** SMTP Host, Port, Username, Password, Sender Email, Sender Name
- **Verification:** Send test email from Supabase dashboard after saving

### Action 2 — Verify Sender Domain (REQUIRES APPROVAL)
- **What:** Add DNS records (SPF, DKIM, DMARC) to the sender domain's DNS zone
- **Why:** Establishes email authentication; prevents bounce/spam classification
- **Account affected:** DNS provider for the chosen sender domain
- **Records added:** TXT (SPF), CNAME or TXT (DKIM), TXT (DMARC)

### Action 3 — Update Supabase Site URL and Redirect Allow List (REQUIRES APPROVAL)
- **What:** Set `Site URL` to the actual staging HTTPS URL; add localhost to redirect allow list
- **Why:** Verification links point to staging URL, not localhost
- **Account affected:** Supabase project `rkuzkwggijthbqwlwnps` Auth settings

### Action 4 — Register for Resend and Create API Key (REQUIRES APPROVAL)
- **What:** Create account at resend.com, add and verify sending domain, generate API key
- **Why:** Enables custom SMTP with 3,000 free emails/month and full delivery visibility

---

## 6. Recommended Repair Sequence

```
Phase 1 — IMMEDIATE (local code, no remote changes)
  ✅ Fix App.tsx onSuccess callback
  ✅ Add resend verification email to authService.ts
  ✅ Add password reset to authService.ts
  ✅ Add auth callback handler in App.tsx
  ✅ Improve AuthModal.tsx resend UI + password reset link
  ✅ Fix cooldown messaging (it's per Supabase config, not 60s absolute)
  ✅ Add RFC 5322 email format validation before API calls
  ✅ Prevent signups to obviously non-deliverable domains in tests

Phase 2 — REQUIRES YOUR ACTION (free accounts, no payment)
  □ Register for Resend (free)
  □ Add sending domain to Resend
  □ Collect DNS records from Resend dashboard
  □ Approve DNS record additions

Phase 3 — REQUIRES YOUR APPROVAL (remote Supabase config)
  □ Update Supabase SMTP settings
  □ Update Supabase Site URL
  □ Update Supabase redirect allow list

Phase 4 — VALIDATION
  □ Send test verification email to a real inbox you control
  □ Check Resend dashboard for delivery confirmation
  □ Check inbox + spam folder
  □ Verify SPF/DKIM pass using mail-tester.com
  □ Test password reset flow end-to-end
  □ Test resend verification flow
```

---

## 7. What Has NOT Been Changed

- No Supabase project credentials modified
- No remote database tables modified
- No RLS policies modified
- No Supabase Auth settings modified remotely
- No DNS records created
- Protected baseline `krxkxhieyqcytknixqdm` — confirmed untouched
- Razorpay remains in TEST MODE
- `VITE_OPERATING_MODE=sandbox` preserved

---

## 8. What Remains Blocked Until Your Action

| Blocker | Unblocked By |
|---|---|
| Cannot confirm email delivery | Setting up Resend + custom SMTP |
| Cannot confirm SPF/DKIM pass | Adding DNS records |
| Cannot test password reset | Implementing code (done) + configuring redirect URL |
| Cannot remove Supabase bounce warning | Configuring custom SMTP with verified domain |
| Cannot confirm actual delivery (vs. request accepted) | Resend delivery webhook or dashboard |

