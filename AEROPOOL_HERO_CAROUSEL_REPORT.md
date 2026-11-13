# AEROPOOL — PREMIUM CINEMATIC HERO CAROUSEL REPORT

**Date:** 2026-11-06  
**Status:** Complete & Production-Verified  
**Component:** `src/components/HeroCarousel.tsx` mounted in `src/views/LandingView.tsx`  
**Target Viewports:** 360px, 390px, 430px, 768px, 1024px, 1280px  
**Brand Palette:** Deep Navy `#07101F`, Secondary Navy `#0B1930`, Electric Cyan `#00DDF5`, Royal Blue `#087BFF`, Crisp White `#F8FAFC`, Muted Blue-Grey `#A8B5CA`

---

## 1. Executive Summary

The AeroPool mobile and desktop homepage hero section has been transformed from a static banner into a **multi-slide promotional carousel**. Inspired by top international mobility services (Uber, Ola, Lyft), the carousel conveys AeroPool’s core value propositions, verified safety standards, real-time trip visibility, and simplified airport ride pooling.

### Key Transformation Pillars
1. **Four Bespoke Promotional Slides:** Each slide features high-resolution imagery, verified platform capability copy, micro-tags, feature chips, and functional CTAs.
2. **Motion & Interaction System:** 5.5-second auto-rotation with reset on interaction, crossfade with subtle scale transition, staggered text entrances, reduced-motion accessibility, and visibility change pausing.
3. **Interactive Navigation:** Four interactive indicators (active cyan elongated pill with pulsing countdown glow, inactive muted dots), mobile touch swipe gestures, desktop chevrons, and keyboard navigation.
4. **Content & Truth-in-Advertising Integrity:** 100% aligned with actual operational platform capabilities (CSMIA T1/T2, P4 East/West pickup zones, integer paise pricing engine, commercial driver KYC verification, live booking status telemetry).

---

## 2. Four Promotional Slides Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│ AeroPool Hero Carousel                                                │
│                                                                        │
│ [PILL BADGE: CATEGORY]                                                │
│ Headline Line 1                                                       │
│ Headline Line 2                                                       │
│                                                                        │
│ Supporting description text...                                         │
│                                                                        │
│ ┌────────────────────────────────────────┐                            │
│ │ ● Promotional Highlight Banner         │                            │
│ └────────────────────────────────────────┘                            │
│                                                                        │
│ [Chip 1]  [Chip 2]  [Chip 3]                                          │
│                                                                        │
│ [Primary CTA →]  [Secondary CTA]                                      │
│                                                                        │
│ ( ═══ )  ( • )  ( • )  ( • )                          [1 / 4]         │
└────────────────────────────────────────────────────────────────────────┘
```

### Slide 1 — Smarter Airport Rides (Primary Value Proposition)
- **Category:** `SMARTER AIRPORT RIDES` (with Sparkles icon)
- **Headline:**
  ```
  Airport rides,
  smarter together
  ```
- **Description:** Share your airport journey with verified travellers heading in the same direction.
- **Promotional Highlight:** Save up to 40% on your airport ride.
- **Qualification Subtext:** Based on shared pooling vs private airport cab rates, subject to corridor match.
- **Feature Badges:** `CSMIA Terminal 1 & 2`, `Split fare pricing`, `Verified travellers`
- **Visual Asset:** `/images/csmia-hero.jpg` — Chhatrapati Shivaji Maharaj International Airport Terminal 2 illuminated exterior canopy at night with roadway lighting.
- **Primary CTA:** `Check Fare Savings` → Opens live AeroPool 40% Fare Guarantee breakdown modal.
- **Secondary CTA:** `Find a Pool Ride` → Smoothly scrolls down to the main booking launcher card.

### Slide 2 — Verified Fleet & Safety (Trust & Governance)
- **Category:** `VERIFIED FLEET & SAFETY` (with ShieldCheck icon)
- **Headline:**
  ```
  Your journey.
  Trusted partners.
  ```
- **Description:** Travel with verified drivers and trusted commercial fleet partners.
- **Promotional Highlight:** Driver verification & KYC checks active across every vehicle.
- **Qualification Subtext:** All commercial fleet partners hold compliant transport permits & verification.
- **Feature Badges:** `Driver KYC & license check`, `Verified commercial fleet`, `Designated CSMIA pickup bays`, `Passenger safety information`
- **Visual Asset:** `/images/fleet-safety.jpg` — Professional chauffeur in tailored dark suit beside an executive sedan at illuminated airport terminal pickup curb.
- **Primary CTA:** `Safety Charter & KYC` → Navigates to `/safety`.
- **Secondary CTA:** `Fleet Partners` → Navigates to `/fleet-partners`.

### Slide 3 — Real-Time Ride Visibility (Operational Transparency)
- **Category:** `REAL-TIME RIDE VISIBILITY` (with Navigation icon)
- **Headline:**
  ```
  Your ride.
  In clear view.
  ```
- **Description:** Stay informed with ride updates, pickup coordination and real-time tracking.
- **Promotional Highlight:** Live pickup coordination with designated terminal bay guidance.
- **Qualification Subtext:** Real-time driver location updates when GPS tracking is active on booked trips.
- **Feature Badges:** `Ride status progression`, `Pickup bay navigation (P4)`, `Live driver tracking`, `Instant booking updates`
- **Visual Asset:** `/images/live-visibility.jpg` — 3D perspective dark navigation map interface with illuminated cyan route telemetry through Mumbai corridors.
- **Primary CTA:** `How Tracking Works` → Navigates to `/how-it-works`.
- **Secondary CTA:** `Pickup Bay FAQs` → Navigates to `/faq`.

### Slide 4 — Easy Airport Pooling (Frictionless Onboarding)
- **Category:** `EASY AIRPORT POOLING` (with Plane icon)
- **Headline:**
  ```
  From landing
  to destination.
  ```
- **Description:** Add your flight details, choose your destination and find compatible airport pool rides.
- **Promotional Highlight:** Intelligent corridor matching tailored to arrival terminals & flights.
- **Qualification Subtext:** Verified matching confirmed prior to departure with guaranteed seat & luggage.
- **Feature Badges:** `Terminal selection (T1/T2)`, `Flight arrival auto-sync`, `Destination corridor match`, `Guaranteed seat capacity`
- **Visual Asset:** `/images/airport-pooling.jpg` — Modern international airport terminal hall with travellers and rolling luggage under architectural canopy.
- **Primary CTA:** `Start Airport Booking` → Smoothly scrolls to `#booking-card`.
- **Secondary CTA:** `Explore Corridor Guide` → Navigates to `/how-it-works`.

