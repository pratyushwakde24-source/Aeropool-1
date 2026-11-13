# AeroPool — Interactive Map Responsive QA Report
**Deliverable — Cross-Device Viewport Quality Assurance**
*Generated: 2026-11-07*

---

## 1. Viewport Matrix & Visual Verification

The interactive map was validated across mobile, tablet, and desktop viewports to ensure consistent aspect ratios, readable typography, and unobstructed interactive controls.

| Viewport Profile | Width × Height | Canvas Dimensions | Layout Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Android Compact** | 360 × 740 px | 328 × 288 px | Zero horizontal overflow; touch gestures enabled; markers centered | **PASS** |
| **Standard Mobile** | 390 × 844 px | 358 × 320 px | Matches reference design; zoom pill and locate button reachable | **PASS** |
| **Large Mobile** | 430 × 932 px | 398 × 320 px | Seamless edge-to-edge container; full polyline visible | **PASS** |
| **Tablet Portrait** | 768 × 1024 px | 720 × 360 px | Balanced aspect ratio; spacious margin around airport hub | **PASS** |
| **Desktop Wide** | 1280 × 900 px | 896 × 384 px | Elegant card bounding with 48px route padding | **PASS** |

---

## 2. Marker Placement & Collision Prevention

- **Pickup Callout Tooltip (`CSMIA T2`)**: Anchored above the pickup circle with `anchor: 'bottom'`. Even at high zoom levels or map rotation, the label does not invert or detach from the terminal coordinates.
- **Destination Marker (`BKC`)**: Positioned precisely at `19.0662, 72.8688` with a bottom needle tip anchor.
- **Controls Spacing**: Floating controls are anchored with `top-3 right-3`, `bottom-3 right-3`, and `top-3 left-3` with high z-index (`z-20`) to prevent marker collision or overlap during route bounding.

---

## 3. Touch Gesture & Interaction QA

- **Pinch-to-Zoom**: Enabled on mobile touchscreens without page zoom disruption.
- **Two-Finger Pan & Drag**: Smooth map panning across the Mumbai metropolitan area.
- **Tap Precision**: High tap target size on floating controls (40×40px circular locate button, 36×36px zoom buttons) complying with WCAG 2.1 Touch Target guidelines.

