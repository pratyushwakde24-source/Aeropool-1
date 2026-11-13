# AeroPool — Primary Super Admin Account Configuration Report
**Authorized Staging Service-Role Promotion & Verification**  
*Target Staging Project: `rkuzkwggijthbqwlwnps` | Protected Baseline: `krxkxhieyqcytknixqdm` (Untouched)*

---

## 1. Executive Summary

Pursuant to explicit user authorization (**Option A**), the personal staging account `pratyushwakde24@gmail.com` has been promoted to the canonical **Super Admin (`admin`)** role on the AeroPool staging project (`rkuzkwggijthbqwlwnps`).

The promotion was executed via the authorized Supabase service-role administrative client without bypassing Row Level Security (RLS), without weakening PostgreSQL security triggers, and without modifying or resetting the user's password. The account's Auth User ID, email, profile details, and database history remain completely intact.

All **118 platform architecture and security tests** have passed with a **100% pass rate**, and the production Vite bundle compiles cleanly with **0 errors**.

---

## 2. Target Account Verification & Role Transition

| Parameter | Pre-Promotion Value | Post-Promotion Value | Verification Status |
| :--- | :--- | :--- | :---: |
| **Auth User ID** | `76e38e6a-27c4-4921-98ec-2c3c26d95fbc` | `76e38e6a-27c4-4921-98ec-2c3c26d95fbc` | **Unchanged (Preserved)** |
| **Registered Email** | `pratyushwakde24@gmail.com` | `pratyushwakde24@gmail.com` | **Unchanged (Preserved)** |
| **Full Name** | `Pratyush Wakde` | `Pratyush Wakde` | **Unchanged (Preserved)** |
| **Email Confirmation**| Confirmed (`2026-10-30T13:26:02Z`)| Confirmed (`2026-10-30T13:26:02Z`)| **Confirmed (Active)** |
| **`public.profiles` Role**| `'passenger'` | **`'admin'`** | **Successfully Promoted** |
| **`auth.users` Metadata Role**| `'passenger'` | **`'admin'`** | **Successfully Synchronized** |
| **Password Integrity** | Active Hashed Secret | Active Hashed Secret | **Preserved (Never Modified/Exposed)** |
| **Account History** | Existing bookings & history | Existing bookings & history | **100% Preserved** |

---

## 3. Pre-Execution Boundary Verification

Prior to performing any remote database update, the promotion script validated all isolation boundaries:
1. **Target Project Verification**: Verified that `VITE_SUPABASE_URL` points exclusively to `https://rkuzkwggijthbqwlwnps.supabase.co`.
2. **Protected Baseline Boundary**: Verified that `krxkxhieyqcytknixqdm` was strictly excluded and completely isolated.
3. **Identity Match**: Confirmed that User ID `76e38e6a-27c4-4921-98ec-2c3c26d95fbc` belongs uniquely to `pratyushwakde24@gmail.com`.
4. **Duplicate Prevention**: No new rows were inserted; zero duplicate accounts or split profiles were created.

---

## 4. Execution Details & Backend Security Verification

The promotion was applied atomically across two synchronized layers:
1. **PostgreSQL Canonical Role (`public.profiles`)**:
   - Updated `public.profiles.role` to `'admin'`.
   - Conforms strictly to trigger `trg_protect_profile_role` which permits role updates when `current_setting('request.jwt.claim.role', true) = 'service_role'`.
   - Client-side role escalation by regular authenticated users remains completely blocked by the database trigger.
2. **Supabase Auth Metadata (`auth.users`)**:
   - Updated `auth.users.raw_user_meta_data` to `{ "role": "admin", "full_name": "Pratyush Wakde" }`.
   - Ensures that subsequent Supabase JWT access tokens carry `role: 'admin'`, guaranteeing full alignment between client session claims and backend database queries.
3. **Read-Only Verification Query**:
   Immediately following execution, a read-only query confirmed:
   ```text
   Verified Profile: ID=76e38e6a-27c4-4921-98ec-2c3c26d95fbc, Email=pratyushwakde24@gmail.com, Role=admin
   Verified Auth:    ID=76e38e6a-27c4-4921-98ec-2c3c26d95fbc, Metadata Role=admin
   ```

---

## 5. Test Administrator Account Status (`staging.e2e.passenger@aeropool.com`)

In accordance with change control instructions:
- **Email**: `staging.e2e.passenger@aeropool.com`
- **Auth User ID**: `7960cb2e-42fd-4cdc-85f7-be8e25eb0f97`
- **Status**: **Untouched and intact**. Zero modifications, deletions, or role alterations were made to this account.

---

## 6. Frontend Navigation & Access Verification

