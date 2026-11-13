/**
 * AeroPool — Map Provider Factory
 * 
 * Factory responsible for instantiating the concrete IMapProvider implementation
 * (GoogleMapsProvider or MapboxProvider) matching the requested or active provider type.
 */

import { IMapProvider, MapProviderType } from './MapProvider';
import { GoogleMapsProvider } from './GoogleMapsProvider';
import { MapboxProvider } from './MapboxProvider';
import { getActiveMapProvider } from './MapProviderConfig';

/**
 * Creates a new provider instance for the specified provider type
 */
export function createMapProvider(type: MapProviderType): IMapProvider {
  switch (type) {
    case 'mapbox':
      return new MapboxProvider();
    case 'google':
    default:
      return new GoogleMapsProvider();
  }
}

/**
 * Creates a new provider instance for the currently active global provider
 */
export function createActiveMapProvider(): IMapProvider {
  return createMapProvider(getActiveMapProvider());
}

/**
 * Returns human-readable name for the provider
 */
export function getProviderDisplayName(type: MapProviderType): string {
  switch (type) {
    case 'google':
      return 'Google Maps';
    case 'mapbox':
      return 'Mapbox GL';
    default:
      return type;
  }
}
