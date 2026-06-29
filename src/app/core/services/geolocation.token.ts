import { InjectionToken } from '@angular/core';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { Geolocation } from '@capacitor/geolocation';

export const GEOLOCATION_TOKEN = new InjectionToken<GeolocationPlugin>('Capacitor Geolocation', {
  providedIn: 'root',
  factory: () => Geolocation
});
