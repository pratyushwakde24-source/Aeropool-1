import React, { useState, useEffect } from 'react';
import { Navigation, MapPin, Car, Shield, Compass, RotateCcw } from 'lucide-react';
import { DestinationPoint, PickupZone } from '../types';

interface InteractiveMapProps {
  pickupZone?: PickupZone;
  destination?: DestinationPoint;
  driverLocation?: { lat: number; lng: number; isSimulated?: boolean };
  stops?: {
    stopId: string;
    type: 'PICKUP' | 'DROPOFF';
    passengerName: string;
    locationName: string;
    lat: number;
    lng: number;
    completed: boolean;
  }[];
  vehiclePlate?: string;
  vehicleModel?: string;
  isSimulatedDemo?: boolean;
  heightClass?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  pickupZone,
  destination,
  driverLocation,
  stops = [],
  vehiclePlate = 'MH 02 EE 8421',
  vehicleModel = 'Toyota Innova Crysta',
  isSimulatedDemo = true,
  heightClass = 'h-80 md:h-96',
}) => {
  // Center coordinates around CSMIA T2 or destination
  const [zoom, setZoom] = useState(1);
  const [simulatedOffset, setSimulatedOffset] = useState({ x: 0, y: 0 });
  const [gpsMode, setGpsMode] = useState<'demo' | 'real'>('demo');
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number; accuracy: number; updatedAt: Date } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Request actual device GPS when authorized
  const handleRequestLiveGPS = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your browser or environment.');
      return;
    }

    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeviceCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          updatedAt: new Date(),
        });
        setGpsMode('real');
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Location permission denied by user' : 'Unable to acquire satellite GPS fix');
        setGpsMode('demo');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Simulate smooth gentle vehicle animation along the route in demo mode
  useEffect(() => {
    if (gpsMode === 'real') return;
    const interval = setInterval(() => {
      setSimulatedOffset((prev) => {
        const nextX = (prev.x + 0.8) % 100;
        const nextY = Math.sin((nextX / 100) * Math.PI * 2) * 8;
        return { x: nextX, y: nextY };
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [gpsMode]);

  return (
    <div className={`relative w-full ${heightClass} bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex flex-col justify-between`}>
      {/* Map Graphic Canvas (Vector GIS Style with OpenStreetMap-inspired styling) */}
      <div className="absolute inset-0 bg-[#0b1329] overflow-hidden select-none pointer-events-none">
        {/* Mumbai Coastline and Road Grid SVG */}
        <svg
          className="w-full h-full opacity-60"
          viewBox="0 0 800 500"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect width="800" height="500" fill="url(#grid)" />

          {/* Mumbai Coastal Shoreline Outline */}
          <path
            d="M 120 0 Q 140 120 180 200 T 220 320 T 190 420 T 210 500 L 0 500 L 0 0 Z"
            fill="#080e1e"
          />

          {/* Major Expressways (Western Express Hwy, Eastern Express Hwy, Sea Link) */}
          {/* WEH */}
          <path
            d="M 280 20 L 330 180 L 320 280 L 260 410 L 250 490"
            fill="none"
            stroke="#1e3a8a"
            strokeWidth="3.5"
            strokeDasharray="4 2"
          />
          {/* EEH */}
          <path
            d="M 450 20 L 460 160 L 410 320 L 340 450 L 310 500"
            fill="none"
            stroke="#1e293b"
            strokeWidth="3"
          />
          {/* Bandra-Worli Sea Link */}
          <path
            d="M 230 310 Q 200 350 240 380"
            fill="none"
            stroke="#0284c7"
            strokeWidth="2.5"
          />

          {/* Active Pooled Route Path */}
          <path
            d="M 330 180 C 310 240, 290 280, 260 360 S 240 420, 240 450"
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* CSMIA Airport Runway graphic */}
          <g transform="translate(325, 175)">
            <rect x="-35" y="-6" width="70" height="12" fill="#334155" rx="3" transform="rotate(-35)" />
            <line x1="-30" y1="0" x2="30" y2="0" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" transform="rotate(-35)" />
            <rect x="-25" y="-5" width="50" height="10" fill="#334155" rx="3" transform="rotate(40)" />
          </g>

          {/* Pickup Zone Marker (CSMIA) */}
          <circle cx="330" cy="180" r="14" fill="#0284c7" fillOpacity="0.3" className="animate-ping" />
          <circle cx="330" cy="180" r="7" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />

          {/* Destination Markers */}
          <circle cx="260" cy="360" r="6" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
          <circle cx="240" cy="450" r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />

          {/* Animated Driver Marker */}
          <g transform={`translate(${300 - (simulatedOffset.x * 0.6)}, ${220 + (simulatedOffset.x * 1.8) + simulatedOffset.y})`}>
            <circle cx="0" cy="0" r="16" fill="#2563eb" fillOpacity="0.3" className="animate-pulse" />
            <circle cx="0" cy="0" r="9" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
          </g>
        </svg>
      </div>

      {/* Top Map HUD Bar */}
      <div className="relative z-10 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-lg text-xs font-medium text-slate-200">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>CSMIA Corridor</span>
          {gpsMode === 'real' && deviceCoords ? (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider">
              Device GPS (±{deviceCoords.accuracy}m)
            </span>
          ) : (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
              Demo Simulation
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Real GPS Toggle */}
          <button
            onClick={handleRequestLiveGPS}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
              gpsMode === 'real'
                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Enable Device Geolocation"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>{gpsMode === 'real' ? 'Live GPS Active' : 'Acquire Device GPS'}</span>
          </button>

          <button
            onClick={() => setZoom((z) => (z === 1 ? 1.2 : 1))}
            className="p-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 transition"
            title="Recenter"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {gpsError && (
        <div className="relative z-10 mx-3 sm:mx-4 px-3 py-1.5 bg-amber-950/80 border border-amber-500/40 rounded-xl text-[11px] text-amber-300 flex items-center justify-between">
          <span>{gpsError}</span>
          <button onClick={() => setGpsError(null)} className="text-amber-400 hover:text-white font-bold ml-2">×</button>
        </div>
      )}

      {/* Bottom Map Status Card */}
      <div className="relative z-10 m-3 sm:m-4 p-3.5 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{vehicleModel}</span>
              <span className="text-xs bg-slate-800 text-sky-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                {vehiclePlate}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {pickupZone ? `${pickupZone.name} (${pickupZone.pillar})` : 'T2 Level P4 East (Pillar 4-6)'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Corridor</div>
            <div className="text-xs font-semibold text-slate-200">
              {destination ? destination.corridor : 'Bandra-BKC Expressway'}
            </div>
          </div>
          <div className="pl-3 border-l border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Speed</div>
            <div className="text-xs font-mono font-semibold text-emerald-400">32 km/h</div>
          </div>
        </div>
      </div>
    </div>
  );
};
