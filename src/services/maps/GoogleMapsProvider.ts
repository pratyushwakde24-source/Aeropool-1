/**
 * AeroPool — Google Maps Implementation of IMapProvider
 * 
 * Encapsulates the Google Maps JavaScript SDK lifecycle, markers, vehicle rotation,
 * and polyline layers within the unified map abstraction.
 */

import {
  IMapProvider,
  MapProviderType,
  MapCameraState,
  MapMarkerDescriptor,
  MapRouteDescriptor,
  MapBounds,
} from './MapProvider';
import { loadGoogleMapsScript } from '../googleMapsService';

// Signature AeroPool Midnight Navy styling tokens matching the reference design
const DARK_MIDNIGHT_GOOGLE_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0B1930' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A8B5CA' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1930' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#2A3F60' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1C2B44' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#131E30' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22385C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#07101F' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1F304B' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0B3322' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#16253C' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7E92B0' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0B1930' }] },
  { featureType: 'airport', elementType: 'geometry', stylers: [{ color: '#1F2F4A' }] },
];

// Car SVG geometry path for heading-oriented vehicle markers
const VEHICLE_CAR_SVG_PATH =
  'M17.402,0H5.6c-0.4,0-0.8,0.3-0.8,0.8l-1.3,7.5C3.2,8.6,3,9,3,9.5V20c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1v-1h11v1 c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1V9.5c0-0.5-0.2-0.9-0.5-1.2l-1.3-7.5C18.2,0.3,17.8,0,17.402,0z M6.8,2.5h9.4l0.8,5H6L6.8,2.5z';

export class GoogleMapsProvider implements IMapProvider {
  public readonly providerType: MapProviderType = 'google';

  private map: google.maps.Map | null = null;
  private container: HTMLElement | null = null;
  private markersMap: Map<string, {
    marker: google.maps.Marker;
    descriptor: MapMarkerDescriptor;
    animFrameId?: number;
  }> = new Map();
  private polyline: google.maps.Polyline | null = null;
  private clickListeners: Set<(pos: { lat: number; lng: number }) => void> = new Set();
  private gClickListener: google.maps.MapsEventListener | null = null;
  private idleListener: google.maps.MapsEventListener | null = null;
  private currentCamera: MapCameraState = {
    center: { lat: 19.0902, lng: 72.8628 }, // CSMIA Default
    zoom: 12,
  };

  public isReady(): boolean {
    return Boolean(this.map);
  }

