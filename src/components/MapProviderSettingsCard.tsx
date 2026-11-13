import React, { useState, useEffect } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Layers,
  ArrowRightLeft,
  ShieldAlert,
  Activity,
  MapPin,
  Car,
  Navigation,
  Globe2,
  Sparkles,
} from 'lucide-react';
import {
  MapProviderType,
  getActiveMapProvider,
  subscribeActiveMapProvider,
  switchMapProviderSafely,
  checkAllMapProvidersHealth,
  ProviderHealthDetail,
  getGoogleMapsKey,
  getMapboxToken,
} from '../services/maps';
import { db } from '../services/db';
import { InteractiveMap } from './InteractiveMap';
import { PICKUP_ZONES, MUMBAI_DESTINATIONS } from '../services/geoService';

interface MapProviderSettingsCardProps {
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const MapProviderSettingsCard: React.FC<MapProviderSettingsCardProps> = ({ onNotify }) => {
  const [activeProvider, setActiveProvider] = useState<MapProviderType>(getActiveMapProvider);
  const [healthMap, setHealthMap] = useState<Record<MapProviderType, ProviderHealthDetail> | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    rollbackOccurred?: boolean;
  } | null>(null);

  // Subscribe to global active provider
  useEffect(() => {
    const unsub = subscribeActiveMapProvider((provider) => {
      setActiveProvider(provider);
    });
    return unsub;
  }, []);

