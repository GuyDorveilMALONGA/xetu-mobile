import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { firstValueFrom, from, forkJoin, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { StopsSearchResponse, DirectRoute, WalkDirectRoute, TransferRoute } from '../../core/models/models';

type FieldKey = 'from' | 'to';
type SearchTab = 'arrets' | 'lignes';

interface StepperState {
  busMain: string;
  busSub: string;
  walk: string;
  duration: string;
}

interface DisplayStop {
  nom: string;
  lat: number | null;
  lon: number | null;
  distance_m: number | null;
  type: 'stop' | 'zone' | 'hub';
  source: string;
  lignes: Array<{ numero: string; has_recent: boolean; last_seen_min: number | null }>;
}

interface LocalStopEntry {
  lignes: string[];
  lat: number | null;
  lon: number | null;
  type?: 'zone' | 'hub';
  source?: string;
}

interface LigneInfo {
  nom: string;
  terminus_a: string;
  terminus_b: string;
}

interface LigneSearchResult {
  numero: string;
  info: LigneInfo;
}

interface LocalIndex {
  stops: Record<string, LocalStopEntry>;
  lignesInfo: Record<string, LigneInfo>;
}

const FREQ_SHORTCUTS: Array<{ from: string; to: string }> = [
  { from: 'Sandaga', to: 'Plateau' },
  { from: 'Liberté 5', to: 'Colobane' },
  { from: 'Yoff', to: 'Médina' }
];

const FALLBACK_ZONES: string[] = [
  'Sandaga', 'Plateau', 'Médina', 'Colobane', 'Fass', 'Point E', 'UCAD', 'Fann', 'HLM',
  'Grand Dakar', 'Castors', 'Dieuppeul', 'Liberté 5', 'Liberté 6', 'Sacré-Cœur',
  'Mermoz', 'Ouakam', 'Almadies', 'Yoff', 'Ngor', 'Patte d’Oie', 'Grand Yoff',
  'Parcelles Assainies', 'Cambérène', 'Pikine', 'Guédiawaye', 'Rufisque', 'Keur Massar',
  'Gare Petersen', 'Gare Lat Dior', 'Gare TER Dakar', 'Marché Tilène', 'Marché HLM',
  'Sapeur Pompier', 'Terminus Liberté 5'
];

const IDLE_STEPPER: StepperState = { busMain: '—', busSub: '', walk: '', duration: '—' };

const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizeText(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').replace(/[-'’./]/g, ' ').trim();
}

const localIndexPromises = new WeakMap<ApiService, Promise<LocalIndex>>();

function loadLocalIndex(apiService: ApiService): Promise<LocalIndex> {
  const cached = localIndexPromises.get(apiService);
  if (cached) return cached;

  const promise = (async () => {
    const stops: Record<string, LocalStopEntry> = {};
    const lignesInfo: Record<string, LigneInfo> = {};

    try {
      const mvp = await firstValueFrom(apiService.getLocalStopsIndex());
      const lignesData = mvp.lignes || {};
      Object.keys(lignesData).forEach((lid) => {
        const ligne = lignesData[lid];
        const num = String(ligne.numero || lid);
        lignesInfo[num] = {
          nom: ligne.nom || `Ligne ${num}`,
          terminus_a: ligne.terminus_a || '',
          terminus_b: ligne.terminus_b || ''
        };
        const tous = [...(ligne.arrets || []), ...(ligne.arrets_retour || [])];
        tous.forEach((a) => {
          const nom = (a.nom || '').trim();
          if (!nom) return;
          if (!stops[nom]) stops[nom] = { lignes: [], lat: a.lat ?? null, lon: a.lon ?? null };
          if (!stops[nom].lignes.includes(num)) stops[nom].lignes.push(num);
          (a.aliases_terrain || []).forEach((alias) => {
            const an = (alias || '').trim();
            if (!an || an === nom) return;
            if (!stops[an]) stops[an] = { lignes: [], lat: a.lat ?? null, lon: a.lon ?? null };
            if (!stops[an].lignes.includes(num)) stops[an].lignes.push(num);
          });
        });
      });
    } catch {
      // index local de lignes indisponible : on reste sur l'API seule
    }

    const addZone = (nom: string | undefined, lat: number | null, lon: number | null, opts: { hub: boolean; source: string }) => {
      const key = (nom || '').trim();
      if (!key) return;
      if (!stops[key]) {
        stops[key] = { lignes: [], lat, lon, type: opts.hub ? 'hub' : 'zone', source: opts.source };
        return;
      }
      if (!stops[key].type && !stops[key].lignes.length) {
        stops[key].type = opts.hub ? 'hub' : 'zone';
        stops[key].source = opts.source || stops[key].source || '';
      }
    };

    try {
      const secteurs = await firstValueFrom(apiService.getLocalSecteurs());
      (secteurs.secteurs_dakar || []).forEach((s) => {
        const lat = s.coordonnees?.latitude ?? null;
        const lon = s.coordonnees?.longitude ?? null;
        const hub = !!s.parametres_transport?.zone_hub_majeur;
        addZone(s.nom_officiel, lat, lon, { hub, source: s.commune });
        addZone(s.commune, lat, lon, { hub, source: s.nom_officiel });
        (s.points_repere || []).forEach((repere) => addZone(repere, lat, lon, { hub, source: s.nom_officiel }));
      });
    } catch {
      // secteurs indisponibles : FALLBACK_ZONES ci-dessous reste appliqué
    }

    FALLBACK_ZONES.forEach((nom) => addZone(nom, null, null, { hub: false, source: 'Zone connue' }));

    return { stops, lignesInfo };
  })();

  localIndexPromises.set(apiService, promise);
  return promise;
}

