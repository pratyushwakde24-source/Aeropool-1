/**
 * AeroPool — Mapbox GL JS Implementation of IMapProvider
 * 
 * Provides real visual map rendering with Mapbox GL JS v3, custom HTML vehicle
 * markers with dynamic bearing rotation, and GeoJSON route layers.
 */

import {
  IMapProvider,
  MapProviderType,
  MapCameraState,
  MapMarkerDescriptor,
  MapRouteDescriptor,
  MapBounds,
} from './MapProvider';
import { loadMapboxScript } from './mapboxGlLoader';
import { getMapboxToken } from './MapProviderConfig';

const MAPBOX_DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const MAPBOX_SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';
const ROUTE_SOURCE_ID = 'aeropool-route-source';
const ROUTE_LAYER_ID = 'aeropool-route-layer';

export class MapboxProvider implements IMapProvider {
  public readonly providerType: MapProviderType = 'mapbox';

  private map: mapboxgl.Map | null = null;
  private container: HTMLElement | null = null;
  private markersMap: Map<string, {
    marker: mapboxgl.Marker;
    element: HTMLElement;
    descriptor: MapMarkerDescriptor;
    animFrameId?: number;
  }> = new Map();
  private currentRoute: MapRouteDescriptor | null = null;
  private pendingMarkers: MapMarkerDescriptor[] | null = null;
  private pendingFitCoords: { coords: { lat: number; lng: number }[]; padding: number } | null = null;
  private clickListeners: Set<(pos: { lat: number; lng: number }) => void> = new Set();
  private isMapLoaded: boolean = false;
  private currentMapType: 'roadmap' | 'satellite' = 'roadmap';
  private currentCamera: MapCameraState = {
    center: { lat: 19.0902, lng: 72.8628 }, // CSMIA Airport Default
    zoom: 12,
  };

  public isReady(): boolean {
    return Boolean(this.map && this.isMapLoaded);
  }

