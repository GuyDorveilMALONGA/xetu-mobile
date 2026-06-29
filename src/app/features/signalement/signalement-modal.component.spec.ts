import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SignalementModalComponent } from './signalement-modal.component';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { GEOLOCATION_TOKEN } from '../../core/services/geolocation.token';
import { GeolocationPlugin } from '@capacitor/geolocation';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { of, throwError } from 'rxjs';

describe('SignalementModalComponent', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let geolocationMock: jasmine.SpyObj<GeolocationPlugin>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let toastCtrlSpy: jasmine.SpyObj<ToastController>;

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['searchStops', 'getNearby', 'reportBus']);
    const sessionSpy = jasmine.createSpyObj('SessionService', ['ensureSession', 'getSessionId']);
    const geoSpy = jasmine.createSpyObj('GeolocationPlugin', ['getCurrentPosition']);
    const modalSpy = jasmine.createSpyObj('ModalController', ['dismiss']);
    const toastSpy = jasmine.createSpyObj('ToastController', ['create']);

    await TestBed.configureTestingModule({
      imports: [SignalementModalComponent],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: SessionService, useValue: sessionSpy },
        { provide: GEOLOCATION_TOKEN, useValue: geoSpy },
        { provide: ModalController, useValue: modalSpy },
        { provide: ToastController, useValue: toastSpy }
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;
    geolocationMock = TestBed.inject(GEOLOCATION_TOKEN) as jasmine.SpyObj<GeolocationPlugin>;
    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;
    toastCtrlSpy = TestBed.inject(ToastController) as jasmine.SpyObj<ToastController>;

    // Default mock setups
    sessionServiceSpy.ensureSession.and.resolveTo({ sessionId: 'session_123', token: 'token_123' });
    sessionServiceSpy.getSessionId.and.returnValue('session_123');
    apiServiceSpy.getNearby.and.returnValue(of({ status: 'success', message: '', stops: [{ nom: 'Fann', distance_m: 100, lignes: [] }] }));
    apiServiceSpy.searchStops.and.returnValue(of({ stops: [], total: 0, query: '' }));
    apiServiceSpy.reportBus.and.returnValue(of({ id: 'report_789', status: 'recorded' }));

    // Mock Geolocation plugin default behavior
    geolocationMock.getCurrentPosition.and.resolveTo({
      timestamp: Date.now(),
      coords: {
        latitude: 14.68, // Dakar (inside Senegal bounds)
        longitude: -17.45,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      } as any
    });
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should list only whitelisted MVP lines in Step 1', () => {
    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.mvpLines).toEqual(['1', '4', '6', '7', '8', '9', '10', '13', '23', '232']);
  });

  it('should advance to Step 2 when selecting a line', () => {
    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.selectLigne('4');

    expect(component.selectedLigne()).toBe('4');
    expect(component.step()).toBe(2);
  });

  it('should fetch nearby stops if GPS coords are inside Senegal bounds', fakeAsync(() => {
    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick(); // resolve geolocation promise

    expect(component.gpsCoords()).toEqual({ lat: 14.68, lon: -17.45 });
    expect(apiServiceSpy.getNearby).toHaveBeenCalledWith(14.68, -17.45);
    expect(component.nearbyStops()).toContain('Fann');
  }));

  it('should ignore GPS coords if outside Senegal bounds', fakeAsync(() => {
    spyOn(console, 'warn');
    geolocationMock.getCurrentPosition.and.resolveTo({
      timestamp: Date.now(),
      coords: {
        latitude: 48.85, // Paris (outside Senegal bounds)
        longitude: 2.35,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      } as any
    });

    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.gpsCoords()).toBeNull();
    expect(apiServiceSpy.getNearby).not.toHaveBeenCalled();
  }));

  it('should submit report with source web_geoloc and coordinates when GPS is valid', fakeAsync(() => {
    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick(); // resolve GPS

    component.selectedLigne.set('4');
    component.selectedArret.set('Fann');
    component.mode.set('dedans');
    component.observation = 'Bus plein';

    component.submitReport();
    tick(); // resolve submission

    expect(sessionServiceSpy.ensureSession).toHaveBeenCalled();
    expect(apiServiceSpy.reportBus).toHaveBeenCalledWith({
      ligne: '4',
      arret: 'Fann',
      mode: 'dedans',
      observation: 'Bus plein',
      source: 'web_geoloc',
      lat: 14.68,
      lon: -17.45
    });

    expect(component.showSuccess()).toBeTrue();

    tick(1500); // Wait for auto-dismiss timer
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith({ success: true });
  }));

  it('should submit report with source web_signal and no coordinates when GPS is invalid/null', fakeAsync(() => {
    spyOn(console, 'warn');
    geolocationMock.getCurrentPosition.and.rejectWith(new Error('Permission denied'));

    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick(); // resolve GPS rejection

    component.selectedLigne.set('4');
    component.selectedArret.set('Fann');
    component.mode.set('vu');
    component.observation = '';

    component.submitReport();
    tick();

    expect(apiServiceSpy.reportBus).toHaveBeenCalledWith({
      ligne: '4',
      arret: 'Fann',
      mode: 'vu',
      observation: null,
      source: 'web_signal'
    });
  }));

  it('should treat already_recorded status as a successful report', fakeAsync(() => {
    apiServiceSpy.reportBus.and.returnValue(of({ status: 'already_recorded' }));

    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.selectedLigne.set('4');
    component.selectedArret.set('Fann');
    component.submitReport();
    tick();

    expect(component.showSuccess()).toBeTrue();
  }));

  it('should handle 429 rate limit error and read retry_after from JSON body', fakeAsync(() => {
    spyOn(console, 'warn');
    const errorResponse = {
      status: 429,
      error: {
        error: 'Too many requests, retry in 45s',
        retry_after: 45
      }
    };
    apiServiceSpy.reportBus.and.returnValue(throwError(() => errorResponse));

    const fixture = TestBed.createComponent(SignalementModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.selectedLigne.set('4');
    component.selectedArret.set('Fann');
    component.submitReport();
    tick();

    expect(component.rateLimitCountdown()).toBe(45);

    tick(1000);
    expect(component.rateLimitCountdown()).toBe(44);

    // Clean up timer
    component.ngOnDestroy();
  }));
});
