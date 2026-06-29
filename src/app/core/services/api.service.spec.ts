import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { SessionService } from './session.service';
import { environment } from '../../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;

  beforeEach(() => {
    const sessionSpy = jasmine.createSpyObj('SessionService', ['getToken', 'getSessionId']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ApiService,
        { provide: SessionService, useValue: sessionSpy }
      ]
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch active buses', () => {
    const mockBusesResponse = {
      buses: [],
      total: 0,
      timestamp: new Date().toISOString()
    };

    service.getBuses().subscribe(res => {
      expect(res.total).toBe(0);
      expect(res.buses).toEqual([]);
    });

    const req = httpMock.expectOne(`${environment.apiBase}/api/buses`);
    expect(req.request.method).toBe('GET');
    req.flush(mockBusesResponse);
  });

  it('should fetch route with parameters', () => {
    service.getRoute('Yoff', 'Sandaga').subscribe();

    const req = httpMock.expectOne(request => 
      request.url === `${environment.apiBase}/api/route` &&
      request.params.get('from') === 'Yoff' &&
      request.params.get('to') === 'Sandaga'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'not_found' });
  });

  it('should include Authorization header if token exists', () => {
    sessionServiceSpy.getToken.and.returnValue('valid_mock_token');
    sessionServiceSpy.getSessionId.and.returnValue('web_123');

    service.getSubscriptions('web_123').subscribe();

    const req = httpMock.expectOne(request =>
      request.url === `${environment.apiBase}/api/subscriptions` &&
      request.params.get('session_id') === 'web_123'
    );
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid_mock_token');
    req.flush({ lignes: [], abonnements: [] });
  });
});