  public async initialize(container: HTMLElement, initialCamera: MapCameraState): Promise<void> {
    this.container = container;
    this.currentCamera = { ...initialCamera };
    this.isMapLoaded = false;

    // Load Mapbox GL JS SDK and CSS
    await loadMapboxScript();

    if (!window.mapboxgl?.Map) {
      throw new Error('Mapbox GL SDK loaded but window.mapboxgl.Map is undefined');
    }

    const token = getMapboxToken();
    if (token) {
      window.mapboxgl.accessToken = token;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const map = new window.mapboxgl!.Map({
          container,
          style: MAPBOX_DARK_STYLE,
          center: [initialCamera.center.lng, initialCamera.center.lat],
          zoom: initialCamera.zoom,
          attributionControl: false,
          preserveDrawingBuffer: true,
        });

        // Apply custom AeroPool dark midnight theme on style load
        map.on('style.load', () => {
          if (this.currentMapType === 'roadmap') {
            this.applyDarkMidnightTheme(map);
          }
        });

        map.once('load', () => {
          this.map = map;
          this.isMapLoaded = true;

          if (this.currentMapType === 'roadmap') {
            this.applyDarkMidnightTheme(map);
          }

          // Wire click listener
          map.on('click', (e: mapboxgl.MapMouseEvent) => {
            const pos = {
              lat: Number(e.lngLat.lat.toFixed(5)),
              lng: Number(e.lngLat.lng.toFixed(5)),
            };
            this.clickListeners.forEach((listener) => listener(pos));
          });

          // Track camera movement
          map.on('moveend', () => {
            if (this.map) {
              const center = this.map.getCenter();
              this.currentCamera = {
                center: { lat: center.lat, lng: center.lng },
                zoom: Number(this.map.getZoom().toFixed(2)),
              };
            }
          });

          // Replay pending markers if queued prior to load
          if (this.pendingMarkers) {
            this.setMarkers(this.pendingMarkers);
            this.pendingMarkers = null;
          }

          // Re-render route if one was queued prior to load
          if (this.currentRoute) {
            this.applyRouteLayer(this.currentRoute);
          }

          // Replay pending coordinate bounds fitting
          if (this.pendingFitCoords) {
            this.fitCoordinates(this.pendingFitCoords.coords, this.pendingFitCoords.padding);
            this.pendingFitCoords = null;
          }

          resolve();
        });

        map.once('error', (e) => {
          console.warn('Mapbox GL runtime error event:', e);
          // If map failed before load
          if (!this.isMapLoaded) {
            reject(new Error('Mapbox GL failed to initialize canvas'));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private applyDarkMidnightTheme(map: mapboxgl.Map): void {
    try {
      const style = map.getStyle();
      if (!style || !style.layers) return;

      for (const layer of style.layers) {
        try {
          const id = layer.id.toLowerCase();
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#0B1930');
          } else if (layer.type === 'fill') {
            if (id.includes('water')) {
              map.setPaintProperty(layer.id, 'fill-color', '#07101F');
            } else if (id.includes('landuse') || id.includes('park') || id.includes('green') || id.includes('wood') || id.includes('grass')) {
              map.setPaintProperty(layer.id, 'fill-color', '#0B3322');
              map.setPaintProperty(layer.id, 'fill-opacity', 0.85);
            } else if (id.includes('aeroway') || id.includes('airport')) {
              map.setPaintProperty(layer.id, 'fill-color', '#1F304B');
            }
          } else if (layer.type === 'line') {
            if (id.includes('road') || id.includes('street') || id.includes('highway') || id.includes('bridge') || id.includes('tunnel')) {
              if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
                map.setPaintProperty(layer.id, 'line-color', '#22385C');
              } else {
                map.setPaintProperty(layer.id, 'line-color', '#16243A');
              }
            } else if (id.includes('aeroway') || id.includes('runway') || id.includes('taxiway')) {
              map.setPaintProperty(layer.id, 'line-color', '#2B3F60');
            }
          } else if (layer.type === 'symbol') {
            if (layer.layout && 'text-field' in layer.layout) {
              map.setPaintProperty(layer.id, 'text-color', '#A8B5CA');
              map.setPaintProperty(layer.id, 'text-halo-color', '#0B1930');
              map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
            }
          }
        } catch {
          // ignore individual layer style rejection
        }
      }
    } catch (err) {
      console.warn('Mapbox dark theme styling exception:', err);
    }
  }

  public setCamera(camera: MapCameraState, animate: boolean = false): void {
    this.currentCamera = { ...camera };
    if (!this.map) return;

    if (animate) {
      this.map.flyTo({
        center: [camera.center.lng, camera.center.lat],
        zoom: camera.zoom,
        duration: 1000,
        essential: true,
      });
    } else {
      this.map.setCenter([camera.center.lng, camera.center.lat]);
      this.map.setZoom(camera.zoom);
    }
  }

  public getCamera(): MapCameraState {
    if (this.map) {
      const center = this.map.getCenter();
      return {
        center: { lat: center.lat, lng: center.lng },
        zoom: Number(this.map.getZoom().toFixed(2)),
      };
    }
    return { ...this.currentCamera };
  }

  private animateMapboxMarker(
    entry: { marker: mapboxgl.Marker; element: HTMLElement; descriptor: MapMarkerDescriptor; animFrameId?: number },
    newDesc: MapMarkerDescriptor
  ): void {
    if (entry.animFrameId) {
      cancelAnimationFrame(entry.animFrameId);
      entry.animFrameId = undefined;
    }

    const currentLngLat = entry.marker.getLngLat();
    if (!currentLngLat) {
      entry.marker.setLngLat([newDesc.position.lng, newDesc.position.lat]);
      return;
    }

    const startLng = currentLngLat.lng;
    const startLat = currentLngLat.lat;
    const targetLng = newDesc.position.lng;
    const targetLat = newDesc.position.lat;

    // Update heading rotation and stale appearance on HTML element
    const headingDeg = typeof newDesc.heading === 'number' ? newDesc.heading : 0;
    const isStale = Boolean(newDesc.isStale);
    const rotatingDiv = entry.element.querySelector('.aeropool-vehicle-rotating') as HTMLElement;
    if (rotatingDiv) {
      rotatingDiv.style.transform = `rotate(${headingDeg}deg)`;
      rotatingDiv.style.opacity = isStale ? '0.6' : '1';
    }

    // Direct snap if displacement is tiny (< 1 meter)
    if (Math.abs(targetLat - startLat) < 0.00001 && Math.abs(targetLng - startLng) < 0.00001) {
      entry.marker.setLngLat([targetLng, targetLat]);
      entry.descriptor = { ...newDesc };
      return;
    }

    const startTime = performance.now();
    const duration = 350; // ms

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;

      entry.marker.setLngLat([currentLng, currentLat]);

      if (progress < 1) {
        entry.animFrameId = requestAnimationFrame(step);
      } else {
        entry.animFrameId = undefined;
        entry.descriptor = { ...newDesc };
      }
    };

    entry.animFrameId = requestAnimationFrame(step);
  }

  public setMarkers(descriptors: MapMarkerDescriptor[]): void {
    if (!this.map || !window.mapboxgl) return;

    if (!this.isMapLoaded) {
      this.pendingMarkers = descriptors;
      return;
    }

    const incomingIds = new Set(descriptors.map((d) => d.id));

    // 1. Remove markers no longer present (e.g. driver went offline)
    for (const [id, entry] of this.markersMap.entries()) {
      if (!incomingIds.has(id)) {
        if (entry.animFrameId) cancelAnimationFrame(entry.animFrameId);
        entry.marker.remove();
        this.markersMap.delete(id);
      }
    }

    // 2. Differential update or creation
    descriptors.forEach((desc) => {
      if (!this.map || !window.mapboxgl) return;

      const existing = this.markersMap.get(desc.id);
      if (existing) {
        if (desc.type === 'VEHICLE') {
          this.animateMapboxMarker(existing, desc);
        } else {
          existing.marker.setLngLat([desc.position.lng, desc.position.lat]);
          existing.descriptor = { ...desc };
        }
        return;
      }

      // Create new marker
      const el = document.createElement('div');
      el.className = 'aeropool-mapbox-marker';
      el.style.cursor = 'pointer';

      let marker: mapboxgl.Marker;

      if (desc.type === 'VEHICLE') {
        const headingDeg = typeof desc.heading === 'number' ? desc.heading : 0;
        const isStale = Boolean(desc.isStale);
        el.innerHTML = `
          <div class="aeropool-vehicle-rotating" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transform: rotate(${headingDeg}deg); transition: transform 0.35s ease; opacity: ${isStale ? '0.6' : '1'}; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="${desc.iconColor || '#00DDF5'}" stroke="#ffffff" stroke-width="1.8">
              <path d="M17.402,0H5.6c-0.4,0-0.8,0.3-0.8,0.8l-1.3,7.5C3.2,8.6,3,9,3,9.5V20c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1v-1h11v1 c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1V9.5c0-0.5-0.2-0.9-0.5-1.2l-1.3-7.5C18.2,0.3,17.8,0,17.402,0z M6.8,2.5h9.4l0.8,5H6L6.8,2.5z"/>
            </svg>
          </div>
        `;
        marker = new window.mapboxgl.Marker({
          element: el,
          anchor: 'center',
          rotationAlignment: 'map',
        }).setLngLat([desc.position.lng, desc.position.lat]);
      } else if (desc.type === 'PICKUP') {
        const terminalName = desc.title?.replace(/^CSMIA\s*/i, '').trim() || 'CSMIA T2';
        el.innerHTML = `
          <div class="aeropool-pickup-marker" style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
            <!-- White Callout Bubble with Airplane Symbol -->
            <div style="background: #ffffff; color: #0b1329; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 9999px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); display: flex; align-items: center; gap: 7px; white-space: nowrap; border: 1px solid rgba(255,255,255,0.9);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00A8F0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/>
              </svg>
              <span>${terminalName.startsWith('CSMIA') ? terminalName : `CSMIA ${terminalName}`}</span>
            </div>
            <!-- Downward Pointer Triangle -->
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #ffffff; margin-top: -1px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));"></div>
            <!-- Cyan Dot with White Border -->
            <div style="width: 18px; height: 18px; background: #00DDF5; border: 3.5px solid #ffffff; border-radius: 50%; box-shadow: 0 0 12px rgba(0,221,245,0.85), 0 2px 6px rgba(0,0,0,0.4); margin-top: 2px;"></div>
          </div>
        `;
        marker = new window.mapboxgl.Marker({
          element: el,
          anchor: 'bottom',
        }).setLngLat([desc.position.lng, desc.position.lat]);
      } else if (desc.type === 'DESTINATION') {
        el.innerHTML = `
          <div class="aeropool-destination-marker" style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
            <div style="position: relative; width: 34px; height: 40px; display: flex; align-items: center; justify-content: center;">
              <svg width="34" height="40" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6));">
                <path d="M16 0C7.163 0 0 7.163 0 16C0 26.25 14.25 36.75 15.1 37.36C15.37 37.56 15.68 37.66 16 37.66C16.32 37.66 16.63 37.56 16.9 37.36C17.75 36.75 32 26.25 32 16C32 7.163 24.837 0 16 0Z" fill="#F0445E"/>
                <circle cx="16" cy="15" r="5.5" fill="#FFFFFF"/>
              </svg>
            </div>
          </div>
        `;
        marker = new window.mapboxgl.Marker({
          element: el,
          anchor: 'bottom',
        }).setLngLat([desc.position.lng, desc.position.lat]);
      } else {
        marker = new window.mapboxgl.Marker({
          color: desc.iconColor || '#38bdf8',
        }).setLngLat([desc.position.lng, desc.position.lat]);
      }

      if (desc.infoHtml) {
        const popup = new window.mapboxgl.Popup({ offset: 25 }).setHTML(desc.infoHtml);
        marker.setPopup(popup);
      }

      if (desc.onClick) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          desc.onClick?.();
        });
      }

      marker.addTo(this.map);
      this.markersMap.set(desc.id, {
        marker,
        element: el,
        descriptor: { ...desc },
      });
    });
  }

  public setRoute(route: MapRouteDescriptor | null): void {
    this.currentRoute = route;
    if (!this.map || !this.isMapLoaded) return;
    this.applyRouteLayer(route);
  }

  private applyRouteLayer(route: MapRouteDescriptor | null): void {
    if (!this.map) return;

    const coordinates = route?.polyline?.map((p) => [p.lng, p.lat]) || [];
    const geojson: any = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates,
      },
    };

    const existingSource = this.map.getSource(ROUTE_SOURCE_ID);
    if (existingSource) {
      (existingSource as any).setData(geojson);
    } else if (coordinates.length > 0) {
      this.map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });
    }

    // Always ensure casing and primary layers are present whenever coordinates exist
    if (coordinates.length > 0 && this.map.getSource(ROUTE_SOURCE_ID)) {
      if (!this.map.getLayer(`${ROUTE_LAYER_ID}-glow`)) {
        // 1. Secondary Glow / Route Casing Layer (#087BFF)
        this.map.addLayer({
          id: `${ROUTE_LAYER_ID}-glow`,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#087BFF',
            'line-width': 8,
            'line-opacity': 0.38,
          },
        });
      }

      if (!this.map.getLayer(ROUTE_LAYER_ID)) {
        // 2. Primary Route Polyline Layer (#00DDF5)
        this.map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': route?.strokeColor || '#00DDF5',
            'line-width': route?.strokeWidth || 4.5,
            'line-opacity': 1.0,
          },
        });
      }
    }
  }

  public setMapType(type: 'roadmap' | 'satellite'): void {
    if (!this.map || this.currentMapType === type) return;

    this.currentMapType = type;
    const styleUrl = type === 'satellite' ? MAPBOX_SATELLITE_STYLE : MAPBOX_DARK_STYLE;

    this.map.setStyle(styleUrl);
    // Re-apply route layer and dark theme after style reload
    this.map.once('style.load', () => {
      if (this.currentMapType === 'roadmap' && this.map) {
        this.applyDarkMidnightTheme(this.map);
      }
      if (this.currentRoute) {
        this.applyRouteLayer(this.currentRoute);
      }
    });
  }

  public onMapClick(listener: (pos: { lat: number; lng: number }) => void): () => void {
    this.clickListeners.add(listener);
    return () => {
      this.clickListeners.delete(listener);
    };
  }

  public fitBounds(bounds: MapBounds, padding: number = 40): void {
    if (!this.map) return;
    this.map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding }
    );
  }

  public fitCoordinates(coords: { lat: number; lng: number }[], padding: number = 40): void {
    if (!this.map || coords.length === 0 || !window.mapboxgl) return;

    if (!this.isMapLoaded) {
      this.pendingFitCoords = { coords, padding };
      return;
    }

    try {
      this.map.resize();
      const bounds = new window.mapboxgl.LngLatBounds();
      let validCount = 0;
      coords.forEach((c) => {
        if (typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)) {
          bounds.extend([c.lng, c.lat]);
          validCount++;
        }
      });

      if (validCount > 0) {
        this.map.fitBounds(bounds, { padding, maxZoom: 15, duration: 750 });
      }
    } catch (err) {
      console.warn('Mapbox fitCoordinates error:', err);
    }
  }

  public zoomIn(): void {
    if (this.map) {
      this.map.zoomIn({ duration: 300 });
    }
  }

  public zoomOut(): void {
    if (this.map) {
      this.map.zoomOut({ duration: 300 });
    }
  }

  public centerOn(pos: { lat: number; lng: number }): void {
    if (this.map) {
      const currentZoom = this.map.getZoom();
      this.map.flyTo({
        center: [pos.lng, pos.lat],
        zoom: Math.max(14, currentZoom),
        duration: 900,
        essential: true,
      });
    }
  }

  public resize(): void {
    if (this.map) {
      this.map.resize();
    }
  }

  public destroy(): void {
    for (const entry of this.markersMap.values()) {
      if (entry.animFrameId) cancelAnimationFrame(entry.animFrameId);
      entry.marker.remove();
    }
    this.markersMap.clear();
    if (this.map) {
      try {
        if (this.map.getLayer(`${ROUTE_LAYER_ID}-glow`)) this.map.removeLayer(`${ROUTE_LAYER_ID}-glow`);
        if (this.map.getLayer(ROUTE_LAYER_ID)) this.map.removeLayer(ROUTE_LAYER_ID);
        if (this.map.getSource(ROUTE_SOURCE_ID)) this.map.removeSource(ROUTE_SOURCE_ID);
        this.map.remove();
      } catch {
        // ignore cleanup error
      }
      this.map = null;
    }
    this.isMapLoaded = false;
    this.clickListeners.clear();
    this.container = null;
  }
}
