import { InjectionToken } from '@angular/core';
import { Preferences, PreferencesPlugin } from '@capacitor/preferences';

export const PREFERENCES_TOKEN = new InjectionToken<PreferencesPlugin>('PreferencesToken', {
  providedIn: 'root',
  factory: () => Preferences
});
