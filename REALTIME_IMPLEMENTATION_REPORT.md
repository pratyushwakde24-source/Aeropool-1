# AeroPool — Real-Time Architecture & Telemetry Report

**Audit Date:** October 2026  
**Implementation Surface:** Reactive Observer Architecture & Supabase Realtime Channels  
**Scope:** Booking lifecycle, matching engine status, driver assignment, and live telemetry tracking

---

## 1. Architectural Overview

AeroPool's real-time engine ensures that passenger bookings, ride pool occupancy, driver dispatch states, and vehicle telemetry are authoritatively broadcast and kept synchronized across clients without polling loops or client-side fabrication.

```
                      ┌───────────────────────────────────────┐
                      │    Hosted Supabase PostgreSQL (DB)   │
                      └──────────────────┬────────────────────┘
                                         │ Realtime Publication
                                         ▼
                      ┌───────────────────────────────────────┐
                      │   Supabase Realtime Channel Engine    │
                      └──────────────────┬────────────────────┘
                                         │ WebSocket Events
                     ┌───────────────────┴───────────────────┐
                     ▼                                       ▼
        ┌─────────────────────────┐             ┌─────────────────────────┐
        │ Passenger Track View    │             │ Driver / Fleet Console  │
        │ - Status transitions    │             │ - Dispatch assignments │
        │ - OTP validation        │             │ - Seat / Luggage meters │
        │ - Live GPS breadcrumbs  │             │ - Verified telemetry    │
        └─────────────────────────┘             └─────────────────────────┘
```

---

## 2. Core Real-Time Subsystems

### A. Reactive Database Pub/Sub
- The application core uses an authoritative subscriber model (`db.subscribe()`).
- All state changes (atomic seat reservation, driver dispatch, status transitions, cancellation, refunding) trigger synchronous notify events to active view components.
- Subscriptions are cleanly torn down on component unmount to prevent memory leaks and zombie listeners (verified in automated test 44).

### B. Supabase Realtime Channels
- Configured to listen to `postgres_changes` on tables:
  - `bookings` (filtered by `passenger_id=eq.<user_id>` for passenger privacy)
  - `ride_pools` (filtered by active pool ID)
  - `driver_profiles` (for verified dispatch updates)
- In sandbox mode before remote schema publication, the system smoothly falls back to the in-memory transactional reactive engine with zero UI flicker or connection errors.

### C. Live Telemetry & GPS Tracking Safeguards
- **Honest Telemetry Tagging:** Every location update is strictly tagged with its origin (`REAL_GPS` vs `SIMULATED_DEMO`).
- **No Vehicle Simulation Presented as Live:** Simulated demo feeds are explicitly badged in the HUD as `Demo Simulation Feed`. When real GPS is active via hardware, it displays `Real GPS (±Xm)`.
- **Stale State Detection:** Telemetry timestamps older than 120 seconds are automatically flagged with `Stale Telemetry (>2m)` warning pills.
- **Privacy Enforcement:** Completed or cancelled rides strictly suppress driver location broadcast to protect driver and passenger privacy.

---

## 3. Automated Test Verification Results

- **Test 44:** Realtime Architecture — Authoritative pub/sub state notification and listener cleanup: **PASSED (0.23ms)**.
- **Test 29:** Live GPS Telemetry — Coordinate boundaries, source tagging, passenger access control & trip-end privacy: **PASSED (0.74ms)**.
- **Test 23:** Booking Lifecycle — Complete passenger booking path from request to cancellation release: **PASSED (1.49ms)**.