---

## 3. Visual & Typography System

1. **Card Architecture:**
   - Container: `rounded-3xl border border-[rgba(75,150,220,0.2)] bg-[#0B1930] shadow-2xl`
   - Consistent Height: Enforced via `min-h-[350px] sm:min-h-[370px] md:min-h-[390px] lg:min-h-[410px]` to eliminate layout shifts during slide transitions.
2. **Multi-Directional Contrast Gradients:**
   - Horizontal: `bg-gradient-to-r from-[#07101F] via-[#07101F]/88 sm:via-[#07101F]/75 to-transparent` ensures WCAG AAA text legibility across all background brightness levels.
   - Vertical: `bg-gradient-to-t from-[#07101F] via-[#07101F]/60 sm:via-[#07101F]/40 to-transparent` maintains indicator contrast.
   - Subtle ambient cyan glow: `w-64 h-64 bg-[#00DDF5]/8 rounded-full blur-3xl`.
3. **Typography:**
   - Headlines: Font Plus Jakarta Sans, `text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#F8FAFC] tracking-tight leading-[1.12]`.
   - Body & Supporting Copy: `text-xs sm:text-sm text-[#A8B5CA] leading-relaxed`.
   - Category Badges: `text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-[#00DDF5] bg-[#00DDF5]/10 border border-[#00DDF5]/25`.

---

## 4. Animation & Navigation Engine

- **Interval Timing:** 5500ms rotation cycle with automatic timer reset on user interaction (manual tab clicks, swipe, keyboard).
- **Transitions:** Smooth crossfade + subtle scale transition (`duration-1000 ease-out`, scales from `1.05` to `1.00`).
- **Interactive Indicators:**
  - Active: Cyan elongated pill (`w-8 h-2 rounded-full bg-[#00DDF5] shadow-[0_0_12px_rgba(0,221,245,0.6)]`) with inner pulse fill.
  - Inactive: Muted blue-grey dots (`w-2 h-2 rounded-full bg-slate-600/70 hover:bg-slate-400`).
- **Touch Gestures:** Native touch events tracking horizontal swipe (`deltaX > 40px`), verifying dominance over vertical scroll.
- **Desktop Chevrons:** Left/Right arrow buttons visible on hover or keyboard focus.
- **Reduced-Motion Handling:** Query `(prefers-reduced-motion: reduce)` automatically suspends auto-rotation, eliminates scale transforms, and enforces instantaneous transitions.
- **Background Tab Throttling:** Subscribed to `visibilitychange` to freeze auto-rotation while the browser tab is hidden.

---

## 5. Verification Status

| Check | Result | Verification Notes |
|:---|:---:|:---|
| TypeScript Compilation | ✅ PASS | `tsc --noEmit` exited with code 0 |
| Production Build | ✅ PASS | `vite build` completed successfully |
| E2E Headless Chrome Execution | ✅ PASS | CDP test suite completed with zero errors |
| Slide 1 Visual & Interaction | ✅ PASS | Headline, copy, 40% guarantee modal verified |
| Slide 2 Visual & Interaction | ✅ PASS | Verified fleet copy, KYC badges, route verified |
| Slide 3 Visual & Interaction | ✅ PASS | Visibility copy, pickup bay guidance verified |
| Slide 4 Visual & Interaction | ✅ PASS | Easy pooling copy, booking anchor verified |
| Auto-Rotation Functionality | ✅ PASS | Rotated automatically at 5500ms threshold |
| Mobile Touch Swipe | ✅ PASS | Left swipe smoothly triggered next slide |
| Keyboard Accessibility | ✅ PASS | ArrowLeft / ArrowRight navigation confirmed |
| Console Error Audit | ✅ PASS | 0 runtime console errors captured |

