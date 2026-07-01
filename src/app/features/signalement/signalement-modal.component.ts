import { Component, OnInit, OnDestroy, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { ScoreService } from '../../core/services/score.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { MAPLIBRE_FACTORY_TOKEN, MAPLIBRE_MARKER_FACTORY_TOKEN, MapLibreFactory, MapLibreMarkerFactory } from '../../core/services/maplibre.token';
import { MapStyleService } from '../../core/services/map-style.service';
import { XetuMvpData, ReportRequest, TrackingSessionStartRequest, TrackingSessionPingRequest, TrackingSessionStopRequest } from '../../core/models/models';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { firstValueFrom, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';

interface LineStopOption {
  name: string;
  lat: number | null;
  lon: number | null;
  aliases: string[];
  dist?: number;
}

type NearbyStopView = { name: string; dist?: number; source: 'gps' | 'line' };

@Component({
  selector: 'app-signalement-modal',
  templateUrl: './signalement-modal.component.html',
  styleUrls: ['./signalement-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent
  ]
})
export class SignalementModalComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly apiService = inject(ApiService);
  private readonly sessionService = inject(SessionService);
  private readonly scoreService = inject(ScoreService);
  private readonly mapStyleService = inject(MapStyleService);
  private readonly toastCtrl = inject(ToastController);
  private readonly geolocation = inject(GEOLOCATION_TOKEN);
  private readonly createMap = inject(MAPLIBRE_FACTORY_TOKEN);
  private readonly createMarker = inject(MAPLIBRE_MARKER_FACTORY_TOKEN);

  // Whitelisted MVP lines validated by the backend
  readonly mvpLines = ['1', '4', '6', '7', '8', '9', '10', '13', '23', '232'];

  step = signal<number>(1);
  selectedLigne = signal<string>('');
  selectedArret = signal<string>('');
  mode = signal<'vu' | 'dedans'>('vu');
  selectedTags = signal<string[]>([]);

  // Snapped info
  nearestStopName = signal<string | null>(null);
  nearestStopDist = signal<number | null>(null);
  detectedSens = signal<'aller' | 'retour' | null>(null);
  manualSens = signal<'aller' | 'retour' | null>(null);
  lineTerminusA = signal<string>('Terminus A');
  lineTerminusB = signal<string>('Terminus B');

  // Ligne Search
  ligneSearchQuery = signal<string>('');
  filteredMvpLines = computed(() => {
    const q = this.ligneSearchQuery().trim().toLowerCase();
    if (!q) return this.mvpLines;
    return this.mvpLines.filter(l => l.toLowerCase().includes(q));
  });

  // GPS / Nearby Stops
  gpsCoords = signal<{ lat: number; lon: number } | null>(null);
  isGpsLoading = signal<boolean>(false);
  nearbyStops = signal<NearbyStopView[]>([]);

  // MapLibre map inside wizard
  private map: MapLibreMap | null = null;
  private userMarker: Marker | null = null;

  // Search Stops
  searchQuery = '';
  searchResults = signal<string[]>([]);
  isSearchLoading = signal<boolean>(false);
  lineStops = signal<LineStopOption[]>([]);
  lineStopsLoading = signal<boolean>(false);
  lineStopsError = signal<string>('');
  isStopInputFocused = signal<boolean>(false);
  locationStatus = signal<'idle' | 'loading' | 'ready' | 'unavailable' | 'outside'>('idle');

  // States
  isSubmitting = signal<boolean>(false);
  showSuccess = signal<boolean>(false);
  submitNotice = signal<string>('');
  rateLimitCountdown = signal<number>(0);
  scoreTotal = signal<number>(0);
  isNewReportRecorded = false;

  // Tracking State
  trackingStatus = signal<'inactive' | 'starting' | 'active'>('inactive');
  trackingSessionId = signal<string | null>(null);
  trackingError = signal<string | null>(null);
  private trackingInterval: ReturnType<typeof setInterval> | null = null;

  private countdownInterval: any = null;
  private searchSubject = new Subject<string>();
  private searchSubscription = new Subscription();
  private locationRequestId = 0;

  ngOnInit() {
    this.checkLocationAndFetchNearby();
    this.scoreTotal.set(this.scoreService.points());

    // Debounced search for stops in Step 2
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(query => {
        if (query.trim().length < 2) {
          return of({ stops: [], total: 0, query });
        }
        this.isSearchLoading.set(true);
        return this.apiService.searchStops(query).pipe(
          catchError((err) => {
            console.warn('Stop search failed in wizard:', err);
            return of({ stops: [], total: 0, query });
          })
        );
      })
    ).subscribe({
      next: (res) => {
        this.isSearchLoading.set(false);
        this.searchResults.set(res.stops.map(s => s.nom));
      }
    });
  }

  ngOnDestroy() {
    this.stopTracking(true);
    this.searchSubscription.unsubscribe();
    this.clearCountdown();
    this.destroyMap();
  }

  private async checkLocationAndFetchNearby() {
    const requestId = ++this.locationRequestId;
    this.isGpsLoading.set(true);
    this.locationStatus.set('loading');
    try {
      const coordinates = await this.withTimeout(
        this.getCurrentPosition(),
        6500,
        'gps_timeout'
      );

      if (requestId !== this.locationRequestId) return;

      const lat = coordinates.coords.latitude;
      const lon = coordinates.coords.longitude;

      // Senegal Bounding Box Validation:
      // Latitude [12.0, 16.0], Longitude [-17.7, -11.0]
      if (lat >= 12.0 && lat <= 16.0 && lon >= -17.7 && lon <= -11.0) {
        this.gpsCoords.set({ lat, lon });
        this.locationStatus.set('ready');
        this.updateUserMarker();

        await this.fetchBackendNearbyStops(lat, lon);
        this.refreshLineStopsFallback();
      } else {
        console.warn('GPS coordinates are outside Senegal boundaries, ignoring to avoid pollution.');
        this.locationStatus.set('outside');
        this.refreshLineStopsFallback();
      }
    } catch (e) {
      console.warn('Could not retrieve GPS coordinates for nearby stops:', e);
      if (requestId === this.locationRequestId) {
        this.locationStatus.set('unavailable');
        this.refreshLineStopsFallback();
      }
    } finally {
      if (requestId === this.locationRequestId) {
        this.isGpsLoading.set(false);
      }
    }
  }

  private async getCurrentPosition(): Promise<{ coords: { latitude: number; longitude: number } }> {
    try {
      return await this.geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000
      });
    } catch (capacitorError) {
      if (!navigator.geolocation) {
        throw capacitorError;
      }

      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(position),
          (browserError) => reject(browserError),
          { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
        );
      });
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
        })
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async fetchBackendNearbyStops(lat: number, lon: number) {
    try {
      const sessionId = this.sessionService.getSessionId();
      const res = await firstValueFrom(this.apiService.getNearby(lat, lon, sessionId || undefined));
      if (res?.stops?.length) {
        this.nearbyStops.set(res.stops.map(s => ({
          name: s.nom,
          dist: s.distance_m ?? undefined,
          source: 'gps'
        })));
      }
    } catch (err) {
      console.warn('Nearby stops unavailable, using local line stops when possible:', err);
    }
  }

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery = val;
    this.isStopInputFocused.set(true);
    this.searchSubject.next(val);
    
    // Clear previously selected or snapped stops when user types
    this.selectedArret.set('');
    this.nearestStopName.set(null);
    this.nearestStopDist.set(null);
    this.detectedSens.set(null);
  }

  onSearchFocus() {
    this.isStopInputFocused.set(true);
    if (this.selectedLigne() && this.lineStops().length === 0 && !this.lineStopsLoading()) {
      this.loadLineStops(this.selectedLigne());
    }
  }

  onSearchBlur() {
    setTimeout(() => this.isStopInputFocused.set(false), 150);
  }

  onLigneSearchChange(value: string) {
    this.ligneSearchQuery.set(value);
  }

  selectLigne(ligne: string) {
    this.selectedLigne.set(ligne);
    this.selectedArret.set('');
    this.searchQuery = '';
    this.searchResults.set([]);
    this.loadLineStops(ligne);
    this.step.set(2);
    this.initMap();
    
    // Attempt snap-to-line if GPS is available
    const coords = this.gpsCoords();
    if (coords) {
      this.snapToLine(ligne, coords.lat, coords.lon);
    }
  }

  selectArret(arret: string) {
    const normalized = arret.trim();
    if (!normalized) return;

    // Si on a un nearestStop mais qu'on sélectionne un autre arrêt manuellement, on clean
    if (this.nearestStopName() && normalized !== this.nearestStopName()) {
      this.nearestStopName.set(null);
      this.nearestStopDist.set(null);
      this.detectedSens.set(null);
    }

    this.selectedArret.set(normalized);
    this.searchQuery = '';
    this.isStopInputFocused.set(false);
    this.destroyMap();
    this.step.set(3);
  }

  selectArretSuggestion(arret: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.selectArret(arret);
  }

  goBack() {
    const current = this.step();
    if (current > 1) {
      if (current === 2) {
        this.destroyMap();
      }
      this.step.set(current - 1);
      if (this.step() === 2) {
        this.initMap();
      }
    }
  }

  toggleTag(tag: string) {
    const current = this.selectedTags();
    if (current.includes(tag)) {
      this.selectedTags.set(current.filter(t => t !== tag));
    } else {
      this.selectedTags.set([...current, tag]);
    }
  }

  async submitReport() {
    if (!this.selectedLigne() || !this.selectedArret()) return;

    this.isSubmitting.set(true);
    this.submitNotice.set('');
    this.isNewReportRecorded = false;

    try {
      // 1. Guarantee session is active
      await this.sessionService.ensureSession();

      // 2. Prepare payload
      const coords = this.gpsCoords();
      const hasValidGps = coords !== null;

      // Only controlled quality tags are sent. Free-text comments are intentionally
      // not collected so users cannot inject uncontrolled report content.
      const tags = this.selectedTags();
      const finalObservation = tags.length > 0 ? `Tags: ${tags.join(', ')}` : null;

      const payload: ReportRequest = {
        ligne: this.selectedLigne(),
        arret: this.selectedArret(),
        mode: this.mode() as 'vu' | 'dedans',
        observation: finalObservation,
        source: hasValidGps ? 'web_geoloc' : 'web_signal'
      };

      if (this.nearestStopName()) {
        payload.nearest_stop = this.nearestStopName();
      }

      if (hasValidGps && coords) {
        payload.lat = coords.lat;
        payload.lon = coords.lon;
      }

      // 3. Submit report
      const res = await firstValueFrom(this.apiService.reportBus(payload));

      // 4. Dashboard parity: only a genuinely recorded report is a success.
      // increment the score on a genuinely new report — never on an
      // already_recorded is not visible as a new bus and must not award points.
      if (res && 'id' in res && res.status === 'recorded') {
        this.scoreService.increment(res.id);
        this.isNewReportRecorded = true;
        this.scoreTotal.set(this.scoreService.points());
        this.step.set(4);
        this.showSuccess.set(true);
        // Do NOT automatically dismiss. Let the user click "Retour à la carte"
      } else if (res && res.status) {
        this.scoreTotal.set(this.scoreService.points());
        this.submitNotice.set(this.noticeForStatus(res.status));
      } else {
        throw new Error('Invalid response from report server');
      }
    } catch (err: any) {
      console.warn('Failed to submit report:', err);

      // Handle 429 Too Many Requests
      if (err.status === 429) {
        let retryAfter = 60; // default fallback
        
        // Attempt to read from JSON body first
        if (err.error) {
          if (typeof err.error.retry_after === 'number') {
            retryAfter = err.error.retry_after;
          } else if (err.error.error && err.error.error.includes('retry in')) {
            // Parse seconds from message e.g. "retry in 45s"
            const match = err.error.error.match(/(\d+)s/);
            if (match) {
              retryAfter = parseInt(match[1], 10);
            }
          }
        }
        
        this.startRateLimitCountdown(retryAfter);
      } else {
        // General error toast
        const msg = err.error?.message || err.error?.error || 'Impossible d\'enregistrer le signalement pour le moment.';
        const toast = await this.toastCtrl.create({
          message: msg,
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private noticeForStatus(status: string): string {
    switch (status) {
      case 'rejected_distance':
        return 'Signalement non ajoute : ta position GPS est trop loin de cet arret. Aucun point ajoute.';
      case 'rejected_low_confidence':
        return 'Signalement non ajoute : confiance insuffisante (verifie ligne et arret). Aucun point ajoute.';
      case 'rejected_spam':
        return 'Signalement non ajoute : trop de signalements recents. Aucun point ajoute.';
      case 'record_failed':
        return 'Signalement non enregistre suite a une erreur serveur. Reessaie dans un instant.';
      case 'already_recorded':
      default:
        return 'Signalement non ajoute : deja recent. Aucun point ajoute.';
    }
  }

  private startRateLimitCountdown(seconds: number) {
    this.clearCountdown();
    this.rateLimitCountdown.set(seconds);

    this.countdownInterval = setInterval(() => {
      const current = this.rateLimitCountdown();
      if (current <= 1) {
        this.clearCountdown();
      } else {
        this.rateLimitCountdown.set(current - 1);
      }
    }, 1000);
  }

  private clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.rateLimitCountdown.set(0);
  }

  manualStopLabel(): string {
    return this.findResolvableLineStop(this.searchQuery)?.name || '';
  }

  nearbyTitle(): string {
    if (this.hasGpsNearbyStops()) return 'Arrêts proches de vous';
    if (this.nearbyStops().length > 0) return 'Arrêts de la ligne';
    return 'Arrêts proches de vous';
  }

  hasGpsNearbyStops(): boolean {
    return this.nearbyStops().some(stop => stop.source === 'gps');
  }

  nearbyEmptyLabel(): string {
    if (this.isGpsLoading() && this.lineStops().length === 0) return 'Recherche de position...';
    if (this.locationStatus() === 'unavailable') return 'GPS indisponible. Tapez un arrêt ou choisissez un arrêt de la ligne.';
    if (this.locationStatus() === 'outside') return 'Position hors zone Dakar/Sénégal.';
    return 'Aucun arrêt proche trouvé';
  }

  lineStopSuggestions(): LineStopOption[] {
    const query = this.searchQuery.trim();
    const stops = this.lineStops();
    if (!query) {
      return stops.slice(0, 8);
    }
    return stops.filter((stop) => this.lineStopMatches(stop, query)).slice(0, 8);
  }

  stopSuggestions(): string[] {
    const lineStops = this.lineStopSuggestions().map((stop) => stop.name);

    if (this.lineStops().length > 0) {
      return this.uniqueStopNames(lineStops);
    }

    return this.uniqueStopNames(this.searchResults());
  }

  showStopDropdown(): boolean {
    return this.isStopInputFocused() && this.stopSuggestions().length > 0;
  }

  shouldChooseSuggestedStop(): boolean {
    return this.searchQuery.trim().length >= 2 && !this.manualStopLabel() && this.lineStops().length > 0;
  }

  private async loadLineStops(ligne: string) {
    this.lineStopsLoading.set(true);
    this.lineStopsError.set('');
    this.lineStops.set([]);

    try {
      const data = await firstValueFrom(this.apiService.getLocalStopsIndex());
      const stops = this.extractLineStops(data, ligne);
      this.lineStops.set(stops);
      this.refreshLineStopsFallback();

      if (stops.length === 0) {
        this.lineStopsError.set(`Aucun arrêt embarqué trouvé pour la ligne ${ligne}.`);
      }
    } catch (err) {
      console.warn('Could not load local line stops for signalement:', err);
      this.lineStopsError.set('Impossible de charger les arrêts de cette ligne.');
    } finally {
      this.lineStopsLoading.set(false);
    }
  }

  private extractLineStops(data: XetuMvpData, ligne: string): LineStopOption[] {
    const line = data.lignes?.[ligne];
    const rawStops = [...(line?.arrets || []), ...(line?.arrets_retour || [])];
    const seen = new Set<string>();
    const stops: LineStopOption[] = [];

    for (const stop of rawStops) {
      const key = this.normalizeStopText(stop.nom);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      stops.push({
        name: stop.nom,
        lat: stop.lat ?? null,
        lon: stop.lon ?? null,
        aliases: stop.aliases_terrain || []
      });
    }

    return stops;
  }

  private refreshLineStopsFallback() {
    if (this.hasGpsNearbyStops()) return;

    const stops = this.lineStops();
    if (stops.length === 0) return;

    const coords = this.gpsCoords();
    const rankedStops = coords
      ? stops
          .map(stop => ({
            ...stop,
            dist: stop.lat != null && stop.lon != null
              ? Math.round(this.haversine(coords.lat, coords.lon, stop.lat, stop.lon))
              : undefined
          }))
          .sort((a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY))
      : stops;

    this.nearbyStops.set(rankedStops.slice(0, 6).map(stop => ({
      name: stop.name,
      dist: stop.dist,
      source: 'line' as const
    })));
  }

  private findResolvableLineStop(query: string): LineStopOption | null {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const stops = this.lineStops();
    if (stops.length === 0) {
      return null;
    }

    const matches = stops.filter((stop) => this.lineStopMatches(stop, trimmed));
    const officialExact = matches.find((stop) => this.isSameStopText(stop.name, trimmed));

    if (officialExact) {
      return officialExact;
    }

    return matches.length === 1 ? matches[0] : null;
  }

  private lineStopMatches(stop: LineStopOption, query: string): boolean {
    const normalizedQuery = this.normalizeStopText(query);
    const looseQuery = this.normalizeStopTextLoose(query);
    if (!normalizedQuery) return true;

    return [stop.name, ...stop.aliases].some((term) => {
      const normalizedTerm = this.normalizeStopText(term);
      const looseTerm = this.normalizeStopTextLoose(term);
      return normalizedTerm.includes(normalizedQuery) || looseTerm.includes(looseQuery);
    });
  }

  private isSameStopText(left: string, right: string): boolean {
    return this.normalizeStopText(left) === this.normalizeStopText(right)
      || this.normalizeStopTextLoose(left) === this.normalizeStopTextLoose(right);
  }

  private normalizeStopText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private normalizeStopTextLoose(value: string): string {
    return this.normalizeStopText(value).replace(/(.)\1+/g, '$1');
  }

  private uniqueStopNames(names: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const name of names) {
      const key = this.normalizeStopText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(name);
    }

    return unique.slice(0, 8);
  }

  private initMap() {
    this.afterStableLayout(async () => {
      const mapContainer = document.getElementById('map-signal');
      if (!mapContainer) return;

      if (this.map) {
        this.resizeSignalMap();
        return;
      }

      try {
        const style = await this.mapStyleService.getStyleUrl();
        this.map = this.createMap({
          container: 'map-signal',
          style,
          center: [-17.4677, 14.7167],
          zoom: 14,
          attributionControl: {}
        });

        this.map.on('load', () => {
          this.updateUserMarker();
          this.resizeSignalMap();
        });
        this.resizeSignalMap();
      } catch (err) {
        console.warn('Failed to initialize MapLibre in signalement modal:', err);
      }
    });
  }

  private afterStableLayout(callback: () => void) {
    setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(callback));
    }, 0);
  }

  private resizeSignalMap() {
    this.afterStableLayout(() => {
      if (this.map) {
        this.map.resize();
      }
    });
  }

  private destroyMap() {
    if (this.map) {
      try {
        this.map.remove();
      } catch (e) {
        console.warn('Error removing MapLibre map in signalement modal:', e);
      }
      this.map = null;
    }
    this.userMarker = null;
  }

  private updateUserMarker() {
    if (!this.map) return;
    const coords = this.gpsCoords();
    if (!coords) return;

    try {
      if (this.userMarker) {
        this.userMarker.setLngLat([coords.lon, coords.lat]);
      } else {
        const element = document.createElement('div');
        element.className = 'user-location-marker';
        element.innerHTML = '<div class="blue-dot"></div>';
        this.userMarker = this.createMarker({
          element,
          anchor: 'center'
        }).setLngLat([coords.lon, coords.lat]).addTo(this.map);
      }
      this.map.jumpTo({ center: [coords.lon, coords.lat], zoom: 15 });
    } catch (err) {
      console.warn('Failed to update user marker in signalement map:', err);
    }
  }

  private applySnappedStop(stopName: string, dist: number, sens: 'aller' | 'retour') {
    this.selectedArret.set(stopName);
    this.nearestStopName.set(stopName);
    this.nearestStopDist.set(dist);
    this.detectedSens.set(sens);
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dphi = ((lat2 - lat1) * Math.PI) / 180;
    const dlam = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async snapToLine(ligne: string, lat: number, lon: number) {
    try {
      const data = await firstValueFrom(this.apiService.getLocalStopsIndex());
      const lineData = data.lignes?.[ligne];
      if (!lineData) return;

      const aller = (lineData.arrets || []).map(s => ({ ...s, _sens: 'aller' as const }));
      const retour = (lineData.arrets_retour || []).map(s => ({ ...s, _sens: 'retour' as const }));
      const stops = [...aller, ...retour];

      let bestDist = Infinity;
      let bestName: string | null = null;
      let bestSens: 'aller' | 'retour' | null = null;

      for (const s of stops) {
        if (s.lat == null || s.lon == null || !s.nom) continue;
        const d = this.haversine(lat, lon, s.lat, s.lon);
        if (d < bestDist) {
          bestDist = d;
          bestName = s.nom;
          bestSens = s._sens;
        }
      }

      if (bestName && bestDist <= 300) {
        this.applySnappedStop(bestName, Math.round(bestDist), bestSens!);
      }
    } catch (err) {
      console.warn('Could not snap to line:', err);
    }
  }

  dismiss() {
    this.modalCtrl.dismiss({
      success: this.showSuccess(),
      recorded: this.isNewReportRecorded
    });
  }

  // --- Live Tracking ---

  async startTracking() {
    this.trackingStatus.set('starting');
    this.trackingError.set(null);
    try {
      const phone = await this.sessionService.getDeviceId();
      const ligne = this.selectedLigne();
      if (!ligne) throw new Error('no_line');
      
      const req: TrackingSessionStartRequest = {
        phone,
        ligne,
        direction: this.detectedSens() || this.manualSens() || null,
        consent: true
      };

      const res = await firstValueFrom(this.apiService.startTrackingSession(req));
      if (res.status === 'ok' && res.session_id) {
        this.trackingSessionId.set(res.session_id);
        this.trackingStatus.set('active');
        this.startPingLoop();
      } else if (res.status === 'consent_required') {
        this.trackingError.set('Consentement requis.');
        this.trackingStatus.set('inactive');
      } else {
        this.trackingError.set('Service temporairement indisponible.');
        this.trackingStatus.set('inactive');
      }
    } catch (e) {
      console.warn('Erreur startTracking:', e);
      this.trackingError.set('Impossible de démarrer le suivi.');
      this.trackingStatus.set('inactive');
    }
  }

  private startPingLoop() {
    this.clearPingLoop();
    this.pingTracking(); // Immediate ping
    this.trackingInterval = setInterval(() => {
      this.pingTracking();
    }, 30000);
  }

  private clearPingLoop() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  private async pingTracking() {
    const sessionId = this.trackingSessionId();
    if (!sessionId || this.trackingStatus() !== 'active') return;

    try {
      const position = await this.geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });

      const phone = await this.sessionService.getDeviceId();
      const req: TrackingSessionPingRequest = {
        session_id: sessionId,
        phone,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy_m: position.coords.accuracy
      };

      const res = await firstValueFrom(this.apiService.pingTrackingSession(req));
      if (res.status === 'no_active_session' || res.status === 'unauthorized_session') {
        this.clearPingLoop();
        this.trackingStatus.set('inactive');
        this.trackingError.set('Session expirée.');
      }
    } catch (e) {
      console.warn('Erreur pingTracking:', e);
    }
  }

  async stopTracking(isDestroy = false) {
    this.clearPingLoop();
    if (!isDestroy) {
      this.trackingStatus.set('inactive');
    }

    const sessionId = this.trackingSessionId();
    if (!sessionId) return;
    
    this.trackingSessionId.set(null);

    try {
      const phone = await this.sessionService.getDeviceId();
      const req: TrackingSessionStopRequest = {
        session_id: sessionId,
        phone,
        reason: isDestroy ? 'component_destroyed' : 'user_stop'
      };
      // Best-effort local cleanup was done, async network call
      firstValueFrom(this.apiService.stopTrackingSession(req)).catch(() => {});
    } catch (e) {
      console.warn('Failed to stop tracking securely', e);
    }
  }
}
