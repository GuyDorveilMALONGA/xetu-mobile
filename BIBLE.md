# Xetu Mobile Bible

Date: 2026-06-29  
Repo: `C:\Users\DELL\Desktop\xetu-mobile`  
Status: **Ionic 8 + Angular 20 + Capacitor 8.x** (Active Integration)

## 1. Constitution

Xetu Mobile is the native iOS/Android application for Xetu. It is built using **Ionic 8**, **Angular 20 (Standalone)**, and **Capacitor 8.x**.

The application is being migrated from a simple WebView wrapper to a fully native-like shell. It replicates the features of the original Xetu PWA (`whatsapp-agent/Dashboard/`) tab-by-tab using a progressive strangler pattern:
- **Carte** (Home Map + Bottom Sheet)
- **Itinéraire** (Route Search)
- **Chat IA** (WebSocket Agent Chat)
- **Mes lignes** (Subscriptions & Score)

The backend (`whatsapp-agent`, FastAPI + Supabase, hosted on Railway) remains the sole source of truth. The mobile app contains **no business logic**; it is a pure client consuming the backend REST and WebSocket APIs.

## 2. La loi produit

Xetu livre une vérité (où est le bus), pas une prédiction (quand il arrive).

- Le cœur = localisation honnête : ligne, dernier arrêt vu, sens, fraîcheur ("vu il y a N min"), prochains arrêts dans l'ordre.
- L'usager habitué estime son temps lui-même dès qu'il sait où est le bus. L'app ne le fait pas à sa place.
- L'ETA / l'état ne sont PAS le cœur. Au mieux un indice optionnel, toujours étiqueté "estimation", jamais affiché comme sûr.
- Règle d'or : un marqueur absent vaut mieux qu'un marqueur au mauvais endroit. On ne ment jamais sur la position.
- Métrique qui compte : la fraîcheur du dernier-vu par ligne. Signalement, notif, leaderboard servent à la maintenir fraîche.

## 3. Non-négociables

- **Repo mobile séparé** : aucun code ou logique métier backend copié dans `xetu-mobile`.
- **Zéro Expo/React Native** : La coque historique React Native + Expo WebView est entièrement supprimée.
- **Contrats API stables** : Types TypeScript dérivés du backend réel (définis dans `src/app/core/models/models.ts`).
- **Pas de secret dans git** : `.env`, clés API, et keystores restent hors du dépôt.
- **Bâtir avec de bonnes abstractions** : Toute intégration système (ex: Capacitor Preferences) doit utiliser des abstractions injectables via Angular DI (ex: `PREFERENCES_TOKEN`) pour garantir la testabilité.

## 4. Architecture

### Navigation & Pages
- **`app.routes.ts`** & **`tabs.routes.ts`** : Gèrent les routes de l'application en standalone avec chargement différé (*lazy-loading*) obligatoire pour toutes les pages.
- **`TabsPage`** : Utilise les composants `ion-tabs` et `ion-tab-bar` (style pilule comme la PWA).

### Core Services
- **`StoreService`** : Fournit un état partagé et réactif via les *Angular Signals* (`wsStatus`, `messages`, `activeBuses`, `subscriptions`, `userScore`, etc.).
- **`SessionService`** : Gère la création de session anonyme via `POST /api/session`, la persistance locale via `@capacitor/preferences` (clé `CapacitorStorage.xetu_session_*`), et l'idempotence des requêtes via un verrou de promesse.
- **`ApiService`** : Wrapper HTTP typé avec injection automatique de l'en-tête `Authorization: Bearer <token>` et politique de réenvoi automatique (retry) avec backoff exponentiel sur les erreurs 5xx et réseau.
- **`WsService`** : Gère la connexion WebSocket persistante vers le serveur (`/ws/{session_id}`), avec pings d'inactivité (25s) et watchdog de réponse (12s), reconnexion automatique progressive (backoff de 1.5s à 30s) et réinitialisation de session sur les codes d'erreur `4001/4002/4003`.

## 5. État actuel

- **Phase 1 (Scaffold & Core) : Terminée et validée.** Le socle compile en production (`npm run build`), 24/24 tests unitaires passent (`ng test`), et le projet Android est initialisé et synchronisé (`npx cap sync android`).
- **Phase 2 (Chat IA) : En cours.**

## 6. La séquence d'implémentation

1. **Phase 1 — Scaffold & Core Infrastructure** (Terminée) : Scaffold, design tokens, navigation, services principaux (Session, API, WS, Store).
2. **Phase 2 — Chat IA** (Active) : Onglet Chat avec intégration WebSocket E2E, bulles, indicateur de saisie, suggestions contextuelles et composer dans le pied de page pour le clavier iOS.
3. **Phase 3 — Mes Lignes & Score** : Gestion des abonnements (`/api/subscriptions`) et affichage du score/badges de fiabilité.
4. **Phase 4 — Itinéraire** : Recherche d'arrêts et calcul d'itinéraire (`/api/route`).
5. **Phase 5 — Signalement** : Wizard de signalement en 3 étapes.
6. **Phase 6 — Carte / Home** : Carte Leaflet avec bus actifs et bottom-sheet.
7. **Phase 7 — GPS Natif** : Positionnement natif et partage de trajet.
8. **Phase 8 — Push Natif** : Notifications natifs après correction de la faille P0-3 côté backend.
9. **Phase 9 — Offline & Polissage** : File d'attente hors-ligne, écran onboarding et paramètres.
10. **Phase 10 — Stores** : Builds de production finaux.
