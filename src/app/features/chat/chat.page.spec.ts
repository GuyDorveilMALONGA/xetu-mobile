import { TestBed } from '@angular/core/testing';
import { ChatPage } from './chat.page';
import { WsService } from '../../core/services/ws.service';
import { StoreService } from '../../core/services/store.service';
import { By } from '@angular/platform-browser';

describe('ChatPage', () => {
  let wsServiceSpy: jasmine.SpyObj<WsService>;
  let storeService: StoreService;

  beforeEach(async () => {
    const wsSpy = jasmine.createSpyObj('WsService', ['sendChat']);
    wsSpy.sendChat.and.returnValue(true);

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

  it('should always render the static welcome bubble', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const firstBubble = fixture.debugElement.query(By.css('.chat-msg--bot .chat-bubble'));
    expect(firstBubble).toBeTruthy();
    expect(firstBubble.nativeElement.textContent).toContain('Salam !');
    expect(firstBubble.nativeElement.textContent).toContain('Xëtu');
  });

  it('should render message bubbles from StoreService after the welcome bubble', () => {
    storeService.messages.set([
      { role: 'user', text: 'Hello', time: '12:00' },
      { role: 'bot', text: 'Hi *there*', time: '12:01' }
    ]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.chat-msg'));
    // index 0 is the permanent welcome bubble, 1 and 2 are the StoreService messages
    expect(rows.length).toBe(3);

    expect(rows[1].nativeElement.classList.contains('chat-msg--user')).toBeTrue();
    expect(rows[1].nativeElement.textContent).toContain('Hello');

    expect(rows[2].nativeElement.classList.contains('chat-msg--bot')).toBeTrue();
    const botBubble = rows[2].query(By.css('.chat-bubble'));
    expect(botBubble.nativeElement.innerHTML).toContain('Hi <strong>there</strong>');
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

  it('should show a connecting status pill instead of sending if wsStatus is not open', () => {
    storeService.wsStatus.set('closed');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.composerText = 'Bus 4 ?';
    component.sendCurrentMessage();

    expect(wsServiceSpy.sendChat).not.toHaveBeenCalled();
    expect(storeService.chatStatus()).toBe('Connexion au chat en cours...');
  });

  it('should restore the composer text and show an unstable status when sendChat fails', () => {
    wsServiceSpy.sendChat.and.returnValue(false);
    storeService.wsStatus.set('open');
    const fixture = TestBed.createComponent(ChatPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.composerText = 'Bus 4 ?';
    component.sendCurrentMessage();

    expect(component.composerText).toBe('Bus 4 ?');
    expect(storeService.chatStatus()).toBe('Connexion instable. Réessaie dans un instant.');
  });

  it('should show typing indicator when chatTyping is true', () => {
    storeService.chatTyping.set(true);
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const typing = fixture.debugElement.query(By.css('.chat-typing'));
    expect(typing).toBeTruthy();
  });

  it('should show status pill when chatStatus is set', () => {
    storeService.chatStatus.set('J\'analyse...');
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();

    const pill = fixture.debugElement.query(By.css('.chat-status-pill'));
    expect(pill).toBeTruthy();
    expect(pill.nativeElement.textContent).toBe('J\'analyse...');
  });
});
