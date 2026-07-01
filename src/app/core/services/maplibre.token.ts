import { InjectionToken } from '@angular/core';
import maplibregl, { Marker } from 'maplibre-gl';

export type MapLibreFactory = (options: maplibregl.MapOptions) => maplibregl.Map;
export type MapLibreMarkerFactory = (options: maplibregl.MarkerOptions) => Marker;

export const MAPLIBRE_FACTORY_TOKEN = new InjectionToken<MapLibreFactory>('MAPLIBRE_FACTORY_TOKEN', {
  providedIn: 'root',
  factory: () => (options: maplibregl.MapOptions) => new maplibregl.Map(options)
});

export const MAPLIBRE_MARKER_FACTORY_TOKEN = new InjectionToken<MapLibreMarkerFactory>('MAPLIBRE_MARKER_FACTORY_TOKEN', {
  providedIn: 'root',
  factory: () => (options: maplibregl.MarkerOptions) => new maplibregl.Marker(options)
});
