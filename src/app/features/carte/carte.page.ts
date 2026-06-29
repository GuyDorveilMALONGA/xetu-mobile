import { Component, OnInit, OnDestroy, signal, computed, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { Bus, LeaderboardResponse } from '../../core/models/models';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { ModalController } from '@ionic/angular/standalone';
import { SignalementModalComponent } from '../signalement/signalement-modal.component';

const POLL_INTERVAL_MS = 30000;

@Component({
  selector: 'app-carte',
  templateUrl: './carte.page.html',
  styleUrls: ['./carte.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class CartePage implements OnInit, OnDestroy {
  // Map and markers
  private map: L.Map | null = null;
  private userMarker: L.Marker | null = null;
  private busMarkers = new Map<string, L.Marker>();
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private welcomeShown = false;

  // State signals
  activeBuses = this.storeService.activeBuses;
  leaderboard = this.storeService.leaderboard;
  userLocation = signal<{ lat: number; lon: number } | null>(null);
  isLoading = signal<boolean>(false);
  isLeaderboardLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  activeTab = signal<'buses' | 'top'>('buses');
  activeFilter = signal<string | null>(null);
  isPanelExpanded = signal<boolean>(false);
  selectedBusKey = signal<string | null>(null);
  welcomeMessage = signal<string | null>(null);

  filterLines = computed(() => {
    const lines = [...new Set(this.activeBuses().map(b => b.ligne))];
    return lines.sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  });

  filteredBuses = computed(() => {
    const filter = this.activeFilter();
    const buses = this.activeBuses();
    return filter ? buses.filter(b => b.ligne === filter) : buses;
  });

  constructor(
    private apiService: ApiService,
    private storeService: StoreService,
    private sessionService: SessionService,
    private modalCtrl: ModalController,
    @Inject(GEOLOCATION_TOKEN) private geolocation: GeolocationPlugin
  ) {}

  ngOnInit() {
    // No-op
  }

  ionViewDidEnter() {
    this.initMap();
    this.fetchUserLocation();
    this.getBuses();
    this.startPolling();
  }

  ionViewDidLeave() {
    this.stopPolling();
    this.destroyMap();
  }

  ngOnDestroy() {
    this.stopPolling();
    this.destroyMap();
  }

  async openSignalement() {
    const modal = await this.modalCtrl.create({
      component: SignalementModalComponent
    });
    await modal.present();
  }

  private startPolling() {
    this.stopPolling();
    this.pollHandle = setInterval(() => this.getBuses(), POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  togglePanel() {
    this.isPanelExpanded.set(!this.isPanelExpanded());
  }

  setTab(tab: 'buses' | 'top') {
    this.activeTab.set(tab);
    if (tab === 'top') {
      this.fetchLeaderboard();
    }
  }

  setFilter(line: string | null) {
    this.activeFilter.set(this.activeFilter() === line ? null : line);
    this.filterMarkers();
  }

  /**
   * Initializes the Leaflet map container
   */
  private initMap() {
    if (this.map) return;

    // Default center on Dakar center: Latitude 14.7167, Longitude -17.4677, Zoom 13
    this.map = L.map('map', {
      zoomControl: false,
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

      this.maybeShowWelcome(lat, lon);
    } catch (err) {
      console.warn('Failed to retrieve user GPS coordinates:', err);
    }
  }

  /**
   * Affiche le message "Position détectée" une seule fois par session de page.
   * Réutilise la position déjà capturée — aucune nouvelle requête GPS.
   * Si /api/nearby échoue, on n'affiche rien (ne bloque jamais la carte).
   */
  private async maybeShowWelcome(lat: number, lon: number) {
    if (this.welcomeShown) return;
    this.welcomeShown = true;

    try {
      const sessionId = this.sessionService.getSessionId() || undefined;
      const nearby = await firstValueFrom(this.apiService.getNearby(lat, lon, sessionId));
      const first = nearby.stops?.[0];
      const allLines: string[] = ([] as string[]).concat(...(nearby.stops || []).map(s => s.lignes || []));
      const lines = [...new Set(allLines)].sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });

      if (first?.nom && lines.length) {
        this.welcomeMessage.set(`Tu es à proximité de ${first.nom}. Les lignes ${lines.join(', ')} y passent.`);
      } else if (first?.nom) {
        this.welcomeMessage.set(`Tu es à proximité de ${first.nom}. Aucune ligne active n'est renseignée ici pour le moment.`);
      } else {
        this.welcomeMessage.set(`Position détectée. Aucun arrêt proche n'est renseigné pour le moment.`);
      }
    } catch (err) {
      console.warn('Contexte nearby indisponible:', err);
    }
  }

  dismissWelcome() {
    this.welcomeMessage.set(null);
  }

  dismissWelcomeAndSignal() {
    this.welcomeMessage.set(null);
    this.openSignalement();
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
        // BUG-1 : reset le filtre si la ligne filtrée n'existe plus parmi les bus actifs
        const filter = this.activeFilter();
        if (filter && !res.buses.some(b => b.ligne === filter)) {
          this.activeFilter.set(null);
        }
        this.updateBusMarkers(res.buses);
        this.filterMarkers();
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

  async fetchLeaderboard() {
    this.isLeaderboardLoading.set(true);
    try {
      const res = await firstValueFrom(this.apiService.getLeaderboard());
      this.storeService.leaderboard.set(res.leaderboard || []);
    } catch (err) {
      console.warn('Failed to fetch leaderboard:', err);
    } finally {
      this.isLeaderboardLoading.set(false);
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
      const isSelected = this.selectedBusKey() === key;
      const color = this.freshnessColor(bus.minutes_depuis_signalement);
      const size = isSelected ? 40 : 34;

      const existingMarker = this.busMarkers.get(key);
      if (existingMarker) {
        existingMarker.setLatLng(markerCoords);
        existingMarker.setIcon(this.makeBusIcon(bus.ligne, color, size, isSelected));
        existingMarker.setZIndexOffset(isSelected ? 1000 : 0);
      } else {
        const marker = L.marker(markerCoords, {
          icon: this.makeBusIcon(bus.ligne, color, size, isSelected),
          zIndexOffset: isSelected ? 1000 : 0
        }).addTo(this.map);

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

  /**
   * Affiche/masque les markers existants selon la ligne filtrée (n'affecte pas la liste).
   */
  private filterMarkers() {
    if (!this.map) return;
    const visible = new Set(this.filteredBuses().map(b => b.ligne));
    for (const [key, marker] of this.busMarkers.entries()) {
      const shouldShow = visible.has(key);
      const onMap = this.map.hasLayer(marker);
      if (shouldShow && !onMap) marker.addTo(this.map);
      if (!shouldShow && onMap) this.map.removeLayer(marker);
    }
  }

  private makeBusIcon(ligne: string, color: string, size: number, isSelected: boolean): L.DivIcon {
    const safeLine = this.escapeHtml(ligne);
    const pulse = isSelected
      ? ''
      : `<div class="xetu-pulse" style="width:${size}px;height:${size}px;background:${color};"></div>`;
    return L.divIcon({
      html: `<div style="position:relative;width:${size}px;height:${size}px;">
        ${pulse}
        <div style="position:absolute;top:0;left:0;width:${size}px;height:${size}px;
          border-radius:50%;background:${color};
          border:3px solid rgba(255,255,255,${isSelected ? '0.95' : '0.7'});
          box-shadow:0 2px 12px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:${size <= 34 ? 11 : 13}px;color:#0a0f1e;">
          ${safeLine}
        </div>
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      className: 'xetu-bus-marker'
    });
  }

  centerOnUser() {
    const coords = this.userLocation();
    if (this.map && coords) {
      this.map.setView([coords.lat, coords.lon], 15, { animate: false });
    }
  }

  async handleLocate() {
    if (this.userLocation()) {
      this.centerOnUser();
    } else {
      await this.fetchUserLocation();
      this.centerOnUser();
    }
  }

  selectBus(bus: Bus) {
    const key = bus.ligne;
    this.selectedBusKey.set(this.selectedBusKey() === key ? null : key);
    this.updateBusMarkers(this.activeBuses());
    if (this.map) {
      this.map.setView([bus.lat, bus.lon], 16, { animate: false });
    }
  }

  freshnessColor(minutesDepuisSignalement: number): string {
    if (minutesDepuisSignalement <= 5) return '#00D67F';
    if (minutesDepuisSignalement <= 15) return '#FFD166';
    return '#FF4757';
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
    if (minutesDepuisSignalement <= 5) return 'age-fresh';
    if (minutesDepuisSignalement <= 15) return 'age-ok';
    return 'age-old';
  }

  hashColor(name: string): string {
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return `hsl(${sum % 360}, 60%, 45%)`;
  }

  initials(name: string): string {
    return (name || '').trim().split(' ')[0].slice(0, 2).toUpperCase();
  }

  badgeLabel(badge: LeaderboardResponse['leaderboard'][number]['badge'] | string | undefined): string {
    if (!badge) return 'Contributeur';
    if (typeof badge === 'string') return badge;
    return badge.label || 'Contributeur';
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char] || char);
  }
}
