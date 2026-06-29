import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonInput,
  IonButton,
  IonIcon,
  IonToggle,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonCard,
  IonCardContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { swapVertical, search, walk, arrowForward, alertCircle, chevronDown, chevronUp } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { RouteResponse, DirectRoute, TransferRoute, WalkDirectRoute } from '../../core/models/models';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-itineraire',
  templateUrl: './itineraire.page.html',
  styleUrls: ['./itineraire.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonInput,
    IonButton,
    IonIcon,
    IonToggle,
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonCard,
    IonCardContent
  ]
})
export class ItinerairePage implements OnInit, OnDestroy {
  fromQuery = signal<string>('');
  toQuery = signal<string>('');
  noTransfer = signal<boolean>(false);

  fromSuggestions = signal<string[]>([]);
  toSuggestions = signal<string[]>([]);
  activeInput = signal<'from' | 'to' | null>(null);

  isLoading = signal<boolean>(false);
  routeResult = signal<RouteResponse | null>(null);
  errorMessage = signal<string | null>(null);

  // Expanded states for route stop lists (key is route index/type)
  expandedRoutes = signal<{ [key: string]: boolean }>({});

  private fromSearch$ = new Subject<string>();
  private toSearch$ = new Subject<string>();
  private subscriptions = new Subscription();

  constructor(private apiService: ApiService) {
    addIcons({ swapVertical, search, walk, arrowForward, alertCircle, chevronDown, chevronUp });
  }

  ngOnInit() {
    // Debounced autocomplete for "from" input
    this.subscriptions.add(
      this.fromSearch$.pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(query => {
          if (query.trim().length < 2) {
            return of({ stops: [], total: 0, query });
          }
          return this.apiService.searchStops(query);
        })
      ).subscribe({
        next: (res) => {
          this.fromSuggestions.set(res.stops.map(s => s.nom));
        },
        error: (err) => console.error('From stops search failed:', err)
      })
    );

    // Debounced autocomplete for "to" input
    this.subscriptions.add(
      this.toSearch$.pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(query => {
          if (query.trim().length < 2) {
            return of({ stops: [], total: 0, query });
          }
          return this.apiService.searchStops(query);
        })
      ).subscribe({
        next: (res) => {
          this.toSuggestions.set(res.stops.map(s => s.nom));
        },
        error: (err) => console.error('To stops search failed:', err)
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  onInputChange(field: 'from' | 'to', value: string) {
    if (field === 'from') {
      this.fromQuery.set(value);
      this.activeInput.set('from');
      this.fromSearch$.next(value);
    } else {
      this.toQuery.set(value);
      this.activeInput.set('to');
      this.toSearch$.next(value);
    }
  }

  selectSuggestion(field: 'from' | 'to', stopName: string) {
    if (field === 'from') {
      this.fromQuery.set(stopName);
      this.fromSuggestions.set([]);
    } else {
      this.toQuery.set(stopName);
      this.toSuggestions.set([]);
    }
    this.activeInput.set(null);
  }

  swapPoints() {
    const tempFrom = this.fromQuery();
    this.fromQuery.set(this.toQuery());
    this.toQuery.set(tempFrom);
    this.routeResult.set(null);
    this.errorMessage.set(null);
    this.fromSuggestions.set([]);
    this.toSuggestions.set([]);
    this.activeInput.set(null);
  }

  async calculateRoute() {
    const from = this.fromQuery().trim();
    const to = this.toQuery().trim();

    if (!from || !to) {
      return;
    }

    this.isLoading.set(true);
    this.routeResult.set(null);
    this.errorMessage.set(null);
    this.expandedRoutes.set({});

    this.apiService.getRoute(from, to, this.noTransfer()).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.routeResult.set(res);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set('Une erreur réseau est survenue lors du calcul de l\'itinéraire.');
        console.error('Route calculation failed:', err);
      }
    });
  }

  toggleRouteExpansion(key: string) {
    const current = this.expandedRoutes();
    this.expandedRoutes.set({
      ...current,
      [key]: !current[key]
    });
  }

  isRouteExpanded(key: string): boolean {
    return !!this.expandedRoutes()[key];
  }

  directRoutes(result: RouteResponse): DirectRoute[] {
    if (result.status !== 'direct') {
      return [];
    }
    return (result.routes || []) as DirectRoute[];
  }

  walkDirectRoutes(result: RouteResponse): WalkDirectRoute[] {
    if (result.status !== 'walk_direct') {
      return [];
    }
    return (result.routes || []) as WalkDirectRoute[];
  }

  transferRoutes(result: RouteResponse): TransferRoute[] {
    if (result.status !== 'transfer') {
      return [];
    }
    return (result.routes || []) as TransferRoute[];
  }

  estimatedBusMinutes(route: DirectRoute): number {
    return Math.max(1, Math.round((route.nb_stops * 2)));
  }
}
