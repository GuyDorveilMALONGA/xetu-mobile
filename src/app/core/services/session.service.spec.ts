import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SessionService } from './session.service';
import { environment } from '../../../environments/environment';
import { PREFERENCES_TOKEN } from './preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';

describe('SessionService', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;
  let preferencesMock: jasmine.SpyObj<PreferencesPlugin>;

  beforeEach(() => {
    const prefSpy = jasmine.createSpyObj('PreferencesPlugin', ['get', 'set', 'remove']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SessionService,
        { provide: PREFERENCES_TOKEN, useValue: prefSpy }
      ]
    });

    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    preferencesMock = TestBed.inject(PREFERENCES_TOKEN) as jasmine.SpyObj<PreferencesPlugin>;

    // Default mock behavior: no session in storage
    preferencesMock.get.and.resolveTo({ value: null });
    preferencesMock.set.and.resolveTo();
    preferencesMock.remove.and.resolveTo();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create new session via POST if not in Preferences', fakeAsync(() => {
    const mockResponse = {
      session_id: 'web_1234567890abcdef',
      token: 'mock_token',
      expires_in: 3600
    };

    let resolvedResult: any = null;
    service.ensureSession().then(result => {
      resolvedResult = result;
    });

    // Execute get calls and yield to http request
    tick();

    const req = httpMock.expectOne(`${environment.apiBase}/api/session`);
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    // Resolve http response
    tick();

    expect(resolvedResult).toBeTruthy();
    expect(resolvedResult.sessionId).toBe(mockResponse.session_id);
    expect(resolvedResult.token).toBe(mockResponse.token);
    expect(service.getSessionId()).toBe(mockResponse.session_id);
    expect(service.getToken()).toBe(mockResponse.token);
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: 'xetu_session_id', value: mockResponse.session_id });
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: 'xetu_session_token', value: mockResponse.token });
  }));

  it('should restore session from Preferences if present', fakeAsync(() => {
    preferencesMock.get.and.callFake(async ({ key }) => {
      if (key === 'xetu_session_id') return { value: 'web_stored_id' };
      if (key === 'xetu_session_token') return { value: 'stored_token' };
      return { value: null };
    });

    let resolvedResult: any = null;
    service.ensureSession().then(result => {
      resolvedResult = result;
    });

    tick();

    expect(resolvedResult).toBeTruthy();
    expect(resolvedResult.sessionId).toBe('web_stored_id');
    expect(resolvedResult.token).toBe('stored_token');
    httpMock.expectNone(`${environment.apiBase}/api/session`);
  }));

  it('should reset session and generate a new UUID', fakeAsync(() => {
    let resolvedResult: any = null;
    service.resetSession().then(result => {
      resolvedResult = result;
    });

    tick();

    expect(resolvedResult).toBeTruthy();
    expect(resolvedResult.startsWith('web_')).toBeTrue();
    expect(resolvedResult).not.toBe('web_stored_id');
    expect(service.getToken()).toBeNull();
    expect(preferencesMock.remove).toHaveBeenCalledWith({ key: 'xetu_session_token' });
  }));

  describe('getDeviceId', () => {
    it('should derive mob_ prefix from web_ prefix', fakeAsync(() => {
      preferencesMock.get.and.callFake(async ({ key }) => {
        if (key === 'xetu_session_id') return { value: 'web_abc123' };
        if (key === 'xetu_session_token') return { value: 'token' };
        return { value: null };
      });

      let deviceId: string = '';
      service.getDeviceId().then(res => deviceId = res);
      tick();

      expect(deviceId).toBe('mob_abc123');
    }));

    it('should prepend mob_ if no prefix exists', fakeAsync(() => {
      preferencesMock.get.and.callFake(async ({ key }) => {
        if (key === 'xetu_session_id') return { value: 'abc12345' };
        if (key === 'xetu_session_token') return { value: 'token' };
        return { value: null };
      });

      let deviceId: string = '';
      service.getDeviceId().then(res => deviceId = res);
      tick();

      expect(deviceId).toBe('mob_abc12345');
    }));

    it('should keep mob_ if it already has mob_ prefix', fakeAsync(() => {
      preferencesMock.get.and.callFake(async ({ key }) => {
        if (key === 'xetu_session_id') return { value: 'mob_def567' };
        if (key === 'xetu_session_token') return { value: 'token' };
        return { value: null };
      });

      let deviceId: string = '';
      service.getDeviceId().then(res => deviceId = res);
      tick();

      expect(deviceId).toBe('mob_def567');
    }));
  });
});
