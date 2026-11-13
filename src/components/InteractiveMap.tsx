import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  Layers,
  LocateFixed,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { DestinationPoint, PickupZone, DriverCurrentLocation, LocationBreadcrumb } from '../types';
import { CSMIA_AIRPORT, PICKUP_ZONES } from '../services/geoService';
import { calculateRoute, RouteResult } from '../services/mapProviderService';
import {
  IMapProvider,
  MapProviderType,
  MapMarkerDescriptor,
  MapCameraState,
  createMapProvider,
  getActiveMapProvider,
  subscribeActiveMapProvider,
  getGoogleMapsKey,
  getMapboxToken,
} from '../services/maps';

export interface InteractiveMapProps {
  pickupZone?: PickupZone;
  destination?: DestinationPoint;
  driverLocation?: DriverCurrentLocation;
  breadcrumbs?: LocationBreadcrumb[];
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
  isConcluded?: boolean;
  heightClass?: string;
  onDestinationSelect?: (dest: { lat: number; lng: number; name?: string }) => void;
  interactiveSelection?: boolean;
  providerOverride?: MapProviderType;
  onRouteCalculated?: (route: RouteResult) => void;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  pickupZone = PICKUP_ZONES[0],
  destination,
  driverLocation,
  breadcrumbs = [],
  stops = [],
  vehiclePlate,
  vehicleModel,
  isSimulatedDemo = false,
  isConcluded = false,
  heightClass = 'h-80 md:h-96',
  onDestinationSelect,
  interactiveSelection = true,
  providerOverride,
  onRouteCalculated,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<IMapProvider | null>(null);

  const [activeProviderType, setActiveProviderType] = useState<MapProviderType>(() => getActiveMapProvider());
  const effectiveProvider = providerOverride || activeProviderType;

