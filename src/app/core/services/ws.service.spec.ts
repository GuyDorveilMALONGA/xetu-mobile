import { TestBed } from '@angular/core/testing';
import { WsService } from './ws.service';
import { SessionService } from './session.service';
import { StoreService } from './store.service';

describe('WsService', () => {
  let service: WsService;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let storeService: StoreService;

  beforeEach(() => {
    const sessionSpy = jasmine.createSpyObj('SessionService', ['ensureSession', 'resetSession']);
    sessionSpy.ensureSession.and.returnValue(Promise.resolve({ sessionId: 'web_test', token: 'token_test' }));

    TestBed.configureTestingModule({
      providers: [
        WsService,
        StoreService,
        { provide: SessionService, useValue: sessionSpy }
      ]
    });

    service = TestBed.inject(WsService);
    sessionServiceSpy = TestBed.inject(SessionService) as jasmine.SpyObj<SessionService>;
    storeService = TestBed.inject(StoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize wsStatus as disconnected', () => {
    expect(storeService.wsStatus()).toBe('disconnected');
  });

  it('should set wsStatus to connecting on connect', async () => {
    // Override window.WebSocket with a mock constructor
    const mockWsInstance = {
      close: jasmine.createSpy('close'),
      send: jasmine.createSpy('send')
    };
    const mockWebSocketConstructor = jasmine.createSpy('WebSocket').and.returnValue(mockWsInstance);
    (window as any).WebSocket = mockWebSocketConstructor;

    await service.connect();
    expect(storeService.wsStatus()).toBe('connecting');
    expect(mockWebSocketConstructor).toHaveBeenCalled();
  });

  it('should not open a websocket when the session token is missing', async () => {
    sessionServiceSpy.ensureSession.and.returnValue(Promise.resolve({ sessionId: 'web_test', token: '' }));
    const mockWebSocketConstructor = jasmine.createSpy('WebSocket');
    (window as any).WebSocket = mockWebSocketConstructor;

    await service.connect();

    expect(storeService.wsStatus()).toBe('failed');
    expect(mockWebSocketConstructor).not.toHaveBeenCalled();
  });

  it('should not append a user chat message when the websocket send fails', () => {
    const sent = service.sendChat('Bus 4 ?');

    expect(sent).toBeFalse();
    expect(storeService.messages()).toEqual([]);
  });

  it('should append a user chat message only after websocket send succeeds', () => {
    const mockWsInstance = {
      readyState: WebSocket.OPEN,
      send: jasmine.createSpy('send')
    };
    (service as any).ws = mockWsInstance;

    const sent = service.sendChat('Bus 4 ?');

    expect(sent).toBeTrue();
    expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat', text: 'Bus 4 ?' }));
    expect(storeService.messages()).toEqual([
      jasmine.objectContaining({ role: 'user', text: 'Bus 4 ?' })
    ]);
  });
});
