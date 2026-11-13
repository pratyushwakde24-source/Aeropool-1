# AEROPOOL — MOBILE PASSENGER HOMEPAGE IMPLEMENTATION AUDIT

**Date:** 2026-11-05  
**Stage:** Phase 1 — Comprehensive Pre-Implementation Technical Audit  
**Operating Mode:** `sandbox` (`VITE_OPERATING_MODE="sandbox"`, Razorpay TEST MODE `rzp_test_*`)  
**Active Commission Policy:** Standard 80/20 (`COMM_POL_80_20_V1`: 80% Driver / 20% Platform) — **85/15 strictly inactive**  
**Target Staging Reference:** `rkuzkwggijthbqwlwnps`  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED / ZERO ACCESS**)  

---

## 1. Existing Frontend Architecture Overview

AeroPool is built on **React 19 + TypeScript + Vite 8.3 + Tailwind CSS v4**.
- **State Layer (`src/services/db.ts`):** Reactive singleton store (`AeroPoolDatabase`) maintaining local state synchronized with browser `localStorage` and Supabase PostgreSQL backend via atomic RPCs and fallbacks. Subscribed via `db.subscribe()`.
- **Authentication Layer (`src/services/authService.ts`):** Supabase JWT session persistence, role-based access control (`passenger`, `driver`, `fleet_operator`, `admin`, `support`), user profile hydration, and session restoration guard (`isAuthRestoring`).
- **Routing Architecture (`src/App.tsx`):** History pushState-based router (`currentRoute`, `handleNavigate`) with URL synchronization, popstate listeners, and role-based access guards (`AccessDeniedCard`).

---

## 2. Component Inventory & Existing Booking Capabilities

### 2.1 Passenger Homepage & Booking Components
1. **`src/views/LandingView.tsx`:**
   - Currently mounted on route `/`.
   - Contains Hero, dynamic fare comparison widget, sustainability stats, and CTA button routing to `/app/book`.
2. **`src/views/PassengerBookView.tsx`:**
   - Currently mounted on route `/app/book`.
   - Comprehensive 5-stage airport ride-pooling booking flow:
     - Stage 1: Terminal (`T1` vs `T2`), Pickup Zone selection (`PICKUP_ZONES`), Flight details lookup (`lookupCSMIAFlight`), Passenger count, Luggage count.
     - Stage 2: Destination autocomplete search via Mapbox/Google Places (`searchDestinationPlaces`) and Mumbai corridor presets (`MUMBAI_DESTINATIONS`).
     - Stage 3: Vehicle tier selection (`Sedan`, `SUV`, `Premium`) with transparent integer paise pricing.
     - Stage 4: Available pool matching candidate inspection (`evaluatePoolMatches`).
     - Stage 5: Razorpay checkout modal (`RazorpayModal`), OTP assignment, and booking creation (`db.createBooking`).
3. **`src/views/PassengerDashboardView.tsx`:**
   - Mounted on `/app` or `/app/dashboard`.
   - Features active flight arrival spotlight, quick ride launcher, verified flyer status badge, and quick navigation links.

### 2.2 Navigation Routes Inventory
| Route Path | View Component | Access Role | Description |
|:---|:---|:---:|:---|
| `/` | `LandingView` | Public / Guest | Primary passenger entrance & booking launcher |
| `/app/book` | `PassengerBookView` | Passenger / Admin | 5-step booking wizard & pool match resolver |
| `/app/track/:id` | `PassengerTrackView` | Passenger / Admin | Live trip telemetry, OTP verification, SOS |
| `/app/bookings` | `PassengerBookingsView` | Passenger / Admin | Ride history, GST Tax Invoices, Credit Notes |
| `/app` / `/app/dashboard` | `PassengerDashboardView` | Passenger / Admin | Passenger dashboard & flight monitor |
| `/how-it-works` | `HowItWorksView` | Public | 4-step ride pooling educational guide |
| `/safety` | `SafetyView` | Public | Driver KYC, verification, and safety charter |
| `/fleet-partners` | `FleetPartnersPublicView` | Public | Commercial operator onboarding info |
| `/faq` | `FaqView` | Public | CSMIA terminal pickup guides, FAQs |
| `/support` | `SupportPortalView` | Support / Admin | Ticket resolution portal |
| `/driver` | `DriverDashboardView` | Driver / Admin | Driver commercial dispatch cockpit |
| `/driver/kyc` | `DriverKYCView` | Driver / Admin | 4-stage driver onboarding wizard |
| `/fleet` | `FleetDashboardView` | Fleet Operator | Commercial fleet roster & settlements |
| `/app/admin` | `AdminDashboardView` | Admin | Super admin operations console |

