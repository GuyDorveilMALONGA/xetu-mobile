import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import { StoreService } from './store.service';
import { WsWelcome, WsChatResponse, WsTyping, WsStatus, WsReportAck, WsError } from '../models/models';

@Injectable({
  providedIn: 'root'
})
export class WsService {
  private ws: WebSocket | null = null;
  private reconnectTry = 0;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private watchdogTimer: any = null;
  private intentionallyClosed = false;

  private readonly PING_INTERVAL_MS = 25000;
  private readonly PONG_TIMEOUT_MS = 12000;
  private readonly RECONNECT_BASE_MS = 1500;
  private readonly RECONNECT_MAX_MS = 30000;
  private readonly RECONNECT_FACTOR = 1.8;
  private readonly MAX_RECONNECT_TRIES = 10;
  private readonly SESSION_RESET_CODES = new Set([4001, 4002, 4003]);

  constructor(
    private sessionService: SessionService,
    private storeService: StoreService
  ) {}

  /**
   * Initializes the WebSocket connection.
   */
  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionallyClosed = false;
    this.storeService.wsStatus.set('connecting');

    try {
      const { sessionId, token } = await this.sessionService.ensureSession();
      if (!token) {
        console.warn('WebSocket connection skipped: no valid session token available.');
        this.storeService.wsStatus.set('failed');
        return;
      }

      const wsBaseUrl = environment.wsBase.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}/ws/${sessionId}?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (event) => this.onMessage(event);
      this.ws.onclose = (event) => this.onClose(event);
      this.ws.onerror = (error) => this.onError(error);
    } catch (err) {
      console.error('WebSocket connection setup failed:', err);
      this.scheduleReconnect();
    }
  }

  private onOpen(): void {
    console.log('WebSocket connection established.');
    this.reconnectTry = 0;
    this.storeService.wsStatus.set('open');
    this.startPingHeartbeat();
  }

  private onMessage(event: MessageEvent): void {
    this.markAlive();
    try {
      const payload = JSON.parse(event.data);
      console.log('WS message received:', payload);

      switch (payload.type) {
        case 'welcome':
          const welcome = payload as WsWelcome;
          if (welcome.suggestions && welcome.suggestions.length) {
            this.storeService.chatSuggestions.set(welcome.suggestions);
          }
          break;
        case 'chat_response':
          const chatResponse = payload as WsChatResponse;
          this.storeService.lastBotMessage.set(chatResponse.text);
          // Append message to store
          const currentMsgs = this.storeService.messages();
          this.storeService.messages.set([
            ...currentMsgs,
            { role: 'bot', text: chatResponse.text, time: this.getCurrentTime() }
          ]);
          break;
        case 'typing':
          const typing = payload as WsTyping;
          this.storeService.chatTyping.set(typing.active);
          break;
        case 'status':
          const statusMsg = payload as WsStatus;
          this.storeService.chatStatus.set(statusMsg.text);
          break;
        case 'report_ack':
          // Can be handled by features directly via event subscription or custom logic
          console.log('Report acknowledged:', payload);
          break;
        case 'error':
          const errorMsg = payload as WsError;
          console.error('WS payload error:', errorMsg.message);
          break;
        case 'pong':
          // Heartbeat pong received, watchdog is cleared by markAlive()
          break;
        default:
          console.debug('Unhandled WS message type:', payload.type);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }

  private onClose(event: CloseEvent): void {
    console.log(`WebSocket closed with code ${event.code}. Reason: ${event.reason}`);
    this.stopPingHeartbeat();
    this.storeService.wsStatus.set('closed');

    if (this.intentionallyClosed) {
      return;
    }

    if (this.SESSION_RESET_CODES.has(event.code)) {
      console.warn('Session invalid or expired. Resetting session...');
      this.sessionService.resetSession().then(() => {
        this.reconnectTry = 0;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 1000);
      });
    } else {
      this.scheduleReconnect();
    }
  }

  private onError(error: Event): void {
    console.error('WebSocket error:', error);
    this.storeService.wsStatus.set('connecting');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTry >= this.MAX_RECONNECT_TRIES) {
      console.error('Max WebSocket reconnection attempts reached.');
      this.storeService.wsStatus.set('failed');
      return;
    }

    const delay = Math.min(
      this.RECONNECT_BASE_MS * Math.pow(this.RECONNECT_FACTOR, this.reconnectTry),
      this.RECONNECT_MAX_MS
    );
    console.log(`Scheduling WS reconnect in ${delay}ms (attempt ${this.reconnectTry + 1}/${this.MAX_RECONNECT_TRIES})`);

    this.reconnectTry++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startPingHeartbeat(): void {
    this.stopPingHeartbeat();

    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      this.startWatchdog();
    }, this.PING_INTERVAL_MS);
  }

  private stopPingHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopWatchdog();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setTimeout(() => {
      console.warn('Pong timeout! No response from server. Closing connection.');
      if (this.ws) {
        this.ws.close(4000, 'Pong timeout');
      }
    }, this.PONG_TIMEOUT_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private markAlive(): void {
    this.stopWatchdog();
  }

  /**
   * Sends a raw payload to the WebSocket server.
   */
  send(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    console.warn('WebSocket is not open. Message not sent:', payload);
    return false;
  }

  sendChat(text: string): boolean {
    // Add user message to state
    const currentMsgs = this.storeService.messages();
    this.storeService.messages.set([
      ...currentMsgs,
      { role: 'user', text, time: this.getCurrentTime() }
    ]);
    return this.send({ type: 'chat', text });
  }

  sendReport(ligne: string, arret: string, observation?: string, lat?: number, lon?: number): boolean {
    return this.send({
      type: 'report',
      ligne,
      arret,
      observation,
      lat,
      lon
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopPingHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }
    this.storeService.wsStatus.set('disconnected');
  }

  private getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