With the path-aware routing enhancements deployed to `src/App.tsx`:
1. **Direct Route Access**: Navigating to `http://localhost:3000/admin` is now fully supported without resetting to the landing page.
2. **Auto-Navigation on Sign-In**: When logging in with `pratyushwakde24@gmail.com`, `AuthModal` detects `user.role === 'admin'` and automatically navigates directly to `/admin`.
3. **Navbar & Footer Visibility**:
   - Top Navbar: A dedicated **"Super Admin"** button appears next to "FAQ" when signed in as an admin.
   - User Avatar Menu: Displays the purple **"Super Admin"** badge and **"Super Admin Console"** link.
   - Global Footer: Includes a direct link to **"Super Admin Console"** under the Platform section.
4. **Map Provider Engine**:
   - Inside the Super Admin Console (`/admin`), the **"Map Provider Engine"** tab is active and visible.
   - Allows instant one-click switching between Google Maps and Mapbox GL, masked credential inspection, real-time health diagnostics, and the interactive corridor map preview.
5. **Unauthorized Account Protection**:
   - Other passenger and driver accounts attempting to access `/admin` are strictly rejected by `AccessDeniedCard` (403 Forbidden).

---

## 7. Verification & Automated Test Results

The platform test suite, linter, and production bundler were run to verify zero regression across the system:

```text
============================================================
🚀 Running AeroPool Platform Architecture & Security Tests
============================================================
...
104. [✅ PASS] [STATE_MACHINE] Phase 3: Super Admin authorized one-click switch from Google Maps to Mapbox GL (8.41ms)
105. [✅ PASS] [STATE_MACHINE] Phase 3: Super Admin authorized one-click switch from Mapbox GL back to Google Maps (3.83ms)
106. [✅ PASS] [SECURITY    ] Phase 3: RBAC Security — Unauthorized passenger rejected from modifying global map provider (0.08ms)
107. [✅ PASS] [SECURITY    ] Phase 3: RBAC Security — Unauthorized driver rejected from modifying global map provider (0.01ms)
108. [✅ PASS] [STATE_MACHINE] Phase 3: Safe Rollback — Invalid or failing provider switch rejected with state preserved (0.02ms)
109. [✅ PASS] [INTEGRATION ] Phase 3: State Preservation — Camera viewport coordinates and zoom level accurately preserved (0.02ms)
110. [✅ PASS] [INTEGRATION ] Phase 3: Marker Preservation — Airport pickup bay and dropoff destination markers preserved (0.15ms)
111. [✅ PASS] [INTEGRATION ] Phase 3: Vehicle Marker Preservation — Real GPS coordinates and authentic heading rotation preserved (0.01ms)
112. [✅ PASS] [INTEGRATION ] Phase 3: Route Preservation — Active Mumbai corridor polyline geometry preserved across switch (0.03ms)
113. [✅ PASS] [SECURITY    ] Phase 3: Health Monitoring — Google Maps health probe correctly validates credentials and masks secrets (0.26ms)
114. [✅ PASS] [SECURITY    ] Phase 3: Health Monitoring — Mapbox GL health probe validates token format and masks secrets (0.17ms)
115. [✅ PASS] [SECURITY    ] Phase 3: Audit Logging — Every map provider switch generates an immutable audit log entry in system ledger (3.25ms)
116. [✅ PASS] [PERSISTENCE ] Phase 3: Configuration Persistence — Selected map provider persists across application sessions (5.65ms)
117. [✅ PASS] [INTEGRATION ] Phase 3: Zero Disruption — Active ride pools and passenger bookings remain 100% intact during switch (2.86ms)
118. [✅ PASS] [SECURITY    ] Phase 3: Zero GPS Disruption — Driver GPS telemetry stream and anti-spoofing validation remain active (0.14ms)

============================================================
Execution Summary: 118 total tests | 118 passed | 0 failed | 50776.8ms
Pass Rate: 100%
============================================================
```

- **Typecheck (`npm run lint`)**: Passed with **0 errors**.
- **Production Build (`npm run build`)**: Passed cleanly (`dist/` generated in 44s).

---

## 8. Exact Steps to Access the Super Admin Console

1. Open your browser and go to:
   ```text
   http://localhost:3000
   ```
2. Click **"Sign In"** in the top right corner (or navigate to `http://localhost:3000/admin` and click **"Sign In to Continue"**).
3. Enter your personal credentials:
   - **Email**: `pratyushwakde24@gmail.com`
   - **Password**: *(Your existing personal account password)*
4. You will be automatically redirected to the **AeroPool Super Admin Console** at `http://localhost:3000/admin`.
5. Click the **"Map Provider Engine"** tab (with the cyan compass badge) to manage and test the Google Maps and Mapbox GL engines.

