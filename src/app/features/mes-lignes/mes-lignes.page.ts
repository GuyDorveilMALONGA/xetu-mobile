import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { ScoreService } from '../../core/services/score.service';
import { PREFERENCES_TOKEN } from '../../core/services/preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';
import { SubscribeModalComponent } from './subscribe-modal.component';
import { firstValueFrom } from 'rxjs';

interface PendingOp {
  op: 'subscribe' | 'unsubscribe';
  ligne: string;
}

@Component({
  selector: 'app-mes-lignes',
  templateUrl: './mes-lignes.page.html',
  styleUrls: ['./mes-lignes.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class MesLignesPage implements OnInit, OnDestroy {
  private readonly apiService = inject(ApiService);
  private readonly storeService = inject(StoreService);
  private readonly sessionService = inject(SessionService);
  private readonly scoreService = inject(ScoreService);
  private readonly modalCtrl = inject(ModalController);
  private readonly preferences = inject(PREFERENCES_TOKEN);

  subscriptions = this.storeService.subscriptions;
  isOffline = signal<boolean>(!navigator.onLine);

  knownLines: string[] = [];
  lineNames: Record<string, string> = {};

  readonly scorePoints = this.scoreService.points;
  readonly scoreBadge = computed(() => this.scoreService.getBadge(this.scorePoints()));
  readonly scoreNext = computed(() => this.scoreService.getNextBadge(this.scorePoints()));
  readonly scorePct = computed(() => {
    const next = this.scoreNext();
    return next ? Math.min(Math.round((this.scorePoints() / next.min) * 100), 100) : 100;
  });
  readonly scoreStatusTitle = computed(() => {
    const badge = this.scoreBadge();
    return badge.min === 0 ? 'Nouveau contributeur' : `Contributeur ${badge.label.toLowerCase()}`;
  });
  readonly scoreRemaining = computed(() => {
    const next = this.scoreNext();
    return next ? next.min - this.scorePoints() : 0;
  });

  private onlineListener: any = null;
  private offlineListener: any = null;
  private scoreListener: any = null;

  async ngOnInit() {
    // 1. Load local cache + line names in parallel for instant boot
    await Promise.all([this.loadLocalCache(), this.loadLineNames()]);

    // 2. Register online/offline listeners
    this.registerNetworkListeners();
    this.registerScoreListener();

    // 3. Ensure session is active, then sync
    try {
      const session = await this.sessionService.ensureSession();
      if (session && session.sessionId) {
        await this.syncSubscriptions(session.sessionId);
      }
    } catch (err) {
      console.error('Failed to ensure session on mes-lignes init:', err);
    }
  }

  ngOnDestroy() {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
    }
    if (this.scoreListener) {
      window.removeEventListener('xetu-score-updated', this.scoreListener);
    }
  }

  ionViewDidEnter() {
    this.scoreService.refresh();
  }

  private registerNetworkListeners() {
    this.onlineListener = () => {
      this.isOffline.set(false);
      void this.syncAfterOnline();
    };

    this.offlineListener = () => {
      this.isOffline.set(true);
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

  private registerScoreListener() {
    this.scoreListener = () => this.scoreService.refresh();
    window.addEventListener('xetu-score-updated', this.scoreListener);
  }

  private async syncAfterOnline() {
    try {
      const session = await this.sessionService.ensureSession();
      if (session.sessionId) {
        await this.syncSubscriptions(session.sessionId);
      }
    } catch (err) {
      console.warn('Failed to sync subscriptions after reconnect:', err);
    }
  }

  /**
   * Loads the local cache from Preferences
   */
  private async loadLocalCache() {
    try {
      const { value } = await this.preferences.get({ key: 'xetu_subscriptions' });
      if (value) {
        const cached: string[] = JSON.parse(value);
        this.subscriptions.set(cached);
      }
    } catch (e) {
      console.warn('Failed to load local subscriptions cache:', e);
    }
  }

  /**
   * Saves the current subscriptions list to Preferences cache
   */
  private async saveLocalCache(list: string[]) {
    try {
      await this.preferences.set({
        key: 'xetu_subscriptions',
        value: JSON.stringify(list)
      });
    } catch (e) {
      console.warn('Failed to save subscriptions cache:', e);
    }
  }

  /**
   * Loads the real MVP line names from the embedded local index
   * (same source as itineraire.page.ts and signalement-modal.component.ts.mvpLines)
   */
  private async loadLineNames() {
    try {
      const data = await firstValueFrom(this.apiService.getLocalStopsIndex());
      const entries = Object.entries(data.lignes || {});
      this.knownLines = entries.map(([num]) => num).sort((a, b) => parseFloat(a) - parseFloat(b));
      this.lineNames = entries.reduce((acc, [num, ligne]) => {
        acc[num] = ligne.terminus_a && ligne.terminus_b ? `${ligne.terminus_a} ↔ ${ligne.terminus_b}` : `Ligne ${num}`;
        return acc;
      }, {} as Record<string, string>);
    } catch (e) {
      console.warn('Failed to load local lines index:', e);
    }
  }

  /**
   * Gets the line description from the real MVP lines index
   */
  getLineDescription(ligne: string): string {
    return this.lineNames[ligne] || `Ligne ${ligne}`;
  }

  /**
   * Synchronizes subscriptions with the backend
   */
  async syncSubscriptions(sessionId: string) {
    if (this.isOffline()) {
      return;
    }

    try {
      // Fetch current state from the server
      const res = await firstValueFrom(this.apiService.getSubscriptions(sessionId));

      // Update local state with the server's list
      this.subscriptions.set(res.lignes || []);
      await this.saveLocalCache(res.lignes || []);

      // Replay the pending queue if there are any ops
      await this.replayPendingQueue();
    } catch (err) {
      console.warn('Failed to sync subscriptions with server:', err);
    }
  }

  /**
   * Queue a pending operation and deduplicate it
   */
  private async queuePendingOp(op: 'subscribe' | 'unsubscribe', ligne: string) {
    try {
      const { value } = await this.preferences.get({ key: 'xetu_pending_subscriptions_ops' });
      let queue: PendingOp[] = value ? JSON.parse(value) : [];

      // Deduplication rule:
      // If the last op for this line is the opposite, they cancel out.
      // Otherwise, we replace or append.
      const existingIdx = queue.findIndex(item => item.ligne === ligne);
      if (existingIdx > -1) {
        const existingOp = queue[existingIdx];
        if (existingOp.op !== op) {
          // Opposite operation -> they cancel out! Remove from queue.
          queue.splice(existingIdx, 1);
        } else {
          // Same operation -> replace it.
          queue[existingIdx] = { op, ligne };
        }
      } else {
        // New operation -> append.
        queue.push({ op, ligne });
      }

      await this.preferences.set({
        key: 'xetu_pending_subscriptions_ops',
        value: JSON.stringify(queue)
      });
    } catch (e) {
      console.error('Failed to queue pending operation:', e);
    }
  }

  /**
   * Replays all pending operations in the queue
   */
  private async replayPendingQueue() {
    try {
      const { value } = await this.preferences.get({ key: 'xetu_pending_subscriptions_ops' });
      if (!value) return;

      const queue: PendingOp[] = JSON.parse(value);
      if (queue.length === 0) return;

      const remainingQueue: PendingOp[] = [];

      for (const op of queue) {
        try {
          if (op.op === 'subscribe') {
            await firstValueFrom(this.apiService.createSubscription(op.ligne));
          } else {
            await firstValueFrom(this.apiService.deleteSubscription(op.ligne));
          }
        } catch (err) {
          console.warn(`Failed to replay pending operation for line ${op.ligne}:`, err);
          if (this.shouldQueueForRetry(err)) {
            remainingQueue.push(op);
          }
        }
      }

      // Save remaining queue
      await this.preferences.set({
        key: 'xetu_pending_subscriptions_ops',
        value: JSON.stringify(remainingQueue)
      });

      // If we processed any operations, re-fetch from server to ensure state is perfectly synced
      const sessionId = this.sessionService.getSessionId();
      if (sessionId && queue.length > remainingQueue.length) {
        const res = await firstValueFrom(this.apiService.getSubscriptions(sessionId));
        this.subscriptions.set(res.lignes || []);
        await this.saveLocalCache(res.lignes || []);
      }
    } catch (e) {
      console.error('Failed to replay pending queue:', e);
    }
  }

  private shouldQueueForRetry(err: unknown): boolean {
    if (this.isOffline()) {
      return true;
    }

    const status = (err as { status?: number } | null)?.status;
    return status === undefined || status === 0 || status >= 500;
  }

  /**
   * Subscribe to a line (Optimistic UI)
   */
  async subscribe(ligne: string): Promise<boolean> {
    // 1. Optimistic UI update
    const current = this.subscriptions();
    if (!current.includes(ligne)) {
      const updated = [...current, ligne];
      this.subscriptions.set(updated);
      await this.saveLocalCache(updated);
    }

    // 2. Process API call
    if (this.isOffline()) {
      await this.queuePendingOp('subscribe', ligne);
      return true;
    }

    try {
      await this.sessionService.ensureSession();
      await firstValueFrom(this.apiService.createSubscription(ligne));
      return true;
    } catch (err) {
      if (this.shouldQueueForRetry(err)) {
        console.warn(`Failed to subscribe to line ${ligne}, queueing for retry:`, err);
        await this.queuePendingOp('subscribe', ligne);
        return true;
      }

      this.subscriptions.set(current);
      await this.saveLocalCache(current);
      console.warn(`Failed to subscribe to line ${ligne}, reverted optimistic update:`, err);
      return false;
    }
  }

  /**
   * Unsubscribe from a line (Optimistic UI)
   */
  async unsubscribe(ligne: string): Promise<boolean> {
    // 1. Optimistic UI update
    const current = this.subscriptions();
    if (current.includes(ligne)) {
      const updated = current.filter(l => l !== ligne);
      this.subscriptions.set(updated);
      await this.saveLocalCache(updated);
    }

    // 2. Process API call
    if (this.isOffline()) {
      await this.queuePendingOp('unsubscribe', ligne);
      return true;
    }

    try {
      await this.sessionService.ensureSession();
      await firstValueFrom(this.apiService.deleteSubscription(ligne));
      return true;
    } catch (err) {
      if (this.shouldQueueForRetry(err)) {
        console.warn(`Failed to unsubscribe from line ${ligne}, queueing for retry:`, err);
        await this.queuePendingOp('unsubscribe', ligne);
        return true;
      }

      this.subscriptions.set(current);
      await this.saveLocalCache(current);
      console.warn(`Failed to unsubscribe from line ${ligne}, reverted optimistic update:`, err);
      return false;
    }
  }

  /**
   * Opens the subscribe bottom-sheet modal. Toggling happens live via
   * onSubscribe/onUnsubscribe callbacks (modal stays open, mirrors
   * Dashboard/js/mylines.js _renderSubscribeLines), not via dismiss data.
   */
  async openSubscribeModal() {
    const modal = await this.modalCtrl.create({
      component: SubscribeModalComponent,
      componentProps: {
        currentSubscriptions: this.subscriptions(),
        knownLines: this.knownLines,
        lineNames: this.lineNames,
        onSubscribe: (ligne: string) => this.subscribe(ligne),
        onUnsubscribe: (ligne: string) => this.unsubscribe(ligne)
      },
      cssClass: 'subscribe-sheet-modal'
    });

    await modal.present();
  }
}
