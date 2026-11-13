# AEROPOOL — PHASE 8: COMPREHENSIVE UI/UX AUDIT & SCREEN INVENTORY
**Platform:** AeroPool Smart Airport Ride-Pooling Platform  
**Target Environment:** Staging (`rkuzkwggijthbqwlwnps`) & Local Preview  
**Audit Date:** November 5, 2026  
**Status:** COMPLETE (Stage 1 Audit Sign-Off)

---

## 1. Executive Summary & Objective

This document establishes the authoritative inventory of all screens, routes, modals, user workflows, state bindings, props, and API endpoints across the AeroPool platform prior to the Phase 8 visual redesign.

The core mandate is to transform AeroPool into a premier, world-class airport mobility platform comparable in polish and ergonomics to Uber and Ola, while maintaining the brand's signature blue/cyan identity, and strictly preserving 100% of the underlying business logic, state machines, RLS rules, Supabase integration, and pricing engines.

---

## 2. Complete Screen & Route Inventory

| Route | View Component | Target Audience | Primary Function | Key Handlers & State Bindings |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `LandingView.tsx` | Public | Brand landing, airport value prop, CSMIA hub info, live simulator | `onNavigate`, CTA links, interactive fare estimator preview |
| `/how-it-works` | `HowItWorksView.tsx` | Public | Step-by-step traveler guide from flight touchdown to pickup | `onNavigate`, tab switching, pickup zone diagram |
| `/safety` | `SafetyView.tsx` | Public | Commercial fleet verification, RTO badges, SOS, OTP safety | `onNavigate`, safety pillar accordion, emergency hotline |
| `/fleet-partners` | `FleetPartnersPublicView.tsx` | Public / Fleets | Partner acquisition, 80/20 commercial split, fleet onboarding | `onNavigate`, onboarding form triggers |
| `/faq` | `FaqView.tsx` | Public | Comprehensive questions regarding luggage, delays, cancellations | Search query, category filters |
| `/terms` | `LegalTermsView.tsx` | Public | Airport ride-pooling contract, liability, cancel policy | Section navigation |
| `/privacy` | `LegalTermsView.tsx` | Public | DPDP Act compliance, GPS location tracking consent | Section navigation |
| `/auth/signin`, `/auth/signup` | `AuthModal.tsx` | Unauthenticated | Supabase Auth login/signup modal with email rate-limiting | `handleSignIn`, `handleSignUp`, `handleResendVerification` |
| `/auth/email-verified` | `EmailVerifiedView.tsx` | Public / Auth | Displays email confirmation celebration and direct login action | `onNavigate` |
| `/auth/reset-password` | `PasswordResetView.tsx` | Public / Auth | Supabase password reset link target with new password form | `authService.updateUserPassword`, `onNavigate` |
| `/forgot-password` | `ForgotPasswordView.tsx` | Public / Auth | Password reset email request trigger | `authService.resetPasswordForEmail`, `onNavigate` |
| `/app`, `/app/dashboard` | `PassengerDashboardView.tsx` | Passenger / Admin | Active trip card, quick rebook launcher, past rides overview | `onNavigate`, terminal selector, recent booking cards |
| `/app/book` | `PassengerBookView.tsx` | Passenger / Admin | 5-step airport ride booking wizard: Flight, Destination, Type, Matches, Payment | `handleFlightSearch`, `handleDestSearchChange`, `handleMapPinSelect`, `handlePaymentSuccess`, `db.createPoolAndBookAtomicAsync`, `db.bookRideAtomicAsync` |
| `/app/track/:id` | `PassengerTrackView.tsx` | Passenger / Admin | Live trip tracking, OTP display, driver card, GPS map, cancel modal | `realtimeGpsService.subscribePoolTelemetry`, `cancel_booking_atomic`, `setShowSafetyModal` |
| `/app/bookings` | `PassengerBookingsView.tsx` | Passenger / Admin | Booking ledger, invoice viewer, refund credit note, cancellation | `setActiveTab`, `setSelectedInvoice`, `setSelectedRefundReceipt`, `db.cancelBookingAtomicAsync` |
| `/driver`, `/driver/trips` | `DriverDashboardView.tsx` | Driver / Admin | Driver cockpit: Online toggle, 30s dispatch modal, OTP validation, GPS breadcrumb | `db.toggleDriverAvailability`, `db.acceptRideOffer`, `db.verifyPassengerOtp`, `realtimeGpsService.publishDriverGps` |
| `/driver/kyc` | `DriverKYCView.tsx` | Driver / Admin | Driver onboarding wizard: License, badge, vehicle RC, verification status | `db.updateDriverProfile`, `db.uploadDriverDocument`, form validations |
| `/fleet` | `FleetDashboardView.tsx` | Fleet Operator / Admin | Commercial fleet command: Driver roster, active vehicles, settlement status | `db.requestSettlement`, roster filtering |
| `/admin`, `/app/admin` | `AdminDashboardView.tsx` | Super Admin | Enterprise airport command center: Overview, KYC approval, Pools, Diagnostics, Audit | Tab switching, `db.updateDriverVerificationStatus`, `runFullDiagnosticsProbe` |
| Inside Admin | `AdminFinancialCommandCenter.tsx` | Super Admin | Financial ledger, payments, refunds, settlements, 80/20 governance, reconciliation | `apiFetch('/api/admin/reconcile')`, `approveServerSettlement`, settlement batching |
| Inside Admin | `MapProviderSettingsCard.tsx` | Super Admin | Map provider switcher (Mapbox vs Google Maps vs OpenStreetMap) | `setMapProviderConfig`, live health check |
| `/support` | `SupportPortalView.tsx` | Support / Admin | Ticket resolution, emergency SOS dispatch queue | Ticket filters, status updates |

