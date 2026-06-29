import { Component, OnInit, OnDestroy, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonIcon,
  IonFab,
  IonFabButton,
  IonButtons,
  ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, trash, megaphone } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { StoreService } from '../../core/services/store.service';
import { SessionService } from '../../core/services/session.service';
import { PREFERENCES_TOKEN } from '../../core/services/preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';
import { SubscribeModalComponent, LIGNE_NAMES } from './subscribe-modal.component';
import { SignalementModalComponent } from '../signalement/signalement-modal.component';
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
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    IonButtons
  ]
})
export class MesLignesPage implements OnInit, OnDestroy {
  subscriptions = this.storeService.subscriptions;
  isOffline = signal<boolean>(!navigator.onLine);

  private onlineListener: any = null;
  private offlineListener: any = null;

  constructor(
    private apiService: ApiService,
    private storeService: StoreService,
    private sessionService: SessionService,
    private modalCtrl: ModalController,
    @Inject(PREFERENCES_TOKEN) private preferences: PreferencesPlugin
  ) {
    addIcons({ add, trash, megaphone });
  }

  async openSignalement() {
    const modal = await this.modalCtrl.create({
      component: SignalementModalComponent
    });
    await modal.present();
  }

  async ngOnInit() {
    // 1. Load local cache first for instant boot
    await this.loadLocalCache();

    // 2. Register online/offline listeners
    this.registerNetworkListeners();

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
   * Gets the line description from the local dictionary
   */
  getLineDescription(ligne: string): string {
    return LIGNE_NAMES[ligne] || 'Ligne de bus Dakar';
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
  async subscribe(ligne: string) {
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
      return;
    }

    try {
      await this.sessionService.ensureSession();
      await firstValueFrom(this.apiService.createSubscription(ligne));
    } catch (err) {
      if (this.shouldQueueForRetry(err)) {
        console.warn(`Failed to subscribe to line ${ligne}, queueing for retry:`, err);
        await this.queuePendingOp('subscribe', ligne);
        return;
      }

      this.subscriptions.set(current);
      await this.saveLocalCache(current);
      console.warn(`Failed to subscribe to line ${ligne}, reverted optimistic update:`, err);
    }
  }

  /**
   * Unsubscribe from a line (Optimistic UI)
   */
  async unsubscribe(ligne: string) {
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
      return;
    }

    try {
      await this.sessionService.ensureSession();
      await firstValueFrom(this.apiService.deleteSubscription(ligne));
    } catch (err) {
      if (this.shouldQueueForRetry(err)) {
        console.warn(`Failed to unsubscribe from line ${ligne}, queueing for retry:`, err);
        await this.queuePendingOp('unsubscribe', ligne);
        return;
      }

      this.subscriptions.set(current);
      await this.saveLocalCache(current);
      console.warn(`Failed to unsubscribe from line ${ligne}, reverted optimistic update:`, err);
    }
  }

  /**
   * Opens the subscribe bottom-sheet modal
   */
  async openSubscribeModal() {
    const modal = await this.modalCtrl.create({
      component: SubscribeModalComponent,
      componentProps: {
        currentSubscriptions: this.subscriptions()
      },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data && data.action && data.ligne) {
      if (data.action === 'subscribe') {
        await this.subscribe(data.ligne);
      } else {
        await this.unsubscribe(data.ligne);
      }
    }
  }
}
