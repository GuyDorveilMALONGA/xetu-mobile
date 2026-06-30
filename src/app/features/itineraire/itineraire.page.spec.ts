import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ItinerairePage } from './itineraire.page';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { firstValueFrom, from, forkJoin, Subject, Subscription, of, NEVER, throwError } from 'rxjs';
import { RouteResponse, StopsSearchResponse } from '../../core/models/models';

describe('ItinerairePage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let storeService: StoreService;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('ApiService', ['searchStops', 'getRoute', 'getLocalStopsIndex', 'getLocalSecteurs']);

    await TestBed.configureTestingModule({
      imports: [ItinerairePage],
      providers: [
        { provide: ApiService, useValue: spy }
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    storeService = TestBed.inject(StoreService);

    const stopsResponse: StopsSearchResponse = {
      stops: [{ nom: 'Fann', lat: 14.6, lon: -17.4, distance_m: null, lignes: [] }],
      total: 1,
      query: 'Fa'
    };
    apiServiceSpy.searchStops.and.returnValue(of(stopsResponse));
    apiServiceSpy.getLocalStopsIndex.and.returnValue(of({ lignes: {} }));
    apiServiceSpy.getLocalSecteurs.and.returnValue(of({ secteurs_dakar: [] }));
    storeService.activeBuses.set([]);
  });

  it('should create the page', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should search after debounce when a field is activated with an existing query', fakeAsync(() => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fa');
    component.activateField('from');
    tick(280);

    expect(apiServiceSpy.searchStops).toHaveBeenCalledWith('Fa');
    expect(component.searchResults()[0].nom).toBe('Fann');
  }));

  it('should not re-activate an already active field', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.activateField('from');
    component.activateField('from');

    expect(component.activeField()).toBe('from');
  });

  it('should focus the rendered input when activating a field', fakeAsync(() => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.activateField('from');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.itin-field-input[data-field="from"]');
    expect(input).toBeTruthy();
    const focusSpy = spyOn(input!, 'focus');
    const selectSpy = spyOn(input!, 'select');

    tick();

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  }));

  it('should debounce search on input typing', fakeAsync(() => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onFieldInput('from', 'Fa');
    expect(apiServiceSpy.searchStops).not.toHaveBeenCalled();

    tick(280);
    expect(apiServiceSpy.searchStops).toHaveBeenCalledWith('Fa');
  }));

  it('should keep the search stream alive after a search API error', fakeAsync(() => {
    apiServiceSpy.searchStops.and.returnValues(
      throwError(() => new Error('network down')),
      of({ stops: [{ nom: 'Colobane', lat: 14.6, lon: -17.4, distance_m: null, lignes: [] }], total: 1, query: 'Co' })
    );

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onFieldInput('from', 'Fa');
    tick(280);

    // L'API a échoué mais l'index local (FALLBACK_ZONES) reste disponible : le flux ne casse pas.
    expect(component.isSearching()).toBeFalse();

    component.onFieldInput('from', 'Co');
    tick(280);

    expect(apiServiceSpy.searchStops).toHaveBeenCalledTimes(2);
    expect(component.searchResults()[0].nom).toBe('Colobane');
  }));

  it('should merge API and local stops with API result taking priority on duplicate names', fakeAsync(() => {
    apiServiceSpy.searchStops.and.returnValue(of({
      stops: [{ nom: 'Fann', lat: 14.7, lon: -17.45, distance_m: 45, lignes: [{ numero: '4', has_recent: false, last_seen_min: null }] }],
      total: 1,
      query: 'Fann'
    }));
    apiServiceSpy.getLocalStopsIndex.and.returnValue(of({
      lignes: {
        '13': {
          numero: '13',
          nom: 'Ligne 13',
          terminus_a: 'Dieuppeul',
          terminus_b: 'Palais',
          arrets: [{ nom: 'Fann', lat: 1, lon: 1, aliases_terrain: [] }],
          arrets_retour: []
        }
      }
    }));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onFieldInput('from', 'Fann');
    tick(280);
    flushMicrotasks();
    tick();

    const fann = component.searchResults().find((stop) => stop.nom === 'Fann');
    expect(fann?.distance_m).toBe(45);
    expect(fann?.lat).toBe(14.7);
    expect(fann?.lignes.map((ligne) => ligne.numero)).toEqual(['4']);
  }));

  it('should surface local secteur hubs as zone results when the API has no match', fakeAsync(() => {
    apiServiceSpy.searchStops.and.returnValue(of({ stops: [], total: 0, query: 'Mamelles' }));
    apiServiceSpy.getLocalSecteurs.and.returnValue(of({
      secteurs_dakar: [{
        nom_officiel: 'Mamelles',
        commune: 'Ouakam',
        coordonnees: { latitude: 14.73, longitude: -17.49 },
        parametres_transport: { zone_hub_majeur: true },
        points_repere: []
      }]
    }));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onFieldInput('from', 'Mamelles');
    tick(280);
    flushMicrotasks();
    tick();

    const mamelles = component.searchResults()[0];
    expect(mamelles.nom).toBe('Mamelles');
    expect(mamelles.type).toBe('hub');
    expect(mamelles.source).toBe('Ouakam');
    expect(component.isZoneStop(mamelles)).toBeTrue();
  }));

  it('should show line results and reinject a selected line without calculating a route', fakeAsync(() => {
    apiServiceSpy.searchStops.and.returnValue(of({ stops: [], total: 0, query: '13' }));
    apiServiceSpy.getLocalStopsIndex.and.returnValue(of({
      lignes: {
        '13': {
          numero: '13',
          nom: 'Ligne 13',
          terminus_a: 'Gare DIEUPPEUL',
          terminus_b: 'Gare PALAIS 2',
          arrets: [{ nom: 'Ouakam', lat: 14.72, lon: -17.48, aliases_terrain: [] }],
          arrets_retour: []
        }
      }
    }));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.activateField('from');
    component.onFieldInput('from', '13');
    tick(280);
    flushMicrotasks();
    tick();

    expect(component.lignesResults()[0].numero).toBe('13');

    component.setSearchTab('lignes');
    component.selectLigne('13');
    tick(250);

    expect(component.fromQuery()).toBe('13');
    expect(component.searchTab()).toBe('arrets');
    expect(component.activeField()).toBe('from');
    expect(apiServiceSpy.getRoute).not.toHaveBeenCalled();
  }));

  it('should pick a stop for "from" and auto-activate "to" when empty', fakeAsync(() => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.activateField('from');
    component.pickStop('Fann', new Event('mousedown'));

    expect(component.fromQuery()).toBe('Fann');
    expect(component.activeField()).toBeNull();

    tick(150);
    expect(component.activeField()).toBe('to');
  }));

  it('should pick a stop for "to" and immediately calculate when "from" is filled', fakeAsync(() => {
    const mockResponse: RouteResponse = {
      status: 'direct',
      routes: [
        { number: '219', name: 'Express AIBD', terminus_a: 'Dakar', terminus_b: 'AIBD', stops: ['Fann', 'Leclerc'], nb_stops: 2, score: 95 }
      ]
    };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponse));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.activateField('to');
    component.pickStop('Leclerc', new Event('mousedown'));
    tick();

    expect(apiServiceSpy.getRoute).toHaveBeenCalledWith('Fann', 'Leclerc');
    expect(component.resultVisible()).toBeTrue();
  }));

  it('should swap departure and arrival values and hide any visible result', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Leclerc');
    component.resultVisible.set(true);

    component.swap();

    expect(component.fromQuery()).toBe('Leclerc');
    expect(component.toQuery()).toBe('Fann');
    expect(component.resultVisible()).toBeFalse();
  });

  it('should fill both fields and calculate when a frequent destination is selected', fakeAsync(() => {
    const mockResponse: RouteResponse = { status: 'direct', routes: [
      { number: '7', name: 'Ligne 7', terminus_a: 'Sandaga', terminus_b: 'Plateau', stops: [], nb_stops: 3, score: 90 }
    ] };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponse));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.selectFreq('Sandaga', 'Plateau');
    tick();

    expect(component.fromQuery()).toBe('Sandaga');
    expect(component.toQuery()).toBe('Plateau');
    expect(apiServiceSpy.getRoute).toHaveBeenCalledWith('Sandaga', 'Plateau');
  }));

  it('should reset trip visibility but preserve search queries on resetTrip', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Leclerc');
    component.resultVisible.set(true);

    component.resetTrip();

    expect(component.resultVisible()).toBeFalse();
    expect(component.fromQuery()).toBe('Fann');
    expect(component.toQuery()).toBe('Leclerc');
  });

  describe('calcFromTo result branches', () => {
    function setup() {
      const fixture = TestBed.createComponent(ItinerairePage);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      return component;
    }

    it('renders a direct route in the stepper', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({
        status: 'direct',
        dest_display: 'Leclerc',
        routes: [{ number: '219', name: 'Express AIBD', terminus_a: 'Dakar', terminus_b: 'AIBD', stops: [], nb_stops: 4, score: 95 }]
      } as RouteResponse));

      const component = setup();
      component.calcFromTo('Fann', 'Leclerc');
      tick();

      expect(component.stepper().busMain).toBe('Ligne 219 - direct');
      expect(component.stepper().busSub).toBe('4 arrêts');
      expect(component.stepper().duration).toBe('~8 min');
    }));

    it('renders a walk_direct route in the stepper', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({
        status: 'walk_direct',
        dest_display: 'Leclerc',
        routes: [{
          number: '4', name: 'Ligne 4', walk_stop: 'Colobane', walk_dist_m: 300, walk_min: 5,
          stops: [], nb_stops: 2, walk_dest_m: 100, walk_dest_min: 2, total_min: 15, score: 80, zone: 1
        }]
      } as RouteResponse));

      const component = setup();
      component.calcFromTo('Fann', 'Leclerc');
      tick();

      expect(component.stepper().busMain).toBe('5 min à pied → Ligne 4');
      expect(component.stepper().busSub).toBe("Marche jusqu'à Colobane · 2 arrêts");
      expect(component.stepper().walk).toBe("2 min à l'arrivée");
      expect(component.stepper().duration).toBe('~15 min');
    }));

    it('renders a transfer route in the stepper', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({
        status: 'transfer',
        dest_display: 'Colobane',
        routes: [{
          number1: '4', name1: 'Ligne 4', stops1: [], transfer: 'Centenaire',
          number2: '13', name2: 'Ligne 13', stops2: [], nb_stops: 10, total_min: 26, score: 1560
        }]
      } as RouteResponse));

      const component = setup();
      component.calcFromTo('Liberte 6', 'Colobane');
      tick();

      expect(component.stepper().busMain).toBe('Ligne 4 → 13');
      expect(component.stepper().busSub).toBe('Correspondance à Centenaire');
      expect(component.stepper().duration).toBe('~26 min');
    }));

    it('renders same_stop message', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({ status: 'same_stop', stop: 'Fann' } as RouteResponse));

      const component = setup();
      component.calcFromTo('Fann', 'Fann');
      tick();

      expect(component.stepper().busMain).toBe('Tu es déjà à Fann');
      expect(component.stepper().duration).toBe('0 min');
    }));

    it('renders stop_not_found message with the correct field', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({ status: 'stop_not_found', which: 'origin' } as RouteResponse));

      const component = setup();
      component.calcFromTo('Inconnu', 'Leclerc');
      tick();

      expect(component.stepper().busMain).toBe('Arrêt de départ inconnu');
    }));

    it('renders not_found message', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(of({ status: 'not_found', routes: [] } as RouteResponse));

      const component = setup();
      component.calcFromTo('Fann', 'Leclerc');
      tick();

      expect(component.stepper().busMain).toBe('Aucun trajet trouvé');
    }));

    it('renders a network error message when the API call throws', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(throwError(() => new Error('network down')));

      const component = setup();
      component.calcFromTo('Fann', 'Leclerc');
      tick();

      expect(component.stepper().busMain).toBe('Impossible de calculer l\'itinéraire');
      expect(component.stepper().busSub).toBe('Veuillez vérifier votre connexion ou modifier le trajet');
    }));

    it('cancels the loader and shows error when API never responds (timeout)', fakeAsync(() => {
      apiServiceSpy.getRoute.and.returnValue(NEVER);

      const component = setup();
      component.calcFromTo('Fann', 'Leclerc');
      
      expect(component.stepper().busMain).toBe('Calcul en cours...');

      tick(10000); // 10s timeout
      
      expect(component.stepper().busMain).toBe('Impossible de calculer l\'itinéraire');
      expect(component.stepper().busSub).toBe('Veuillez vérifier votre connexion ou modifier le trajet');
    }));
  });
});
