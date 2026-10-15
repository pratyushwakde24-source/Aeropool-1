# AeroPool — Implementation Plan

This implementation plan structures the development of AeroPool across 8 rigorous milestones matching the system specifications.

---

## Milestone 1 — Audit, Architecture & Stabilization (Completed)
- [x] Inspect existing workspace, package manifests, and dependencies.
- [x] Establish design system with Tailwind CSS v4, Plus Jakarta Sans, and Lucide icons.
- [x] Generate foundational documents: `PROJECT_AUDIT.md`, `IMPLEMENTATION_PLAN.md`, `FEATURE_STATUS.md`, and `DEPLOYMENT_GUIDE.md`.
- [x] Configure application metadata and verified base compilation.

---

## Milestone 2 — Persistent Database Schema & Authentication Architecture
- [x] Finalize database schema covering:
  - `profiles`, `organizations`, `organization_members`
  - `passenger_profiles`, `driver_profiles`, `vehicles`, `driver_documents`
  - `airports`, `airport_terminals`, `pickup_zones`, `flights`
  - `ride_requests`, `ride_pools`, `pool_members`, `bookings`
  - `trip_assignments`, `trip_stops`, `driver_locations`
  - `fare_quotes`, `payments`, `refunds`, `operator_settlements`
  - `support_tickets`, `safety_incidents`, `audit_logs`, `notifications`
- [x] Implement atomic transaction store with persistence in LocalStorage / IndexedDB with event listeners.
- [x] Provide complete PostgreSQL DDL migration scripts with Row Level Security (RLS) policies.
- [x] Multi-role Auth Provider with instant role switching for evaluation (Passenger, Driver, Fleet Partner, Super Admin, Support Agent).

---

## Milestone 3 — Public Experience & Passenger Booking Flow
- [x] High-converting Landing Page with hero visual, interactive cost savings estimator, safety pillars, and airport coverage.
- [x] Public informational pages: `/how-it-works`, `/safety`, `/fleet-partners`, `/faq`, `/terms`, `/privacy`.
- [x] Step 1: Flight details (airline, flight number, scheduled time, CSMIA terminal, passenger & luggage count).
- [x] Step 2: Destination selection (Mumbai zones: BKC, South Bombay, Bandra, Powai, Andheri, Navi Mumbai, Thane) with real coordinates and distance calculations.
- [x] Step 3: Ride preference selection (Shared Pool vs Solo, max wait window, vehicle comfort class).
- [x] Step 4: Intelligent match results display with compatibility score, detour time, seat availability, and fare comparison.
- [x] Step 5: Booking confirmation and Razorpay checkout modal with minor currency math.
- [x] Step 6: Active ride view with pickup instructions (e.g., T2 Level P4 Pillar 5) and QR boarding pass.

---

## Milestone 4 — Intelligent Ride-Pooling Engine & Pricing Architecture
- [x] Multi-factor compatibility scoring engine:
  - Destination & route proximity (35%)
  - Pickup readiness & arrival time overlap (25%)
  - Estimated detour tolerance (20%)
  - Vehicle luggage & seat fit (10%)
  - Pool packing efficiency (10%)
- [x] Dynamic pricing model stored in integer minor units (paise):
  - Base fare + Distance component + Duration estimate + Airport surcharge + Tolls
  - Equitable pooling discount distribution (up to 40% passenger savings while maintaining driver earnings).
- [x] Concurrency protection and seat lock reservation logic to prevent double booking.

---

## Milestone 5 — Driver & Fleet Operations
- [x] Driver Dashboard:
  - KYC & document submission (Driving Licence, Commercial Badge, Vehicle RC, Fitness Certificate).
  - Verification workflow with document approval statuses.
  - Active ride dispatch queue with stop-by-stop passenger pickup sequence.
  - Trip status state transitions (`DRIVER_EN_ROUTE` -> `ARRIVED_AT_TERMINAL` -> `PASSENGERS_ONBOARD` -> `TRIP_COMPLETED`).
  - Earnings tracker with weekly payouts and commission breakdown.
- [x] Fleet Operator Portal:
  - Organization profile and fleet compliance metrics.
  - Vehicle inventory management (Sedan, EV, SUV, XL) with luggage specs.
  - Driver roster with compliance expiry flags.
  - Fleet trip monitoring and commission settlement reconciliation.

---

## Milestone 6 — Live Trip Tracking, Map & Notifications
- [x] Real-time interactive terminal and route map with pickup zones and vehicle location marker.
- [x] Live GPS simulation toggle for development/demonstration, clearly labelled as demo data.
- [x] Real-time state machine tracking for passengers and drivers.
- [x] Comprehensive notification center with status alerts (Driver Arrived, Flight Delay, Payment Receipt).
- [x] Emergency SOS & Safety incident reporting system with passenger escalation.

---

## Milestone 7 — Super Admin Console, Financial Oversight & Support
- [x] Platform executive metrics: total rides, GMV, platform take-rate, pool match rate, passenger savings.
- [x] Driver & fleet approval / rejection verification queue.
- [x] Booking and pool lifecycle inspector with manual override.
- [x] Financial audit, payment reconciliation, and instant refund processing.
- [x] Customer Support ticket resolution portal with priority levels and notes.
- [x] System audit log recording all administrative and transactional events.

---

## Milestone 8 — Testing, Quality Assurance & Hardening
- [x] Automated test suite verifying:
  - Pricing calculation and integer paise rounding.
  - Ride-pooling matching scoring and detour limits.
  - Seat capacity and luggage overflow prevention.
  - Booking lifecycle state transitions.
  - Role-based permission controls and fleet isolation.
- [x] Verification of production build and TypeScript compilation.
