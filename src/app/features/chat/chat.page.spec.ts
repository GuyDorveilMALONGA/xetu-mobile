import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ChatPage } from './chat.page';
import { WsService } from '../../core/services/ws.service';
import { StoreService } from '../../core/services/store.service';
import { By } from '@angular/platform-browser';

describe('ChatPage', () => {
  let wsServiceSpy: jasmine.SpyObj<WsService>;
  let storeService: StoreService;

  beforeEach(async () => {
    const wsSpy = jasmine.createSpyObj('WsService', ['sendChat']);

    await TestBed.configureTestingModule({
      imports: [ChatPage],
      providers: [
        StoreService,
        { provide: WsService, useValue: wsSpy }
      ]
    }).compileComponents();

    wsServiceSpy = TestBed.inject(WsService) as jasmine.SpyObj<WsService>;
    storeService = TestBed.inject(StoreService);
  });

  it('should create the page', () => {
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render welcome message when no messages exist', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    
    const welcome = fixture.debugElement.query(By.css('.welcome-card'));
    expect(welcome).toBeTruthy();
    expect(welcome.nativeElement.textContent).toContain('Salam ! Je suis Xëtu');
  });

  it('should render message bubbles from StoreService', () => {
    storeService.messages.set([
      { role: 'user', text: 'Hello', time: '12:00' },
      { role: 'bot', text: 'Hi *there*', time: '12:01' }
    ]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const bubbles = fixture.debugElement.queryAll(By.css('.message-bubble'));
    expect(bubbles.length).toBe(2);

    expect(bubbles[0].nativeElement.textContent).toContain('Hello');
    expect(bubbles[0].nativeElement.classList.contains('user-bubble')).toBeTrue();

    // Markdown check (Hi *there* -> Hi <strong>there</strong>)
    expect(bubbles[1].nativeElement.innerHTML).toContain('Hi <strong>there</strong>');
    expect(bubbles[1].nativeElement.classList.contains('bot-bubble')).toBeTrue();
  });

  it('should call WsService.sendChat when sending message', () => {
    storeService.wsStatus.set('open');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.composerText = 'Bus 4 ?';
    component.sendCurrentMessage();

    expect(wsServiceSpy.sendChat).toHaveBeenCalledWith('Bus 4 ?');
    expect(component.composerText).toBe('');
  });

  it('should not call WsService.sendChat if composer is empty', () => {
    storeService.wsStatus.set('open');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.composerText = '   ';
    component.sendCurrentMessage();

    expect(wsServiceSpy.sendChat).not.toHaveBeenCalled();
  });

  it('should not call WsService.sendChat if wsStatus is not open', () => {
    storeService.wsStatus.set('closed');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.composerText = 'Bus 4 ?';
    component.sendCurrentMessage();

    expect(wsServiceSpy.sendChat).not.toHaveBeenCalled();
  });

  it('should send suggestion immediately if wsStatus is open', () => {
    storeService.wsStatus.set('open');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onSuggestionClick('Bus 4 ?');
    expect(wsServiceSpy.sendChat).toHaveBeenCalledWith('Bus 4 ?');
    expect(component.composerText).toBe('');
  });

  it('should only populate composerText when clicking suggestion if wsStatus is not open', () => {
    storeService.wsStatus.set('connecting');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onSuggestionClick('Bus 4 ?');
    expect(wsServiceSpy.sendChat).not.toHaveBeenCalled();
    expect(component.composerText).toBe('Bus 4 ?');
  });

  it('should show typing indicator when chatTyping is true', () => {
    storeService.chatTyping.set(true);
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const typing = fixture.debugElement.query(By.css('.typing-bubble'));
    expect(typing).toBeTruthy();
  });

  it('should show status pill when chatStatus is set', () => {
    storeService.chatStatus.set('J\'analyse...');
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const pill = fixture.debugElement.query(By.css('.status-pill'));
    expect(pill).toBeTruthy();
    expect(pill.nativeElement.textContent).toBe('J\'analyse...');
  });
});
