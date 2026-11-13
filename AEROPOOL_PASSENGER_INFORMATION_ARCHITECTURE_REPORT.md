# AEROPOOL — PASSENGER HOMEPAGE SIMPLIFICATION & INFORMATION ARCHITECTURE REPORT

**Date:** 2026-11-06  
**Status:** Complete & Production-Verified  
**Role:** Senior Mobility Product Designer  
**Scope:** Homepage simplification, elimination of marketing footer, and establishment of a dedicated Information & Governance Centre within Profile / More.  
**Platform Reference:** Uber / Ola-grade information hierarchy and mobile passenger workflow.

---

## 1. Executive Summary & Architectural Transformation

AeroPool's passenger booking homepage has been transformed from a long corporate marketing website into a **streamlined, booking-first mobility application**.

### The Core Problem Solved
Previously, the passenger booking homepage concluded with a massive 5-column marketing footer containing company descriptions, airport addresses, compliance badges, transport permits, and dozens of legal links. In a ride-booking application, this created unnecessary cognitive overload, excessive vertical scrolling, and made the platform resemble a desktop marketing brochure rather than an Uber/Ola-grade mobility tool.

### Design Solutions Implemented
1. **Complete Removal of the Large Footer:** The 5-column corporate footer was removed entirely from the passenger homepage (`/`) and all in-app passenger flows (`/app/*`). The homepage now ends naturally after the primary booking and promotional cards.
2. **Dedicated Information & Governance Centre:** All company overview, terminal guidance, driver verification, safety charters, fleet onboarding, support channels, and legal policies were consolidated into an accessible **Information Centre** housed within the **Profile** section (`/app/dashboard` and `/profile`).
3. **Four Dedicated Bottom Navigation Tabs:**
   - **Home (`/`):** Instant booking launcher, 4-slide compact hero carousel, quick access links.
   - **My Rides (`/app/bookings`):** Active booking tracking, ride history, and GST Tax Invoices.
   - **Safety (`/safety`):** Driver KYC standards, vehicle compliance, 24/7 SOS details.
   - **Profile (`/app/dashboard`):** Flyer credentials, active upcoming ride, and the full 6-category Information Centre.
4. **Natural Mobile Page Termination:** With proper mobile safe-area spacing (`pb-24 lg:pb-12`), the passenger homepage terminates cleanly with zero blank dead space and zero content obscured by the fixed bottom navigation bar.

---

## 2. Streamlined Passenger Homepage Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ [✈] AeroPool BOM CSMIA                                (🔔) (PW) [☰]   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Compact Hero Promotional Carousel (Fixed 280px Height)              │
│    "Airport rides, smarter together" • [━━] [•] [•] [•]                │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Prominent Airport Ride Booking Card                                 │
│    [✈] Pickup (Airport): CSMIA – Terminal 2                          ↓ │
│    [📍] Drop to: Enter your destination                             🔍 │
│    [📅 Flight Details (Optional)]   [👥 1 passenger                 ↓] │
│    ┌─────────────────────────────────────────────────────────────────┐ │
│    │  Find a Pool Ride →                                             │ │
│    └─────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Quick-Access Shortcuts                                              │
│    [How It Works]  [Safety & KYC]  [Fleet Partner]  [Support]          │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Promotional Highlight: "Save up to 40% on your airport ride"        │
├────────────────────────────────────────────────────────────────────────┤
│ 5. CSMIA Terminal & Bay Guide Card ("At CSMIA →")                      │
└────────────────────────────────────────────────────────────────────────┘
  [Natural Page Termination — ZERO Long Marketing Footer]
==========================================================================
  (🏠 Home)        (🚗 My Rides)        (🛡️ Safety)        (👤 Profile)
