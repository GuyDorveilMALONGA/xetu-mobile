import { Component, ViewChild, ElementRef, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { WsService } from '../../core/services/ws.service';
import { StoreService } from '../../core/services/store.service';
import { FormatMessagePipe } from '../../core/pipes/format-message.pipe';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

const STATUS_LABELS: Record<string, string> = {
  open: 'Connecté',
  connecting: 'Connexion…',
  closed: 'Hors ligne',
  failed: 'Non connecté'
};

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, FormatMessagePipe]
})
export class ChatPage implements OnInit, OnDestroy {
  @ViewChild('messagesWrap') messagesWrapRef?: ElementRef<HTMLDivElement>;
  @ViewChild('composerInput') composerInputRef?: ElementRef<HTMLTextAreaElement>;

  composerText = '';
  private keyboardShowSubscription: PluginListenerHandle | null = null;

  messages = this.storeService.messages;
  wsStatus = this.storeService.wsStatus;
  chatTyping = this.storeService.chatTyping;
  chatStatus = this.storeService.chatStatus;
  statusLabel = computed(() => STATUS_LABELS[this.wsStatus()] ?? STATUS_LABELS['closed']);

  constructor(private wsService: WsService, private storeService: StoreService) {}

  async ngOnInit() {
    this.scrollToBottom();

    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      this.keyboardShowSubscription = await Keyboard.addListener('keyboardDidShow', () => {
        this.scrollToBottom();
      });
    } catch (e) {
      console.warn('Keyboard listeners not available in this environment:', e);
    }
  }

  ngOnDestroy() {
    if (this.keyboardShowSubscription) {
      void this.keyboardShowSubscription.remove();
    }
  }

  sendCurrentMessage(): void {
    const text = this.composerText.trim();
    if (!text || text.length > 500) {
      return;
    }

    if (this.wsStatus() !== 'open') {
      this.storeService.chatStatus.set('Connexion au chat en cours...');
      return;
    }

    const sent = this.wsService.sendChat(text);
    this.composerText = '';
    this.resetComposerHeight();

    if (!sent) {
      this.composerText = text;
      this.storeService.chatStatus.set('Connexion instable. Réessaie dans un instant.');
      return;
    }

    this.scrollToBottom();
  }

  onComposerInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.composerText = el.value;
    el.style.height = 'auto';
    el.style.height = Math.max(46, Math.min(el.scrollHeight, 96)) + 'px';
  }

  onEnterPress(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.sendCurrentMessage();
    }
  }

  private resetComposerHeight(): void {
    const el = this.composerInputRef?.nativeElement;
    if (el) {
      el.style.height = '46px';
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesWrapRef?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
