import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CartePage } from './carte.page';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { MAPLIBRE_FACTORY_TOKEN, MAPLIBRE_MARKER_FACTORY_TOKEN } from '../../core/services/maplibre.token';
import { MapStyleService } from '../../core/services/map-style.service';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { of, throwError } from 'rxjs';
import { Bus } from '../../core/models/models';
import { ModalController, ToastController } from '@ionic/angular/standalone';

class FakeMapLibreMap {
  zoom: number;
  center: { lat: number; lng: number };
  layers = new Set<string>();
  layerDefs = new Map<string, any>();
  sources = new Map<string, any>();

  constructor(options: any) {
    this.zoom = options.zoom || 0;
    this.center = {
      lat: options.center?.[1] || 0,
      lng: options.center?.[0] || 0
    };
  }

  on(event: string, callback: () => void) {
    if (event === 'load') {
      callback();
    }
  }

  resize() {}
  remove() {}

  zoomIn() {
    this.zoom += 1;
  }

  zoomOut() {
    this.zoom -= 1;
  }

  jumpTo(options: any) {
    if (options.center) {
      this.center = { lat: options.center[1], lng: options.center[0] };
    }
    if (typeof options.zoom === 'number') {
      this.zoom = options.zoom;
    }
  }

  getZoom() {
    return this.zoom;
  }

  getCenter() {
    return this.center;
  }

  fitBounds(_bounds: any, options: any) {
    if (typeof options?.maxZoom === 'number') {
      this.zoom = options.maxZoom;
    }
  }

  addSource(id: string, source: any) {
    this.sources.set(id, {
      ...source,
      setData: (data: any) => {
        source.data = data;
      }
    });
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  removeSource(id: string) {
    this.sources.delete(id);
  }

  addLayer(layer: any) {
    this.layers.add(layer.id);
    this.layerDefs.set(layer.id, layer);
  }

  getLayer(id: string) {
    return this.layers.has(id) ? { id } : undefined;
  }

  removeLayer(id: string) {
    this.layers.delete(id);
    this.layerDefs.delete(id);
  }
}

class FakeMapLibreMarker {
  private element: HTMLElement;
  coords: [number, number] | null = null;

  constructor(options: any) {
    this.element = options.element;
  }

  setLngLat(coords: [number, number]) {
    this.coords = coords;
    return this;
  }

  addTo(_map: FakeMapLibreMap) {
    if (!this.element.isConnected) {
      document.body.appendChild(this.element);
    }
    return this;
  }

  remove() {
    this.element.remove();
    return this;
  }

  getElement() {
    return this.element;
  }
}

describe('CartePage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let storeService: StoreService;
  let geolocationMock: jasmine.SpyObj<GeolocationPlugin>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let toastCtrlSpy: jasmine.SpyObj<ToastController>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let mapDiv: HTMLDivElement;

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['getBuses', 'getNearby', 'getLeaderboard', 'getLocalStopsIndex', 'requestBusRefresh']);
    const geoSpy = jasmine.createSpyObj('GeolocationPlugin', ['getCurrentPosition']);
    const modalSpy = jasmine.createSpyObj('ModalController', ['create']);
    const toastSpy = jasmine.createSpyObj('ToastController', ['create']);
    const sessionSpy = jasmine.createSpyObj('SessionService', ['getSessionId', 'getToken', 'ensureSession']);

    // Create a real DOM element for the map container
    mapDiv = document.createElement('div');
    mapDiv.id = 'map';
    mapDiv.style.width = '100px';
    mapDiv.style.height = '100px';
    document.body.appendChild(mapDiv);

