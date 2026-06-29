import { Component, EnvironmentInjector, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { map, gitCompare, chatbubbles, list } from 'ionicons/icons';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage implements OnInit, OnDestroy {
  public environmentInjector = inject(EnvironmentInjector);
  isTabBarVisible = signal<boolean>(true);
  
  private keyboardShowListener: PluginListenerHandle | null = null;
  private keyboardHideListener: PluginListenerHandle | null = null;

  constructor() {
    addIcons({ map, gitCompare, chatbubbles, list });
  }

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
