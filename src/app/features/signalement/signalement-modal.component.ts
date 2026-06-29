import { Component, OnInit, OnDestroy, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonIcon,
  IonButtons,
  IonProgressBar,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  IonCard,
  IonCardContent,
  ModalController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, pin, arrowForward } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { firstValueFrom, Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-signalement-modal',
  templateUrl: './signalement-modal.component.html',
  styleUrls: ['./signalement-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonButtons,
    IonProgressBar,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
    IonCard,
    IonCardContent
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

  // GPS / Nearby Stops
  gpsCoords = signal<{ lat: number; lon: number } | null>(null);
  isGpsLoading = signal<boolean>(false);
  nearbyStops = signal<string[]>([]);

  // Search Stops
  searchQuery = '';
  searchResults = signal<string[]>([]);
  isSearchLoading = signal<boolean>(false);

  // States
  isSubmitting = signal<boolean>(false);
  showSuccess = signal<boolean>(false);
  rateLimitCountdown = signal<number>(0);

  private countdownInterval: any = null;
  private searchSubject = new Subject<string>();
  private searchSubscription = new Subscription();

  constructor(
    private modalCtrl: ModalController,
    private apiService: ApiService,
    private sessionService: SessionService,
    private toastCtrl: ToastController,
    @Inject(GEOLOCATION_TOKEN) private geolocation: GeolocationPlugin
  ) {
    addIcons({ checkmarkCircle, alertCircle, pin, arrowForward });
  }

  ngOnInit() {
    this.checkLocationAndFetchNearby();

    // Debounced search for stops in Step 2
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(query => {
        if (query.trim().length < 2) {
          return of({ stops: [], total: 0, query });
        }
        this.isSearchLoading.set(true);
        return this.apiService.searchStops(query);
      })
    ).subscribe({
      next: (res) => {
        this.isSearchLoading.set(false);
        this.searchResults.set(res.stops.map(s => s.nom));
      },
      error: (err) => {
        this.isSearchLoading.set(false);
        console.error('Stop search failed in wizard:', err);
      }
    });
  }

  ngOnDestroy() {
    this.searchSubscription.unsubscribe();
    this.clearCountdown();
  }

  /**
   * Request GPS permission and fetch coordinates using Geolocation
   */
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
        
        // Fetch nearby stops
        const res = await firstValueFrom(this.apiService.getNearby(lat, lon));
        if (res && res.stops) {
          this.nearbyStops.set(res.stops.map(s => s.nom));
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

  onSearchInput() {
    this.searchSubject.next(this.searchQuery);
  }

  selectLigne(ligne: string) {
    this.selectedLigne.set(ligne);
    this.step.set(2);
  }

  selectArret(arret: string) {
    this.selectedArret.set(arret);
    this.step.set(3);
  }

  goBack() {
    const current = this.step();
    if (current > 1) {
      this.step.set(current - 1);
    }
  }

  getProgressValue(): number {
    const current = this.step();
    if (this.showSuccess()) return 1.0;
    if (current === 1) return 0.33;
    if (current === 2) return 0.66;
    return 1.0;
  }

  /**
   * Submits the manual report to /api/report
   */
  async submitReport() {
    this.isSubmitting.set(true);

    try {
      // 1. Guarantee session is active
      await this.sessionService.ensureSession();

      // 2. Prepare payload
      const coords = this.gpsCoords();
      const hasValidGps = coords !== null;

      const payload: any = {
        ligne: this.selectedLigne(),
        arret: this.selectedArret(),
        mode: this.mode(),
        observation: this.observation.trim() || null,
        source: hasValidGps ? 'web_geoloc' : 'web_signal'
      };

      if (hasValidGps && coords) {
        payload.lat = coords.lat;
        payload.lon = coords.lon;
      }

      // 3. Submit report
      const res = await firstValueFrom(this.apiService.reportBus(payload));

      // 4. Treat both recorded and already_recorded as success
      if (res && (res.status === 'already_recorded' || ('id' in res && res.status === 'recorded'))) {
        this.showSuccess.set(true);
        setTimeout(() => {
          this.modalCtrl.dismiss({ success: true });
        }, 1500);
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

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
