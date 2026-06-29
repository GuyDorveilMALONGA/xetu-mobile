import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MesLignesPage } from './mes-lignes.page';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { ScoreService } from '../../core/services/score.service';
import { PREFERENCES_TOKEN } from '../../core/services/preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';
import { ModalController } from '@ionic/angular/standalone';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

// Fixture mirroring the real shape of assets/data/xetu_mvp.json (10 real MVP lines)
const MVP_LINES_FIXTURE = {
  version: 'mvp-1.0',
  generated: '2026-03-30',
  description: 'Xëtu MVP — 10 lignes Dem Dikk Dakar',
  lignes: {
    '4': { numero: '4', nom: 'Ligne 4', terminus_a: 'Liberté 5', terminus_b: 'Place Leclerc' },
    '23': { numero: '23', nom: 'Ligne 23', terminus_a: 'Parcelles Assainies', terminus_b: 'Palais 1' }
  }
};

describe('MesLignesPage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let storeService: StoreService;
  let scoreService: ScoreService;
  let preferencesMock: jasmine.SpyObj<PreferencesPlugin>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', [
      'getSubscriptions',
      'createSubscription',
      'deleteSubscription',
      'getLocalStopsIndex'
    ]);
    const sessionSpy = jasmine.createSpyObj('SessionService', ['ensureSession', 'getSessionId']);
    const prefSpy = jasmine.createSpyObj('PreferencesPlugin', ['get', 'set', 'remove']);
    const modalSpy = jasmine.createSpyObj('ModalController', ['create']);

    await TestBed.configureTestingModule({
      imports: [MesLignesPage],
      providers: [
        StoreService,
        ScoreService,
        { provide: ApiService, useValue: apiSpy },
        { provide: SessionService, useValue: sessionSpy },
        { provide: PREFERENCES_TOKEN, useValue: prefSpy },
        { provide: ModalController, useValue: modalSpy }
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;
    storeService = TestBed.inject(StoreService);
    scoreService = TestBed.inject(ScoreService);
    preferencesMock = TestBed.inject(PREFERENCES_TOKEN) as jasmine.SpyObj<PreferencesPlugin>;
    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;

    // Default mock setups
    sessionServiceSpy.ensureSession.and.resolveTo({ sessionId: 'session_123', token: 'token_123' });
    sessionServiceSpy.getSessionId.and.returnValue('session_123');
    preferencesMock.get.and.resolveTo({ value: null });
    preferencesMock.set.and.resolveTo();
    apiServiceSpy.getLocalStopsIndex.and.returnValue(of(MVP_LINES_FIXTURE as any));
    apiServiceSpy.getSubscriptions.and.returnValue(of({ lignes: ['23', '4'], abonnements: [] }));
    apiServiceSpy.createSubscription.and.returnValue(of({ status: 'success', ligne: '23', arret: '' }));
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
        return { value: JSON.stringify(['23']) };
      }
      return { value: null };
    });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick(); // resolve promises

    expect(sessionServiceSpy.ensureSession).toHaveBeenCalled();
    expect(preferencesMock.get).toHaveBeenCalledWith({ key: 'xetu_subscriptions' });
    expect(component.subscriptions()).toContain('23');
  }));

  it('should derive real MVP line descriptions from the local lines index, not a hardcoded dictionary', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.knownLines).toEqual(['4', '23']);
    expect(component.getLineDescription('4')).toBe('Liberté 5 ↔ Place Leclerc');
    expect(component.getLineDescription('999')).toBe('Ligne 999');
  }));

  it('should perform optimistic UI update and call ApiService when subscribing', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    // Reset subscriptions
    component.subscriptions.set(['4']);

    component.subscribe('23');

    // Optimistic UI check (updated immediately)
    expect(component.subscriptions()).toContain('23');
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_subscriptions',
      value: JSON.stringify(['4', '23'])
    }));

    tick(); // resolve API call
    expect(apiServiceSpy.createSubscription).toHaveBeenCalledWith('23');
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
    component.subscribe('23');

    // Optimistic UI still updates
    expect(component.subscriptions()).toContain('23');

    tick(); // resolve failed API call

    // Verify it queued the operation
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_pending_subscriptions_ops',
      value: JSON.stringify([{ op: 'subscribe', ligne: '23' }])
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
    component.subscribe('23');
    expect(component.subscriptions()).toContain('23');

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

    component.subscriptions.set(['4', '23']);

    component.unsubscribe('4');

    // Optimistic UI check
    expect(component.subscriptions()).not.toContain('4');
    expect(component.subscriptions()).toContain('23');

    tick(); // resolve API call
    expect(apiServiceSpy.deleteSubscription).toHaveBeenCalledWith('4');
  }));

  it('should deduplicate pending queue if opposite operations are added', fakeAsync(() => {
    // Start with a queue containing a subscribe op for line 23
    preferencesMock.get.and.callFake(async ({ key }) => {
      if (key === 'xetu_pending_subscriptions_ops') {
        return { value: JSON.stringify([{ op: 'subscribe', ligne: '23' }]) };
      }
      return { value: null };
    });

    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    // Now unsubscribe from the same line (the opposite operation)
    component.unsubscribe('23');

    tick();

    // They should cancel out and leave an empty queue!
    expect(preferencesMock.set).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'xetu_pending_subscriptions_ops',
      value: JSON.stringify([])
    }));
  }));

  it('should render without any Ionic header/toolbar chrome (hand-rolled screen)', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    fixture.detectChanges();
    tick();

    expect(fixture.debugElement.query(By.css('ion-header'))).toBeNull();
    expect(fixture.debugElement.query(By.css('ion-toolbar'))).toBeNull();
    expect(fixture.debugElement.query(By.css('ion-fab'))).toBeNull();
  }));

  it('should always show the persistent subscribe CTA, even with no subscriptions', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.subscriptions.set([]);
    fixture.detectChanges();

    const cta = fixture.debugElement.query(By.css('.btn-subscribe'));
    expect(cta).toBeTruthy();
    expect(cta.nativeElement.textContent).toContain("S'abonner à une ligne");

    const emptyIcon = fixture.debugElement.query(By.css('.mylines-empty-icon--bell'));
    expect(emptyIcon).toBeTruthy();
    expect(emptyIcon.nativeElement.textContent.trim()).toBe('');
  }));

  it('should render the score card with the current score points and no invented week/rank data', fakeAsync(() => {
    const fixture = TestBed.createComponent(MesLignesPage);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const statVals = fixture.debugElement.queryAll(By.css('.score-stat-val'));
    expect(statVals.length).toBe(3);
    expect(statVals[0].nativeElement.textContent.trim()).toBe(String(scoreService.points()));
    expect(statVals[1].nativeElement.textContent.trim()).toBe('—');
    expect(statVals[2].nativeElement.textContent.trim()).toBe('—');
  }));
});