---

## 3. Global Modal & Overlay Inventory

| Component | Trigger | Key Functionality | Preserved Props / Handlers |
| :--- | :--- | :--- | :--- |
| `Navbar.tsx` | Global Header | Navigation, mobile hamburger drawer, notification bell, user avatar menu, auth trigger | `currentRoute`, `onNavigate`, `currentUser`, `unreadNotifsCount`, `onOpenNotifications`, `onOpenTestSuite`, `onOpenAuthModal`, `onSignOut` |
| `Footer.tsx` | Global Footer | Platform footer, CSMIA terminal location notes, compliance links, support helpline | `onNavigate` |
| `AuthModal.tsx` | Header / Actions | Supabase login & signup, email cooldown timer, resend verification link | `isOpen`, `initialMode`, `initialEmail`, `onClose`, `onSuccess`, `onNavigate` |
| `NotificationCenter.tsx` | Navbar Bell | Right-side drawer showing passenger trip updates, driver dispatch alerts, admin warnings | `isOpen`, `notifications`, `onClose`, `onNavigate` |
| `RazorpayModal.tsx` | Booking Checkout | Razorpay Test Mode checkout, UPI / Card / Netbanking mock selector, server HMAC signature verification | `isOpen`, `amountPaise`, `passengerName`, `passengerPhone`, `destinationName`, `bookingId`, `onSuccess`, `onClose` |
| `SafetyModal.tsx` | Track / Global | Emergency SOS modal, Mumbai Police (112), CSMIA Airport Security (022-66851010), Women Helpline | `isOpen`, `onClose`, `poolId`, `bookingId` |
| `TestSuiteModal.tsx` | Admin / Dev | In-browser test runner executing all 195 architectural test cases | `isOpen`, `onClose` |
| `AccessDeniedCard.tsx` | Route Guard | Friendly role-boundary card explaining required permissions and directing to login | `requiredRole`, `currentUser`, `onNavigate`, `onOpenAuthModal` |

---

## 4. Destination-Selection UX Analysis (Uber/Ola Benchmark)

Based on the target destination selection standard:
1. **Airport Hub Indicator**: Prominent badge highlighting Chhatrapati Shivaji Maharaj International Airport (CSMIA) Mumbai, with direct terminal selector (`Terminal 1 - Domestic` vs `Terminal 2 - International & Domestic`).
2. **Pickup Zone Hierarchy**: Clear selection of designated airport pickup zones (e.g., T2 Level P4 East Pillar 4-6, T2 MLCP P7, T1 Domestic Arrival).
3. **Recent & Popular Destination Pills**: Instant chips for top Mumbai airport routes:
   - BKC (Bandra Kurla Complex) — Financial Hub
   - Colaba / Marine Drive / Nariman Point — South Mumbai
   - Andheri West / Lokhandwala — Western Suburbs
   - Powai / Hiranandani — Tech Corridor
   - Navi Mumbai / Vashi — Satellite Hub
   - Thane / Mulund — Central Corridor
4. **Predictive Search Bar**: Floating search bar with instant autocomplete powered by `searchDestinationPlaces`, showing distance in km, estimated travel time in minutes, and corridor tagging.
5. **Interactive Route Map Preview**: Embedded map displaying CSMIA origin, destination marker, and route polyline with live traffic overlay.
6. **Vehicle & Pooling Category Cards**:
   - `Shared Pool (Sedan)`: Guaranteed ₹200–₹500 savings, 1 seat / luggage, max 20 min wait.
   - `Shared Pool (XL)`: Group sharing, 2–3 seats, large luggage allowance.
   - `Private Airport Taxi`: Zero wait, direct express corridor.
7. **Transparent Fare Breakdown Pill**: Visual breakdown of Base Fare, Distance Fare, CSMIA Airport Toll pass-through, and Pool Discount.

---

## 5. Architectural Invariant Checklist

- [x] **Operating Mode**: Sandboxed (`VITE_OPERATING_MODE="sandbox"`).
- [x] **Payment Gateway**: Razorpay Test Mode (`rzp_test_*`, zero real charges).
- [x] **Commission Policy**: Active 80/20 default strictly enforced. 85/15 policy remains inactive.
- [x] **RPC & State Machine**: `book_ride_atomic` and `cancel_booking_atomic` state transitions preserved without alteration.
- [x] **Realtime GPS**: WebSocket telemetry contracts and fallback intervals remain untouched.
- [x] **Protected Baseline**: Target staging reference `rkuzkwggijthbqwlwnps` only; `krxkxhieyqcytknixqdm` untouched.

---
*Stage 1 Audit is fully verified and serves as the baseline specification for the Phase 8 UI redesign.*

