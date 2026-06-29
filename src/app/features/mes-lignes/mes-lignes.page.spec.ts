import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MesLignesPage } from './mes-lignes.page';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { PREFERENCES_TOKEN } from '../../core/services/preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';
import { ModalController } from '@ionic/angular/standalone';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

describe('MesLignesPage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let storeService: StoreService;
  let preferencesMock: jasmine.SpyObj<PreferencesPlugin>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['getSubscriptions', 'createSubscription', 'deleteSubscription']);
    const sessionSpy = jasmine.createSpyObj('SessionService', ['ensureSession', 'getSessionId']);
    const prefSpy = jasmine.createSpyObj('PreferencesPlugin', ['get', 'set', 'remove']);
    const modalSpy = jasmine.createSpyObj('ModalController', ['create']);

    await TestBed.configureTestingModule({
      imports: [MesLignesPage],
      providers: [
        StoreService,
        { provide: ApiService, useValue: apiSpy },
        { provide: SessionService, useValue: sessionSpy },
        { provide: PREFERENCES_TOKEN, useValue: prefSpy },
        { provide: ModalController, useValue: modalSpy }
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;
    storeService = TestBed.inject(StoreService);
    preferencesMock = TestBed.inject(PREFERENCES_TOKEN) as jasmine.SpyObj<PreferencesPlugin>;
    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;

    // Default mock setups
    sessionServiceSpy.ensureSession.and.resolveTo({ sessionId: 'session_123', token: 'token_123' });
    sessionServiceSpy.getSessionId.and.returnValue('session_123');
    preferencesMock.get.and.resolveTo({ value: null });
    preferencesMock.set.and.resolveTo();
    apiServiceSpy.getSubscriptions.and.returnValue(of({ lignes: ['219', '4'], abonnements: [] }));
    apiServiceSpy.createSubscription.and.returnValue(of({ status: 'success', ligne: '28', arret: '' }));
    apiServiceSpy.deleteSubscription.and.returnValue(of({ status: 'success', ligne: '4', arret: '' }));
  });

  it('should create the page', () => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should call ensureSession and load cached subscriptions on init', fakeAsync(() => {
    // Mock cached subscriptions in Preferences
    preferencesMock.get.and.callFake(async ({ key }) => {
      if (key === 'xetu_subscriptions') {
        return { value: JSON.stringify(['219']) };
      }
      return { value: null };
    });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick(); // resolve promises

    expect(sessionServiceSpy.ensureSession).toHaveBeenCalled();
    expect(preferencesMock.get).toHaveBeenCalledWith({ key: 'xetu_subscriptions' });
    expect(component.subscriptions()).toContain('219');
  }));

  it('should perform optimistic UI update and call ApiService when subscribing', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    // Reset subscriptions
    component.subscriptions.set(['4']);

    component.subscribe('219');

    // Optimistic UI check (updated immediately)
    expect(component.subscriptions()).toContain('219');
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_subscriptions',
      value: JSON.stringify(['4', '219'])
    }));

    tick(); // resolve API call
    expect(apiServiceSpy.createSubscription).toHaveBeenCalledWith('219');
  }));

  it('should queue subscription operation in Preferences if API fails (offline)', fakeAsync(() => {
    spyOn(console, 'warn');
    apiServiceSpy.createSubscription.and.returnValue(throwError(() => new Error('Network error')));
    preferencesMock.get.and.resolveTo({ value: JSON.stringify([]) });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.subscriptions.set(['4']);
    component.subscribe('219');

    // Optimistic UI still updates
    expect(component.subscriptions()).toContain('219');

    tick(); // resolve failed API call

    // Verify it queued the operation
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_pending_subscriptions_ops',
      value: JSON.stringify([{ op: 'subscribe', ligne: '219' }])
    }));
  }));

  it('should rollback optimistic subscription and not queue on rejected backend errors', fakeAsync(() => {
    spyOn(console, 'warn');
    apiServiceSpy.createSubscription.and.returnValue(throwError(() => ({ status: 400 })));
    preferencesMock.get.and.resolveTo({ value: JSON.stringify([]) });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.subscriptions.set(['4']);
    component.subscribe('219');
    expect(component.subscriptions()).toContain('219');

    tick();

    expect(component.subscriptions()).toEqual(['4']);

    const pendingQueueWrites = preferencesMock.set.calls
      .allArgs()
      .filter(([arg]) => arg.key === 'xetu_pending_subscriptions_ops');
    expect(pendingQueueWrites.length).toBe(0);
  }));

  it('should perform optimistic UI update and call ApiService when unsubscribing', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.subscriptions.set(['4', '219']);

    component.unsubscribe('4');

    // Optimistic UI check
    expect(component.subscriptions()).not.toContain('4');
    expect(component.subscriptions()).toContain('219');

    tick(); // resolve API call
    expect(apiServiceSpy.deleteSubscription).toHaveBeenCalledWith('4');
  }));

  it('should deduplicate pending queue if opposite operations are added', fakeAsync(() => {
    // Start with a queue containing a subscribe op for line 219
    preferencesMock.get.and.callFake(async ({ key }) => {
      if (key === 'xetu_pending_subscriptions_ops') {
        return { value: JSON.stringify([{ op: 'subscribe', ligne: '219' }]) };
      }
      return { value: null };
    });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    // Now unsubscribe from the same line (the opposite operation)
    component.unsubscribe('219');

    tick();

    // They should cancel out and leave an empty queue!
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_pending_subscriptions_ops',
      value: JSON.stringify([])
    }));
  }));
});