  public async initialize(container: HTMLElement, initialCamera: MapCameraState): Promise<void> {
    this.container = container;
    this.currentCamera = { ...initialCamera };

    await loadGoogleMapsScript();

    if (!window.google?.maps?.Map) {
      throw new Error('Google Maps SDK loaded but google.maps.Map is undefined');
    }

    this.map = new window.google.maps.Map(container, {
      center: initialCamera.center,
      zoom: initialCamera.zoom,
      mapTypeId: 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
      styles: DARK_MIDNIGHT_GOOGLE_STYLES,
    });

    // Wire click listener
    this.gClickListener = this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const pos = {
          lat: Number(e.latLng.lat().toFixed(5)),
          lng: Number(e.latLng.lng().toFixed(5)),
        };
        this.clickListeners.forEach((listener) => listener(pos));
      }
    });

    // Track camera movements
    this.idleListener = this.map.addListener('idle', () => {
      if (this.map) {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        if (center) {
          this.currentCamera = {
            center: { lat: center.lat(), lng: center.lng() },
            zoom: zoom || this.currentCamera.zoom,
          };
        }
      }
    });
  }

  public setCamera(camera: MapCameraState, animate: boolean = false): void {
    this.currentCamera = { ...camera };
    if (!this.map) return;

    if (animate) {
      this.map.panTo(camera.center);
      this.map.setZoom(camera.zoom);
    } else {
      this.map.setCenter(camera.center);
      this.map.setZoom(camera.zoom);
    }
  }

  public getCamera(): MapCameraState {
    if (this.map) {
      const center = this.map.getCenter();
      const zoom = this.map.getZoom();
      if (center) {
        return {
          center: { lat: center.lat(), lng: center.lng() },
          zoom: zoom || this.currentCamera.zoom,
        };
      }
    }
    return { ...this.currentCamera };
  }

  private animateGoogleMarker(
    entry: { marker: google.maps.Marker; descriptor: MapMarkerDescriptor; animFrameId?: number },
    newDesc: MapMarkerDescriptor
  ): void {
    if (entry.animFrameId) {
      cancelAnimationFrame(entry.animFrameId);
      entry.animFrameId = undefined;
    }

    const startPos = entry.marker.getPosition();
    if (!startPos) {
      entry.marker.setPosition(new window.google.maps.LatLng(newDesc.position.lat, newDesc.position.lng));
      return;
    }

    const startLat = startPos.lat();
    const startLng = startPos.lng();
    const targetLat = newDesc.position.lat;
    const targetLng = newDesc.position.lng;

    // Heading and Stale styling update
    const headingDeg = typeof newDesc.heading === 'number' ? newDesc.heading : 0;
    const isStale = Boolean(newDesc.isStale);
    entry.marker.setIcon({
      path: VEHICLE_CAR_SVG_PATH,
      rotation: headingDeg,
      scale: 1.15,
      fillColor: isStale ? '#94a3b8' : (newDesc.iconColor || '#0ea5e9'),
      fillOpacity: isStale ? 0.6 : 1,
      strokeWeight: 1.5,
      strokeColor: '#ffffff',
      anchor: new window.google.maps.Point(11, 11),
    });

    // If movement is very small (< 0.00001 deg), snap directly
    if (Math.abs(targetLat - startLat) < 0.00001 && Math.abs(targetLng - startLng) < 0.00001) {
      entry.marker.setPosition(new window.google.maps.LatLng(targetLat, targetLng));
      entry.descriptor = { ...newDesc };
      return;
    }

    const startTime = performance.now();
    const duration = 350; // smooth interpolation duration in ms

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;

      entry.marker.setPosition(new window.google.maps.LatLng(currentLat, currentLng));

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
    if (!this.map) return;

    const incomingIds = new Set(descriptors.map((d) => d.id));

    // 1. Differential Removal: Remove markers that are no longer in incoming descriptors (e.g. driver went offline)
    for (const [id, entry] of this.markersMap.entries()) {
      if (!incomingIds.has(id)) {
        if (entry.animFrameId) cancelAnimationFrame(entry.animFrameId);
        entry.marker.setMap(null);
        this.markersMap.delete(id);
      }
    }

    // 2. Differential Update or Creation
    descriptors.forEach((desc) => {
      if (!this.map) return;

      const existing = this.markersMap.get(desc.id);
      if (existing) {
        // Update existing marker in-place without rebuilding DOM
        if (desc.type === 'VEHICLE') {
          this.animateGoogleMarker(existing, desc);
        } else {
          existing.marker.setPosition(new window.google.maps.LatLng(desc.position.lat, desc.position.lng));
          existing.descriptor = { ...desc };
        }
        return;
      }

      // Instantiate new marker
      const position = new window.google.maps.LatLng(desc.position.lat, desc.position.lng);
      let marker: google.maps.Marker;

      if (desc.type === 'VEHICLE') {
        const headingDeg = typeof desc.heading === 'number' ? desc.heading : 0;
        const isStale = Boolean(desc.isStale);
        marker = new window.google.maps.Marker({
          position,
          map: this.map,
          title: desc.title || `Assigned Vehicle (${desc.vehiclePlate || 'AeroPool'})`,
          icon: {
            path: VEHICLE_CAR_SVG_PATH,
            rotation: headingDeg,
            scale: 1.15,
            fillColor: isStale ? '#94a3b8' : (desc.iconColor || '#0ea5e9'),
            fillOpacity: isStale ? 0.6 : 1,
            strokeWeight: 1.5,
            strokeColor: '#ffffff',
            anchor: new window.google.maps.Point(11, 11),
          },
        });
      } else if (desc.type === 'PICKUP') {
        marker = new window.google.maps.Marker({
          position,
          map: this.map,
          title: desc.title || 'CSMIA Pickup Hub',
          label: {
            text: '✈',
            color: '#ffffff',
            fontWeight: 'bold',
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: desc.iconColor || '#0284c7',
            fillOpacity: 1,
            scale: 13,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      } else if (desc.type === 'DESTINATION') {
        marker = new window.google.maps.Marker({
          position,
          map: this.map,
          title: desc.title || 'Drop-off Destination',
          label: {
            text: '⚑',
            color: '#ffffff',
            fontWeight: 'bold',
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: desc.iconColor || '#10b981',
            fillOpacity: 1,
            scale: 12,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      } else {
        // Generic marker
        marker = new window.google.maps.Marker({
          position,
          map: this.map,
          title: desc.title,
        });
      }

      // Attach InfoWindow if content is provided
      if (desc.infoHtml) {
        const infoWindow = new window.google.maps.InfoWindow({
          content: desc.infoHtml,
        });
        marker.addListener('click', () => {
          if (this.map) infoWindow.open(this.map, marker);
        });
      }

      if (desc.onClick) {
        marker.addListener('click', () => {
          desc.onClick?.();
        });
      }

      this.markersMap.set(desc.id, {
        marker,
        descriptor: { ...desc },
      });
    });
  }

  public setRoute(route: MapRouteDescriptor | null): void {
    if (!this.map) return;

    if (this.polyline) {
      this.polyline.setMap(null);
      this.polyline = null;
    }

    if (!route || route.polyline.length === 0) return;

    const path = route.polyline.map((p) => new window.google.maps.LatLng(p.lat, p.lng));

    this.polyline = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: route.strokeColor || '#00DDF5',
      strokeOpacity: 0.95,
      strokeWeight: route.strokeWidth || 4.5,
      map: this.map,
    });
  }

  public setMapType(type: 'roadmap' | 'satellite'): void {
    if (!this.map) return;
    this.map.setMapTypeId(type === 'satellite' ? 'satellite' : 'roadmap');
  }

  public onMapClick(listener: (pos: { lat: number; lng: number }) => void): () => void {
    this.clickListeners.add(listener);
    return () => {
      this.clickListeners.delete(listener);
    };
  }

  public fitBounds(bounds: MapBounds, padding: number = 40): void {
    if (!this.map) return;
    const gBounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(bounds.south, bounds.west),
      new window.google.maps.LatLng(bounds.north, bounds.east)
    );
    this.map.fitBounds(gBounds, padding);
  }

  public fitCoordinates(coords: { lat: number; lng: number }[], padding: number = 40): void {
    if (!this.map || coords.length === 0) return;
    const gBounds = new window.google.maps.LatLngBounds();
    coords.forEach((c) => gBounds.extend(new window.google.maps.LatLng(c.lat, c.lng)));
    this.map.fitBounds(gBounds, padding);
  }

  public zoomIn(): void {
    if (this.map) {
      const current = this.map.getZoom() || 12;
      this.map.setZoom(current + 1);
    }
  }

  public zoomOut(): void {
    if (this.map) {
      const current = this.map.getZoom() || 12;
      this.map.setZoom(current - 1);
    }
  }

  public centerOn(pos: { lat: number; lng: number }): void {
    if (this.map) {
      this.map.panTo(new window.google.maps.LatLng(pos.lat, pos.lng));
      const current = this.map.getZoom() || 12;
      if (current < 14) {
        this.map.setZoom(14);
      }
    }
  }

  public resize(): void {
    if (this.map && window.google?.maps?.event) {
      window.google.maps.event.trigger(this.map, 'resize');
    }
  }

  public destroy(): void {
    if (this.gClickListener) {
      window.google?.maps?.event?.removeListener(this.gClickListener);
      this.gClickListener = null;
    }
    if (this.idleListener) {
      window.google?.maps?.event?.removeListener(this.idleListener);
      this.idleListener = null;
    }
    for (const entry of this.markersMap.values()) {
      if (entry.animFrameId) cancelAnimationFrame(entry.animFrameId);
      entry.marker.setMap(null);
    }
    this.markersMap.clear();
    if (this.polyline) {
      this.polyline.setMap(null);
      this.polyline = null;
    }
    this.clickListeners.clear();
    this.map = null;
    this.container = null;
  }
}