```

- **Scroll Depth Reduced:** From ~2,400px down to ~1,135px on a standard 390px mobile viewport.
- **Focus:** 100% focused on airport pickup, destination corridor selection, and instant pool matching.

---

## 3. Information Centre Structure (Profile / More Section)

The new Information Centre (`src/components/InformationCentre.tsx`) is mounted within the Profile section (`src/views/PassengerDashboardView.tsx`), accessible to both authenticated passengers and guest flyers:

### Category 1: About AeroPool
- **About Us:** Interactive modal detailing AeroPool’s mission, CSMIA airport operations, 80/20 driver revenue share, and congestion reduction charter.
- **How AeroPool Works:** Direct link to `/how-it-works` (4-step visual flow).
- **Our Airport Pooling Concept:** Modal detailing arrival-window matching (15-min buffers), corridor boundary isolation, and luggage capacity rules.

### Category 2: Airport Information
- **CSMIA Terminal 1 (T1):** Guidance for Domestic Santacruz, Arrivals Curbside Pillars 3–4.
- **CSMIA Terminal 2 (T2):** Guidance for Sahar Hub, Level P4 East Pillars 4–6 and MLCP P7 Bay C.
- **Pickup Zones Directory:** Comprehensive list of verified airport bays.
- **Airport Pickup Guide:** Direct link to `/faq`.

### Category 3: Safety and Trust
- **Driver Verification & Badging:** Details on commercial transport licenses, police background checks, and airport driver badges.
- **KYC & Document Verification:** Information on Aadhaar, driving license, and commercial permit validation.
- **Passenger Safety & 24/7 SOS:** Details on the 4-digit OTP ride verification, 112 / CSMIA Police emergency dispatch, and live trip sharing.
- **Ride-Sharing Safety Charter:** Direct link to `/safety`.

### Category 4: Fleet Partners
- **Become a Fleet Partner:** Direct link to `/fleet-partners`.
- **Fleet Onboarding Information:** Commercial fleet operator onboarding standards, payouts (T+1), and vehicle eligibility.

### Category 5: Help and Support
- **Help Centre:** Direct link to `/faq`.
- **Contact Support:** Direct link to `/support`.
- **Frequently Asked Questions:** Direct link to `/faq`.

### Category 6: Legal and Compliance
- **Terms of Service:** Direct link to `/terms`.
- **Privacy Policy and GPS Consent:** Direct link to `/privacy`.
- **Cancellation and Refund Policy:** Direct link to `/terms` (Section 3).

---

## 4. Navigation & Role Access Matrix

| Route Path | View Component | Accessible by Guest? | Footer Rendered? | Primary Purpose |
|:---|:---|:---:|:---:|:---|
| `/` | `LandingView` | Yes | ❌ Excluded | Instant airport pool launcher |
| `/app/book` | `PassengerBookView` | Passenger / Admin | ❌ Excluded | 5-step booking wizard |
| `/app/bookings` | `PassengerBookingsView` | Passenger / Admin | ❌ Excluded | Ride history & GST Tax Invoices |
| `/app/track/:id` | `PassengerTrackView` | Passenger / Admin | ❌ Excluded | Live GPS telemetry & OTP verification |
| `/app/dashboard` / `/profile` | `PassengerDashboardView` | Yes (Guest banner / Flyer account) | ❌ Excluded | Profile, active rides, & Information Centre |
| `/how-it-works` | `HowItWorksView` | Yes | ✅ Included | 4-step airport ride guide |
| `/safety` | `SafetyView` | Yes | ✅ Included | Safety & KYC charter |
| `/fleet-partners` | `FleetPartnersPublicView` | Yes | ✅ Included | Commercial operator onboarding |
| `/faq` | `FaqView` | Yes | ✅ Included | CSMIA terminal pickup FAQ |
| `/support` | `SupportPortalView` | Yes | ✅ Included | Customer ticket support |
| `/terms` | `LegalTermsView` | Yes | ✅ Included | Terms & Cancellation policy |
| `/privacy` | `LegalTermsView` | Yes | ✅ Included | Geolocation & privacy consent |

---

## 5. Verification & Automated Test Results

Automated headless Chrome verification (`scripts/verify_ia_simplification.cjs`) via Chrome DevTools Protocol (CDP) confirmed all requirements:

```json
{
  "homepage": {
    "hasFooter": false,
    "heroHeight": 280,
    "bookingCardPresent": true,
    "quickCardsCount": 6,
    "savingsBannerPresent": true,
    "atCsmiaCardPresent": true,
    "bottomNavTabs": ["Home", "My Rides", "Safety", "Profile"],
    "scrollHeight": 1135
  },
  "informationCentre": {
    "all6CategoriesPresent": true,
    "categories": [
      "About AeroPool",
      "Airport Information",
      "Safety and Trust",
      "Fleet Partners",
      "Help and Support",
      "Legal and Compliance"
    ]
  },
  "modalsAndNavigation": {
    "terminalGuidanceModalVerified": true,
    "safetyNavigationVerified": true,
    "howItWorksNavigationVerified": true,
    "returnedHomeCleanly": true
  }
}
```

### Visual Evidence Artifacts
- [`homepage-no-footer-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/homepage-no-footer-390px.png): Demonstrates clean homepage ending without footer.
- [`profile-information-centre-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/profile-information-centre-390px.png): Demonstrates Profile / Information Centre with all 6 categories.
- [`modal-terminal-guidance-opened.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/modal-terminal-guidance-opened.png): Demonstrates interactive airport pickup guidance modal.
- [`safety-view-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/safety-view-390px.png): Demonstrates bottom nav routing to Safety.

---

## 6. Code Quality & Integration Status

- **TypeScript Compilation (`npm run lint`):** ✅ Passed (`tsc --noEmit` exited with code 0).
- **Production Build (`npm run build`):** ✅ Passed (`dist/` created in 8.24s).
- **Backend Integrity:** Zero modifications made to Supabase schemas, payment systems, matching engine, or RPC procedures. All backend APIs, booking records, and authentication flows remain intact.

