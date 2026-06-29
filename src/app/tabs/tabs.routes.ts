import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'carte',
        loadComponent: () =>
          import('../features/carte/carte.page').then((m) => m.CartePage),
      },
      {
        path: 'itineraire',
        loadComponent: () =>
          import('../features/itineraire/itineraire.page').then((m) => m.ItinerairePage),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('../features/chat/chat.page').then((m) => m.ChatPage),
      },
      {
        path: 'mes-lignes',
        loadComponent: () =>
          import('../features/mes-lignes/mes-lignes.page').then((m) => m.MesLignesPage),
      },
      {
        path: '',
        redirectTo: '/tabs/carte',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/carte',
    pathMatch: 'full',
  },
];
