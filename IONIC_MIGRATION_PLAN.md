# Xëtu Mobile — Plan d'implémentation Ionic + Angular + Capacitor

> **DÉCISION ACTIVE (2026-06-28)** : stabiliser d'abord la voie **Capacitor/Ionic**. React Native est mis en attente et ne doit pas guider l'implémentation courante. On réévaluera React seulement après stabilisation du clavier, du WebView embarqué, du GPS, du chat et du packaging Capacitor.
>
> Document d'exécution. Conçu pour qu'un agent de code l'exécute **phase par phase**.
> Backend FastAPI/Supabase/WS **conservé tel quel**. Le mobile ne contient **aucune logique métier** : il consomme les API existantes. L'agent IA reste côté serveur. Agno est cadré comme orchestration backend uniquement, avec DeepSeek comme provider modèle. Données réseau = backend / `xetu_mvp.json`.
>
> **Cadre Doryx** — STRUCTURE TOUCHÉE : nouveau front mobile (remplace la coque Expo+WebView et, à terme, l'usage mobile de la PWA `Dashboard/`). DÉCISION ACTIVE concernée : « Canal principal Telegram+PWA » + « Auth PWA reportée post-users » (session anonyme conservée). DETTE impactée : P0-3 (push subscribe rebinding sans auth) — re-touchée en Phase 8. CE PLAN CORRIGE : structure (UI hand-rollée → primitives framework), pas un symptôme isolé.

---

## 0. Résumé exécutif

**Constat technique vérifié (28 juin 2026).** La « coque mobile » (`xetu-mobile`) est un wrapper Expo `react-native-webview` de ~360 lignes (`App.tsx`) qui charge la PWA `Dashboard/`. **L'application réelle, c'est la PWA** : ~16 modules JS vanilla + 9 feuilles CSS, avec une UI sur mesure riche (wizard de signalement 3 étapes, carte Leaflet + bottom-sheet, chat WS, moteur d'itinéraire). Donc « migrer vers Ionic » = **réécrire la PWA en Angular/Ionic**, pas migrer la coque (la coque est jetée).

**Douleur aiguë = fluidité iOS, surtout le clavier.** Cause racine vérifiée : **3 gestionnaires clavier concurrents** écrivent tous `#app.style.height` :
1. IIFE inline `fixIosKeyboard()` (`Dashboard/index.html:755`) ;
2. `_initKeyboardViewport()` (`Dashboard/js/app.js:358`) qui poursuit le visual viewport frame-par-frame ;
3. aligneur propre de `signal.js:770`.
Plus le hack `100dvh` + bascule `.keyboard-open` (saut discret de `.screen { bottom }`). C'est **structurel** : on ré-implémente à la main ce que l'OS anime déjà. Aucun framework n'est requis pour le corriger, mais Ionic+Capacitor **supprime la classe entière** (le plugin Keyboard redimensionne la WebView nativement ; `ion-content`/`ion-footer` épinglent le composer).

**Décision stratégique active (détaillée §2).** Trois options : (A) durcir la PWA + garder WebView ; (B) **construire une app Ionic neuve, portée tab-par-tab, PWA en prod jusqu'à parité** ; (C) réécriture big-bang. **Choix actuel : B (Capacitor/Ionic à stabiliser d'abord), précédée d'un hotfix clavier PWA d'un jour** pour les users WhatsApp qui arrivent maintenant. React Native est différé. B livre des jalons testables, encaisse les gains de fluidité tôt, et évite la fenêtre « zéro livraison » de C.

**Identité visuelle = conservée.** Mêmes couleurs (orange `#FF6B35` / fond `#0A0F1E`), mêmes 4 tabs (Carte / Itinéraire / Chat IA / Mes lignes), carte en écran d'accueil, wording, flows. Le **code** est réécrit ; **l'âme Xëtu** reste. Le design system est extrait du Dashboard actuel (§5) avant toute nouvelle UI.

**Estimation globale.** ~9–13 semaines pour un dev solo à parité fonctionnelle + stores, en phasé. MVP livrable (Chat + Mes lignes + Carte read-only) en ~4–5 semaines.

---

## 1. Cadrage & contraintes (non négociables)

| # | Contrainte | Conséquence dans le plan |
|---|---|---|
| C1 | Backend non réécrit | Mobile = client REST/WS pur |
| C2 | Zéro logique métier mobile | Pas de calcul d'itinéraire/anti-fraude côté app ; tout via API |
| C3 | Agent IA côté serveur | Chat = transport WS, jamais d'appel LLM dans l'app |
| C4 | Données réseau = backend/`xetu_mvp.json` | Pas de liste de lignes/arrêts dupliquée ; `/api/stops/search`, `/api/nearby` |
| C5 | Prêt pour vrais users | Onboarding permissions, états offline/erreur soignés, store builds signés |
| C6 | Priorité UX iPhone : clavier, fluidité, chat | §12 dédiée ; Chat = 1ʳᵉ tab portée |
| C7 | Pas de faux live / fausses données | États vides honnêtes ; « aucun bus actif » réel ; pas de mock affiché en prod |
| C8 | Cohérence produit | Transport Dakar / Dem Dikk / signalements communautaires |
| C9 | Session anonyme (pas d'auth) | Conserver le modèle `POST /api/session` → `{sessionId, token}` |

---

## 2. Décision stratégique : réécriture totale vs migration progressive

### Les trois options

**Option A — Durcir la PWA, garder Expo+WebView.**
- *Pour* : conserve l'UI existante qui marche déjà ; coût le plus faible ; livre aux users WhatsApp immédiatement ; backend intact.
- *Contre* : plafond de fluidité WebView + visualViewport persiste ; ressenti « web emballé » ; structure vanilla (3 handlers clavier, `?v=` sur chaque import, pub/sub global) dure à maintenir ; push natif fiable = travail en plus.
- *C'est ce que recommandait ton briefing /compact.*

**Option B — App Ionic neuve, migration progressive (strangler) tab-par-tab.** ✅ **RECOMMANDÉ**
- On scaffolde une app **Ionic Angular + Capacitor** ; on porte les écrans un par un ; **la PWA reste l'app de prod** jusqu'à ce que l'app Ionic atteigne la parité MVP, puis bascule.
- *Pour* : le plugin Keyboard + `ion-content`/`ion-footer` tuent la douleur clavier dès la 1ʳᵉ tab ; chaque phase est livrable (TestFlight / piste interne) ; design system extrait une fois ; GPS/push natifs via plugins Capacitor ; fluidité validée écran par écran.
- *Contre* : fenêtre de double maintenance (PWA + Ionic) ; portage Leaflet + bottom-sheet non trivial ; courbe Angular.
- *Nuance honnête* : « progressif » ne veut **pas** dire un binaire hybride moitié-PWA moitié-Ionic (impraticable). Ça veut dire : build phasé d'une **seule** app Ionic, route par route, la PWA servant de prod pendant la transition.

**Option C — Réécriture totale big-bang.**
- *Pour* : état final le plus propre ; un seul modèle mental.
- *Contre* : longue fenêtre sans livraison ; risque maximal ; aucun gain de fluidité avant la toute fin ; pour un dev solo avec users réels, c'est l'option la plus dangereuse.

### Comparatif

| Critère | A (PWA durcie) | B (progressive) | C (big-bang) |
|---|---|---|---|
| Coût total | ★ faible | ★★ moyen | ★★★ élevé |
| Risque | faible | **moyen-maîtrisé** | élevé |
| 1ʳᵉ livraison | jours | ~2–3 sem (Chat) | ~9+ sem |
| Fluidité clavier finale | plafonnée | **native** | native |
| Maintenance pendant | mono | double (transitoire) | mono |
| Adapté users réels maintenant | oui (court terme) | **oui** | non |

### Recommandation

1. **Phase 0 — hotfix clavier PWA (~1 jour)** dans `whatsapp-agent/Dashboard/` : fusionner les 3 handlers en un seul contrôleur, `transform` uniquement (plus d'écriture `height` par frame), throttle rAF, retirer l'aligneur `signal.js`. Soulage les users WhatsApp **maintenant**, indépendamment du rewrite.
2. **Puis Option B** : app Ionic neuve, portée Chat → Mes lignes → Itinéraire → Signalement → Carte (la plus dure en dernier).

> Si tu choisis C plutôt que B, **tout le reste de ce document s'applique à l'identique** ; seule change la §16 (on supprime les jalons intermédiaires et on bascule en un seul go). B et C partagent ~90 % du plan.

---

## 3. Architecture cible

```
┌─────────────────────────────────────────────┐
│              Ionic Angular App               │
│  ion-tabs · ion-router-outlet · standalone   │
│  components · Angular signals (state)         │
├─────────────────────────────────────────────┤
│  Services Angular (DI)                        │
│  ApiService · WsService · SessionService ·    │
│  GeoService · PushService · NetworkService ·  │
│  Store (signals)                              │
├─────────────────────────────────────────────┤
│  Capacitor native plugins                     │
│  Geolocation · PushNotifications · Keyboard · │
│  App · Network · Preferences · StatusBar ·    │
│  SplashScreen                                 │
├─────────────────────────────────────────────┤
│            REST  /  WebSocket                 │
├─────────────────────────────────────────────┤
│        FastAPI (Railway) — INCHANGÉ           │
│   Agno orchestration · anti-fraude · network.py│
├─────────────────────────────────────────────┤
│              Supabase / PostgreSQL            │
└─────────────────────────────────────────────┘
```

- **Rendu** : Capacitor empaquette le build Angular comme assets natifs (pas de WebView pointant vers une URL distante — gros changement vs l'actuel). L'app fonctionne offline-shell par défaut.
- **Réseau** : `ApiService` (HTTP) + `WsService` (WebSocket natif) vers Railway. Base URL par environnement (`environment.ts` / `environment.prod.ts`).
- **Pas de SSR**, pas d'Angular Universal. SPA pure empaquetée.

### 3A. Agno côté backend uniquement

Agno n'est pas un framework mobile et ne doit jamais être importé par l'app Ionic. Il est positionné comme couche d'orchestration agent **dans `whatsapp-agent`**, derrière FastAPI.

Ce que le mobile voit :

```text
Ionic app
  -> REST / WebSocket
  -> FastAPI Railway
  -> réponse Xëtu stable
```

Ce que le backend peut changer derrière cette frontière :

```text
FastAPI
  -> orchestrator/pipeline.py
  -> agent/xetu_agno_agent.py
  -> Agno Agent
  -> tools existants
  -> DeepSeek
```

Règles :

- DeepSeek reste le provider modèle.
- Agno remplace progressivement la boucle ReAct custom, pas FastAPI.
- L'adoption Agno doit être feature-flaggée : `AGENT_RUNTIME=custom|agno`.
- Production par défaut : `custom` tant que les golden tests ne prouvent pas la parité.
- Le mobile ne reçoit jamais d'événement Agno brut ; le backend traduit tout en événements Xëtu stables (`typing`, `status`, `chat_response`, `error`).
- Les shortcuts déterministes avant LLM restent côté backend : identité/provider, GPS follow-up, itinéraire, signalement fort, place-lines.
- Les tools restent des wrappers minces autour des implémentations actuelles : `calculate_route`, `get_recent_sightings`, `report_bus`, `manage_subscription`, `get_bus_info`, `resolve_spatial_query`, `extract_entities`.
- `session_id`, phone, token, GPS connu et contexte user sont injectés côté serveur, jamais fournis par le modèle.
- Rollback Agno = changer `AGENT_RUNTIME` sans rebuild mobile.

---

## 4. Design system extrait du Dashboard actuel

> Source : `Dashboard/css/variables.css`, `base.css`, `components.css`. À porter dans `theme/variables.scss` (variables Ionic) + un fichier de tokens partagé. **Ne pas repartir d'un thème Ionic générique.**

**Couleurs (thème sombre par défaut ; un thème clair existe — `variables-light.css`).**
```
--bg:        #0A0F1E    --surface:   #111827    --surface2:  #1a2235    --surface3: #212d42
--orange:    #FF6B35  (accent primaire, = ion-color primary)
--orange-dim: rgba(255,107,53,.15)   --orange-border: rgba(255,107,53,.3)
--green:     #00D67F  (succès / live)   --yellow: #FFD166   --red: #FF4757
--text:      #F0F4FF    --text-dim: #c4cde0    --muted: #6B7A99
--border:    rgba(255,255,255,.07)
```
**Typographie** : `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto…` (head = body) ; mono : `ui-monospace, SFMono-Regular, Menlo…`.
**Espacements** : `4 / 8 / 12 / 16 / 24` (xs→xl). **Rayons** : `6 / 10 / 14 / 20 / 9999`.
**Layout** : hauteur nav `--nav-h: 66px` ; panel home replié `116px`, étendu `min(560px, 100dvh-88px)`.
**Animations signature** : `slideUp` (translateY 12px + opacity, 0.18–0.25s ease), `fadeIn`, `typingBounce` (chat), `pulse` (dot live). Transition rapide `--t-fast`.
**Mapping Ionic** : `--orange` → `--ion-color-primary` ; `--bg`/`--surface*` → `--ion-background-color` + `--ion-item-background` ; `--text`/`--muted` → `--ion-text-color` + `--ion-color-medium`. Bulles chat, badges ligne (orange/vert/jaune), cards arrêt = composants custom stylés avec ces tokens.

---

## 5. Structure de dossiers recommandée

```
xetu-mobile/                      (on réutilise CE repo ; App.tsx/Expo sera retiré en fin de B)
  src/
    app/
      app.component.ts
      app.routes.ts               # routes + redirect /tabs/carte
      tabs/
        tabs.page.ts              # <ion-tabs> + <ion-tab-bar>
      features/
        carte/                    # home : map + bottom-sheet + bus actifs + top signaleurs
        itineraire/
        chat/
        mes-lignes/               # abonnements + score
        signalement/             # wizard 3 étapes (route secondaire, hors tab-bar)
        detail-ligne/
        detail-arret/
        onboarding/               # permissions GPS/notifs
        parametres/
      core/
        services/                 # api, ws, session, geo, push, network
        state/                    # stores signals
        models/                   # types DTO (Bus, Ligne, Arret, Subscription, ChatMessage…)
        interceptors/             # http: base url, session token, retry
      shared/
        components/               # bus-card, ligne-badge, stop-card, bottom-sheet, chat-bubble…
        pipes/  directives/
    theme/
      variables.scss              # tokens Ionic (depuis §4)
      xetu.scss                   # styles produits (badges, bulles, panel…)
    environments/
      environment.ts / environment.prod.ts
    assets/
    global.scss
  capacitor.config.ts
  ionic.config.json
  angular.json
```

---

## 6. Découpage des modules Angular/Ionic

**Tabs principales** (`ion-tab-bar`, icônes = SVG actuels) :
1. **Carte** (`carte`) — défaut.
2. **Itinéraire** (`itineraire`).
3. **Chat IA** (`chat`).
4. **Mes lignes** (`mes-lignes`).

**Routes secondaires** (hors tab-bar, `ion-router-outlet`) :
- `signalement` (wizard plein écran, lancé par le bouton « Je vois un bus ici »),
- `detail-ligne/:id`, `detail-arret/:id`,
- `onboarding`, `parametres`, `etat-reseau`.

**Standalone components** (Angular moderne, pas de NgModules). Lazy-load par route.

---

## 7. Services Angular

| Service | Rôle | API/Plugin |
|---|---|---|
| `SessionService` | crée/restaure la session anonyme, stocke `{sessionId, token}` | `POST /api/session` + `@capacitor/preferences` |
| `ApiService` | wrapper HTTP typé + interceptor (base URL, retry, erreurs) | endpoints §15 |
| `WsService` | connexion `/ws/{id}?token=`, **heartbeat ping 25s / watchdog pong 12s** (porté de `ws.js`), reconnexion backoff, codes 4001/4002/4003 → reset session | WebSocket natif |
| `GeoService` | permission + position ponctuelle + watch live | `@capacitor/geolocation` |
| `PushService` | enregistrement token natif, réception | `@capacitor/push-notifications` |
| `NetworkService` | online/offline, file d'attente d'envois | `@capacitor/network` |
| `StoreService` | état réactif (signals) partagé entre tabs | — |

**Idempotence session** : porter le garde `_sessionPromise` de `session.js` (un seul `POST /api/session` concurrent) → un `shareReplay(1)` / promesse mémoïsée dans `SessionService`.

---

## 8. State management

- **Angular signals** (pas besoin de NgRx pour cette taille). Un `StoreService` central expose des `signal()` : `wsStatus`, `messages`, `activeBuses`, `subscriptions`, `score`, `lastBotMessage`, `route`, `geoStatus`.
- Remplace le pub/sub maison de `store.js` (`subscribe('lastBotMessage', …)`) par des signals + `effect()`.
- Persistance légère via `@capacitor/preferences` (session, abonnements en cache, dernier itinéraire).

---

## 9. Composants Ionic (mapping depuis l'actuel)

| Écran actuel (HTML) | Ionic |
|---|---|
| `#app` flex column | `ion-app` > `ion-tabs` |
| `.bottom-nav` | `ion-tab-bar` / `ion-tab-button` |
| `.screen` | `ion-content` par page |
| `.chat-composer` (textarea + send) | `ion-footer` > `ion-toolbar` > `ion-textarea` + `ion-button` |
| bulles `.chat-bubble` | composant `chat-bubble` custom (styles §4) |
| popups `.popup-overlay`, `.subscribe-modal` | `ion-modal` (sheet, `breakpoints`) |
| menu hamburger `.menu-overlay` | `ion-menu` ou `ion-modal` |
| panel home `.home-bottom` (grabber/expand) | `ion-modal` sheet (`initialBreakpoint`, `breakpoints:[0.15,0.6]`) **ou** composant bottom-sheet custom au-dessus de la carte |
| toasts | `ion-toast` |
| wizard signalement (progress 1/2/3) | pages/segments + `ion-progress-bar` |
| cartes arrêt / badges ligne | `ion-card` + composants badge custom |

---

## 10. Plugins Capacitor

`@capacitor/geolocation`, `@capacitor/push-notifications`, `@capacitor/keyboard`, `@capacitor/app` (état background/URL), `@capacitor/network`, `@capacitor/preferences`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/share` (bouton Partager), `@capacitor/browser` (liens externes Telegram/WhatsApp). Carte : **Leaflet conservé** (npm `leaflet`, pas de CDN ; pas de Google Maps → coût + suffisant).

---

## 11. ⭐ Section critique iPhone : clavier, safe-area, viewport

> C'est le cœur de la demande. En Capacitor natif, **on arrête de simuler le viewport en JS** : le plugin Keyboard redimensionne la WebView, et `ion-content`/`ion-footer` gèrent l'ancrage. On **supprime** les 3 handlers actuels.

**Configuration Keyboard (`capacitor.config.ts`) :**
```ts
plugins: {
  Keyboard: {
    resize: KeyboardResize.Native,   // iOS redimensionne la WebView nativement
    resizeOnFullScreen: true,        // Android
  }
}
```
- `KeyboardResize.Native` : iOS réduit la hauteur de la WebView → pas de bande noire/blanche, pas de hack `100dvh`. (Alternative : `Ionic` si on veut piloter via CSS vars `--keyboard-height`.)

**Comment chaque problème listé disparaît :**

| Problème actuel | Solution Ionic/Capacitor |
|---|---|
| Blanc/noir au-dessus du clavier | `resize: Native` : la WebView ne laisse plus de bande découverte (cause = layout viewport ancré en haut en standalone). Plus de `100dvh` manuel. |
| Sauts de layout au focus | Aucune écriture JS de `height`/`transform`. `ion-content` gère le scroll ; l'OS anime seul. |
| Animations incohérentes | On ne combat plus l'OS : un seul mouvement, le slide natif. Suppression des 3 handlers. |
| Inputs cachés | `ion-content` **scrollAssist** remonte automatiquement le champ focalisé ; `ion-textarea` dans `ion-item` en bénéficie. |
| Bottom-nav qui remonte mal | `ion-tab-bar` ; on l'**escamote** sur `keyboardWillShow` (listener Keyboard) puis on la restaure sur `keyboardWillHide`. Le composer en `ion-footer` reste collé au-dessus du clavier. |
| Chat scroll mal | `ion-content.scrollToBottom(200)` sur nouveau message **et** sur `keyboardDidShow`. Composer en `ion-footer` (hors zone scrollable). |

**Safe-area** : `ion-content`/`ion-header`/`ion-footer` appliquent `env(safe-area-inset-*)` via les vars Ionic. Notch et home-indicator gérés sans `--safe-area-factor` maison. `viewport-fit=cover` géré par Capacitor.

**Scroll anchoring** : laisser `ion-content` (overflow natif iOS, `overscroll-behavior` géré). Ne pas réintroduire de `position:fixed` sur le body.

**Input accessory bar iOS** : décider via `Keyboard.setAccessoryBarVisible({ isVisible: false })` (barre « Précédent/Suivant/OK » — la masquer pour un composer chat épuré).

**Règle d'or** : interdiction de toute manipulation manuelle de `window.visualViewport` / `style.height` / `style.transform` pour suivre le clavier. Si on en arrive là, c'est qu'on a mal configuré le plugin.

---

## 12. Animations & transitions fluides

- Transitions de pages : transitions natives Ionic (`ios` mode) — push/pop fluides gratuits.
- Conserver `slideUp` pour l'apparition des cards/bulles (keyframes portées en SCSS).
- `typingBounce` (indicateur de frappe chat) et `pulse` (dot live) portés à l'identique.
- Préférer `transform`/`opacity` (composités GPU) ; jamais d'anim sur `height`/`top`.
- Respecter `prefers-reduced-motion`.
- Bottom-sheet home : utiliser les `breakpoints` natifs d'`ion-modal` (drag fluide) plutôt qu'un grabber JS maison.

---

## 13–14. Plans par fonctionnalité

**Chat IA** (1ʳᵉ portée — exerce WS + clavier) : `WsService` ↔ `/ws/{id}`. Envois `{type:'chat',text}` ; réceptions `welcome / chat_response / typing / status / report_ack / error / pong`. Bulles user/bot, indicateur typing, pill de statut, suggestions contextuelles (porter `_contextualSuggestions`). Composer `ion-footer`. **Aucun appel LLM dans l'app.**

**Carte (home)** : Leaflet dans un composant ; `GET /api/buses` (bus actifs) en polling raisonné (pas de faux live — afficher l'âge réel de la donnée). Bottom-sheet : tabs « Bus actifs » / « Top signaleurs » (`GET /api/leaderboard`). Bouton « Je vois un bus ici » → route `signalement`. Bouton locate → `GeoService`.

**Itinéraire** : double champ from/to + swap + destinations fréquentes. `GET /api/route` (origine/destination), `GET /api/stops/search`, `GET /api/nearby`. Affichage carte résultat (origine → bus → destination + durée). Pas de calcul local (C2).

**Signalement** : wizard 3 étapes (Ligne → Arrêt → Envoi). Étape 2 = mini-carte Leaflet + arrêts proches (`/api/nearby`) + saisie manuelle. Étape 3 = mode « vu » / « dans le bus » (+ consentement live), tags qualité, `POST /api/report`. Écran succès + points. Live tracking : `/tracking/session/start` → `ping` (15s) → `stop`. ⚠️ Vérifier le rayon d'envoi (notify abonnés) avant tests réels.

**Mes lignes / abonnements** : `GET/POST/DELETE /api/subscriptions[/{ligne}]`. Score : depuis le payload existant. Modal d'abonnement (recherche + liste lignes depuis le backend, **pas** de liste codée en dur — C4).

**GPS natif** : `@capacitor/geolocation` remplace le bridge `window.XetuNative.requestLocation`/`expo-location`. Permission via page `onboarding`. Live = `watchPosition`. (Background tracking = hors scope MVP ; à décider plus tard, nécessite plugin tiers + justification store.)

**Notifications natives** : `@capacitor/push-notifications` (APNs/FCM) remplace le web-push VAPID. Le device token natif doit être enregistré côté backend → **nouvel endpoint** ou extension de `POST /api/push/subscribe` (aujourd'hui orienté web-push). ⚠️ **DETTE P0-3** : `subscribe` permet le rebinding sans auth — à corriger côté backend **avant** d'ouvrir le push natif aux vrais users.

**Offline/cache** : assets bundlés (offline-shell gratuit). `NetworkService` + file d'attente pour les envois (signalement/abonnement) ; cache lecture (lignes, derniers bus) via `Preferences`. États offline explicites (page `etat-reseau`). Pas de fausses données affichées hors-ligne (C7).

**Session** : `POST /api/session` au boot, token en `Preferences`, ré-émis au WS. Anonyme (C9). Reset sur codes WS 4001/4002/4003.

**WebSocket** : porter intégralement la logique de `ws.js` (backoff `1.5s→30s ×1.8`, max 10 essais, heartbeat 25s/12s, `_markAlive` sur tout message). C'est du code déjà éprouvé — le transposer, pas le réinventer.

---

## 15. APIs backend utilisées (surface réelle, vérifiée)

| Méthode | Endpoint | Usage mobile |
|---|---|---|
| POST | `/api/session` | session anonyme `{sessionId, token}` |
| WS | `/ws/{session_id}?token=` | chat + report + ping/pong |
| GET | `/api/buses` | bus actifs (carte) |
| GET | `/api/route` | itinéraire |
| GET | `/api/stops/search` | recherche d'arrêt |
| GET | `/api/nearby` | arrêts proches |
| GET/POST/DELETE | `/api/subscriptions[/{ligne}]` | abonnements |
| GET | `/api/leaderboard` | top signaleurs |
| POST | `/api/report` | signalement (REST) |
| GET | `/api/push/vapid-public-key` | (web-push actuel) |
| POST/DELETE | `/api/push/subscribe` · `/api/push/unsubscribe` | push (à étendre pour token natif) |
| POST | `/tracking/session/start` · `/ping` · `/stop` · `/update` · `/report` · `/relance` | partage live |
| GET | `/tracking/bus-events` · `/health` | events / santé |

> Non utilisés par le mobile : `/webhook` (WhatsApp), `/telegram/webhook` (canaux serveur).

---

## 16. Phases d'implémentation (ordre exact + checklist + fichiers)

> Chaque phase = livrable et testable. B = phasé ; ✅ = critère de sortie de phase.

**Phase 0 — Hotfix clavier PWA (dans `whatsapp-agent/Dashboard/`, ~1 j).** Hors Ionic, pour les users actuels.
- [ ] Fusionner `fixIosKeyboard` (index.html) + `_initKeyboardViewport` (app.js) + aligneur signal.js → **un** contrôleur.
- [ ] `transform` seul, throttle rAF, plus d'écriture `height` par frame.
- ✅ Plus de saut/jank visible au focus sur iPhone réel.

**Phase 1 — Scaffold (Ionic Angular + Capacitor).** Fichiers : `capacitor.config.ts`, `theme/variables.scss`, `app.routes.ts`, `tabs.page.ts`, `environments/*`, `core/services/{api,ws,session}.service.ts`, `core/state/store.service.ts`.
- [ ] `ionic start` (Angular, tabs), ajout iOS/Android.
- [ ] Tokens §4 portés ; tab-bar avec les 4 icônes.
- [ ] `SessionService` + `WsService` (heartbeat) fonctionnels.
- ✅ App boot, 4 tabs vides, session créée, WS connecté (statut visible).

**Phase 2 — Chat IA.** ✅ Conversation E2E réelle via FastAPI → agent backend → DeepSeek ; clavier **fluide** sur iPhone (critère §11) ; reconnexion WS OK.

**Track backend Agno — parallèle, non bloquant mobile.** À lancer seulement quand le chat actuel est stable. ✅ `AGENT_RUNTIME=agno` passe les golden conversations, les tests de tools, le guard provider, le budget timeout <18s, puis reste rollbackable vers `custom`.

**Phase 3 — Mes lignes + score.** ✅ Abonnement/désabonnement persistés (`/api/subscriptions`) ; score réel affiché.

**Phase 4 — Itinéraire.** ✅ Recherche + résultat depuis `/api/route` ; swap ; destinations fréquentes.

**Phase 5 — Signalement.** ✅ Wizard 3 étapes, `POST /api/report` 201, GPS natif, écran succès+points ; rayon notify vérifié.

**Phase 6 — Carte/home.** ✅ Leaflet + bus actifs réels + bottom-sheet + top signaleurs ; pas de faux live.

**Phase 7 — GPS natif + live tracking.** ✅ `@capacitor/geolocation` ; partage live `/tracking/*` ; permission onboarding.

**Phase 8 — Push natif.** ⚠️ Corriger P0-3 backend d'abord. ✅ Token natif enregistré, notif reçue device réel.

**Phase 9 — Offline / erreurs / onboarding / paramètres / liens externes.** ✅ États offline honnêtes ; file d'attente envois ; menu (Telegram/WhatsApp/partage/avis/CGU/contact/QR).

**Phase 10 — Durcissement + stores.** ✅ TestFlight + Play interne ; users WhatsApp onboardés ; PWA retirée comme app mobile (reste éventuellement en web).

---

## 17. Tests

- **Unitaires (Jest/Vitest)** : `WsService` (reconnexion, heartbeat, codes reset), `SessionService` (idempotence), `ApiService` (interceptors/retry), réducteurs de store, mappers DTO.
- **Composants** : bulles chat, badges ligne, wizard (transitions d'étape), bottom-sheet.
- **E2E (Cypress/Playwright web + builds device)** : parcours Chat, Abonnement, Itinéraire, Signalement.
- **Device manuel obligatoire** : clavier iPhone (chaque critère §11) sur iOS réel — non simulable fidèlement en émulateur.
- **Contrats API** : tests qui figent la forme des réponses `/api/*` consommées (détecter les ruptures backend).
- **Agno backend** : golden conversations, parité tool-calling, absence de fuite provider/modèle, rollback `AGENT_RUNTIME=custom`, timeout pipeline <18s.

---

## 18. Déploiement Android / iOS

- **iOS** : Xcode, signing (compte Apple Developer), `npx cap sync ios`, archive → **TestFlight** (piste interne dès Phase 2). APNs key pour push (Phase 8).
- **Android** : Android Studio, keystore, `npx cap sync android`, AAB → **Play Console** piste interne. FCM pour push.
- **Config réseau** : iOS ATS (HTTPS Railway OK) ; Android `cleartext` interdit en prod.
- **CI** : build Angular + `cap sync` + lint/tests à chaque PR ; builds signés sur tag.
- **Versioning** : aligner `version` + build number ; canal de mise à jour OTA (ex. Capacitor Live Updates / Appflow) **optionnel**, à décider.

---

## 19. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Portage Leaflet + bottom-sheet (Phase 6) plus dur que prévu | retard | le mettre en **dernier** ; MVP livrable sans (carte read-only d'abord) |
| Double maintenance PWA+Ionic | charge | fenêtre courte ; geler les features PWA pendant B (bugfix only) |
| Push natif + P0-3 auth | sécurité | **corriger P0-3 backend avant Phase 8** ; ne pas ouvrir le push sans auth de rebinding |
| Pipeline < 18s (contrainte WhatsApp) | régression backend | le mobile ne touche pas le pipeline ; ne pas ajouter d'appels serveur synchrones |
| Agno change les réponses chat | confiance | feature flag, golden tests, parité tools, rollback immédiat vers `custom` |
| Événements Agno exposés au mobile | dette contrat | backend traduit en événements Xëtu stables ; aucun événement framework dans l'app |
| Clavier toujours capricieux malgré le plugin | UX | tester `resize: Native` **et** `Ionic` sur device dès Phase 2 ; figer le mode qui gagne |
| Courbe Angular (dev solo) | vélocité | standalone components + signals (pas de NgRx/NgModules) ; périmètre MVP serré |
| Données réseau dupliquées par inadvertance | dette C4 | revue : toute liste lignes/arrêts vient d'une API, jamais codée |
| Faux live affiché | confiance users (C7) | afficher l'âge réel de la donnée ; états vides explicites |

---

## 20. Critères d'acceptation (globaux)

- [ ] Les 4 tabs + signalement + détails fonctionnent sur iPhone **et** Android réels.
- [ ] **Clavier** : aucun des 6 défauts §11 reproductible sur iPhone.
- [ ] Chat E2E réel (DeepSeek via FastAPI/agent backend), reconnexion WS transparente après coupure réseau.
- [ ] Si Agno est activé, il reste invisible contractuellement côté mobile et rollbackable.
- [ ] Abonnement chat → visible dans Mes lignes (le bug historique ne revient pas).
- [ ] Signalement E2E persiste + notifie (rayon vérifié) ; points corrects.
- [ ] Aucune logique métier dupliquée (revue de code C2/C4) ; agent et Agno 100 % backend.
- [ ] Aucune fausse donnée / faux live (C7).
- [ ] Identité visuelle Xëtu conservée (couleurs, tabs, wording, flows).
- [ ] Builds signés sur TestFlight + Play interne ; users WhatsApp onboardables.

---

## 21. Ordre d'exécution résumé

`Phase 0 (PWA hotfix) → 1 (scaffold) → 2 (Chat) → 3 (Mes lignes) → 4 (Itinéraire) → 5 (Signalement) → 6 (Carte) → 7 (GPS) → 8 (Push, après fix P0-3) → 9 (Offline/onboarding) → 10 (stores + bascule)`

**Difficulté / priorité** : Chat ★★ (prioritaire, valide clavier+WS) · Mes lignes ★ · Itinéraire ★★ · Signalement ★★★ (wizard+GPS+map) · Carte ★★★ (Leaflet+sheet) · Push ★★ (dépend backend) · Offline ★★.
