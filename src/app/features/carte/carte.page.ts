import { Component, OnInit, OnDestroy, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonModal,
  IonFab,
  IonFabButton,
  ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { locate, refresh, alertCircle, bus, megaphone } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { Bus } from '../../core/models/models';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { SignalementModalComponent } from '../signalement/signalement-modal.component';

@Component({
  selector: 'app-carte',
  templateUrl: './carte.page.html',
  styleUrls: ['./carte.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    IonModal,
    IonFab,
    IonFabButton
  ]
})
export class CartePage implements OnInit, OnDestroy {
  // Map and markers
  private map: L.Map | null = null;
  private userMarker: L.Marker | null = null;
  private busMarkers = new Map<string, L.Marker>();

  // State signals
  activeBuses = this.storeService.activeBuses;
  userLocation = signal<{ lat: number; lon: number } | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor(
    private apiService: ApiService,
    private storeService: StoreService,
    private modalCtrl: ModalController,
    @Inject(GEOLOCATION_TOKEN) private geolocation: GeolocationPlugin
  ) {
    addIcons({ locate, refresh, alertCircle, bus, megaphone });
  }

  ngOnInit() {
    // No-op
  }

  ionViewDidEnter() {
    this.initMap();
    this.fetchUserLocation();
    this.getBuses();
  }

  ionViewDidLeave() {
    this.destroyMap();
  }

  ngOnDestroy() {
    this.destroyMap();
  }

  async openSignalement() {
    const modal = await this.modalCtrl.create({
      component: SignalementModalComponent
    });
    await modal.present();
  }

  /**
   * Initializes the Leaflet map container
   */
  private initMap() {
    if (this.map) return;

    // Default center on Dakar center: Latitude 14.7167, Longitude -17.4677, Zoom 13
    this.map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([14.7167, -17.4677], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(this.map);

    // Ensure map layout renders correctly
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 200);
  }

  /**
   * Destroys the map instance and clears all markers
   */
  private destroyMap() {
    this.clearBusMarkers();
    if (this.userMarker && this.map) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  /**
   * Fetches user location using Geolocation (foreground only)
   */
  private async fetchUserLocation() {
    try {
      const coordinates = await this.geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000
      });

      const lat = coordinates.coords.latitude;
      const lon = coordinates.coords.longitude;
      
      // Store user location
      this.userLocation.set({ lat, lon });

      // Draw user location marker
      if (this.map) {
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div class="blue-dot"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        if (this.userMarker) {
          this.userMarker.setLatLng([lat, lon]);
        } else {
          this.userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(this.map);
        }
      }
    } catch (err) {
      console.warn('Failed to retrieve user GPS coordinates:', err);
    }
  }

  /**
   * Fetches active buses from the API
   */
  async getBuses() {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const res = await firstValueFrom(this.apiService.getBuses());
      
      // Explicitly handle database error: { buses: [], error: "db_error" }
      if (res && res.error) {
        this.error.set(res.error);
        this.storeService.activeBuses.set([]);
        this.clearBusMarkers();
      } else if (res && Array.isArray(res.buses)) {
        this.storeService.activeBuses.set(res.buses);
        this.updateBusMarkers(res.buses);
      } else {
        throw new Error('Format de réponse invalide');
      }
    } catch (err: any) {
      console.error('Failed to fetch buses:', err);
      this.error.set('Impossible de charger les positions des bus.');
      this.storeService.activeBuses.set([]);
      this.clearBusMarkers();
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Updates map markers incrementally without recreating the map
   */
  private updateBusMarkers(buses: Bus[]) {
    if (!this.map) return;

    // Use a unique compound key since Bus does not have an 'id' property
    const getBusKey = (b: Bus) => b.ligne;
    const newBusKeys = new Set(buses.map(getBusKey));

    // Remove stale bus markers
    for (const [key, marker] of this.busMarkers.entries()) {
      if (!newBusKeys.has(key)) {
        marker.remove();
        this.busMarkers.delete(key);
      }
    }

    // Add or update markers
    for (const bus of buses) {
      const key = getBusKey(bus);
      const markerCoords: L.LatLngExpression = [bus.lat, bus.lon];
      const isStale = this.isBusStale(bus.minutes_depuis_signalement);

      const htmlIcon = `
        <div class="bus-marker-icon-wrapper ${isStale ? 'stale-bus' : ''}">
          🚌
        </div>
      `;

      const busIcon = L.divIcon({
        className: 'bus-map-marker',
        html: htmlIcon,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const popupContent = `
        <div style="font-family: inherit; font-size: 13px; color: #ffffff; padding: 4px;">
          <b style="color: #ff6b35; font-size: 14px;">Ligne ${bus.ligne}</b><br/>
          <b>Direction:</b> ${bus.direction || 'Inconnue'}<br/>
          <b>Dernier arrêt:</b> ${bus.arret_signale || 'Inconnu'}<br/>
          <b>Source:</b> ${this.getSourceLabel(bus.tracking_mode)}<br/>
          <b>Activité:</b> ${this.getFreshnessText(bus.minutes_depuis_signalement)}
        </div>
      `;

      const existingMarker = this.busMarkers.get(key);
      if (existingMarker) {
        // Update position and popup
        existingMarker.setLatLng(markerCoords);
        existingMarker.setIcon(busIcon);
        existingMarker.setPopupContent(popupContent);
      } else {
        // Create new marker
        const marker = L.marker(markerCoords, { icon: busIcon })
          .addTo(this.map)
          .bindPopup(popupContent);
        
        // Add click event to marker
        marker.on('click', () => {
          this.selectBus(bus);
        });

        this.busMarkers.set(key, marker);
      }
    }
  }

  private clearBusMarkers() {
    for (const marker of this.busMarkers.values()) {
      marker.remove();
    }
    this.busMarkers.clear();
  }

  centerOnUser() {
    const coords = this.userLocation();
    if (this.map && coords) {
      this.map.setView([coords.lat, coords.lon], 15, { animate: false });
    }
  }

  selectBus(bus: Bus) {
    if (this.map) {
      this.map.setView([bus.lat, bus.lon], 16, { animate: false });
    }
  }

  /**
   * Helper: Check if a bus has not been seen for over 15 minutes
   */
  private isBusStale(minutesDepuisSignalement: number): boolean {
    return minutesDepuisSignalement > 15;
  }

  getSourceLabel(mode?: string): string {
    if (mode === 'live_gps') {
      return 'GPS Live';
    }
    return 'Signalement communautaire';
  }

  getFreshnessText(minutesDepuisSignalement: number): string {
    if (minutesDepuisSignalement <= 1) {
      return "Vu à l'instant";
    }
    if (minutesDepuisSignalement < 60) {
      return `Vu il y a ${minutesDepuisSignalement} min`;
    }
    const hours = Math.floor(minutesDepuisSignalement / 60);
    return `Vu il y a ${hours}h`;
  }

  getFreshnessClass(minutesDepuisSignalement: number): string {
    if (minutesDepuisSignalement <= 5) {
      return 'fresh-green';
    }
    if (minutesDepuisSignalement <= 15) {
      return 'fresh-orange';
    }
    return 'fresh-red';
  }
}
