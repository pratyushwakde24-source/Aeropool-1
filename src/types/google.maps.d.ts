/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace google {
  namespace maps {
    export type MapTypeStyle = any;
    export type MapsEventListener = any;

    export class Map {
      constructor(mapDiv: HTMLElement, opts?: any);
      setCenter(latLng: any): void;
      getCenter(): LatLng | undefined;
      panTo(latLng: any): void;
      setZoom(zoom: number): void;
      getZoom(): number | undefined;
      setMapTypeId(type: string): void;
      fitBounds(bounds: any, padding?: any): void;
      addListener(eventName: string, handler: Function): any;
    }

    export class Marker {
      constructor(opts?: any);
      setMap(map: any): void;
      addListener(eventName: string, handler: Function): any;
      getPosition(): LatLng | undefined;
      setPosition(latLng: any): void;
      setIcon(icon: any): void;
      getTitle(): string | undefined;
      setTitle(title: string): void;
    }

    export class InfoWindow {
      constructor(opts?: any);
      open(map: any, anchor?: any): void;
      close(): void;
    }

    export class Polyline {
      constructor(opts?: any);
      setMap(map: any): void;
    }

    export class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    export class LatLngBounds {
      constructor(sw?: any, ne?: any);
      extend(point: any): LatLngBounds;
    }

    export class Circle {
      constructor(opts?: any);
    }

    export class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
    }

    export enum SymbolPath {
      CIRCLE = 0,
      FORWARD_CLOSED_ARROW = 1,
      FORWARD_OPEN_ARROW = 2,
      BACKWARD_CLOSED_ARROW = 3,
      BACKWARD_OPEN_ARROW = 4,
    }

    export enum TravelMode {
      DRIVING = 'DRIVING',
      BICYCLING = 'BICYCLING',
      TRANSIT = 'TRANSIT',
      WALKING = 'WALKING',
    }

    export enum UnitSystem {
      METRIC = 0,
      IMPERIAL = 1,
    }

    export enum DirectionsStatus {
      OK = 'OK',
      NOT_FOUND = 'NOT_FOUND',
      ZERO_RESULTS = 'ZERO_RESULTS',
      MAX_WAYPOINTS_EXCEEDED = 'MAX_WAYPOINTS_EXCEEDED',
      INVALID_REQUEST = 'INVALID_REQUEST',
      OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
      REQUEST_DENIED = 'REQUEST_DENIED',
      UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    }

    export interface DirectionsResult {
      routes: Array<{
        summary?: string;
        overview_path: Array<{ lat(): number; lng(): number }>;
        legs: Array<{
          distance?: { value: number; text: string };
          duration?: { value: number; text: string };
        }>;
      }>;
    }

    export class DirectionsService {
      route(request: any, callback: (result: DirectionsResult, status: DirectionsStatus) => void): void;
    }

    export interface MapMouseEvent {
      latLng?: {
        lat(): number;
        lng(): number;
      };
    }

    export namespace event {
      export function addListenerOnce(instance: any, eventName: string, handler: Function): any;
      export function removeListener(listener: any): void;
      export function trigger(instance: any, eventName: string, ...args: any[]): void;
    }

    export namespace places {
      export enum PlacesServiceStatus {
        OK = 'OK',
        ZERO_RESULTS = 'ZERO_RESULTS',
        OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
        REQUEST_DENIED = 'REQUEST_DENIED',
        INVALID_REQUEST = 'INVALID_REQUEST',
        UNKNOWN_ERROR = 'UNKNOWN_ERROR',
      }

      export interface AutocompletePrediction {
        description: string;
        place_id: string;
      }

      export class AutocompleteService {
        getPlacePredictions(
          request: any,
          callback: (results: AutocompletePrediction[], status: PlacesServiceStatus) => void
        ): void;
      }
    }
  }
}

interface Window {
  google?: typeof google;
}