    await TestBed.configureTestingModule({
      imports: [CartePage],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: GEOLOCATION_TOKEN, useValue: geoSpy },
        { provide: MAPLIBRE_FACTORY_TOKEN, useValue: (options: any) => new FakeMapLibreMap(options) },
        { provide: MAPLIBRE_MARKER_FACTORY_TOKEN, useValue: (options: any) => new FakeMapLibreMarker(options) },
        { provide: MapStyleService, useValue: { getStyleUrl: () => Promise.resolve('test-style') } },
        { provide: ModalController, useValue: modalSpy },
        { provide: ToastController, useValue: toastSpy },
        { provide: SessionService, useValue: sessionSpy },
        StoreService
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    storeService = TestBed.inject(StoreService);
    geolocationMock = TestBed.inject(GEOLOCATION_TOKEN) as jasmine.SpyObj<GeolocationPlugin>;
    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;
    toastCtrlSpy = TestBed.inject(ToastController) as jasmine.SpyObj<ToastController>;
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;

    // Default mock setups
    apiServiceSpy.getBuses.and.returnValue(of({ buses: [], total: 0, timestamp: '' }));
    apiServiceSpy.getNearby.and.returnValue(of({ status: 'empty', message: '', stops: [] }));
    apiServiceSpy.getLeaderboard.and.returnValue(of({
      leaderboard: [],
      stats: { total_signalements_aujourd_hui: 0, total_signalements_all_time: 0, nb_contributeurs: 0 }
    }));
    apiServiceSpy.getLocalStopsIndex.and.returnValue(of({ lignes: {}, quartiers: [] }));
    modalCtrlSpy.create.and.resolveTo({
      present: jasmine.createSpy('present').and.resolveTo(),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({ data: { success: false } })
    } as any);
    toastCtrlSpy.create.and.resolveTo({
      present: jasmine.createSpy('present').and.resolveTo()
    } as any);
    sessionServiceSpy.ensureSession.and.resolveTo({ sessionId: 'test-session', token: 'test-token' });
    sessionServiceSpy.getSessionId.and.returnValue('test-session');
    geolocationMock.getCurrentPosition.and.resolveTo({
      timestamp: Date.now(),
      coords: {
        latitude: 14.7167,
        longitude: -17.4677,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      } as any
    });
  });

  afterEach(() => {
    // Clean up the DOM element
    if (mapDiv) {
      mapDiv.remove();
    }
    document.querySelectorAll('.xetu-line-endpoint').forEach((el) => el.remove());
  });

  it('should create the page and initialize map on ionViewDidEnter', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250); // wait for setTimeout map invalidation

    expect(component['map']).toBeTruthy();
    expect(component['map']?.getZoom()).toBe(13);
    
    component.ionViewDidLeave();
  }));

  it('should fetch user location and draw user marker on map', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(geolocationMock.getCurrentPosition).toHaveBeenCalled();
    expect(component.userLocation()).toEqual({ lat: 14.7167, lon: -17.4677 });
    expect(component['userMarker']).toBeTruthy();
    
    component.ionViewDidLeave();
  }));

  describe('relanceBus', () => {
    it('should correctly evaluate relanceAllowed', () => {
      const fixture = TestBed.createComponent(CartePage);
      const component = fixture.componentInstance;
      
      const bus: Bus = { ligne: '4', mode: 'dedans', minutes_depuis_signalement: 15, eta_disabled_reason: null } as any;
      expect(component.relanceAllowed(bus)).toBeTrue();

      const busNotDedans: Bus = { ligne: '4', mode: 'vu', minutes_depuis_signalement: 15, eta_disabled_reason: null } as any;
      expect(component.relanceAllowed(busNotDedans)).toBeFalse();

      const busTooFresh: Bus = { ligne: '4', mode: 'dedans', minutes_depuis_signalement: 5, eta_disabled_reason: null } as any;
      expect(component.relanceAllowed(busTooFresh)).toBeFalse();
    });

    it('should prevent double click via isRelancing state and show toast', fakeAsync(() => {
      const fixture = TestBed.createComponent(CartePage);
      const component = fixture.componentInstance;
      const bus: Bus = { ligne: '4', mode: 'dedans', minutes_depuis_signalement: 15, eta_disabled_reason: null } as any;
      
      apiServiceSpy.requestBusRefresh.and.returnValue(of({ status: 'cooldown', retry_after_sec: 42 }));
      
      const event = new Event('click');
      spyOn(event, 'stopPropagation');
      
      // first call
      component.relanceBus(bus, event);
      
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isRelancing('4')).toBeTrue();
      
      // second call should be ignored
      component.relanceBus(bus, event);
      
      tick(); // resolve promise
      expect(apiServiceSpy.requestBusRefresh).toHaveBeenCalledTimes(1);
      
      // Toast displayed
      expect(toastCtrlSpy.create).toHaveBeenCalledWith({
        message: 'Demande déjà envoyée, réessaie dans 42s.',
        duration: 3000,
        position: 'bottom'
      });
      
      // state reset
      expect(component.isRelancing('4')).toBeFalse();
    }));
  });

  it('should fetch buses and update store activeBuses on success', fakeAsync(() => {
    const mockBuses: Bus[] = [
      {
        ligne: '4',
        lat: 14.7,
        lon: -17.4,
        direction: 'aller',
        arret_signale: 'Fann',
        arret_estime: 'Fann',
        minutes_depuis_signalement: 2,
        mode: 'vu',
        au_terminus: false,
        repart_dans_min: null,
        confiance: { niveau: 'vert', tone: 'success', icon: 'signal-live', label: 'Bon' },
        confidence_level: 'high',
        confidence_score: 90,
        confidence_reason: '',
        confirmation_count: 1,
        direction_confidence: 'high',
        trace_progress: null,
        next_stops_eta: [],
        eta_disabled_reason: null
      }
    ];
    apiServiceSpy.getBuses.and.returnValue(of({ buses: mockBuses, total: 1, timestamp: new Date().toISOString() }));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(apiServiceSpy.getBuses).toHaveBeenCalled();
    expect(component.activeBuses()).toEqual(mockBuses);
    expect(component['busMarkers'].size).toBe(1);
    expect(component['busMarkers'].has('4')).toBeTrue();
    
    component.ionViewDidLeave();
  }));

  it('should open signalement modal from the map', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.openSignalement();
    tick();

    expect(modalCtrlSpy.create).toHaveBeenCalled();
  }));

  it('should call getBuses on successful and recorded signalement modal dismiss', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    spyOn(component, 'getBuses');

    const mockModal = {
      present: jasmine.createSpy('present').and.resolveTo(),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({ data: { success: true, recorded: true } })
    };
    modalCtrlSpy.create.and.resolveTo(mockModal as any);

    component.openSignalement();
    tick();

    expect(modalCtrlSpy.create).toHaveBeenCalled();
    expect(mockModal.present).toHaveBeenCalled();
    expect(component.getBuses).toHaveBeenCalled();
  }));

  it('should NOT call getBuses if signalement modal is dismissed without a new recording', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    spyOn(component, 'getBuses');

    const mockModal = {
      present: jasmine.createSpy('present').and.resolveTo(),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.resolveTo({ data: { success: true, recorded: false } })
    };
    modalCtrlSpy.create.and.resolveTo(mockModal as any);

    component.openSignalement();
    tick();

    expect(modalCtrlSpy.create).toHaveBeenCalled();
    expect(mockModal.present).toHaveBeenCalled();
    expect(component.getBuses).not.toHaveBeenCalled();
  }));

  it('should treat db_error as an empty community state and clear markers', fakeAsync(() => {
    apiServiceSpy.getBuses.and.returnValue(of({ buses: [], total: 0, timestamp: '', error: 'db_error' }));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(component.error()).toBeNull();
    expect(component.activeBuses().length).toBe(0);
    expect(component['busMarkers'].size).toBe(0);
    
    component.ionViewDidLeave();
  }));

  it('should handle HTTP error gracefully', fakeAsync(() => {
    spyOn(console, 'warn');
    storeService.activeBuses.set([
      {
        ligne: '4',
        lat: 14.7,
        lon: -17.4,
        direction: 'aller',
        arret_signale: 'Fann',
        arret_estime: 'Fann',
        minutes_depuis_signalement: 2,
        mode: 'vu',
        au_terminus: false,
        repart_dans_min: null,
        confiance: { niveau: 'vert', tone: 'success', icon: 'signal-live', label: 'Bon' },
        confidence_level: 'high',
        confidence_score: 90,
        confidence_reason: '',
        confirmation_count: 1,
        direction_confidence: 'high',
        trace_progress: null,
        next_stops_eta: [],
        eta_disabled_reason: null
      }
    ]);
    apiServiceSpy.getBuses.and.returnValue(throwError(() => new Error('Server error')));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(component.error()).toBeNull();
    expect(component.activeBuses().length).toBe(0);
    
    component.ionViewDidLeave();
  }));

  it('should center map on user when centerOnUser is called', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    // Initial view set in initMap is zoom 13.
    // centerOnUser should set view to zoom 15.
    component.centerOnUser();
    expect(component['map']?.getZoom()).toBe(15);
    expect(component['map']?.getCenter().lat).toBeCloseTo(14.7167, 4);
    expect(component['map']?.getCenter().lng).toBeCloseTo(-17.4677, 4);
    
    component.ionViewDidLeave();
  }));

  it('should center map on selected bus when selectBus is called', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    const bus: Bus = {
      ligne: '4',
      lat: 14.65,
      lon: -17.35,
      direction: 'aller',
      arret_signale: 'Fann',
      arret_estime: 'Fann',
      minutes_depuis_signalement: 2,
      mode: 'vu',
      au_terminus: false,
      repart_dans_min: null,
      confiance: { niveau: 'vert', tone: 'success', icon: 'signal-live', label: 'Bon' },
      confidence_level: 'high',
      confidence_score: 90,
      confidence_reason: '',
      confirmation_count: 1,
      direction_confidence: 'high',
      trace_progress: null,
      next_stops_eta: [],
      eta_disabled_reason: null
    };
    component.selectBus(bus);
    tick();

    expect(component['map']?.getZoom()).toBe(16);
    expect(component['map']?.getCenter().lat).toBeCloseTo(14.65, 4);
    expect(component['map']?.getCenter().lng).toBeCloseTo(-17.35, 4);
    
    component.ionViewDidLeave();
  }));

  it('should draw active line in green using bus direction and show departure/arrival markers', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    apiServiceSpy.getLocalStopsIndex.and.returnValue(of({
      lignes: {
        '4': {
          arrets: [
            { nom: 'Depart aller', lat: 14.1, lon: -17.1 },
            { nom: 'Arrivee aller', lat: 14.2, lon: -17.2 }
          ],
          arrets_retour: [
            { nom: 'Depart retour', lat: 14.3, lon: -17.3 },
            { nom: 'Arrivee retour', lat: 14.4, lon: -17.4 }
          ],
          geometry_aller: [[-17.1, 14.1], [-17.2, 14.2]],
          geometry_retour: [[-17.3, 14.3], [-17.4, 14.4]]
        }
      },
      quartiers: []
    }));

    component.ionViewDidEnter();
    tick(250);

    const bus: Bus = {
      ligne: '4',
      lat: 14.35,
      lon: -17.35,
      direction: 'retour',
      arret_signale: 'Depart retour',
      arret_estime: 'Depart retour',
      minutes_depuis_signalement: 2,
      mode: 'vu',
      au_terminus: false,
      repart_dans_min: null,
      confiance: { niveau: 'vert', tone: 'success', icon: 'signal-live', label: 'Bon' },
      confidence_level: 'high',
      confidence_score: 90,
      confidence_reason: '',
      confirmation_count: 1,
      direction_confidence: 'high',
      trace_progress: null,
      next_stops_eta: [],
      eta_disabled_reason: null
    };

    component.selectBus(bus);
    tick();

    const map = component['map'] as unknown as FakeMapLibreMap;
    const source = map.sources.get('xetu-active-line');
    const lineFeature = source.data.features.find((feature: any) => feature.geometry.type === 'LineString');
    const lineLayer = map.layerDefs.get('xetu-active-line-path');
    const haloLayer = map.layerDefs.get('xetu-active-line-halo');
    const endpoints = Array.from(document.querySelectorAll('.xetu-line-endpoint'));

    expect(lineFeature.geometry.coordinates).toEqual([[-17.3, 14.3], [-17.4, 14.4]]);
    expect(lineLayer.paint['line-color']).toBe('#13C978');
    expect(haloLayer.paint['line-width']).toBe(9);
    expect(endpoints.length).toBe(2);
    expect(endpoints.map((el) => el.textContent?.trim()).join(' ')).toContain('Départ');
    expect(endpoints.map((el) => el.textContent?.trim()).join(' ')).toContain('Arrivée');
    expect(endpoints[0].getAttribute('aria-label')).toContain('Depart retour');
    expect(endpoints[1].getAttribute('aria-label')).toContain('Arrivee retour');

    component.ngOnDestroy();
  }));

  it('should select the bus card when filtering by line chip, like the dashboard', () => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    const bus: Bus = {
      ligne: '4',
      lat: 14.65,
      lon: -17.35,
      direction: 'aller',
      arret_signale: 'Fann',
      arret_estime: 'Fann',
      minutes_depuis_signalement: 2,
      mode: 'vu',
      au_terminus: false,
      repart_dans_min: null,
      confiance: { niveau: 'vert', tone: 'success', icon: 'signal-live', label: 'Bon' },
      confidence_level: 'high',
      confidence_score: 90,
      confidence_reason: '',
      confirmation_count: 1,
      direction_confidence: 'high',
      trace_progress: null,
      next_stops_eta: [],
      eta_disabled_reason: null
    };

    storeService.activeBuses.set([bus]);

    component.setFilter('4');
    expect(component.activeFilter()).toBe('4');
    expect(component.selectedBusKey()).toBe('4');

    component.setFilter('4');
    expect(component.activeFilter()).toBeNull();
    expect(component.selectedBusKey()).toBeNull();
  });

  it('should not destroy map on ionViewDidLeave, but should destroy it on ngOnDestroy', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    expect(component['map']).toBeTruthy();
    component.ionViewDidLeave();
    expect(component['map']).toBeTruthy(); // Kept alive for tab switching

    component.ngOnDestroy();
    expect(component['map']).toBeNull(); // Cleaned up when page is destroyed
  }));

  it('should stop the 30s polling on ionViewDidLeave and not refetch afterwards', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    const callsBeforeLeave = apiServiceSpy.getBuses.calls.count();
    component.ionViewDidLeave();

    tick(30000);
    expect(apiServiceSpy.getBuses.calls.count()).toBe(callsBeforeLeave);
  }));

  it('should stop the 30s polling on ngOnDestroy even if ionViewDidLeave was not called', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    const callsBeforeDestroy = apiServiceSpy.getBuses.calls.count();
    component.ngOnDestroy();

    tick(30000);
    expect(apiServiceSpy.getBuses.calls.count()).toBe(callsBeforeDestroy);
  }));

  it('should refetch buses every 30s while the view stays active', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    const initialCalls = apiServiceSpy.getBuses.calls.count();
    tick(30000);
    expect(apiServiceSpy.getBuses.calls.count()).toBe(initialCalls + 1);

    component.ionViewDidLeave();
  }));

  it('should render badge.label when badge is an object, with a defensive fallback otherwise', () => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    expect(component.badgeLabel({ emoji: '🏆', label: 'Habitué', niveau: 2 })).toBe('Habitué');
    expect(component.badgeLabel('Vétéran' as any)).toBe('Vétéran');
    expect(component.badgeLabel(undefined as any)).toBe('Contributeur');
  });

  it('should escape line numbers before injecting marker HTML', () => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance as any;

    expect(component.escapeHtml('4<script>"x"&</script>')).toBe('4&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;');
  });

  it('should not expose API errors in the user-facing bus-list state', fakeAsync(() => {
    apiServiceSpy.getBuses.and.returnValue(of({ buses: [], total: 0, timestamp: '', error: 'db_error' }));
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).not.toContain('db_error');
    expect(text).not.toContain('Réessayer');
    expect(text).toContain('Aucun bus actif. Le dernier signal');

    component.ionViewDidLeave();
  }));

  it('should show the welcome message only once per page session, using the already-captured position', fakeAsync(() => {
    apiServiceSpy.getNearby.and.returnValue(of({
      status: 'success',
      message: '',
      stops: [{ nom: 'Fann', distance_m: 80, lignes: ['4', '7'] }]
    }));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    expect(geolocationMock.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(apiServiceSpy.getNearby).toHaveBeenCalledTimes(1);
    expect(component.welcomeMessage()).toContain('Fann');

    component.dismissWelcome();
    component.ionViewDidLeave();

    // Re-entering the page should not show the welcome message again.
    component.ionViewDidEnter();
    tick(250);

    expect(geolocationMock.getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(apiServiceSpy.getNearby).toHaveBeenCalledTimes(1);
    expect(component.welcomeMessage()).toBeNull();

    component.ionViewDidLeave();
  }));

  it('should not block the map when getNearby fails', fakeAsync(() => {
    apiServiceSpy.getNearby.and.returnValue(throwError(() => new Error('network error')));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    expect(component['map']).toBeTruthy();
    expect(component.welcomeMessage()).toBeNull();

    component.ionViewDidLeave();
  }));

  it('should zoom in and zoom out of the map', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    component.ionViewDidEnter();
    tick(250);

    const initialZoom = component['map']?.getZoom() || 13;
    component.zoomIn();
    expect(component['map']?.getZoom()).toBe(initialZoom + 1);

    component.zoomOut();
    expect(component['map']?.getZoom()).toBe(initialZoom);

    component.ionViewDidLeave();
  }));

  it('should color bus freshness green until 3 minutes, yellow until 5, then red', () => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;

    expect(component.freshnessColor(3)).toBe('#00D67F');
    expect(component.freshnessColor(4)).toBe('#FFD166');
    expect(component.freshnessColor(5)).toBe('#FFD166');
    expect(component.freshnessColor(6)).toBe('#FF4757');
    expect(component.getFreshnessClass(3)).toBe('age-fresh');
    expect(component.getFreshnessClass(4)).toBe('age-ok');
    expect(component.getFreshnessClass(6)).toBe('age-old');
  });

  it('should cycle panel height when togglePanel is called', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(800);
    const snapBas = Math.max(180, Math.round(800 * 0.28)); // 224
    const snapMilieu = Math.round(800 * 0.50); // 400
    const snapHaut = Math.round(800 * 0.85); // 680

    component.ngOnInit();
    expect(component.panelHeight()).toBe(snapBas);

    component.togglePanel();
    expect(component.panelHeight()).toBe(snapMilieu);

    component.togglePanel();
    expect(component.panelHeight()).toBe(snapHaut);

    component.togglePanel();
    expect(component.panelHeight()).toBe(snapBas);
  }));

  it('should handle pointer drag start, move, and end', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(800);
    
    component.ngOnInit();
    expect(component.panelHeight()).toBe(224);

    const dragEl = document.createElement('div');
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientY: 500,
      pointerId: 1
    });
    spyOn(pointerDownEvent, 'preventDefault');
    spyOn(dragEl, 'setPointerCapture');

    // Simulate drag start
    Object.defineProperty(pointerDownEvent, 'currentTarget', { value: dragEl });
    Object.defineProperty(pointerDownEvent, 'target', { value: dragEl });
    component.onDragStart(pointerDownEvent);

    expect(component.isDragging()).toBeTrue();
    expect(pointerDownEvent.preventDefault).toHaveBeenCalled();
    expect(dragEl.setPointerCapture).toHaveBeenCalledWith(1);

    // Simulate drag move: drag up by 100px (clientY from 500 to 400)
    document.dispatchEvent(new PointerEvent('pointermove', {
      clientY: 400
    }));
    expect(component.panelHeight()).toBe(324); // 224 + 100

    // Simulate drag end
    spyOn(dragEl, 'releasePointerCapture');
    document.dispatchEvent(new PointerEvent('pointerup'));

    expect(component.isDragging()).toBeFalse();
    expect(dragEl.releasePointerCapture).toHaveBeenCalledWith(1);
    // Should snap to nearest snap height (324 is closer to 400 than to 224)
    expect(component.panelHeight()).toBe(400); // snapped to snapMilieu
  }));

  it('should suppress click toggle after dragging the grabber', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(800);
    spyOn(component, 'togglePanel').and.callThrough();

    component.ngOnInit();
    expect(component.panelHeight()).toBe(224);

    const dragEl = document.createElement('div');
    const pointerDownEvent = new PointerEvent('pointerdown', { clientY: 500, pointerId: 1 });
    Object.defineProperty(pointerDownEvent, 'currentTarget', { value: dragEl });
    Object.defineProperty(pointerDownEvent, 'target', { value: dragEl });
    spyOn(dragEl, 'setPointerCapture');
    
    component.onDragStart(pointerDownEvent);
    
    // Move significantly (100px)
    document.dispatchEvent(new PointerEvent('pointermove', { clientY: 400 }));
    document.dispatchEvent(new PointerEvent('pointerup'));
    
    // Simulate trailing click event
    component.togglePanel();

    // Height should remain 400 (the snapped height), not cycled to 680
    expect(component.togglePanel).toHaveBeenCalled();
    expect(component.panelHeight()).toBe(400);
  }));
});
