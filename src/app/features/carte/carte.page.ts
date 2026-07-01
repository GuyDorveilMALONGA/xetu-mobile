import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { MAPLIBRE_FACTORY_TOKEN, MAPLIBRE_MARKER_FACTORY_TOKEN, MapLibreFactory, MapLibreMarkerFactory } from '../../core/services/maplibre.token';
import { MapStyleService } from '../../core/services/map-style.service';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { Bus, LeaderboardResponse, XetuMvpData } from '../../core/models/models';
import { firstValueFrom } from 'rxjs';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { SignalementModalComponent } from '../signalement/signalement-modal.component';

const POLL_INTERVAL_MS = 30000;
const ACTIVE_LINE_SOURCE_ID = 'xetu-active-line';
const ACTIVE_LINE_HALO_LAYER_ID = 'xetu-active-line-halo';
const ACTIVE_LINE_LAYER_ID = 'xetu-active-line-path';
const ACTIVE_LINE_STOPS_LAYER_ID = 'xetu-active-line-stops';
const ACTIVE_LINE_COLOR = '#13C978';

@Component({
  selector: 'app-carte',
  templateUrl: './carte.page.html',
  styleUrls: ['./carte.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class CartePage implements OnInit, OnDestroy {
  private readonly apiService = inject(ApiService);
  private readonly storeService = inject(StoreService);
  private readonly sessionService = inject(SessionService);
  private readonly mapStyleService = inject(MapStyleService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly geolocation = inject(GEOLOCATION_TOKEN);
  private readonly createMap = inject(MAPLIBRE_FACTORY_TOKEN);
  private readonly createMarker = inject(MAPLIBRE_MARKER_FACTORY_TOKEN);

  // Map and markers
  private map: MapLibreMap | null = null;
  private mapLoaded = false;
  private userMarker: Marker | null = null;
  private busMarkers = new Map<string, Marker>();
  private activeLineEndpointMarkers: Marker[] = [];
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private welcomeShown = false;
  private routesIndex: XetuMvpData['lignes'] | null = null;

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
  relancingLines = signal<Set<string>>(new Set());

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
      this.map.zoomIn({ animate: false });
    }
  }

  zoomOut() {
    if (this.map) {
      this.map.zoomOut({ animate: false });
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
        this.map.resize();
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
        this.map.resize();
      }
    }, 320);
  };

  setTab(tab: 'buses' | 'top') {
    this.activeTab.set(tab);
    if (tab === 'top') {
      this.fetchLeaderboard();
    }
  }

  async setFilter(line: string | null) {
    const nextFilter = this.activeFilter() === line ? null : line;
    this.activeFilter.set(nextFilter);
    this.clearActiveLine();

    if (!nextFilter) {
      this.selectedBusKey.set(null);
      this.updateBusMarkers(this.activeBuses());
    } else {
      const bus = this.activeBuses().find(b => b.ligne === nextFilter);
      if (bus) {
        this.selectedBusKey.set(bus.ligne);
        this.updateBusMarkers(this.activeBuses());
        const drawn = await this.drawLineGeometry(bus.ligne, bus.direction);
        if (!drawn && this.map) {
          this.map.jumpTo({ center: [bus.lon, bus.lat], zoom: 16 });
        }
      }
    }

    this.filterMarkers();
  }

  /**
   * Initializes the MapLibre map container
   */
  private initMap() {
    if (this.map) {
      setTimeout(() => {
        if (this.map) {
          this.map.resize();
        }
      }, 50);
      return;
    }
    this.createMapInstance();
  }

  private async createMapInstance() {
    try {
      const style = await this.mapStyleService.getStyleUrl();
      this.map = this.createMap({
        container: 'map',
        style,
        center: [-17.4677, 14.7167],
        zoom: 13,
        attributionControl: {}
      });

      this.map.on('load', () => {
        this.mapLoaded = true;
        this.updateUserMarker();
        this.updateBusMarkers(this.activeBuses());
        this.filterMarkers();
      });

      setTimeout(() => {
        if (this.map) {
          this.map.resize();
        }
      }, 200);
    } catch (err) {
      console.warn('Failed to initialize MapLibre map:', err);
    }
  }

  private async ensureLocalIndex(): Promise<XetuMvpData> {
    const data = await firstValueFrom(this.apiService.getLocalStopsIndex());
    this.routesIndex = data.lignes || {};
    return data;
  }

  /**
   * Destroys the map instance and clears all markers
   */
  private destroyMap() {
    this.clearBusMarkers();
    this.clearActiveLine();
    if (this.userMarker && this.map) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.mapLoaded = false;
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

      this.updateUserMarker();

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
      const { sessionId } = await this.sessionService.ensureSession();
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
      const isSelected = this.selectedBusKey() === key;
      const color = this.freshnessColor(bus.minutes_depuis_signalement);
      const size = isSelected ? 40 : 34;

      const existingMarker = this.busMarkers.get(key);
      if (existingMarker) {
        existingMarker.setLngLat([bus.lon, bus.lat]);
        const element = existingMarker.getElement();
        element.innerHTML = this.makeBusMarkerHtml(bus.ligne, color, size, isSelected);
        element.style.zIndex = isSelected ? '1000' : '0';
      } else {
        const element = this.createBusMarkerElement(bus.ligne, color, size, isSelected);
        element.style.zIndex = isSelected ? '1000' : '0';
        const marker = this.createMarker({
          element,
          anchor: 'center'
        }).setLngLat([bus.lon, bus.lat]).addTo(this.map);

        element.addEventListener('click', () => {
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
      const onMap = marker.getElement().isConnected;
      if (shouldShow && !onMap) marker.addTo(this.map);
      if (!shouldShow && onMap) marker.remove();
    }
  }

  private createBusMarkerElement(ligne: string, color: string, size: number, isSelected: boolean): HTMLElement {
    const element = document.createElement('div');
    element.className = 'xetu-bus-marker';
    element.innerHTML = this.makeBusMarkerHtml(ligne, color, size, isSelected);
    return element;
  }

  private makeBusMarkerHtml(ligne: string, color: string, size: number, isSelected: boolean): string {
    const safeLine = this.escapeHtml(ligne);
    const pulse = isSelected
      ? ''
      : `<div class="xetu-pulse" style="width:${size}px;height:${size}px;background:${color};"></div>`;
    return `<div style="position:relative;width:${size}px;height:${size}px;">
        ${pulse}
        <div style="position:absolute;top:0;left:0;width:${size}px;height:${size}px;
          border-radius:50%;background:${color};
          border:3px solid rgba(255,255,255,${isSelected ? '0.95' : '0.7'});
          box-shadow:0 2px 12px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:${size <= 34 ? 11 : 13}px;color:#0a0f1e;">
          ${safeLine}
        </div>
      </div>`;
  }

  centerOnUser() {
    const coords = this.userLocation();
    if (this.map && coords) {
      this.map.jumpTo({ center: [coords.lon, coords.lat], zoom: 15 });
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

  async selectBus(bus: Bus) {
    const key = bus.ligne;
    const wasSelected = this.selectedBusKey() === key;
    this.selectedBusKey.set(wasSelected ? null : key);
    this.updateBusMarkers(this.activeBuses());
    this.clearActiveLine();

    if (wasSelected) {
      return;
    }

    const drawn = await this.drawLineGeometry(bus.ligne, bus.direction);
    if (!drawn && this.map) {
      this.map.jumpTo({ center: [bus.lon, bus.lat], zoom: 16 });
    }
  }

  isRelancing(ligne: string): boolean {
    return this.relancingLines().has(ligne);
  }

  relanceAllowed(bus: Bus): boolean {
    const minutes = bus.minutes_depuis_signalement || 0;
    return bus.mode === 'dedans' && !bus.eta_disabled_reason && minutes > 10 && minutes <= 20;
  }

  async relanceBus(bus: Bus, event: Event) {
    event.stopPropagation();
    if (this.isRelancing(bus.ligne)) return;
    
    const newSet = new Set(this.relancingLines());
    newSet.add(bus.ligne);
    this.relancingLines.set(newSet);

    try {
      const res = await firstValueFrom(this.apiService.requestBusRefresh(bus.ligne));
      let msg = '';
      switch(res.status) {
        case 'sent': msg = 'Demande envoyée.'; break;
        case 'fresh_enough': msg = 'Position encore récente.'; break;
        case 'cooldown': msg = `Demande déjà envoyée, réessaie dans ${res.retry_after_sec || 300}s.`; break;
        case 'no_dedans_signalement': msg = 'Aucun passager à relancer pour cette ligne.'; break;
        case 'no_contact': msg = 'Dernier passager non joignable.'; break;
        case 'send_failed': msg = 'Relance impossible pour le moment.'; break;
        default: msg = 'Relance impossible pour le moment.'; break;
      }
      
      const toast = await this.toastCtrl.create({
        message: msg,
        duration: 3000,
        position: 'bottom'
      });
      toast.present();
    } catch (err) {
      console.warn('Erreur relance:', err);
      const toast = await this.toastCtrl.create({
        message: 'Relance impossible pour le moment.',
        duration: 3000,
        position: 'bottom'
      });
      toast.present();
    } finally {
      const resetSet = new Set(this.relancingLines());
      resetSet.delete(bus.ligne);
      this.relancingLines.set(resetSet);
    }
  }

  /**
   * Charge l'index local des lignes (assets/data/xetu_mvp.json, déjà bundlé)
   * et trace le polyline + les arrêts de la ligne sélectionnée, comme le Dashboard.
   */
  private async drawLineGeometry(ligne: string, direction: Bus['direction'] = 'aller'): Promise<boolean> {
    if (!this.map || !this.mapLoaded) return false;

    try {
      if (!this.routesIndex) {
        await this.ensureLocalIndex();
      }

      const routes = this.routesIndex || {};
      const lineRaw = routes[ligne];
      if (!lineRaw) return false;

      const sens = direction === 'retour' ? 'retour' : 'aller';
      const trace = sens === 'retour' ? (lineRaw.geometry_retour || []) : (lineRaw.geometry_aller || []);
      const arrets = sens === 'retour' ? (lineRaw.arrets_retour || []) : (lineRaw.arrets || []);
      if (trace.length < 2) return false;

      const stopFeatures = arrets
        .map((stop, idx) => {
          if (stop.lat == null || stop.lon == null) return null;
          return {
            type: 'Feature' as const,
            properties: {
              terminus: idx === 0 || idx === arrets.length - 1,
              role: idx === 0 ? 'depart' : idx === arrets.length - 1 ? 'arrivee' : 'stop'
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [stop.lon, stop.lat]
            }
          };
        })
        .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

      const sourceData = {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: trace
            }
          },
          ...stopFeatures
        ]
      };

      if (this.map.getSource(ACTIVE_LINE_SOURCE_ID)) {
        (this.map.getSource(ACTIVE_LINE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(sourceData);
      } else {
        this.map.addSource(ACTIVE_LINE_SOURCE_ID, {
          type: 'geojson',
          data: sourceData
        });
        this.map.addLayer({
          id: ACTIVE_LINE_HALO_LAYER_ID,
          type: 'line',
          source: ACTIVE_LINE_SOURCE_ID,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': 'rgba(255,255,255,0.82)',
            'line-width': 9,
            'line-opacity': 0.92
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
        this.map.addLayer({
          id: ACTIVE_LINE_LAYER_ID,
          type: 'line',
          source: ACTIVE_LINE_SOURCE_ID,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': ACTIVE_LINE_COLOR,
            'line-width': 5,
            'line-opacity': 0.96
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
        this.map.addLayer({
          id: ACTIVE_LINE_STOPS_LAYER_ID,
          type: 'circle',
          source: ACTIVE_LINE_SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': ['case', ['get', 'terminus'], 5, 2],
            'circle-color': ['case', ['get', 'terminus'], '#ffffff', 'rgba(19,201,120,0.34)'],
            'circle-stroke-color': ['case', ['get', 'terminus'], ACTIVE_LINE_COLOR, 'rgba(19,201,120,0.46)'],
            'circle-stroke-width': ['case', ['get', 'terminus'], 3, 1]
          }
        });
      }

      this.updateActiveLineEndpointMarkers(arrets, ligne, sens);
      this.fitLineBounds(trace);
      return true;
    } catch (err) {
      console.warn('Tracé de ligne indisponible:', err);
      return false;
    }
  }

  private clearActiveLine() {
    if (!this.map) return;

    this.clearActiveLineEndpointMarkers();
    if (this.map.getLayer(ACTIVE_LINE_STOPS_LAYER_ID)) {
      this.map.removeLayer(ACTIVE_LINE_STOPS_LAYER_ID);
    }
    if (this.map.getLayer(ACTIVE_LINE_LAYER_ID)) {
      this.map.removeLayer(ACTIVE_LINE_LAYER_ID);
    }
    if (this.map.getLayer(ACTIVE_LINE_HALO_LAYER_ID)) {
      this.map.removeLayer(ACTIVE_LINE_HALO_LAYER_ID);
    }
    if (this.map.getSource(ACTIVE_LINE_SOURCE_ID)) {
      this.map.removeSource(ACTIVE_LINE_SOURCE_ID);
    }
  }

  private updateActiveLineEndpointMarkers(
    arrets: NonNullable<XetuMvpData['lignes'][string]['arrets']>,
    ligne: string,
    sens: 'aller' | 'retour'
  ) {
    if (!this.map || arrets.length === 0) return;
    this.clearActiveLineEndpointMarkers();

    const first = arrets[0];
    const last = arrets[arrets.length - 1];
    this.addActiveLineEndpointMarker(first, 'depart', 'Départ', ligne, sens);
    this.addActiveLineEndpointMarker(last, 'arrivee', 'Arrivée', ligne, sens);
  }

  private addActiveLineEndpointMarker(
    stop: { nom: string; lat: number; lon: number },
    role: 'depart' | 'arrivee',
    label: string,
    ligne: string,
    sens: 'aller' | 'retour'
  ) {
    if (!this.map || stop.lat == null || stop.lon == null) return;

    const element = document.createElement('div');
    element.className = `xetu-line-endpoint xetu-line-endpoint--${role}`;
    element.setAttribute('aria-label', `${label} ligne ${ligne} ${sens}: ${stop.nom}`);
    element.innerHTML = `
      <span class="xetu-line-endpoint__pin">${role === 'depart' ? 'D' : 'A'}</span>
      <span class="xetu-line-endpoint__label">${label}</span>
    `;

    const marker = this.createMarker({
      element,
      anchor: role === 'depart' ? 'bottom-left' : 'bottom-right'
    }).setLngLat([stop.lon, stop.lat]).addTo(this.map);
    this.activeLineEndpointMarkers.push(marker);
  }

  private clearActiveLineEndpointMarkers() {
    for (const marker of this.activeLineEndpointMarkers) {
      marker.remove();
    }
    this.activeLineEndpointMarkers = [];
  }

  private updateUserMarker() {
    if (!this.map) return;
    const coords = this.userLocation();
    if (!coords) return;

    if (this.userMarker) {
      this.userMarker.setLngLat([coords.lon, coords.lat]);
      return;
    }

    const element = document.createElement('div');
    element.className = 'user-location-marker';
    element.innerHTML = '<div class="blue-dot"></div>';
    this.userMarker = this.createMarker({
      element,
      anchor: 'center'
    }).setLngLat([coords.lon, coords.lat]).addTo(this.map);
  }

  private fitLineBounds(trace: Array<[number, number]>) {
    if (!this.map || trace.length === 0) return;

    const bounds = trace.reduce(
      (acc, [lon, lat]) => ({
        minLon: Math.min(acc.minLon, lon),
        minLat: Math.min(acc.minLat, lat),
        maxLon: Math.max(acc.maxLon, lon),
        maxLat: Math.max(acc.maxLat, lat)
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity
      }
    );

    this.map.fitBounds(
      [
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat]
      ],
      { padding: 40, maxZoom: 14 }
    );
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
