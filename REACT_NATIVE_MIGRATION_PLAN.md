# Xëtu Mobile — Plan d'implémentation React Native + Expo

> **STATUT (2026-06-28) : DIFFÉRÉ / NON ACTIF.** La décision courante est de stabiliser d'abord la voie **Capacitor/Ionic** décrite dans `IONIC_MIGRATION_PLAN.md`. Ce document reste une référence comparative et une option de réévaluation future, mais ne doit pas guider l'implémentation actuelle.
>
> Document d'exécution. Conçu pour qu'un agent de code l'exécute **phase par phase**.
> Backend FastAPI/Supabase/WS **conservé tel quel**. Le mobile ne contient **aucune logique métier** : il consomme les API existantes. L'agent IA reste côté serveur. Données réseau = backend / `xetu_mvp.json`.
>
> **Cadre Doryx** — STRUCTURE TOUCHÉE : nouveau front mobile natif (remplace la coque Expo+WebView). La PWA `Dashboard/` devient un **canal web de secours maintenu** (bugfix), pas un codebase jumeau. DÉCISION ACTIVE : « Canal principal WhatsApp+PWA » conservée ; session anonyme conservée. DETTE impactée : P0-3 (push subscribe sans auth) — re-touchée en Phase 8. CE PLAN CORRIGE : structure (UI web hand-rollée dans WebView → UI native React Native), pas un symptôme.

---

## 0. Décision de framework (enregistrée)

**React Native (Expo SDK 56), différé** — après décision produit du 28 juin 2026 : stabiliser Capacitor/Ionic d'abord, puis réévaluer React Native si le clavier, la fluidité, le WebView embarqué ou la maintenance Ionic restent insuffisants.

| Pourquoi RN gagne pour Xëtu | |
|---|---|
| Priorité #1 = fluidité/clavier iPhone | RN rend du **natif** : scroll physics, transitions, clavier hérités de la plateforme. Capacitor = WebView (plafonné), Flutter = bon mais Dart. |
| Tu le possèdes déjà | Repo `xetu-mobile` = Expo SDK 56 (RN 0.85, New Architecture, Hermes v1). |
| GPS déjà fait | `expo-location` est **déjà** utilisé dans `App.tsx` — section dé-risquée. |
| Langage | RN réutilise ton JS. Flutter = Dart (3ᵉ langage, 4-6 sem de ramp). |
| Push & OTA | `expo-notifications` > web-push VAPID ; **EAS Update vivant** (vs Ionic AppFlow en sunset). |
| Design system | NativeWind v4 porte tes tokens Xëtu via CSS variables. |

**À ne pas utiliser comme plan actif maintenant.** Flutter reste écarté. React Native reste une option future si Capacitor/Ionic ne stabilise pas l'expérience iPhone. **La PWA reste un canal web de secours maintenu**, pas un flagship jumeau.

---

## 1. Résumé exécutif

On construit une **app React Native native** sur le projet Expo existant. La douleur clavier (3 handlers concurrents dans la PWA) disparaît structurellement : plus de WebView, plus de `visualViewport` simulé — le clavier devient un **événement natif** géré par `react-native-keyboard-controller`. Implémentation **progressive en interne** : on porte tab par tab, mais on ne livre pas aux users une app hybride moitié PWA/moitié RN. La PWA reste en prod jusqu'à parité MVP, puis passe en canal web de secours. Identité visuelle Xëtu conservée (orange `#FF6B35` / fond `#0A0F1E`, 4 tabs, carte en accueil, wording, flows). **Estimation** : ~8-12 semaines solo à parité + stores ; MVP livrable (Chat + Mes lignes + Carte read-only) en ~4 semaines.

---

## 2. Contraintes (non négociables)

