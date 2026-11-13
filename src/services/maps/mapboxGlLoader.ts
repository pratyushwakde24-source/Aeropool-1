/**
 * AeroPool — Dynamic Mapbox GL JS SDK Loader
 * 
 * Asynchronously loads Mapbox GL JavaScript SDK and stylesheet on-demand.
 * Ensures the main bundle remains lean and prevents Node.js SSR / CLI crashes.
 */

import { getMapboxToken } from './MapProviderConfig';

export interface MapboxScriptStatus {
  isConfigured: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
}

let mapboxLoadPromise: Promise<void> | null = null;
let currentStatus: MapboxScriptStatus = {
  isConfigured: Boolean(getMapboxToken() && getMapboxToken().length > 10),
  isLoading: false,
  isLoaded: typeof window !== 'undefined' && Boolean(window.mapboxgl?.Map),
  error: null,
};

const listeners = new Set<(status: MapboxScriptStatus) => void>();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb({ ...currentStatus });
    } catch {
      // ignore
    }
  });
}

export function subscribeMapboxStatus(cb: (status: MapboxScriptStatus) => void): () => void {
  listeners.add(cb);
  cb({ ...currentStatus });
  return () => {
    listeners.delete(cb);
  };
}

export function getMapboxStatus(): MapboxScriptStatus {
  return { ...currentStatus };
}

/**
 * Dynamically loads official Mapbox GL JS SDK v3.4.0 and matching CSS
 */
export function loadMapboxScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // Already loaded
  if (window.mapboxgl?.Map) {
    currentStatus = {
      isConfigured: true,
      isLoading: false,
      isLoaded: true,
      error: null,
    };
    notify();
    return Promise.resolve();
  }

  if (mapboxLoadPromise) {
    return mapboxLoadPromise;
  }

  const token = getMapboxToken();
  if (!token || token.length < 10) {
    currentStatus = {
      isConfigured: false,
      isLoading: false,
      isLoaded: false,
      error: 'Mapbox Access Token is missing or not configured.',
    };
    notify();
    return Promise.reject(new Error(currentStatus.error || 'Token missing'));
  }

  currentStatus = {
    ...currentStatus,
    isConfigured: true,
    isLoading: true,
    error: null,
  };
  notify();

  mapboxLoadPromise = new Promise<void>((resolve, reject) => {
    // 1. Inject Mapbox GL CSS
    const cssId = 'mapbox-gl-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css';
      document.head.appendChild(link);
    }

    // 2. Inject Mapbox GL JS
    const scriptId = 'mapbox-gl-js-sdk';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.mapboxgl?.Map) {
        window.mapboxgl.accessToken = token;
        currentStatus = {
          isConfigured: true,
          isLoading: false,
          isLoaded: true,
          error: null,
        };
        notify();
        resolve();
      } else {
        currentStatus = {
          isConfigured: true,
          isLoading: false,
          isLoaded: false,
          error: 'Mapbox GL library downloaded but window.mapboxgl was not initialized.',
        };
        notify();
        reject(new Error(currentStatus.error || 'Mapbox namespace unavailable'));
      }
    };

    script.onerror = () => {
      currentStatus = {
        isConfigured: true,
        isLoading: false,
        isLoaded: false,
        error: 'Failed to download Mapbox GL JS SDK from CDN. Check network or CSP rules.',
      };
      notify();
      reject(new Error(currentStatus.error || 'Network error'));
    };

    document.head.appendChild(script);
  });

  return mapboxLoadPromise;
}
