# AEROPOOL — PHASE 8: PREMIUM DESIGN SYSTEM & UI TOKENS SPECIFICATION
**Brand Identity:** AeroPool Blue / Cyan Electric Modern Mobility  
**Typography:** Plus Jakarta Sans & JetBrains Mono  
**Design Reference:** Premium Airport Mobility UX (Uber & Ola Standards)  
**Status:** COMPLETE (Stage 2 Specification)

---

## 1. Brand Philosophy & Visual Foundations

AeroPool's design language conveys **clarity, trust, precision, and frictionless airport transit**. Arriving at a bustling airport like CSMIA Mumbai involves cognitive overload (baggage, customs, flight delays). The interface must provide instant reassurance with high visual hierarchy, calm dark surfaces, and unmistakable electric blue/cyan indicators.

### Core Color Palette

| Token | Hex | Tailwind Class | Semantic Usage |
| :--- | :--- | :--- | :--- |
| **Surface Darkest** | `#070b14` | `bg-[#070b14]`, `bg-slate-950` | Root platform canvas, viewport background |
| **Surface Card** | `#0f172a` | `bg-slate-900` | Primary content cards, bottom sheets, navigation bar |
| **Surface Raised** | `#1e293b` | `bg-slate-800` | Nested modules, active items, input fields |
| **Surface Border** | `rgba(255,255,255,0.08)` | `border-white/10`, `border-slate-800` | Subtle hairline dividers, container borders |
| **Primary Blue** | `#0284c7` | `bg-sky-600`, `text-sky-400` | Primary CTAs, active route lines, active tabs |
| **Cyan Accent** | `#06b6d4` | `bg-cyan-500`, `text-cyan-400` | Airport hub indicators, savings badges, OTP displays |
| **Deep Brand Blue** | `#0369a1` | `bg-sky-700` | Gradient start, header accents |
| **Success Emerald** | `#10b981` | `bg-emerald-500`, `text-emerald-400` | Confirmed bookings, approved driver status, savings |
| **Warning Amber** | `#f59e0b` | `bg-amber-500`, `text-amber-400` | Driver dispatch countdown, flight delays, pending status |
| **Danger Rose** | `#f43f5e` | `bg-rose-500`, `text-rose-400` | SOS emergency, ride cancellation, rejection alerts |
| **Text Primary** | `#f8fafc` | `text-slate-50`, `text-white` | Headings, primary metrics, OTP numbers |
| **Text Muted** | `#94a3b8` | `text-slate-400` | Descriptions, labels, secondary timestamps |

---

## 2. Typography Hierarchy

Fonts loaded via Google Fonts in `index.html`:
- **UI Font**: `Plus Jakarta Sans`, sans-serif (Weights: 400, 500, 600, 700, 800)
- **Monospace Font**: `JetBrains Mono`, monospace (Weights: 400, 500, 600)

```
Hero Header:        text-3xl / text-4xl sm:text-5xl font-extrabold tracking-tight
Section Title:      text-xl sm:text-2xl font-bold tracking-tight text-white
Card Heading:       text-base sm:text-lg font-semibold text-white
Body Regular:       text-sm text-slate-300 leading-relaxed
Caption / Label:    text-xs text-slate-400 font-medium
Code / Monetary:    font-mono font-bold tracking-wide (₹, Flight Codes, OTPs, Coordinates)
```

---

## 3. Elevation, Glassmorphism & Shadow Tokens

```css
/* Glass Card Primitive */
.glass-panel {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Glass Card Active / Interactive */
.glass-panel-interactive {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.glass-panel-interactive:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(56, 189, 248, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.15);
}

/* Glow Pill Accent */
.glow-cyan {
  box-shadow: 0 0 20px -2px rgba(6, 182, 212, 0.25);
}
```

---

## 4. Component Primitives

### 4.1 Buttons
- **Primary CTA**: `h-12 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-all`
- **Secondary CTA**: `h-12 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700/80 text-white font-semibold text-sm border border-slate-700 active:scale-[0.98] transition-all`
- **Ghost CTA**: `h-10 px-4 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs font-semibold transition-all`
- **Danger CTA**: `h-12 px-6 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-sm border border-rose-500/30 active:scale-[0.98] transition-all`

### 4.2 Destination Card (Uber/Ola Benchmark Pattern)
- Clean card container with rounded-3xl (`rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl p-6`).
- Airport origin pill pinned to top with CSMIA Hub indicator (`BOM Terminal 2 • Level P4 East`).
- Floating destination search input with instant results and recent destinations chips.
- Visual vehicle category selector with live passenger counter, luggage counter, and savings badge (`Save up to ₹420`).

### 4.3 4-Digit OTP Security Card
- High contrast display: `text-3xl sm:text-4xl font-mono font-extrabold tracking-widest text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-6 py-4 rounded-2xl shadow-inner`.
- Prominent security instruction: *"Share OTP with driver only after boarding and verifying vehicle license plate."*

### 4.4 Mobile Touch Ergonomics
- Minimum touch target: 44px × 44px on all clickable buttons, pills, and inputs.
- Safe-area bottom padding for mobile devices (`pb-24` on mobile main views).
- Bottom sticky summary bar for booking confirmation and live ride actions on mobile screens.

---
*Stage 2 Design System is fully documented and established.*

