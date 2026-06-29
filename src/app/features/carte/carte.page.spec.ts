import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CartePage } from './carte.page';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { of, throwError } from 'rxjs';
import { Bus } from '../../core/models/models';
import { ModalController } from '@ionic/angular/standalone';

describe('CartePage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let storeService: StoreService;
  let geolocationMock: jasmine.SpyObj<GeolocationPlugin>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let mapDiv: HTMLDivElement;

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['getBuses']);
    const geoSpy = jasmine.createSpyObj('GeolocationPlugin', ['getCurrentPosition']);
    const modalSpy = jasmine.createSpyObj('ModalController', ['create']);

    // Create a real DOM element for the Leaflet map container
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
        { provide: ModalController, useValue: modalSpy },
        StoreService
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    storeService = TestBed.inject(StoreService);
    geolocationMock = TestBed.inject(GEOLOCATION_TOKEN) as jasmine.SpyObj<GeolocationPlugin>;
    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;

    // Default mock setups
    apiServiceSpy.getBuses.and.returnValue(of({ buses: [], total: 0, timestamp: '' }));
    modalCtrlSpy.create.and.resolveTo({ present: jasmine.createSpy('present').and.resolveTo() } as any);
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

  it('should handle db_error explicitly and clear markers', fakeAsync(() => {
    apiServiceSpy.getBuses.and.returnValue(of({ buses: [], total: 0, timestamp: '', error: 'db_error' }));

    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(component.error()).toBe('db_error');
    expect(component.activeBuses().length).toBe(0);
    expect(component['busMarkers'].size).toBe(0);
    
    component.ionViewDidLeave();
  }));

  it('should handle HTTP error gracefully', fakeAsync(() => {
    spyOn(console, 'error');
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

    expect(component.error()).toBe('Impossible de charger les positions des bus.');
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

    expect(component['map']?.getZoom()).toBe(16);
    expect(component['map']?.getCenter().lat).toBeCloseTo(14.65, 4);
    expect(component['map']?.getCenter().lng).toBeCloseTo(-17.35, 4);
    
    component.ionViewDidLeave();
  }));

  it('should destroy map and clear markers on ionViewDidLeave', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartePage);
    const component = fixture.componentInstance;
    
    component.ionViewDidEnter();
    tick(250);

    expect(component['map']).toBeTruthy();
    component.ionViewDidLeave();
    expect(component['map']).toBeNull();
  }));
});
