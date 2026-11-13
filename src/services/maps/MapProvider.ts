/**
 * AeroPool — Common Map Provider Interface Contract
 * 
 * Provides an identical application-level abstraction across Google Maps and Mapbox.
 * Eliminates provider-specific SDK coupling from application components.
 */

export type MapProviderType = 'google' | 'mapbox';

export interface MapCameraState {
  center: { lat: number; lng: number };
  zoom: number;
  heading?: number;
  pitch?: number;
}

export type MarkerType = 'PICKUP' | 'DESTINATION' | 'VEHICLE' | 'GENERIC';

export interface MapMarkerDescriptor {
  id: string;
  position: { lat: number; lng: number };
  title?: string;
  type: MarkerType;
  heading?: number; // Direction in degrees (0 = North, 90 = East)
  vehiclePlate?: string;
  vehicleModel?: string;
  iconColor?: string;
  infoHtml?: string;
  isStale?: boolean;
  onClick?: () => void;
}

export interface MapRouteDescriptor {
  polyline: { lat: number; lng: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  isEstimatedFallback?: boolean;
  summary?: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface IMapProvider {
  /**
   * The identifier of this provider ('google' | 'mapbox')
   */
  readonly providerType: MapProviderType;

  /**
   * Returns true if the map instance is mounted and ready for operations
   */
  isReady(): boolean;

  /**
   * Mounts and initializes the map canvas within the specified DOM element
   */
  initialize(container: HTMLElement, initialCamera: MapCameraState): Promise<void>;

  /**
   * Updates camera position, zoom, and orientation
   */
  setCamera(camera: MapCameraState, animate?: boolean): void;

  /**
   * Returns current camera center and zoom
   */
  getCamera(): MapCameraState;

  /**
   * Replaces all active map markers with the provided marker descriptors
   */
  setMarkers(markers: MapMarkerDescriptor[]): void;

  /**
   * Draws or clears the route polyline
   */
  setRoute(route: MapRouteDescriptor | null): void;

  /**
   * Toggles between roadmap (dark themed) and satellite view
   */
  setMapType(type: 'roadmap' | 'satellite'): void;

  /**
   * Registers a listener for map clicks (e.g. pin-drop destination selection)
   * Returns an unregister function
   */
  onMapClick(listener: (pos: { lat: number; lng: number }) => void): () => void;

  /**
   * Adjusts viewport to encompass the given geographical bounds
   */
  fitBounds(bounds: MapBounds, padding?: number): void;

  /**
   * Adjusts viewport to fit a list of coordinates
   */
  fitCoordinates(coords: { lat: number; lng: number }[], padding?: number): void;

  /**
   * Zooms in by one increment
   */
  zoomIn(): void;

  /**
   * Zooms out by one increment
   */
  zoomOut(): void;

  /**
   * Centers the viewport smoothly on the given coordinates
   */
  centerOn(pos: { lat: number; lng: number }): void;

  /**
   * Triggers map canvas re-measurement (e.g. after container resize)
   */
  resize(): void;

  /**
   * Completely tears down markers, layers, event listeners, and DOM elements
   */
  destroy(): void;
}
