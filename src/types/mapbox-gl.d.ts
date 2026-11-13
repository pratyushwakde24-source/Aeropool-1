/**
 * AeroPool — Ambient Type Declarations for Mapbox GL JS SDK
 * Supports dynamic loader and window.mapboxgl global instance.
 */

declare namespace mapboxgl {
  export let accessToken: string;

  export interface LngLatLike {
    lng: number;
    lat: number;
  }

  export class LngLatBounds {
    constructor(sw?: [number, number], ne?: [number, number]);
    extend(lnglat: [number, number] | LngLatLike): this;
    getSouthWest(): { lng: number; lat: number };
    getNorthEast(): { lng: number; lat: number };
  }

  export interface MapOptions {
    container: HTMLElement | string;
    style?: string | object;
    center?: [number, number] | LngLatLike;
    zoom?: number;
    bearing?: number;
    pitch?: number;
    interactive?: boolean;
    attributionControl?: boolean;
    preserveDrawingBuffer?: boolean;
  }

  export interface MarkerOptions {
    element?: HTMLElement;
    anchor?: string;
    offset?: [number, number];
    rotation?: number;
    rotationAlignment?: string;
    pitchAlignment?: string;
    color?: string;
    scale?: number;
    draggable?: boolean;
  }

  export class Popup {
    constructor(options?: { offset?: number | [number, number]; closeButton?: boolean; closeOnClick?: boolean });
    setHTML(html: string): this;
    setText(text: string): this;
    setLngLat(lnglat: [number, number] | LngLatLike): this;
    addTo(map: Map): this;
    remove(): this;
    isOpen(): boolean;
  }

  export class Marker {
    constructor(options?: MarkerOptions);
    setLngLat(lnglat: [number, number] | LngLatLike): this;
    getLngLat(): { lng: number; lat: number };
    setRotation(rotation: number): this;
    getRotation(): number;
    addTo(map: Map): this;
    remove(): this;
    setPopup(popup: Popup): this;
    getPopup(): Popup;
    togglePopup(): this;
    getElement(): HTMLElement;
  }

  export class NavigationControl {
    constructor(options?: { showCompass?: boolean; showZoom?: boolean; visualizePitch?: boolean });
  }

  export interface MapMouseEvent {
    lngLat: { lng: number; lat: number };
    point: { x: number; y: number };
    originalEvent: MouseEvent;
  }

  export class Map {
    constructor(options: MapOptions);
    on(type: 'load' | 'render' | 'error' | 'click' | 'zoom' | 'move' | 'style.load' | string, listener: (ev?: any) => void): this;
    once(type: string, listener: (ev?: any) => void): this;
    off(type: string, listener: (ev?: any) => void): this;
    remove(): void;
    getCenter(): { lng: number; lat: number };
    getZoom(): number;
    getBearing(): number;
    getPitch(): number;
    setCenter(center: [number, number] | LngLatLike): this;
    setZoom(zoom: number): this;
    zoomIn(options?: { duration?: number }): this;
    zoomOut(options?: { duration?: number }): this;
    setBearing(bearing: number): this;
    setPitch(pitch: number): this;
    flyTo(options: { center?: [number, number] | LngLatLike; zoom?: number; bearing?: number; pitch?: number; duration?: number; essential?: boolean }): this;
    easeTo(options: { center?: [number, number] | LngLatLike; zoom?: number; bearing?: number; pitch?: number; duration?: number }): this;
    fitBounds(bounds: [[number, number], [number, number]] | LngLatBounds, options?: { padding?: number | { top: number; bottom: number; left: number; right: number }; maxZoom?: number; duration?: number }): this;
    setStyle(style: string | object, options?: { diff?: boolean }): this;
    getStyle(): any;
    isStyleLoaded(): boolean;
    resize(): this;
    addControl(control: any, position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): this;
    removeControl(control: any): this;
    addSource(id: string, source: any): this;
    removeSource(id: string): this;
    getSource(id: string): any;
    addLayer(layer: any, beforeId?: string): this;
    removeLayer(id: string): this;
    getLayer(id: string): any;
    setLayoutProperty(layerId: string, name: string, value: any): this;
    setPaintProperty(layerId: string, name: string, value: any): this;
  }
}

interface Window {
  mapboxgl?: typeof mapboxgl;
}