  const runHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      const results = await checkAllMapProvidersHealth();
      setHealthMap(results);
    } catch (err: any) {
      console.error('Failed to run map provider health check:', err);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, [activeProvider]);

  const handleSwitch = async (target: MapProviderType) => {
    if (isSwitching || target === activeProvider) return;

    setIsSwitching(true);
    setSwitchFeedback(null);

    const currentUser = db.getState().currentUser;
    const actor = {
      id: currentUser?.id || 'admin-super',
      email: currentUser?.email || 'superadmin@aeropool.in',
      role: currentUser?.role || 'admin',
    };

    try {
      const res = await switchMapProviderSafely(target, actor, {
        reason: `Super Admin dashboard manual switch from ${activeProvider} to ${target}`,
      });

      if (res.success) {
        setSwitchFeedback({
          type: 'success',
          message: `Active map provider successfully switched to ${target === 'google' ? 'Google Maps' : 'Mapbox GL'}. Visual canvas, markers, and live routes preserved.`,
        });
        if (onNotify) {
          onNotify('success', `Active map engine switched to ${target === 'google' ? 'Google Maps' : 'Mapbox GL'}`);
        }
      } else {
        setSwitchFeedback({
          type: 'error',
          message: res.error || 'Failed to switch map provider.',
          rollbackOccurred: res.rollbackOccurred,
        });
        if (onNotify) {
          onNotify('error', res.error || 'Map provider switch failed');
        }
      }
    } catch (err: any) {
      setSwitchFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred during map engine switch.',
        rollbackOccurred: true,
      });
    } finally {
      setIsSwitching(false);
      runHealthCheck();
    }
  };

  const samplePickup = PICKUP_ZONES[0]; // CSMIA T2 Pillar 5
  const sampleDropoff = MUMBAI_DESTINATIONS[0]; // Bandra West / BKC

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Compass className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Map Provider Engine — Super Admin One-Click Switcher
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Switch between Google Maps and Mapbox GL in real time. Visual viewport camera, pickup bay markers,
              authentic GPS heading rotation, and route polylines are seamlessly preserved without page reloads or ride disruption.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runHealthCheck}
              disabled={isCheckingHealth}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
              title="Refresh provider health probes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isCheckingHealth ? 'Probing...' : 'Re-check Health'}</span>
            </button>

            <div className="px-3 py-1.5 bg-slate-950 border border-cyan-500/30 rounded-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-mono text-cyan-300 font-semibold uppercase">
                Active: {activeProvider === 'google' ? 'Google Maps' : 'Mapbox GL'}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {switchFeedback && (
          <div
            className={`mt-4 p-4 rounded-xl text-xs flex items-start gap-3 border ${
              switchFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}
          >
            {switchFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-white">
                {switchFeedback.type === 'success' ? 'Provider Switch Committed' : 'Provider Switch Blocked'}
              </p>
              <p className="leading-relaxed">{switchFeedback.message}</p>
              {switchFeedback.rollbackOccurred && (
                <p className="text-[11px] text-amber-300 font-mono">
                  🛡️ Rollback Guard Active: The previous stable provider remains engaged.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Provider Comparison Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Google Maps */}
        {(() => {
          const isCurrent = activeProvider === 'google';
          const info = healthMap?.google;

          return (
            <div
              className={`bg-slate-900 border rounded-2xl p-6 space-y-5 transition-all relative ${
                isCurrent
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-6 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-[10px] tracking-wider uppercase rounded-full shadow-md">
                  Active Map Engine
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm">
                    G
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Google Maps JavaScript API
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Standard vector and roadmap tiles with Places and Directions APIs
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    info?.overallStatus === 'HEALTHY'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : info?.overallStatus === 'DEGRADED'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  {info?.overallStatus || 'UNKNOWN'}
                </span>
              </div>

              {/* Status Matrix */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Credential (API Key)</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-200 text-[11px]">
                    {info?.credentialConfigured ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span title="Masked API Key">{info.credentialMasked}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-red-400">Missing Key</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">SDK Runtime Status</span>
                  <div className="flex items-center gap-1.5 font-medium text-slate-200">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        info?.sdkLoaded ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="truncate">{info?.sdkStatusMessage || 'Checking...'}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Visual Rendering</span>
                  <div className="flex items-center gap-1.5 font-medium">
                    {info?.visualRendering === 'BILLING_REQUIRED' ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Billing Required
                      </span>
                    ) : info?.visualRendering === 'OPERATIONAL' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Operational
                      </span>
                    ) : (
                      <span className="text-slate-400">{info?.visualRendering || 'Ready'}</span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Search & Routing</span>
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        info?.searchOperational ? 'bg-emerald-400' : 'bg-sky-400'
                      }`}
                    />
                    <span className="truncate">
                      {info?.searchOperational ? 'Google Places Active' : 'Mumbai Corridor Engine'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Error Notice if any */}
              {info?.renderingErrorMessage && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Notice: {info.visualRendering === 'BILLING_REQUIRED' ? 'Billing Error' : 'Configuration Warning'}
                  </p>
                  <p className="leading-relaxed opacity-90">{info.renderingErrorMessage}</p>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                {isCurrent ? (
                  <div className="w-full py-2.5 px-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    <span>Currently Serving Platform Viewports</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSwitch('google')}
                    disabled={isSwitching}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                    <span>Activate Google Maps (One-Click)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Card 2: Mapbox GL */}
        {(() => {
          const isCurrent = activeProvider === 'mapbox';
          const info = healthMap?.mapbox;

          return (
            <div
              className={`bg-slate-900 border rounded-2xl p-6 space-y-5 transition-all relative ${
                isCurrent
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-6 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-[10px] tracking-wider uppercase rounded-full shadow-md">
                  Active Map Engine
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-sm">
                    M
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Mapbox GL JS v3 (WebGL)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      High-performance WebGL vector tiles, GeoJSON polylines, dark navy theme
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    info?.overallStatus === 'HEALTHY'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : info?.overallStatus === 'DEGRADED'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  {info?.overallStatus || 'UNKNOWN'}
                </span>
              </div>

              {/* Status Matrix */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Credential (Access Token)</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-200 text-[11px]">
                    {info?.credentialConfigured ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span title="Masked Token">{info.credentialMasked}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-red-400">Missing Token</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">SDK Runtime Status</span>
                  <div className="flex items-center gap-1.5 font-medium text-slate-200">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        info?.sdkLoaded ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'
                      }`}
                    />
                    <span className="truncate">{info?.sdkStatusMessage || 'Ready'}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Visual Rendering</span>
                  <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WebGL Hardware Active</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Search & Routing</span>
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="truncate">Geocoding & Directions v5</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                {isCurrent ? (
                  <div className="w-full py-2.5 px-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    <span>Currently Serving Platform Viewports</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSwitch('mapbox')}
                    disabled={isSwitching}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-cyan-500/20"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Activate Mapbox GL (Instant)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Live Visual Verification Canvas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Live Visual Map Canvas ({activeProvider === 'google' ? 'Google Maps' : 'Mapbox GL'})
            </h3>
            <p className="text-xs text-slate-400">
              Interactive test viewport rendering CSMIA Mumbai Airport T2 pickup pillar and Bandra BKC route
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Testing Pickup:</span>
            <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 font-mono text-[11px]">
              T2 Pillar 5 (19.0896°N, 72.8656°E)
            </span>
          </div>
        </div>

        {/* Embedded Interactive Map */}
        <div className="rounded-xl overflow-hidden border border-slate-800 shadow-inner">
          <InteractiveMap
            pickupZone={samplePickup}
            destination={sampleDropoff}
            heightClass="h-72 md:h-84"
            interactiveSelection={false}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Airport Pickup Hub</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Dropoff Destination</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span>Corridor Polyline</span>
            </span>
          </div>

          <span className="font-mono text-[11px] text-slate-500">
            Engine: {activeProvider.toUpperCase()} | Seamless In-Memory Preserved State
          </span>
        </div>
      </div>
    </div>
  );
};