function searchStopsLocal(q: string, stops: Record<string, LocalStopEntry>): Array<LocalStopEntry & { nom: string }> {
  const qn = normalizeText(q);
  const res = Object.keys(stops)
    .filter((nom) => normalizeText(nom).includes(qn))
    .map((nom) => ({ nom, ...stops[nom] }));
  res.sort((a, b) => a.nom.localeCompare(b.nom));
  return res.slice(0, 12);
}

function searchLignesLocal(q: string, lignesInfo: Record<string, LigneInfo>): LigneSearchResult[] {
  const qn = normalizeText(q);
  const res = Object.keys(lignesInfo)
    .filter((num) => {
      const info = lignesInfo[num];
      return normalizeText(num).includes(qn)
        || normalizeText(info.nom).includes(qn)
        || normalizeText(info.terminus_a).includes(qn)
        || normalizeText(info.terminus_b).includes(qn);
    })
    .map((numero) => ({ numero, info: lignesInfo[numero] }));
  res.sort((a, b) => {
    const na = parseFloat(a.numero);
    const nb = parseFloat(b.numero);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.numero.localeCompare(b.numero);
  });
  return res.slice(0, 10);
}

function localToApiFormat(stopsRes: Array<LocalStopEntry & { nom: string }>, recentLines: string[]): DisplayStop[] {
  return stopsRes.map((r) => ({
    nom: r.nom,
    lat: r.lat,
    lon: r.lon,
    distance_m: null,
    type: r.type || 'stop',
    source: r.source || '',
    lignes: (r.lignes || []).map((numero) => ({ numero, has_recent: recentLines.includes(numero), last_seen_min: null }))
  }));
}

