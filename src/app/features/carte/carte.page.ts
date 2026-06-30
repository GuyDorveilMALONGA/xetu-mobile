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
  panelHeight = signal<number>(180);
  isDragging = signal<boolean>(false);
  selectedBusKey = signal<string | null>(null);

  private startY = 0;
  private startHeight = 0;
  private activePointerId: number | null = null;
  private activeDragElement: HTMLElement | null = null;
  private hasDragged = false;
  private suppressClick = false;
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
    this.sessionService.ensureSession();
    // Set default height based on viewport
    const snapBas = Math.max(180, Math.round(window.innerHeight * 0.28));
    this.panelHeight.set(snapBas);
  }

  ionViewDidEnter() {
    this.initMap();
    this.fetchUserLocation();
    this.getBuses();
    this.startPolling();
  }

  ionViewDidLeave() {
    this.stopPolling();
  }

  ngOnDestroy() {
    this.stopPolling();
    this.destroyMap();
    // Ensure drag listeners are removed if destroyed during drag
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onDragEnd);
  }

  async openSignalement() {
    const modal = await this.modalCtrl.create({
      component: SignalementModalComponent
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data && data.success && data.recorded) {
      this.getBuses(); // Immediate refresh if a new report was recorded
    }
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

  zoomIn() {
    if (this.map) {
      this.map.zoomIn(1, { animate: false });
    }
  }

  zoomOut() {
    if (this.map) {
      this.map.zoomOut(1, { animate: false });
    }
  }

  togglePanel() {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }

    const snapBas = Math.max(180, Math.round(window.innerHeight * 0.28));
    const snapMilieu = Math.round(window.innerHeight * 0.50);
    const snapHaut = Math.round(window.innerHeight * 0.85);
    const h = this.panelHeight();

    if (h < snapMilieu - 30) {
      this.panelHeight.set(snapMilieu);
    } else if (h < snapHaut - 30) {
      this.panelHeight.set(snapHaut);
    } else {
      this.panelHeight.set(snapBas);
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 320);
  }

  onDragStart(event: PointerEvent) {
    const target = event.target as HTMLElement;
    // Do not drag if clicking on buttons/inputs inside the header (like tabs)
    if (target.closest('button') && !target.classList.contains('panel-grabber')) {
      return;
    }

    event.preventDefault();
    this.isDragging.set(true);
    this.hasDragged = false;
    this.startY = event.clientY;
    this.startHeight = this.panelHeight();

    document.addEventListener('pointermove', this.onDragMove);
    document.addEventListener('pointerup', this.onDragEnd);

    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.activeDragElement = el;
  }

  private onDragMove = (event: PointerEvent) => {
    if (!this.isDragging()) return;
    const deltaY = this.startY - event.clientY;
    if (Math.abs(deltaY) > 5) {
      this.hasDragged = true;
    }
    const newHeight = Math.max(120, Math.min(window.innerHeight * 0.9, this.startHeight + deltaY));
    this.panelHeight.set(newHeight);
  };

  private onDragEnd = (event: PointerEvent) => {
    if (!this.isDragging()) return;
    this.isDragging.set(false);

    if (this.hasDragged) {
      this.suppressClick = true;
      setTimeout(() => {
        this.suppressClick = false;
      }, 50);
    }

    if (this.activeDragElement && this.activePointerId !== null) {
      try {
        this.activeDragElement.releasePointerCapture(this.activePointerId);
      } catch (e) {}
    }
    this.activeDragElement = null;
    this.activePointerId = null;

    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onDragEnd);

    const h = this.panelHeight();
    const snapBas = Math.max(180, Math.round(window.innerHeight * 0.28));
    const snapMilieu = Math.round(window.innerHeight * 0.50);
    const snapHaut = Math.round(window.innerHeight * 0.85);

    const snaps = [
      { val: snapBas, dist: Math.abs(h - snapBas) },
      { val: snapMilieu, dist: Math.abs(h - snapMilieu) },
      { val: snapHaut, dist: Math.abs(h - snapHaut) }
    ];
    snaps.sort((a, b) => a.dist - b.dist);
    this.panelHeight.set(snaps[0].val);

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 320);
  };

  setTab(tab: 'buses' | 'top') {
    this.activeTab.set(tab);
    if (tab === 'top') {
      this.fetchLeaderboard();
    }
  }

  setFilter(line: string | null) {
    const nextFilter = this.activeFilter() === line ? null : line;
    this.activeFilter.set(nextFilter);

    if (!nextFilter) {
      this.selectedBusKey.set(null);
      this.updateBusMarkers(this.activeBuses());
    } else {
      const bus = this.activeBuses().find(b => b.ligne === nextFilter);
      if (bus) {
        this.selectedBusKey.set(bus.ligne);
        this.updateBusMarkers(this.activeBuses());
        if (this.map) {
          this.map.setView([bus.lat, bus.lon], 16, { animate: false });
        }
      }
    }

    this.filterMarkers();
  }

  /**
   * Initializes the Leaflet map container
   */
  private initMap() {
    if (this.map) {
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 50);
      return;
    }

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
        this.error.set(null);
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
      console.warn('Positions bus indisponibles, affichage état vide:', err);
      this.error.set(null);
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

  isBusSelected(bus: Bus): boolean {
    return this.selectedBusKey() === bus.ligne;
  }

  modeLabel(mode: Bus['mode']): string {
    return mode === 'dedans' ? 'Passager a bord' : 'Bus apercu';
  }

  modeIconClass(mode: Bus['mode']): string {
    return mode === 'dedans' ? 'xetu-icon--rider' : 'xetu-icon--seen';
  }

  confidenceLabel(bus: Bus): string {
    return bus.confiance?.label || 'Estime';
  }

  confidenceClass(bus: Bus): string {
    const tone = bus.confiance?.tone || 'warning';
    return ['success', 'warning', 'danger'].includes(tone)
      ? `bus-confidence--${tone}`
      : 'bus-confidence--warning';
  }

  confidenceIconClass(bus: Bus): string {
    return `xetu-icon--${bus.confiance?.icon || 'signal-estimated'}`;
  }

  statusClass(bus: Bus): string {
    return bus.minutes_depuis_signalement <= 3 ? 'bus-status--success'
      : bus.minutes_depuis_signalement <= 5 ? 'bus-status--warning'
      : 'bus-status--danger';
  }

  statusLabel(bus: Bus): string {
    return bus.tracking_mode === 'live_gps' ? 'Position GPS' : 'Signal communautaire';
  }

  statusMessage(bus: Bus): string {
    if (bus.tracking_mode === 'live_gps') {
      return 'Position issue du suivi GPS.';
    }
    return bus.minutes_depuis_signalement <= 3
      ? 'Signal recent partage par la communaute.'
      : 'Derniere position connue, a confirmer.';
  }

  freshnessColor(minutesDepuisSignalement: number): string {
    if (minutesDepuisSignalement <= 3) return '#00D67F';
    if (minutesDepuisSignalement <= 5) return '#FFD166';
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
    if (minutesDepuisSignalement <= 3) return 'age-fresh';
    if (minutesDepuisSignalement <= 5) return 'age-ok';
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