| # | Contrainte | Conséquence |
|---|---|---|
| C1 | Backend non réécrit | Mobile = client REST/WS pur |
| C2 | Zéro logique métier mobile | Itinéraire/anti-fraude/topologie = backend |
| C3 | Agent IA côté serveur | Chat = transport WS, jamais d'appel LLM dans l'app |
| C4 | Données réseau = backend/`xetu_mvp.json` | Pas de liste lignes/arrêts codée en dur |
| C5 | Prêt vrais users | Onboarding permissions, offline/erreurs soignés, builds signés |
| C6 | Priorité iPhone : clavier, fluidité, chat | §11 dédiée ; Chat = 1ʳᵉ tab portée |
| C7 | Pas de faux live / fausses données | États vides honnêtes ; âge réel de la donnée |
| C8 | Cohérence produit | Transport Dakar / Dem Dikk / signalements communautaires |
| C9 | Session anonyme (pas d'auth) | Conserver `POST /api/session` → `{sessionId, token}` |

---

## 3. Architecture cible

```
┌──────────────────────────────────────────────┐
│            React Native (Expo SDK 56)          │
│  expo-router (tabs+stack) · NativeWind ·       │
│  Reanimated · composants natifs                │
├──────────────────────────────────────────────┤
│  State : Zustand (stores) + hooks              │
├──────────────────────────────────────────────┤
│  Services : api · ws · session · geo · push ·  │
│  network                                       │
├──────────────────────────────────────────────┤
│  Expo modules natifs : expo-location ·         │
│  expo-notifications · keyboard-controller ·    │
│  secure-store · netinfo · status-bar ·         │
│  splash-screen · web-browser · linking         │
├──────────────────────────────────────────────┤
│              REST  /  WebSocket                │
├──────────────────────────────────────────────┤
│         FastAPI (Railway) — INCHANGÉ           │
└──────────────────────────────────────────────┘
```

- **Rendu natif** : pas de WebView pour l'UI (sauf éventuellement la carte, §13). New Architecture (JSI) activée par défaut sur SDK 56.
- **Réseau** : base URL par environnement (`app.config.ts` extra / `expo-constants`).
- **Cible plateformes** : iOS (priorité), Android. Web (`react-native-web`) **hors scope** — c'est la PWA existante qui sert le web.

---

## 4. Design system extrait du Dashboard actuel

> Source : `Dashboard/css/variables.css`, `base.css`, `components.css`. Porté dans `src/theme/tokens.ts` + config NativeWind (CSS variables). **Ne pas repartir d'un thème générique.**

**Couleurs (thème sombre par défaut ; thème clair existe — `variables-light.css`).**
```
--bg #0A0F1E   --surface #111827   --surface2 #1a2235   --surface3 #212d42
--orange #FF6B35   --orange-dim rgba(255,107,53,.15)   --orange-border rgba(255,107,53,.3)
--green #00D67F   --yellow #FFD166   --red #FF4757
--text #F0F4FF   --text-dim #c4cde0   --muted #6B7A99
--border rgba(255,255,255,.07)
```
**Typographie** : système (`-apple-system / San Francisco` sur iOS) ; mono pour chiffres/codes.
**Espacements** : `4 / 8 / 12 / 16 / 24`. **Rayons** : `6 / 10 / 14 / 20 / 9999`.
**Layout repères** : nav `~66px`, panel home replié `116px`, étendu `min(560, 100%-88)`.
**Animations signature** : `slideUp` (translateY 12→0 + opacity), `fadeIn`, `typingBounce` (chat), `pulse` (dot live) → portées en **Reanimated**.
**Mapping NativeWind** : définir les tokens en CSS variables (`--color-primary: #FF6B35` …) consommés par les classes utilitaires ; `dark:` variant pour le thème clair/sombre via Appearance API. Icônes : **`lucide-react-native`** (match direct avec le `lucide` de la PWA).

---

## 5. Structure de dossiers (expo-router)

```
xetu-mobile/
  app/                                # routes (expo-router, file-based)
    _layout.tsx                       # root: KeyboardProvider, SafeAreaProvider, GestureHandlerRootView, bootstrap session, StatusBar/SplashScreen
    (tabs)/
      _layout.tsx                     # <Tabs> + tabBar custom (4 onglets, tabBarHideOnKeyboard)
      carte.tsx                       # défaut (initialRouteName)
      itineraire.tsx
      chat.tsx
      mes-lignes.tsx
    signalement/
      _layout.tsx                     # Stack modal (wizard plein écran)
      etape-ligne.tsx / etape-arret.tsx / etape-envoi.tsx / succes.tsx
    ligne/[id].tsx
    arret/[id].tsx
    onboarding.tsx
    parametres.tsx
    +not-found.tsx
  src/
    services/   # api.ts ws.ts session.ts geo.ts push.ts network.ts
    state/      # chatStore.ts busStore.ts subsStore.ts routeStore.ts sessionStore.ts (Zustand)
    components/ # ChatBubble, LigneBadge, StopCard, BottomSheet, BusList, Composer, ...
    theme/      # tokens.ts, nativewind setup
    models/     # types DTO (Bus, Ligne, Arret, Subscription, ChatMessage, RouteResult)
    lib/        # utils, formatters (âge donnée, distances)
  assets/
  app.config.ts                       # nom, icônes, plugins expo, extra.apiBaseUrl/wsBaseUrl par env
  eas.json                            # profils build/submit/update
  global.css                          # NativeWind (@tailwind + :root tokens)
  tailwind.config.js
```

> Le `App.tsx` / `index.ts` actuels (coque WebView) sont retirés une fois la Phase 2 livrée. `src/config.ts` (URL backend) est réutilisé/fusionné dans `app.config.ts`.

---

## 6. Découpage modules / navigation

**Tabs** (`expo-router` `<Tabs>`, icônes `lucide-react-native`) : **Carte** (défaut) · **Itinéraire** · **Chat IA** · **Mes lignes**.
**Stack/modal hors tabs** : `signalement/*` (wizard), `ligne/[id]`, `arret/[id]`, `onboarding`, `parametres`.
`tabBarHideOnKeyboard: true` (Android) + escamotage iOS via `useKeyboardState` (§11).

---

## 7. Services

| Service | Rôle | Implémentation |
|---|---|---|
| `session` | crée/restaure session anonyme `{sessionId, token}` | `POST /api/session` + `expo-secure-store` ; **idempotent** (promesse singleton, port de `_sessionPromise`) |
| `api` | wrapper HTTP typé + retry + base URL + injection token | `fetch` ; mapping DTO `src/models` |
| `ws` | `/ws/{id}?token=`, **heartbeat ping 25s / watchdog pong 12s**, backoff `1.5s→30s ×1.8` (max 10), codes 4001/4002/4003 → reset session | `WebSocket` global RN ; **port quasi verbatim de `Dashboard/js/ws.js`** (logique JS framework-agnostique) |
| `geo` | permission + position + watch | `expo-location` (déjà en place) |
| `push` | enregistrement token natif, réception | `expo-notifications` |
| `network` | online/offline + file d'attente envois | `@react-native-community/netinfo` |

---

## 8. State management

- **Zustand** (mapping naturel du pub/sub `store.js`) : `sessionStore`, `chatStore` (messages, wsStatus, typing), `busStore` (activeBuses, age), `subsStore` (subscriptions, score), `routeStore`.
- Sélecteurs granulaires pour éviter les re-renders. Persistance légère via `expo-secure-store` (session) + `AsyncStorage`/MMKV (cache lignes, dernier itinéraire, abonnements).

---

## 9. Composants (mapping depuis la PWA)

| PWA (HTML/CSS) | React Native |
|---|---|
| `#app` flex column | `(tabs)/_layout` + `SafeAreaView` |
| `.bottom-nav` | `<Tabs>` tabBar custom |
| `.screen` | écran = composant de route |
| `.chat-messages` | **`FlatList inverted`** (anti-jank, ancrage bas) |
| `.chat-composer` | `KeyboardStickyView` (keyboard-controller) + `TextInput` + bouton |
| `.chat-bubble` | `ChatBubble` (NativeWind, styles §4) |
| popups / `.subscribe-modal` | route modale expo-router **ou** `@gorhom/bottom-sheet` |
| menu hamburger | route modale / Drawer |
| panel home `.home-bottom` (grabber) | **`@gorhom/bottom-sheet`** (snapPoints, drag natif) |
| toasts | `react-native-toast-message` (ou custom Reanimated) |
| wizard signalement (1/2/3) | Stack + barre de progression |
| cards arrêt / badges ligne | `StopCard` / `LigneBadge` custom |

---

## 10. Modules natifs (table de migration)

| Capacitor (plan abandonné) | Expo / RN |
|---|---|
| @capacitor/geolocation | **expo-location** (déjà utilisé) |
| @capacitor/push-notifications | **expo-notifications** |
| @capacitor/keyboard | **react-native-keyboard-controller** + `Keyboard` RN |
| @capacitor/preferences | **expo-secure-store** (token) + AsyncStorage/MMKV (cache) |
| @capacitor/network | **@react-native-community/netinfo** |
| @capacitor/app | `AppState` (RN) + **expo-linking** (deep links) |
| @capacitor/status-bar | **expo-status-bar** |
| @capacitor/splash-screen | **expo-splash-screen** |
| @capacitor/share | RN `Share` / **expo-sharing** |
| @capacitor/browser | **expo-web-browser** (liens Telegram/WhatsApp) |
| Leaflet (CDN) | **MapLibre Native** *ou* **Leaflet-dans-WebView** (§13) |
| OTA AppFlow (sunset) | **EAS Update** |

---

## 11. ⭐ Section critique iPhone : clavier, safe-area, fluidité

> Cœur de la demande. En natif RN, **il n'y a plus de viewport web à simuler** : le clavier est un événement natif. On installe `react-native-keyboard-controller` (`<KeyboardProvider>` à la racine `app/_layout.tsx`). On **supprime toute trace** des 3 handlers PWA (ils n'existent plus, pas de DOM).