---

## 3. Existing Form Handlers, Dropdowns, and Modals

| Component | UI Control | Event Handler | Underlying Service / Data Source |
|:---|:---|:---|:---|
| `Navbar` | Notifications Bell | `onOpenNotifications()` | `db.getState().notifications`, `NotificationCenter.tsx` |
| `Navbar` | User Avatar / Sign In | `onOpenAuthModal()`, `setUserDropdownOpen()` | `authService`, `currentUser` profile |
| `Navbar` | Navigation Links | `onNavigate(route)` | `window.history.pushState` |
| `PassengerBookView` | Terminal Selector | `handleTerminalChange(t)` | `geoService.ts`: `TERMINALS`, `PICKUP_ZONES` |
| `PassengerBookView` | Pickup Bay Selector | `setSelectedPickupZoneId(id)` | `PICKUP_ZONES` filtered by `terminalCode` |
| `PassengerBookView` | Destination Autocomplete | `handleDestSearchChange(query)` | `mapProviderService.ts`: `searchDestinationPlaces` |
| `PassengerBookView` | Flight Details Lookup | `handleLookupFlight(flightQuery)` | `flightService.ts`: `lookupCSMIAFlight` |
| `PassengerBookView` | Passenger Count | `setPassengerCount(num)` | 1 to 4 bounded by vehicle category limits |
| `PassengerBookView` | Find a Pool Ride CTA | `handleProceedToMatch()` | `matchingEngine.ts`: `evaluatePoolMatches` |
| `PassengerTrackView` | Emergency SOS | `setShowSafetyModal(true)` | `SafetyModal.tsx`: Direct call 112 / CSMIA Security |
| `PassengerBookingsView`| Tax Invoice Modal | `setSelectedInvoiceBooking(b)` | `invoiceService.ts`: `renderInvoiceHtml` |

---

## 4. Integration Specifications

### 4.1 Supabase Authentication & Profile Management
- **Status:** Active, connected to `rkuzkwggijthbqwlwnps`.
- **Session Persistence:** `sb-rkuzkwggijthbqwlwnps-auth-token` stored in `localStorage`.
- **User Object Structure:**
  ```ts
  interface UserProfile {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    role: UserRole; // 'passenger' | 'driver' | 'fleet_operator' | 'admin' | 'support'
    avatarUrl?: string;
  }
  ```
- **Fallback Behavior:** If unauthenticated, `currentUser` is `null`. Clicking "Find a Pool Ride" or protected routes triggers `onOpenAuthModal('signin')`.

### 4.2 Airport, Terminal, and Pickup-Zone Data (`src/services/geoService.ts`)
- **Airport Landmark:** CSMIA Mumbai (`19.0896° N, 72.8656° E`).
- **Terminals:**
  - `T2`: Chhatrapati Shivaji Maharaj International Airport – Terminal 2 (International & Domestic).
  - `T1`: Chhatrapati Shivaji Maharaj International Airport – Terminal 1 (Domestic).
- **Verified Commercial Pickup Zones:**
  - `pz-t2-p4-east`: Level P4 East, Pillars 4–6 (CSMIA Terminal 2).
  - `pz-t2-mlcp-p7`: Multi-Level Car Park Level P7, Bay C (CSMIA Terminal 2).
  - `pz-t1-arr-p3`: Domestic Arrivals Ground, Pillars 3–4 (CSMIA Terminal 1).
  - `pz-t1-dom-p5`: Domestic Arrivals West, Bay 5 (CSMIA Terminal 1).

