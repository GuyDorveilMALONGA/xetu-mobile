import { Component, OnInit, OnDestroy, signal, computed, Inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { ScoreService } from '../../core/services/score.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { XetuMvpData } from '../../core/models/models';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { firstValueFrom, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import * as L from 'leaflet';

interface LineStopOption {
  name: string;
  lat: number | null;
  lon: number | null;
  aliases: string[];
}

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
  // Whitelisted MVP lines validated by the backend
  readonly mvpLines = ['1', '4', '6', '7', '8', '9', '10', '13', '23', '232'];

  step = signal<number>(1);
  selectedLigne = signal<string>('');
  selectedArret = signal<string>('');
  mode = signal<'vu' | 'dedans'>('vu');
  selectedTags = signal<string[]>([]);

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
  nearbyStops = signal<{ name: string; dist?: number }[]>([]);

  // Leaflet map inside wizard
  private map: L.Map | null = null;
  private userMarker: L.Marker | null = null;

  // Search Stops
  searchQuery = '';
  searchResults = signal<string[]>([]);
  isSearchLoading = signal<boolean>(false);
  lineStops = signal<LineStopOption[]>([]);
  lineStopsLoading = signal<boolean>(false);
  lineStopsError = signal<string>('');
  isStopInputFocused = signal<boolean>(false);

  // States
  isSubmitting = signal<boolean>(false);
  showSuccess = signal<boolean>(false);
  submitNotice = signal<string>('');
  rateLimitCountdown = signal<number>(0);
  scoreTotal = signal<number>(0);
  isNewReportRecorded = false;

  private countdownInterval: any = null;
  private searchSubject = new Subject<string>();
  private searchSubscription = new Subscription();

  constructor(
    private modalCtrl: ModalController,
    private apiService: ApiService,
    private sessionService: SessionService,
    private scoreService: ScoreService,
    private toastCtrl: ToastController,
    @Inject(GEOLOCATION_TOKEN) private geolocation: GeolocationPlugin
  ) {}

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
    this.searchSubscription.unsubscribe();
    this.clearCountdown();
    this.destroyMap();
  }

  private async checkLocationAndFetchNearby() {
    this.isGpsLoading.set(true);
    try {
      const coordinates = await this.getCurrentPosition();

      const lat = coordinates.coords.latitude;
      const lon = coordinates.coords.longitude;

      // Senegal Bounding Box Validation:
      // Latitude [12.0, 16.0], Longitude [-17.7, -11.0]
      if (lat >= 12.0 && lat <= 16.0 && lon >= -17.7 && lon <= -11.0) {
        this.gpsCoords.set({ lat, lon });
        this.updateUserMarker();
        
        // Fetch nearby stops
        const sessionId = this.sessionService.getSessionId();
        const res = await firstValueFrom(this.apiService.getNearby(lat, lon, sessionId || undefined));
        if (res && res.stops) {
          this.nearbyStops.set(res.stops.map(s => ({ name: s.nom, dist: s.distance_m })));
        }
      } else {
        console.warn('GPS coordinates are outside Senegal boundaries, ignoring to avoid pollution.');
      }
    } catch (e) {
      console.warn('Could not retrieve GPS coordinates for nearby stops:', e);
    } finally {
      this.isGpsLoading.set(false);
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

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery = val;
    this.isStopInputFocused.set(true);
    this.searchSubject.next(val);
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
  }

  selectArret(arret: string) {
    const normalized = arret.trim();
    if (!normalized) return;

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

      const payload: any = {
        ligne: this.selectedLigne(),
        arret: this.selectedArret(),
        mode: this.mode(),
        observation: finalObservation,
        source: hasValidGps ? 'web_geoloc' : 'web_signal'
      };

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
      } else if (res && res.status === 'already_recorded') {
        this.scoreTotal.set(this.scoreService.points());
        this.submitNotice.set('Signalement non ajoute : deja recent ou position GPS insuffisante. Aucun point ajoute.');
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
    return 'Arrêts proches de vous';
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
    // Run in a slight delay to ensure Angular has rendered the DOM element #map-signal
    setTimeout(() => {
      const mapContainer = document.getElementById('map-signal');
      if (!mapContainer) return;

      if (this.map) {
        this.map.invalidateSize();
        return;
      }

      try {
        this.map = L.map('map-signal', {
          zoomControl: false,
          attributionControl: false
        }).setView([14.7167, -17.4677], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          subdomains: 'abcd',
        }).addTo(this.map);

        this.updateUserMarker();
      } catch (err) {
        console.warn('Failed to initialize Leaflet in signalement modal:', err);
      }
    }, 50);
  }

  private destroyMap() {
    if (this.map) {
      try {
        this.map.remove();
      } catch (e) {
        console.warn('Error removing Leaflet map in signalement modal:', e);
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
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="blue-dot"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      if (this.userMarker) {
        this.userMarker.setLatLng([coords.lat, coords.lon]);
      } else {
        this.userMarker = L.marker([coords.lat, coords.lon], { icon: userIcon }).addTo(this.map);
      }
      this.map.setView([coords.lat, coords.lon], 15);
    } catch (err) {
      console.warn('Failed to update user marker in signalement map:', err);
    }
  }

  dismiss() {
    this.modalCtrl.dismiss({
      success: this.showSuccess(),
      recorded: this.isNewReportRecorded
    });
  }
}