**Pourquoi chaque défaut actuel disparaît :**

| Défaut PWA actuel | Solution RN |
|---|---|
| Bande blanche/noire au-dessus du clavier | **Plus de WebView** → plus de désaccord layout/visual viewport. La cause racine n'existe plus. |
| Sauts de layout au focus | Aucune écriture manuelle de hauteur. Le clavier pousse via composants natifs. |
| Animations incohérentes | `react-native-keyboard-controller` anime **au timing natif exact** du clavier (un seul mouvement). |
| Inputs cachés | `KeyboardAwareScrollView` / `KeyboardAvoidingView` (mode `padding`/`translate-with-padding`) remontent le champ focalisé. |
| Bottom-nav qui remonte mal | `tabBarHideOnKeyboard` (Android) + escamotage iOS via `useKeyboardState()`. Composer en `KeyboardStickyView` (collé au-dessus du clavier). |
| Chat qui scroll mal | **`FlatList inverted`** : la liste reste ancrée en bas, pas de scroll manuel ; le composer en `KeyboardStickyView`. Mode `translate-with-padding` = « best for chat apps ». |

**Safe-area** : `react-native-safe-area-context` (`SafeAreaProvider` + `useSafeAreaInsets()`). Notch et home-indicator gérés sans `--safe-area-factor` maison.
**Accessory bar iOS** : configurable via le plugin (masquer la barre « Précédent/Suivant » pour un composer chat épuré).
**Règle d'or** : **interdiction absolue** de toute logique « suivre le clavier » manuelle. Tout passe par `keyboard-controller` + `FlatList inverted` + `safe-area-context`.

