# AEROPOOL — HERO CAROUSEL SIMPLIFICATION & SIZE CORRECTION REPORT

**Date:** 2026-11-06  
**Status:** Complete & Production-Verified  
**Reference Alignment:** Exact match to the compact second reference screenshot (`media_1793946572453_5dea76d7.jpg`)  
**Component:** `src/components/HeroCarousel.tsx` in `src/views/LandingView.tsx`  
**Card Dimensions:** Fixed compact height `h-[280px]` (mobile) / `sm:h-[300px]` (desktop) across all 4 slides  
**Booking Card Separation:** 16px (`mt-4`), fully visible immediately beneath the hero card

---

## 1. Executive Summary & Design Correction

The hero carousel has been simplified and resized to directly match the compact second reference image. All oversized elements, badges, chips, information panels, and action buttons have been removed. The carousel now delivers a minimal, cinematic promotional experience that highlights photography, crisp typography, and subtle transitions while keeping the main airport booking launcher immediately visible on mobile devices.

### Key Changes Implemented
1. **Strict Size & Proportions Restored:** The card height is locked to `h-[280px]` on mobile (matching Screenshot 2). It no longer expands with content or occupies the full viewport.
2. **Removed All Extraneous UI Elements:**
   - ❌ Removed large category pill badges (`REAL-TIME RIDE VISIBILITY`, etc.).
   - ❌ Removed live coordination / highlight boxes.
   - ❌ Removed feature chips (`Ride status progression`, `Pickup bay navigation`, etc.).
   - ❌ Removed CTA action buttons (`How Tracking Works`, `Pickup Bay FAQs`, etc.).
   - ❌ Removed tracking information panels.
3. **Four Simplified Slides:** Each slide contains only:
   - One short 2-line headline.
   - One short supporting sentence.
   - One high-quality cinematic background photograph.
   - Four small carousel indicators at the bottom left.
4. **Cinematic 5-Second Transition:** Smooth crossfade between background photographs, subtle slow zoom, smooth text fade, and mobile touch swipe navigation.

---

## 2. Four Simplified Slides Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│ AeroPool Compact Hero Card (Fixed 280px Height)                        │
│                                                                        │
│                                           [Cinematic Photograph        │
│                                            Canopy / Vehicle / Road]    │
│                                                                        │
│ Headline Line 1                                                        │
│ Headline Line 2                                                        │
│                                                                        │
│ Supporting description text (2 lines max).                             │
│                                                                        │
│ [━━] [•] [•] [•]                                                       │
└────────────────────────────────────────────────────────────────────────┘
  ↓ (16px spacing)
┌────────────────────────────────────────────────────────────────────────┐
│ [✈] Pickup (Airport) CSMIA – Terminal 2                              ↓ │
│ ... [Main Booking Form Card immediately visible]                      │
└────────────────────────────────────────────────────────────────────────┘
```

| Slide | Headline | Description | Background Photograph |
|:---|:---|:---|:---|
| **Slide 1** | **Airport rides,<br>smarter together** | Verified pool rides from CSMIA. Save up to 40% on airport transit. | `/images/csmia-hero.jpg` (Illuminated CSMIA terminal exterior at night) |
| **Slide 2** | **Travel with<br>trusted partners** | Verified drivers and commercial fleet partners for your airport journey. | `/images/fleet-safety.jpg` (Chauffeur & executive vehicle at airport curb) |
| **Slide 3** | **Save more on<br>every journey** | Share your airport ride with travellers heading in the same direction. | `/images/airport-pooling.jpg` (Airport terminal with travellers & luggage) |
| **Slide 4** | **Your ride,<br>in clear view** | Stay informed with booking updates and live tracking when available. | `/images/live-visibility.jpg` (Night-time city road with subtle navigation telemetry) |

---

## 3. Strict Size & Layout Verification (390px Mobile)

Chrome DevTools Protocol (CDP) live browser evaluation verified the following layout measurements:

```json
{
  "heroWidth": 358,
  "heroHeight": 280,
  "heroTop": 73,
  "bookingTop": 369,
  "distanceBetweenCards": 16,
  "indicatorCount": 4,
  "hasNoLargeBadges": true,
  "hasNoCtaButtons": true
}
```

### Layout Stability Across Slides
- **Slide 1 Height:** `280px`
- **Slide 2 Height:** `280px`
- **Slide 3 Height:** `280px`
- **Slide 4 Height:** `280px`
- **Cumulative Layout Shift (CLS):** `0.00` (Zero vertical expansion or jumping during slide transitions)

---

## 4. Responsive Viewport Verification

| Viewport Width | Device Type | Hero Width | Hero Height | Booking Card Start (`top`) | Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **360px** | Compact Mobile | 328px | 280px | 369px | ✅ Fully Visible Immediately Below Hero |
| **390px** | Standard Mobile (iPhone 14/15) | 358px | 280px | 369px | ✅ Exact Match to Second Screenshot |
| **430px** | Large Mobile (Pro Max) | 398px | 280px | 369px | ✅ Balanced Spacing & Visibility |

---

## 5. Visual Evidence Artifacts

The following high-resolution screenshots have been captured directly via headless Chrome:

1. [`compact-slide-1-mobile-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-slide-1-mobile-390px.png): Slide 1 — "Airport rides, smarter together"
2. [`compact-slide-2-mobile-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-slide-2-mobile-390px.png): Slide 2 — "Travel with trusted partners"
3. [`compact-slide-3-mobile-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-slide-3-mobile-390px.png): Slide 3 — "Save more on every journey"
4. [`compact-slide-4-mobile-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-slide-4-mobile-390px.png): Slide 4 — "Your ride, in clear view"
5. [`compact-carousel-360px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-carousel-360px.png): Responsive compact view at 360px
6. [`compact-carousel-390px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-carousel-390px.png): Responsive compact view at 390px
7. [`compact-carousel-430px.png`](file:///c:/Users/praty/Aeropool%201/public/screenshots/compact-carousel-430px.png): Responsive compact view at 430px

---

## 6. Build & Quality Verification

- **TypeScript Compilation (`npm run lint`):** ✅ Passed (`tsc --noEmit` exited with code 0)
- **Production Build (`npm run build`):** ✅ Passed (`dist/` created in 9.11s)
- **Platform Architecture Tests (`npm test`):** ✅ Passed (195/195 tests passing)
- **Automatic Rotation:** ✅ Advances smoothly every 5.0 seconds
- **Mobile Touch Swipes:** ✅ Left/right gestures functional
- **Indicators:** ✅ Clickable, active cyan pill (`w-6 h-1.5 bg-[#00DDF5]`) with muted grey dots

