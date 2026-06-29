import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonFooter,
  IonTextarea,
  IonButton,
  IonIcon,
  IonChip,
  IonLabel,
  IonButtons
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { send } from 'ionicons/icons';
import { WsService } from '../../core/services/ws.service';
import { StoreService } from '../../core/services/store.service';
import { FormatMessagePipe } from '../../core/pipes/format-message.pipe';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonFooter,
    IonTextarea,
    IonButton,
    IonIcon,
    IonChip,
    IonLabel,
    IonButtons,
    FormatMessagePipe
  ]
})
export class ChatPage implements OnInit, OnDestroy {
  @ViewChild(IonContent, { static: false }) content!: IonContent;

  composerText = '';
  private keyboardShowSubscription: PluginListenerHandle | null = null;

  // Expose signals from StoreService
  messages = this.storeService.messages;
  wsStatus = this.storeService.wsStatus;
  chatTyping = this.storeService.chatTyping;
  chatStatus = this.storeService.chatStatus;
  chatSuggestions = this.storeService.chatSuggestions;

  constructor(
    private wsService: WsService,
    private storeService: StoreService
  ) {
    addIcons({ send });
  }

  async ngOnInit() {
    // Scroll to bottom initially when messages load/change
    this.scrollToBottom();

    // Listen to keyboard show event to scroll to bottom (experimental)
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      this.keyboardShowSubscription = await Keyboard.addListener('keyboardDidShow', () => {
        this.scrollToBottom(100);
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

  /**
   * Sends the current text in the composer
   */
  sendCurrentMessage() {
    const text = this.composerText.trim();
    if (!text || this.wsStatus() !== 'open') {
      return;
    }

    this.wsService.sendChat(text);
    this.composerText = '';
    
    // Scroll to bottom after sending
    this.scrollToBottom(100);
  }

  /**
   * Handles clicking on a contextual suggestion
   */
  onSuggestionClick(suggestion: string) {
    if (this.wsStatus() === 'open') {
      this.wsService.sendChat(suggestion);
      this.scrollToBottom(100);
    } else {
      // If WS is closed, only populate the input without sending
      this.composerText = suggestion;
    }
  }

  /**
   * Handles enter key press in the textarea
   */
  onEnterPress(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.sendCurrentMessage();
    }
  }

  /**
   * Programmatically scroll the chat content to the bottom
   */
  scrollToBottom(duration = 200) {
    // Use setTimeout to allow DOM rendering to complete
    setTimeout(() => {
      if (this.content) {
        this.content.scrollToBottom(duration).catch(err => {
          console.debug('Scroll to bottom failed or was interrupted:', err);
        });
      }
    }, 50);
  }
}
