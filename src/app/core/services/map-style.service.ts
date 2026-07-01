import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

interface LocalMapConfig {
  mapStyleUrl?: string;
  mapTilerKey?: string;
}

@Injectable({ providedIn: 'root' })
export class MapStyleService {
  private readonly fallbackStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
  private cachedStyleUrl: string | null = null;

  async getStyleUrl(): Promise<string> {
    if (this.cachedStyleUrl) {
      return this.cachedStyleUrl;
    }

    const configured = this.styleFromConfig(environment);
    if (configured) {
      this.cachedStyleUrl = configured;
      return configured;
    }

    const localConfig = await this.loadLocalConfig();
    const localStyle = localConfig ? this.styleFromConfig(localConfig) : null;
    this.cachedStyleUrl = localStyle || this.fallbackStyleUrl;
    return this.cachedStyleUrl;
  }

  private styleFromConfig(config: LocalMapConfig): string | null {
    if (config.mapStyleUrl?.trim()) {
      return config.mapStyleUrl.trim();
    }

    const key = config.mapTilerKey?.trim();
    if (key) {
      return `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(key)}`;
    }

    return null;
  }

  private async loadLocalConfig(): Promise<LocalMapConfig | null> {
    try {
      const response = await fetch('assets/local/map.config.json', { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    }
  }
}