  const [isProviderReady, setIsProviderReady] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeRetryCount, setRouteRetryCount] = useState(0);
  const [deviceCoords, setDeviceCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    updatedAt: Date;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Keep stable callback refs to avoid destroying map canvas on parent re-renders
  const onDestinationSelectRef = useRef(onDestinationSelect);
  useEffect(() => {
    onDestinationSelectRef.current = onDestinationSelect;
  }, [onDestinationSelect]);

  const onRouteCalculatedRef = useRef(onRouteCalculated);
  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated;
  }, [onRouteCalculated]);

  // Subscribe to active global map provider changes
  useEffect(() => {
    const unsub = subscribeActiveMapProvider((provider) => {
      setActiveProviderType(provider);
    });
    return unsub;
  }, []);

  // Recalculate route geometry when pickupZone or destination changes via unified service
  useEffect(() => {
    let isCurrent = true;
    setIsRouteLoading(true);
    setRouteError(null);

    const origin = {
      lat: pickupZone.latitude || CSMIA_AIRPORT.latitude,
      lng: pickupZone.longitude || CSMIA_AIRPORT.longitude,
    };
    const dest = destination
      ? { lat: destination.latitude, lng: destination.longitude }
      : { lat: 19.0662, lng: 72.8688 }; // Bandra Kurla Complex (BKC) reference default

    calculateRoute(origin, dest)
      .then((res) => {
        if (!isCurrent) return;
        setRouteData(res);
        setIsRouteLoading(false);
        setRouteError(null);
        onRouteCalculatedRef.current?.(res);
      })
      .catch((err) => {
        if (!isCurrent) return;
        console.error('Failed to calculate route geometry:', err);
        setIsRouteLoading(false);
        setRouteError('Could not calculate driving route.');
      });

    return () => {
      isCurrent = false;
    };
  }, [
    pickupZone.id,
    pickupZone.latitude,
    pickupZone.longitude,
    destination?.id,
    destination?.latitude,
    destination?.longitude,
    routeRetryCount,
  ]);

  // Mount, initialize and switch map provider
  useEffect(() => {
    let isCancelled = false;

    if (!mapContainerRef.current) return;

    // Check credentials before attempting initialization
    if (effectiveProvider === 'google' && !getGoogleMapsKey()) {
      setIsProviderReady(false);
      setProviderError('Google Maps API key is not configured.');
      return;
    }
    if (effectiveProvider === 'mapbox' && !getMapboxToken()) {
      setIsProviderReady(false);
      setProviderError('Mapbox access token is not configured.');
      return;
    }

    setProviderError(null);

    // If provider already initialized and ready on the current container, keep it
    if (providerRef.current && providerRef.current.providerType === effectiveProvider && providerRef.current.isReady()) {
      return;
    }

    // Save previous camera position or default to CSMIA T2
    let initialCamera: MapCameraState = {
      center: {
        lat: pickupZone.latitude || CSMIA_AIRPORT.latitude,
        lng: pickupZone.longitude || CSMIA_AIRPORT.longitude,
      },
      zoom: 12.5,
    };

    if (providerRef.current?.isReady()) {
      initialCamera = providerRef.current.getCamera();
    }

    // Teardown previous provider if provider type changed or not ready on retry
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
      setIsProviderReady(false);
    }

    providerRef.current = createMapProvider(effectiveProvider);
    const provider = providerRef.current;

    // Clear previous DOM container children if re-initializing
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }

    provider
      .initialize(mapContainerRef.current, initialCamera)
      .then(() => {
        if (isCancelled) return;
        setIsProviderReady(true);
        setProviderError(null);

        // Wire interactive click selection
        if (interactiveSelection) {
          provider.onMapClick((pos) => {
            onDestinationSelectRef.current?.({
              lat: pos.lat,
              lng: pos.lng,
              name: 'Custom Location Pin',
            });
          });
        }
      })
      .catch((err: any) => {
        if (isCancelled) return;
        console.warn(`Failed to initialize ${effectiveProvider} provider:`, err.message);
        setIsProviderReady(false);
        setProviderError(err.message || `Failed to initialize ${effectiveProvider}`);
      });

    return () => {
      isCancelled = true;
    };
  }, [effectiveProvider, retryCount, interactiveSelection]);

  // Sync markers, vehicle rotation, and route polyline onto active provider
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || !isProviderReady) return;

    const originLat = pickupZone.latitude || CSMIA_AIRPORT.latitude;
    const originLng = pickupZone.longitude || CSMIA_AIRPORT.longitude;

    const markers: MapMarkerDescriptor[] = [];

    // 1. CSMIA Pickup Hub Marker (White callout pill + cyan circle)
    const terminalLabel = pickupZone.terminalCode ? `CSMIA ${pickupZone.terminalCode}` : 'CSMIA T2';
    markers.push({
      id: 'pickup-csmia',
      position: { lat: originLat, lng: originLng },
      title: terminalLabel,
      type: 'PICKUP',
      iconColor: '#00DDF5',
      infoHtml: `<div style="color:#0f172a;padding:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.4;">
        <strong style="color:#0369a1;font-size:13px;">CSMIA ${pickupZone.terminalCode} Pickup Hub</strong><br/>
        <span style="font-weight:600;">${pickupZone.name}</span><br/>
        <small style="color:#64748b;">${pickupZone.instructions || pickupZone.pillar || 'Designated Terminal Pickup Bay'}</small>
      </div>`,
    });

    // 2. Drop-off Destination Marker (Crimson / Rose Pink Teardrop Pin)
    if (destination) {
      markers.push({
        id: 'destination-dropoff',
        position: { lat: destination.latitude, lng: destination.longitude },
        title: destination.name,
        type: 'DESTINATION',
        iconColor: '#F0445E',
        infoHtml: `<div style="color:#0f172a;padding:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.4;">
          <strong style="color:#e11d48;font-size:13px;">${destination.name}</strong><br/>
          <span style="color:#334155;">${destination.address || destination.corridor}</span>
        </div>`,
      });
    }

    // 3. Live Driver Vehicle Marker (Strictly real GPS, authentic heading rotation, stale indicator)
    if (driverLocation && !isConcluded && driverLocation.source === 'REAL_GPS') {
      const headingDeg = typeof driverLocation.heading === 'number' ? driverLocation.heading : 0;
      const isStale = Boolean(driverLocation.isStale);
      markers.push({
        id: 'driver-vehicle',
        position: { lat: driverLocation.lat, lng: driverLocation.lng },
        title: isStale
          ? `Vehicle Location Stale (>30s): ${vehiclePlate || 'AeroPool'}`
          : `Assigned Vehicle: ${vehiclePlate || 'AeroPool'} (Heading: ${headingDeg}°)`,
        type: 'VEHICLE',
        heading: headingDeg,
        vehiclePlate,
        vehicleModel,
        iconColor: isStale ? '#94a3b8' : '#00DDF5',
        isStale,
      });
    }

    // 4. Passenger Staging Stops (if any)
    stops.forEach((s) => {
      markers.push({
        id: `stop-${s.stopId}`,
        position: { lat: s.lat, lng: s.lng },
        title: `${s.type === 'PICKUP' ? 'Pickup' : 'Dropoff'}: ${s.passengerName} (${s.locationName})`,
        type: s.type === 'PICKUP' ? 'PICKUP' : 'DESTINATION',
        iconColor: s.completed ? '#64748b' : '#00DDF5',
      });
    });

    provider.setMarkers(markers);

    // Fit bounds to include pickup, destination, vehicle and route polyline
    const coordsToFit: { lat: number; lng: number }[] = [{ lat: originLat, lng: originLng }];
    if (destination && typeof destination.latitude === 'number' && typeof destination.longitude === 'number') {
      coordsToFit.push({ lat: destination.latitude, lng: destination.longitude });
    }
    if (driverLocation && !isConcluded && driverLocation.source === 'REAL_GPS' && !driverLocation.isStale) {
      coordsToFit.push({ lat: driverLocation.lat, lng: driverLocation.lng });
    }

    // Apply Route Polyline
    if (routeData && routeData.polyline.length > 0) {
      provider.setRoute({
        polyline: routeData.polyline,
        strokeColor: '#00DDF5',
        strokeWidth: 4.5,
        isEstimatedFallback: routeData.isEstimatedFallback,
        summary: routeData.summary,
      });

      coordsToFit.push(...routeData.polyline.filter((_, idx) => idx % 4 === 0));
    }

    if (coordsToFit.length >= 2) {
      provider.fitCoordinates(coordsToFit, 48);
    }
  }, [isProviderReady, pickupZone, destination, driverLocation, routeData, isConcluded, stops, vehiclePlate, vehicleModel]);

  // Handle map style changes
  const handleToggleMapType = () => {
    const nextType = mapType === 'roadmap' ? 'satellite' : 'roadmap';
    setMapType(nextType);
    providerRef.current?.setMapType(nextType);
  };

  // Zoom controls
  const handleZoomIn = () => {
    providerRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    providerRef.current?.zoomOut();
  };

  // Resilient browser GPS request with automatic retry on timeout
  const handleRequestLiveGPS = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your current browser.');
      return;
    }

    setGpsError(null);
    setIsAcquiringGps(true);

    const onCoordsAcquired = (pos: GeolocationPosition) => {
      setIsAcquiringGps(false);
      const coords = {
        lat: Number(pos.coords.latitude.toFixed(5)),
        lng: Number(pos.coords.longitude.toFixed(5)),
        accuracy: Math.round(pos.coords.accuracy),
        updatedAt: new Date(),
      };
      setDeviceCoords(coords);

      // Smoothly center the map on the user's location
      providerRef.current?.centerOn(coords);

      if (onDestinationSelect) {
        onDestinationSelect({
          lat: coords.lat,
          lng: coords.lng,
          name: `My GPS Location (±${coords.accuracy}m)`,
        });
      }
    };

    // Attempt high accuracy
    navigator.geolocation.getCurrentPosition(
      onCoordsAcquired,
      (err) => {
        if (err.code === 3) {
          // Timeout occurred; retry with lower accuracy and cached position
          navigator.geolocation.getCurrentPosition(
            onCoordsAcquired,
            (fallbackErr) => {
              setIsAcquiringGps(false);
              if (fallbackErr.code === 1) {
                setGpsError('Location access denied. Please select your location on the map.');
              } else {
                setGpsError('Location request timed out.');
              }
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
          );
        } else {
          setIsAcquiringGps(false);
          if (err.code === 1) {
            setGpsError('Location access denied. Please select your location on the map.');
          } else if (err.code === 2) {
            setGpsError('GPS signal unavailable.');
          } else {
            setGpsError('Location request timed out. Please try again.');
          }
        }
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  };

  // Auto-dismiss GPS error notice
  useEffect(() => {
    if (gpsError) {
      const timer = setTimeout(() => setGpsError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [gpsError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={`relative w-full ${heightClass} bg-[#0B1930] rounded-2xl overflow-hidden border border-[#162744] shadow-2xl select-none`}
    >
      {/* 1. Real Map Canvas Mounting Container (Mapbox GL or Google Maps) */}
      <div
        ref={mapContainerRef}
        className={`absolute inset-0 z-0 transition-opacity duration-500 ${
          isProviderReady ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 2. Loading State / Connecting Map Provider */}
      {!isProviderReady && (
        <div className="absolute inset-0 bg-[#0B1930] flex flex-col items-center justify-center gap-3 z-10">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-[#00DDF5]/20 animate-ping" />
            <div className="w-10 h-10 rounded-full border-2 border-t-[#00DDF5] border-r-transparent border-b-[#00DDF5]/40 border-l-transparent animate-spin" />
            <Navigation className="w-4 h-4 text-[#00DDF5]" />
          </div>
          <div className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-2">
            <span>{providerError ? 'Reconnecting map engine...' : 'Loading Mumbai live map...'}</span>
            {providerError && (
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="text-[#00DDF5] underline hover:text-white"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Route Status Badge / Live Update Indicator */}
      {isProviderReady && isRouteLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-[#0B1930]/90 border border-[#00DDF5]/40 shadow-lg flex items-center gap-2 backdrop-blur-md animate-in fade-in">
          <RefreshCw className="w-3.5 h-3.5 text-[#00DDF5] animate-spin" />
          <span className="text-[11px] font-semibold text-slate-200">Updating route...</span>
        </div>
      )}

      {/* Route Error Notification with Retry */}
      {isProviderReady && routeError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-[#0B1930]/95 border border-amber-500/50 shadow-lg flex items-center gap-2 backdrop-blur-md">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-semibold text-amber-200">{routeError}</span>
          <button
            type="button"
            onClick={() => setRouteRetryCount((c) => c + 1)}
            className="text-[11px] font-bold text-[#00DDF5] underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. Minimal Floating Controls — Matching Exact Design Reference */}

      {/* Top Left: Optional Map View / Layers Toggle */}
      {isProviderReady && (
        <div className="absolute top-3 left-3 z-20">
          <button
            type="button"
            onClick={handleToggleMapType}
            title="Toggle Map Style"
            className="px-2.5 py-1.5 rounded-xl bg-[#0B1930]/90 hover:bg-[#13233D] active:scale-95 border border-slate-700/60 shadow-lg text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1.5 backdrop-blur-md transition-all"
          >
            <Layers className="w-3.5 h-3.5 text-[#00DDF5]" />
            <span className="capitalize">{mapType === 'roadmap' ? 'Satellite' : 'Midnight'}</span>
          </button>
        </div>
      )}

      {/* Top Right: Current Location Crosshair Button */}
      <div className="absolute top-3 right-3 z-20">
        <button
          type="button"
          onClick={handleRequestLiveGPS}
          disabled={isAcquiringGps}
          title="Locate my position"
          className="w-10 h-10 rounded-full bg-[#0B1930]/90 hover:bg-[#13233D] active:scale-90 border border-slate-700/60 shadow-xl text-slate-200 hover:text-[#00DDF5] flex items-center justify-center transition-all backdrop-blur-md cursor-pointer"
        >
          <LocateFixed className={`w-5 h-5 ${isAcquiringGps ? 'animate-spin text-[#00DDF5]' : ''}`} />
        </button>
      </div>

      {/* Bottom Right: Zoom In (+) / Zoom Out (-) Pill */}
      {isProviderReady && (
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-center bg-[#0B1930]/90 border border-slate-700/60 rounded-xl shadow-xl overflow-hidden backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom in"
            className="w-9 h-9 flex items-center justify-center text-slate-200 hover:text-[#00DDF5] hover:bg-slate-800/80 active:bg-slate-700/80 transition text-lg font-bold cursor-pointer"
          >
            +
          </button>
          <div className="w-5 h-[1px] bg-slate-700/60" />
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom out"
            className="w-9 h-9 flex items-center justify-center text-slate-200 hover:text-[#00DDF5] hover:bg-slate-800/80 active:bg-slate-700/80 transition text-lg font-bold cursor-pointer"
          >
            −
          </button>
        </div>
      )}

      {/* 4. Sleek GPS Error / Permission Toast (Auto-dismisses without obstructing map) */}
      {gpsError && (
        <div className="absolute bottom-3 left-3 right-14 sm:right-auto z-30 bg-[#0B1930]/95 border border-red-500/40 rounded-xl px-3 py-2 text-[11px] text-red-300 shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 backdrop-blur-md">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="truncate">{gpsError}</span>
          <button
            type="button"
            onClick={() => setGpsError(null)}
            className="ml-auto text-slate-400 hover:text-white text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
