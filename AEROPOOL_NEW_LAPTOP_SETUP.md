# AeroPool — New Laptop Setup & Mobile Access Guide

A concise guide for starting and accessing AeroPool on any development laptop, including access from an Android or iOS smartphone via stable hostname or IP.

---

## 1. Quick Start Commands

Open a terminal in the project directory (`Aeropool 1`):

### Terminal 1: Start Backend Server (Port 3001)
```bash
npm run server
```
*Alternatively:* `npx tsx server/index.ts`  
*Bound to:* `http://0.0.0.0:3001` (includes automatic mDNS and LocalDNS responder for `aeropool.local`)

### Terminal 2: Start Frontend Dev Server (Port 3000)
```bash
npm run dev
```
*Bound to:* `http://0.0.0.0:3000` (`allowedHosts` includes `aeropool.local`)

---

## 2. Stable Mobile Access URL

Connect your phone to the same Wi-Fi (**`Airtel_prem_0802`**) and open:

```
http://aeropool.local:3000
```

*(Direct IP fallback: `http://192.168.1.9:3000`)*

### Mobile Device Behavior:
- **Apple iOS (iPhone/iPad):** Opens `http://aeropool.local:3000` in Safari with zero configuration (native mDNS).
- **Android Devices:**
  - *Android 12+ (mDNS):* In phone settings, set **Private DNS** to **Off**, then open `http://aeropool.local:3000`.
  - *Universal Static DNS (all Android):* In Wi-Fi advanced settings, set IP to Static and DNS 1 to `192.168.1.9` (the laptop's LocalDNS proxy). All normal internet browsing continues without issue.

---

## 3. Router DHCP Reservation (Lock In 192.168.1.9)

To ensure this laptop permanently keeps `192.168.1.9`:
1. Log into your router admin panel: `http://192.168.1.1`.
2. Find **DHCP Static Lease** / **IP-MAC Binding**.
3. Bind your laptop's Wi-Fi MAC:
   - **MAC Address:** `F4:C8:8A:7F:24:C5`
   - **IP Address:** `192.168.1.9`

---

## 4. Windows Firewall Configuration (One-Time Setup)

If incoming connections are blocked when connecting from another device, open **PowerShell as Administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "AeroPool Dev Servers (TCP 3000, 3001)" -Direction Inbound -LocalPort 3000,3001 -Protocol TCP -Action Allow -Profile Any -RemoteAddress LocalSubnet
```

This creates an inbound rule scoped specifically to your local network subnet and development ports without opening your laptop to the public internet.

---

## 5. Verification Commands

To verify that the application and all integrations are healthy:

```bash
# 1. Typecheck the codebase
npm run lint

# 2. Run the full automated test suite (209 tests)
npm test

# 3. Verify live Supabase database tables & RPCs
npm run verify:db

# 4. Production build check
npm run build
```

---

## 6. Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| **Phone says "Site can't be reached" on aeropool.local** | Android Private DNS is enabled or mDNS is unsupported by the phone's browser | Set Private DNS to Off in Android settings, or use the direct IP `http://192.168.1.9:3000`. |
| **Vite 403 Forbidden** | `allowedHosts` rejected the host | Verified: `vite.config.ts` has `allowedHosts: ['aeropool.local', '.local', 'localhost', '127.0.0.1']`. |
| **API calls fail on the phone** | Direct calls to `localhost:3001` will fail on phone | Use relative paths (`/api/...`) which Vite proxies to the laptop backend automatically. |
| **Router AP / Client Isolation** | Some guest networks isolate connected devices from each other | Ensure you are on the primary home/office Wi-Fi, not a "Guest" network with AP isolation enabled. |