**Setup canonique (Chat) :**
```
<KeyboardProvider>                      // app/_layout.tsx
  ...
  <FlatList inverted data={messages} renderItem={Bubble} />
  <KeyboardStickyView>
    <Composer />                        // TextInput + bouton
  </KeyboardStickyView>
```

---

## 12. Animations & transitions

- **Reanimated 3** (bundlé Expo) + `react-native-gesture-handler`. Optionnel : **Moti** (déclaratif).
- Transitions de routes : natives via `expo-router` (presentation `card`/`modal`).
- Porter `slideUp` (apparition cards/bulles), `typingBounce` (typing chat), `pulse` (dot live) en Reanimated.
- `transform`/`opacity` uniquement (GPU). Respecter `Reduce Motion` (AccessibilityInfo).
- Bottom-sheet home : `@gorhom/bottom-sheet` (drag fluide natif, pas de grabber JS).

---

## 13. Carte (le seul vrai risque de port)

**Deux options, recommandation phasée :**

- **Option recommandée (démarrage) — Leaflet-dans-WebView** (`react-native-webview-leaflet` ou WebView dédiée) : **porte ton code Leaflet existant** (tuiles OSM, marqueurs bus custom) avec un minimum de changement. Une seule WebView contenue, uniquement pour la carte (pan/zoom — aucun clavier/texte, donc aucune des douleurs résolues §11). Risque le plus bas, livraison la plus rapide.
- **Option cible (si jank) — MapLibre Native** (`@maplibre/maplibre-react-native`) : carte vectorielle **100% native**, OSS, sans clé Google. Style JSON à apprendre. À adopter seulement si la WebView-carte rame.

