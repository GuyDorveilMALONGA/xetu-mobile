import { Component, EnvironmentInjector, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonLabel } from '@ionic/angular/standalone';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrl: 'tabs.page.scss',
  imports: [IonTabs, IonTabBar, IonTabButton, IonLabel],
})
export class TabsPage implements OnInit, OnDestroy {
  public environmentInjector = inject(EnvironmentInjector);
  private router = inject(Router);
  isTabBarVisible = signal<boolean>(true);

  isMapPage(): boolean {
    return this.router.url.startsWith('/tabs/carte') || this.router.url === '/';
  }

  private keyboardShowListener: PluginListenerHandle | null = null;
  private keyboardHideListener: PluginListenerHandle | null = null;

  async ngOnInit() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      this.keyboardShowListener = await Keyboard.addListener('keyboardWillShow', () => {
        this.isTabBarVisible.set(false);
      });
      this.keyboardHideListener = await Keyboard.addListener('keyboardWillHide', () => {
        this.isTabBarVisible.set(true);
      });
    } catch (e) {
      console.warn('Capacitor Keyboard listeners not available in this environment:', e);
    }
  }

  ngOnDestroy() {
    if (this.keyboardShowListener) {
      void this.keyboardShowListener.remove();
    }
    if (this.keyboardHideListener) {
      void this.keyboardHideListener.remove();
    }
  }
}