function mergeDisplayStops(apiStops: StopsSearchResponse['stops'], localStops: DisplayStop[]): DisplayStop[] {
  const seen = new Set<string>();
  const out: DisplayStop[] = [];
  const add = (stop: DisplayStop) => {
    const key = normalizeText(stop.nom || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(stop);
  };
  (apiStops || []).forEach((s) => add({
    nom: s.nom,
    lat: s.lat,
    lon: s.lon,
    distance_m: s.distance_m,
    type: 'stop',
    source: '',
    lignes: s.lignes || []
  }));
  localStops.forEach(add);
  return out.slice(0, 14);
}

@Component({
  selector: 'app-itineraire',
  templateUrl: './itineraire.page.html',
  styleUrls: ['./itineraire.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class ItinerairePage implements OnInit, OnDestroy {
  fromQuery = signal<string>('');
  toQuery = signal<string>('');
  activeField = signal<FieldKey | null>(null);

  searchResults = signal<DisplayStop[]>([]);
  lignesResults = signal<LigneSearchResult[]>([]);
  searchTab = signal<SearchTab>('arrets');
  isSearching = signal<boolean>(false);

  resultVisible = signal<boolean>(false);
  resFrom = signal<string>('');
  resTo = signal<string>('');
  stepper = signal<StepperState>(IDLE_STEPPER);

  freqShortcuts = FREQ_SHORTCUTS;
  showFreq = computed(() => !this.fromQuery().trim() && !this.toQuery().trim());

  private pickInProgress = false;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;
  private pickReopenTimer: ReturnType<typeof setTimeout> | null = null;
  private search$ = new Subject<string>();
  private subscriptions = new Subscription();

  constructor(private apiService: ApiService, private storeService: StoreService) {}

  ngOnInit() {
    loadLocalIndex(this.apiService);

    this.subscriptions.add(
      this.search$.pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.trim().length < 2) {
            return of({ merged: [] as DisplayStop[], lignes: [] as LigneSearchResult[] });
          }
          this.isSearching.set(true);
          const api$ = this.apiService.searchStops(query).pipe(
            catchError((err) => {
              console.warn('Stops search failed:', err);
              return of({ stops: [], total: 0, query } as StopsSearchResponse);
            })
          );
          const local$ = from(loadLocalIndex(this.apiService));
          return forkJoin({ api: api$, local: local$ }).pipe(
            map(({ api, local }) => {
              const recentLines = this.storeService.activeBuses().map((b) => String(b.ligne));
              const localStops = localToApiFormat(searchStopsLocal(query, local.stops), recentLines);
              return {
                merged: mergeDisplayStops(api.stops, localStops),
                lignes: searchLignesLocal(query, local.lignesInfo)
              };
            })
          );
        })
      ).subscribe({
        next: ({ merged, lignes }) => {
          this.searchResults.set(merged);
          this.lignesResults.set(lignes);
          this.isSearching.set(false);
        },
        error: (err) => {
          console.error('Stops search failed:', err);
          this.searchResults.set([]);
          this.lignesResults.set([]);
          this.isSearching.set(false);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    if (this.blurTimer) clearTimeout(this.blurTimer);
    if (this.pickReopenTimer) clearTimeout(this.pickReopenTimer);
  }

  @HostListener('document:mousedown', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentPointerDown(event: Event) {
    if (!this.activeField()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.itin-fields-card') || target?.closest('.itin-search-results-wrap')) return;
    this.activeField.set(null);
    this.searchResults.set([]);
    this.lignesResults.set([]);
  }

  activateField(field: FieldKey) {
    if (this.activeField() === field) return;
    this.activeField.set(field);
    this.searchTab.set('arrets');
    this.focusActiveInput(field);
    const query = field === 'from' ? this.fromQuery() : this.toQuery();
    if (query.trim().length >= 2) {
      this.search$.next(query);
    } else {
      this.searchResults.set([]);
      this.lignesResults.set([]);
    }
  }

  onFieldInput(field: FieldKey, value: string) {
    if (field === 'from') this.fromQuery.set(value);
    else this.toQuery.set(value);

    if (!value.trim()) {
      this.searchResults.set([]);
      this.lignesResults.set([]);
      return;
    }
    this.search$.next(value);
  }

  setSearchTab(tab: SearchTab) {
    this.searchTab.set(tab);
  }

  selectLigne(numero: string) {
    const field = this.activeField();
    if (!field) return;
    this.pickInProgress = true;
    this.searchTab.set('arrets');
    if (field === 'from') this.fromQuery.set(numero);
    else this.toQuery.set(numero);
    this.search$.next(numero);
    this.focusActiveInput(field);
    setTimeout(() => {
      this.pickInProgress = false;
    }, 250);
  }

  isZoneStop(stop: DisplayStop): boolean {
    return stop.type === 'zone' || stop.type === 'hub' || !stop.lignes.length;
  }

  onFieldBlur(field: FieldKey) {
    if (this.pickInProgress) return;
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = setTimeout(() => {
      if (!this.pickInProgress && this.activeField() === field) {
        this.activeField.set(null);
      }
    }, 200);
  }

  clearField(field: FieldKey, event: Event) {
    event.stopPropagation();
    if (field === 'from') this.fromQuery.set('');
    else this.toQuery.set('');
    this.activeField.set(field);
    this.focusActiveInput(field);
    this.searchResults.set([]);
    this.lignesResults.set([]);
  }

  pickStop(nom: string, event: Event) {
    event.preventDefault();
    this.pickInProgress = true;
    const field = this.activeField();

    if (field === 'from') {
      this.fromQuery.set(nom);
      this.activeField.set(null);
      this.searchResults.set([]);
      this.lignesResults.set([]);
      if (!this.toQuery().trim()) {
        this.pickReopenTimer = setTimeout(() => {
          this.activeField.set('to');
          this.focusActiveInput('to');
          this.pickInProgress = false;
        }, 150);
      } else {
        this.calcFromTo(nom, this.toQuery());
        this.pickInProgress = false;
      }
    } else if (field === 'to') {
      this.toQuery.set(nom);
      this.activeField.set(null);
      this.searchResults.set([]);
      this.lignesResults.set([]);
      if (this.fromQuery().trim()) {
        this.calcFromTo(this.fromQuery(), nom);
        this.pickInProgress = false;
      } else {
        this.pickReopenTimer = setTimeout(() => {
          this.activeField.set('from');
          this.focusActiveInput('from');
          this.pickInProgress = false;
        }, 150);
      }
    } else {
      this.pickInProgress = false;
    }
  }

  swap() {
    const from = this.fromQuery();
    this.fromQuery.set(this.toQuery());
    this.toQuery.set(from);
    this.activeField.set(null);
    this.searchResults.set([]);
    this.lignesResults.set([]);
    this.resultVisible.set(false);
  }

  selectFreq(from: string, to: string) {
    this.fromQuery.set(from);
    this.toQuery.set(to);
    this.activeField.set(null);
    this.searchResults.set([]);
    this.lignesResults.set([]);
    this.calcFromTo(from, to);
  }

  resetTrip() {
    this.resultVisible.set(false);
    this.activeField.set(null);
    this.searchResults.set([]);
    this.lignesResults.set([]);
  }

  stopHasRecent(stop: DisplayStop): boolean {
    return (stop.lignes || []).some((l) => l.has_recent);
  }

  formatDistance(meters: number | null | undefined): string {
    if (meters === null || meters === undefined) return '';
    return meters < 1000 ? `~${meters} m` : `~${(meters / 1000).toFixed(1)} km`;
  }

  formatLastSeen(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '';
    return minutes === 0 ? "à l'instant" : `il y a ${minutes} min`;
  }

  private focusActiveInput(field: FieldKey) {
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`.itin-field-input[data-field="${field}"]`);
      input?.focus();
      input?.select();
    }, 0);
  }

  async calcFromTo(from: string, to: string) {
    this.resultVisible.set(true);
    this.resFrom.set(from);
    this.resTo.set(to);
    this.stepper.set({ busMain: 'Calcul en cours...', busSub: '', walk: '', duration: '...' });

    try {
      const r = await firstValueFrom(this.apiService.getRoute(from, to));
      const status = r.status || 'not_found';
      const routes = r.routes || [];

      if (status === 'stop_not_found') {
        const which = r.which === 'origin' ? 'départ' : 'destination';
        this.stepper.set({
          busMain: `Arrêt de ${which} inconnu`,
          busSub: 'Essaie un autre nom de quartier',
          walk: '',
          duration: '-'
        });
        return;
      }

      if (status === 'same_stop') {
        this.stepper.set({
          busMain: `Tu es déjà à ${r.stop || from}`,
          busSub: '',
          walk: '',
          duration: '0 min'
        });
        return;
      }

      if (status === 'not_found' || status === 'no_transfer_not_found' || !routes.length) {
        this.stepper.set({
          busMain: 'Aucun trajet trouvé',
          busSub: 'Essaie Yango pour ce trajet',
          walk: '',
          duration: '-'
        });
        return;
      }

      const best = routes[0];

      if (status === 'direct') {
        const route = best as DirectRoute;
        this.stepper.set({
          busMain: `Ligne ${route.number} - direct`,
          busSub: `${route.nb_stops} arrêts`,
          walk: r.dest_display || to,
          duration: `~${route.nb_stops * 2} min`
        });
      } else if (status === 'walk_direct') {
        const route = best as WalkDirectRoute;
        this.stepper.set({
          busMain: `${route.walk_min || 0} min à pied → Ligne ${route.number}`,
          busSub: `Marche jusqu'à ${route.walk_stop || from} · ${route.nb_stops} arrêts`,
          walk: route.walk_dest_m > 0 ? `${route.walk_dest_min || 0} min à l'arrivée` : (r.dest_display || to),
          duration: `~${route.total_min || '?'} min`
        });
      } else if (status === 'transfer') {
        const route = best as TransferRoute;
        this.stepper.set({
          busMain: `Ligne ${route.number1} → ${route.number2}`,
          busSub: `Correspondance à ${route.transfer}`,
          walk: r.dest_display || to,
          duration: `~${route.total_min || '?'} min`
        });
      } else {
        this.stepper.set({
          busMain: 'Itinéraire trouvé',
          busSub: '',
          walk: r.dest_display || to,
          duration: '~? min'
        });
      }
    } catch (err) {
      console.warn('[Itin] Erreur API route:', err);
      this.stepper.set({
        busMain: 'Calcul impossible',
        busSub: 'Problème réseau - réessaie',
        walk: '',
        duration: '-'
      });
    }
  }
}