> Volumes de marqueurs (bus Dakar) faibles → perf non bloquante dans les deux cas. **Décider l'option en amont de la Phase 6, pas pendant.**

---

## 14. Plans par fonctionnalité

**Chat IA** (1ʳᵉ portée) : `ws` ↔ `/ws/{id}`. Envois `{type:'chat',text}` ; réceptions `welcome/chat_response/typing/status/report_ack/error/pong`. `FlatList inverted` + `KeyboardStickyView`. Suggestions contextuelles portées. **Aucun LLM dans l'app.**

**Carte (home)** : §13 + `GET /api/buses` (polling raisonné, **âge réel affiché**, pas de faux live) + bottom-sheet « Bus actifs » / « Top signaleurs » (`GET /api/leaderboard`) + bouton « Je vois un bus ici » → `signalement` + locate (`geo`).

**Itinéraire** : champs from/to + swap + destinations fréquentes. `GET /api/route`, `/api/stops/search`, `/api/nearby`. Carte résultat. **Pas de calcul local (C2).**

**Signalement** : wizard 3 étapes (Ligne → Arrêt → Envoi). Étape 2 = mini-carte + arrêts proches (`/api/nearby`) + saisie manuelle. Étape 3 = mode vu/dans le bus (+ consentement live) + tags qualité + `POST /api/report`. Succès + points. Live = `/tracking/session/start` → `ping` (15s) → `stop`. ⚠️ **Vérifier le rayon notify abonnés avant tests réels** (peut messager de vrais abonnés).

**Mes lignes / score** : `GET/POST/DELETE /api/subscriptions[/{ligne}]`. Score depuis payload. Modal abonnement (recherche + liste lignes **depuis backend**, pas codée — C4).

**GPS natif** : `expo-location` (déjà prouvé dans `App.tsx`) — `requestForegroundPermissionsAsync`, `getCurrentPositionAsync`, `watchPositionAsync`. Permission via `onboarding`. Background tracking hors scope MVP.

