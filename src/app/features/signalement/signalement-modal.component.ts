import { Component, OnInit, OnDestroy, signal, computed, Inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { ScoreService } from '../../core/services/score.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { firstValueFrom, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import * as L from 'leaflet';

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
  observation = '';
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

  // States
  isSubmitting = signal<boolean>(false);
  showSuccess = signal<boolean>(false);
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
      const coordinates = await this.geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000
      });

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

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery = val;
    this.searchSubject.next(val);
  }

  onLigneSearchChange(value: string) {
    this.ligneSearchQuery.set(value);
  }

  selectLigne(ligne: string) {
    this.selectedLigne.set(ligne);
    this.step.set(2);
    this.initMap();
  }

  selectArret(arret: string) {
    const normalized = arret.trim();
    if (!normalized) return;

    this.selectedArret.set(normalized);
    this.searchQuery = '';
    this.destroyMap();
    this.step.set(3);
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

    try {
      // 1. Guarantee session is active
      await this.sessionService.ensureSession();

      // 2. Prepare payload
      const coords = this.gpsCoords();
      const hasValidGps = coords !== null;

      // Concatenate observation text and quality tags
      let finalObservation: string | null = null;
      const obsText = this.observation.trim();
      const tags = this.selectedTags();
      
      if (obsText && tags.length > 0) {
        finalObservation = `${obsText}. Tags: ${tags.join(', ')}`;
      } else if (obsText) {
        finalObservation = obsText;
      } else if (tags.length > 0) {
        finalObservation = `Tags: ${tags.join(', ')}`;
      }

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

      // 4. Treat both recorded and already_recorded as success, but only
      // increment the score on a genuinely new report — never on an
      // idempotent duplicate (status === 'already_recorded').
      if (res && (res.status === 'already_recorded' || ('id' in res && res.status === 'recorded'))) {
        if (res.status === 'recorded') {
          this.scoreService.increment();
          this.isNewReportRecorded = true;
        }
        this.scoreTotal.set(this.scoreService.points());
        this.step.set(4);
        this.showSuccess.set(true);
        // Do NOT automatically dismiss. Let the user click "Retour à la carte"
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
    return this.searchQuery.trim();
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