### 4.3 Google Maps & Mapbox Autocomplete (`src/services/mapProviderService.ts`)
- **Active Engine:** Factory-controlled provider switching (`MapboxProvider` vs `GoogleMapsProvider`).
- **Destination Suggestions (`searchDestinationPlaces`):**
  - Queries active map geocoding/places API with Mumbai MMR bounding box bias (`72.7°E – 73.2°E`, `18.8°N – 19.4°N`).
  - Pre-seeded with key business hub corridors: Bandra Kurla Complex (BKC), Lower Parel, Colaba, Andheri East, Powai, Navi Mumbai, Thane.

### 4.4 Flight Information Service (`src/services/flightService.ts`)
- **Lookup Method:** `lookupCSMIAFlight(flightNumber: string)`.
- **Supported Airlines:** IndiGo (6E), Air India (AI), Vistara (UK), Akasa (QP), Emirates (EK), Singapore Airlines (SQ).
- **Return Contract:** Airline name, scheduled arrival time, flight status, and terminal assignment.

---

## 5. Design System Tokens & Visual Specifications (Phase 2 Alignment)

| Design Token | Specification Value | Usage Context |
|:---|:---|:---|
| **App Background** | `#07101F` | Screen background, body background |
| **Secondary Background** | `#0B1930` | Header, section containers, drawer |
| **Card Background** | `#13243D` (or `rgba(19, 36, 61, 0.85)`) | Glassmorphic cards, booking container |
| **Primary Cyan Accent** | `#00DDF5` | Brand icon, active nav, primary CTA, pins |
| **Electric Blue Accent** | `#087BFF` | Gradient stops, primary button hover, focus rings |
| **Primary Text** | `#F8FAFC` | Headlines, active labels, primary values |
| **Secondary Text** | `#A8B5CA` | Field labels, subheads, inactive tabs |
| **Borders** | `rgba(75, 150, 220, 0.25)` | Thin precision card and input borders |
| **Card Glow** | `0 12px 32px -8px rgba(0, 221, 245, 0.12)` | Subtle cyan elevation |
| **Corner Radius** | `rounded-2xl` (16px), `rounded-3xl` (24px) | Input fields, cards, modal sheets |
| **Touch Targets** | `min-h-[44px]`, `min-w-[44px]` | All buttons, selectors, tabs |

---

## 6. Implementation Plan & Architectural Strategy

1. **Transform `LandingView.tsx`:**
   - Elevate the passenger landing experience into the exact mobile layout specified in the reference screenshot (`media_1793891740257_cd676891.jpg`).
   - Implement the cinematic hero section with `public/images/csmia-hero.jpg` with a gradient fade.
   - Embed the high-polish **Main Booking Card** with interactive terminal selector, destination search with live suggestions, optional flight details modal, passenger counter, and "Find a Pool Ride →" CTA.
   - Embed the 4 Quick Access Cards (`How It Works`, `Safety & KYC`, `Fleet Partner`, `Support`) with active route handlers.
   - Embed the Savings Promotional Banner with ticket graphic and pricing link.
   - Embed the "At CSMIA" terminal guide card with FAQ route link.
2. **Implement Mobile Fixed Bottom Navigation (`src/components/MobileBottomNav.tsx`):**
   - 4-tab bar (`Home`, `My Rides`, `Safety`, `Profile`).
   - Fixed to viewport bottom on mobile (`lg:hidden`), with safe-area padding and 44px touch targets.
   - Wired to actual routes (`/`, `/app/bookings`, `/safety`, `/app/dashboard`).
3. **Elevate Mobile Header (`src/components/Navbar.tsx`):**
   - On mobile screens, render the compact header: AeroPool logo + brand text on left; Notification bell (with unread red badge) + circular user profile avatar with initials on right.
   - Preserve existing desktop navbar for large screens.
4. **Wire End-to-End Functionality:**
   - When a passenger configures their booking and clicks "Find a Pool Ride →":
     - Validates inputs.
     - If guest, prompts sign-in via `AuthModal` (or allows guest search).
     - Resolves matching pools via `evaluatePoolMatches`.
     - Transitions seamlessly to `/app/book` with pre-filled state or presents available pool candidates directly!
5. **Quality Gates & Multi-Screen Validation:**
   - `npm run lint` (0 errors).
   - `npm test` (195/195 tests pass).
   - `npm run build` (Clean production bundling).
   - Headless Chrome browser capture and verification at 390px and 1280px.