**Notifications** : `expo-notifications` (APNs/FCM via EAS credentials). Token natif → **endpoint backend** (étendre `POST /api/push/subscribe`, aujourd'hui web-push). ⚠️ **DETTE P0-3** : rebinding sans auth → **corriger backend avant Phase 8**.

**Offline/cache** : assets bundlés (offline-shell). `netinfo` + file d'attente envois (signalement/abonnement). Cache lecture via AsyncStorage/MMKV. États offline explicites. **Pas de fausses données (C7).**

**Session** : `POST /api/session` au boot, token `expo-secure-store`, ré-émis au WS, anonyme (C9), reset sur codes 4001/4002/4003.

**WebSocket** : port intégral de la logique `ws.js` (heartbeat/backoff/markAlive) — code éprouvé, transposé pas réinventé.

---

## 15. APIs backend (surface réelle, vérifiée)

| Méthode | Endpoint | Usage |
|---|---|---|
| POST | `/api/session` | session anonyme |
| WS | `/ws/{session_id}?token=` | chat + report + ping/pong |
| GET | `/api/buses` | bus actifs (carte) |
| GET | `/api/route` | itinéraire |
| GET | `/api/stops/search` · `/api/nearby` | recherche / arrêts proches |
| GET/POST/DELETE | `/api/subscriptions[/{ligne}]` | abonnements |
| GET | `/api/leaderboard` | top signaleurs |
| POST | `/api/report` | signalement REST |
| GET | `/api/push/vapid-public-key` | (web-push actuel) |
| POST/DELETE | `/api/push/subscribe` · `/unsubscribe` | push (à étendre token natif) |
| POST/GET | `/tracking/session/{start,ping,stop}` · `/update` · `/report` · `/relance` · `/bus-events` | partage live |
| GET | `/health` | santé |

> Non utilisés : `/webhook` (WhatsApp), `/telegram/webhook`.

---

## 15A. Cadre Agno (backend, hors app mobile)

**Décision** : Agno est retenu comme framework d'orchestration agent **côté backend**, mais il ne change pas l'architecture mobile. L'app RN continue à parler uniquement à FastAPI via REST/WS.

Ce qu'Agno peut remplacer :

- la boucle ReAct custom de `whatsapp-agent/agent/xetu_agent.py` ;
- la sélection d'outils et le streaming interne des événements agent ;
- une partie de l'observabilité agent, si elle est utile après parité.

Ce qu'Agno ne remplace pas :

- `FastAPI`, Railway, Supabase, Redis/session locks ;
- les endpoints `/api/*`, `/tracking/*`, `/ws/{session}` ;
- les shortcuts déterministes avant LLM ;
- `db/queries.py` comme frontière d'accès données ;
- les implémentations métier des tools ;
- l'anti-fraude, les subscriptions, le fanout push ;
- les contrats consommés par l'app RN.

### 15A.1 Mode d'adoption

Agno doit entrer derrière un feature flag backend :

```text
AGENT_RUNTIME=custom|agno
```

Règles :

- défaut production = `custom` jusqu'aux tests de parité ;
- `agno` activable sur staging, puis sur une petite cohorte interne ;
- aucun changement de payload WebSocket requis pour le mobile ;
- rollback = changer la variable d'environnement, sans nouveau build mobile.

### 15A.2 Runtime

Phase A :

```text
FastAPI process
  -> orchestrator/pipeline.py
  -> agent/xetu_agno_agent.py
  -> Agno Agent
```

Pas d'AgentOS séparé au départ. Ajouter un deuxième service Railway maintenant augmenterait la surface d'incident avant que l'app mobile soit stable.

Phase B seulement si utile :

- traces agent consultables ;
- évals/golden conversations ;
- workflows multi-étapes ;
- interface équipe pour inspecter les runs.

### 15A.3 Modèle

DeepSeek reste le fournisseur modèle.

Ordre d'intégration :

1. adapter Agno DeepSeek si compatible avec le modèle déployé ;
2. `OpenAILike` pointé vers l'API DeepSeek si c'est plus stable ;
3. wrapper temporaire autour du client DeepSeek actuel si nécessaire.

Interdits :

- pas de Gemini ;
- pas de Groq ;
- pas d'appel LLM depuis l'app RN ;
- pas d'exposition du provider au user.

### 15A.4 Tools Agno

Créer des wrappers minces autour des tools existants, pas une deuxième logique métier.

Tools à exposer :

```text
calculate_route
get_recent_sightings
report_bus
manage_subscription
get_bus_info
resolve_spatial_query
extract_entities
```

Règles d'injection :

- `session_id`, `phone`, token WS, GPS connu, score user = injectés côté serveur ;
- le modèle ne fournit jamais l'identité utilisateur ;
- les args ligne/arrêt/destination sont validés avant exécution ;
- un tool qui écrit en base doit rester idempotent ;
- tous les tool calls sont loggés avec `run_id`, `session_id`, nom tool, durée, statut.

### 15A.5 Guardrails

Avant Agno :

- identité/modèle/provider interceptés ;
- signalement fort prioritaire même pendant itinéraire actif ;
- shortcut GPS follow-up ;
- place-lines / route shortcut ;
- manipulation et hors-scope filtrés.

Pendant Agno :

- instructions transport Dakar uniquement ;
- tools limités au domaine Xëtu ;
- budget temps strict ;
- pas de fausse donnée live ;
- pas de promesse de position officielle des bus.

Après Agno :

- redaction PII si nécessaire ;
- garde "pas de Google/Gemini/provider leak" ;
- réponse courte et actionnable ;
- conversion interne des événements tool en statuts WS si utile.

### 15A.6 Impact mobile

L'app RN ne doit voir aucune différence contractuelle.

Elle peut seulement recevoir de meilleurs statuts :

```text
typing
status: "Recherche des arrêts..."
status: "Calcul de l'itinéraire..."
status: "Abonnement ligne 4 enregistré"
chat_response
error
```

Ne pas introduire d'événements Agno bruts dans le mobile. Le backend traduit tout en événements Xëtu stables.

### 15A.7 Vérification Agno

Agno est acceptable seulement si :

- golden conversations chat identiques ou meilleures ;
- `get_bus_info`, `manage_subscription`, `report_bus`, `calculate_route` appellent les bons tools ;
- "alerte-moi ligne 4" crée l'abonnement et apparaît dans Mes lignes ;
- signalement en session itinéraire reste prioritaire ;
- aucune mention provider/modèle ne sort ;
- timeout pipeline conservé ;
- WhatsApp, Telegram, PWA et RN passent les mêmes tests chat.

---

## 16. Phases (ordre exact + sortie de phase ✅)

**Phase 0 — Hotfix clavier PWA** (`whatsapp-agent/Dashboard/`, ~1j). Fusionner les 3 handlers (`fixIosKeyboard` index.html + `_initKeyboardViewport` app.js + aligneur signal.js) en **un** contrôleur, `transform` seul, throttle rAF. ✅ Plus de jank au focus sur iPhone réel. *(Indépendant du rewrite, soulage les users live.)*

**Phase 1 — Scaffold RN/Expo.** Convertir le repo : expo-router, NativeWind (tokens §4), `lucide-react-native`, `keyboard-controller`, `safe-area-context`, Reanimated, Zustand. Services `session`+`ws`. EAS configuré. ✅ App boot, 4 tabs vides, session créée, WS connecté (statut visible), build EAS interne OK.

**Phase 2 — Chat IA.** ✅ Conversation E2E réelle (DeepSeek), **clavier fluide iPhone** (les 6 critères §11), reconnexion WS OK. *(Retire la coque WebView ici.)*

**Track backend Agno — parallèle, non bloquant mobile.** À lancer après Phase 2 ou en parallèle si le chat RN est stable. ✅ `AGENT_RUNTIME=agno` passe les golden tests, puis reste désactivable instantanément.

**Phase 3 — Mes lignes + score.** ✅ Abonnement/désabonnement persistés ; score réel.

**Phase 4 — Itinéraire.** ✅ Recherche + résultat `/api/route` ; swap ; destinations fréquentes.

**Phase 5 — Signalement.** ✅ Wizard 3 étapes, `POST /api/report` 201, GPS natif, succès+points ; rayon notify vérifié.

**Phase 6 — Carte.** Décider option §13 en amont. ✅ Carte + bus actifs réels + bottom-sheet + top signaleurs ; pas de faux live.

**Phase 7 — GPS + live tracking.** ✅ `expo-location` + `/tracking/*` + permission onboarding.

**Phase 8 — Push natif.** ⚠️ Fix P0-3 backend d'abord. ✅ Token natif enregistré, notif reçue device réel.

**Phase 9 — Offline / erreurs / onboarding / paramètres / liens externes.** ✅ États offline honnêtes ; file d'attente ; menu (Telegram/WhatsApp/partage/avis/CGU/contact/QR).

**Phase 10 — Durcissement + stores.** ✅ TestFlight + Play interne ; users WhatsApp onboardés ; PWA passe en **maintenance** (canal web de secours).

---

## 17. Tests

- **Unitaires (Jest + RNTL)** : `ws` (reconnexion/heartbeat/codes reset), `session` (idempotence), `api` (retry/mapping), stores Zustand, formatters (âge donnée).
- **Composants** : `ChatBubble`, `LigneBadge`, wizard, bottom-sheet.
- **E2E (Maestro recommandé, ou Detox)** : Chat, Abonnement, Itinéraire, Signalement.
- **Device manuel obligatoire** : clavier iPhone réel (chaque critère §11) — non simulable fidèlement.
- **Contrats API** : figer la forme des réponses `/api/*` (détecter ruptures backend).
- **Agno backend** : golden conversations, parité tools, timeout, guard provider, rollback `AGENT_RUNTIME=custom`.

---

## 18. Déploiement (EAS)

- **EAS Build** : iOS + Android (gère signing/keystore/credentials).
- **EAS Submit** : TestFlight + Play Console (piste interne dès Phase 2).
- **EAS Update** : OTA (bundles JS) — déployer les correctifs sans repasser par les stores. *(Remplace AppFlow, qui est en sunset.)*
- **Push** : APNs key + FCM via EAS credentials (Phase 8).
- **iOS ATS** : HTTPS Railway OK. **Android** : pas de cleartext en prod.
- **CI** : lint + tests + `eas build` sur tag.

---

## 19. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Port carte (Phase 6) | retard | démarrer en **Leaflet-WebView** (porte l'existant) ; MapLibre seulement si jank ; carte en **dernier** |
| Courbe React (PWA = vanilla JS, pas de framework) | vélocité | petit périmètre MVP ; Zustand + expo-router (simples) ; pas de Redux |
| Double maintenance PWA + RN (transitoire) | charge | PWA en **bugfix-only** pendant le build ; bascule à parité |
| PWA = canal de secours, pas flagship | divergence features | acté : la PWA ne suit pas feature-à-feature ; décision produit assumée |
| Push + P0-3 auth | sécurité | **corriger P0-3 backend avant Phase 8** |
| Pipeline < 18s (WhatsApp) | régression backend | le mobile ne touche pas le pipeline ; pas d'appel synchrone ajouté |
| Agno modifie le comportement chat | confiance | feature flag, golden tests, rollback immédiat vers `custom` |
| Événements Agno exposés au mobile | dette contrat | backend traduit en événements Xëtu stables (`typing/status/chat_response/error`) |
| Données réseau dupliquées | dette C4 | revue : toute liste lignes/arrêts vient d'une API |
| Faux live affiché | confiance (C7) | afficher l'âge réel ; états vides explicites |

---

## 20. Critères d'acceptation (globaux)

- [ ] 4 tabs + signalement + détails sur iPhone **et** Android réels.
- [ ] **Clavier** : aucun des 6 défauts §11 reproductible sur iPhone.
- [ ] Chat E2E réel (DeepSeek), reconnexion WS transparente après coupure réseau.
- [ ] Agno, si activé, reste invisible contractuellement côté mobile et rollbackable.
- [ ] Abonnement chat → visible dans Mes lignes.
- [ ] Signalement E2E persiste + notifie (rayon vérifié) ; points corrects.
- [ ] Aucune logique métier dupliquée (C2/C4) ; agent 100% backend.
- [ ] Aucune fausse donnée / faux live (C7).
- [ ] Identité visuelle Xëtu conservée (couleurs, tabs, wording, flows).
- [ ] Builds signés TestFlight + Play interne ; PWA en maintenance.

---

## 21. Ordre d'exécution résumé

`Phase 0 (hotfix PWA) → 1 (scaffold RN) → 2 (Chat) → 3 (Mes lignes) → 4 (Itinéraire) → 5 (Signalement) → 6 (Carte) → 7 (GPS) → 8 (Push, après fix P0-3) → 9 (Offline/onboarding) → 10 (stores + PWA maintenance)`

**Difficulté / priorité** : Chat ★★ (prioritaire — valide clavier+WS+feel natif) · Mes lignes ★ · Itinéraire ★★ · Signalement ★★★ · Carte ★★★ (seul vrai risque) · GPS ★ (déjà prouvé) · Push ★★ (dépend backend).
