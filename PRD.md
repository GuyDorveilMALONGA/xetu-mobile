# Xëtu Mobile — PRD (slices)

> Date : 2026-06-24
> Repo : `C:\Users\DELL\Desktop\xetu-mobile`
> Backend source de vérité : `C:\Users\DELL\Desktop\whatsapp-agent` (FastAPI + Supabase + Redis)
> Statut : spec produit, contrats dérivés du code backend réel (lu, pas supposé)

---

## 0. Place de ce document

Trois artefacts, trois rôles — **ne pas dupliquer entre eux** :

| Doc | Rôle | Ce qu'il contient |
|---|---|---|
| `BIBLE.md` | North-star / roadmap | Vision, paliers, sources Expo |
| **`PRD.md` (ici)** | **Quoi exact + contrats + acceptation** | Slices, types, endpoints, critères de done |
| Doryx (`.doryx/`) | Décisions + état d'exécution | D1-D5, contraintes, tranche courante |

Règle : une **décision** va dans Doryx (`decisions.md`), pas ici. Le PRD *référence* `D1`…`D5`, il ne les re-tranche pas. Un **contrat d'API** va ici (dérivé du backend), pas dans la BIBLE.

> ⚠️ **Doryx actuellement inactif** (`.doryx/state.json` absent, 2026-06-24). En attendant son activation, la décision d'architecture **D8** (§1.4) est **spécifiée ici** ; elle devra être **inscrite dans Doryx** (`decisions.md`) dès réactivation, le PRD ne gardant alors que la référence.

---

## 1. Produit

**Xëtu Mobile** = app mobile iOS/Android construite en **hybride** : une **coquille Expo native** qui **exécute la PWA existante** (`whatsapp-agent/Dashboard`) dans une WebView pour l'UI, et **ajoute** par-dessus les capacités device que le web ne peut pas fournir de façon fiable (GPS foreground/background, push natif, permissions, identité device). Voir **§1.4 (Décision D8)**. Elle **consomme** le backend par HTTP. Elle ne contient **aucune** logique métier transport — la position, la confiance, le routing et l'anti-fraude restent backend.

### 1.1 Utilisateur cible
Usager quotidien du bus à Dakar, smartphone Android entrée/milieu de gamme, réseau intermittent (3G/4G instable), data comptée. Conséquence produit : **léger, tolérant au offline, états d'erreur actionnables**.

### 1.2 Objectifs (MVP testable sans publication)
1. Voir les bus actifs avec niveau de confiance et fraîcheur.
2. Chercher un arrêt et voir quelles lignes y passent + récence.
3. Signaler un bus (action communautaire centrale).
4. Calculer un itinéraire simple.
5. Suivre ses lignes ("Mes lignes").

### 1.3 Non-objectifs (explicitement hors MVP)
- **Pas de port RN visuel de la PWA** : l'UI vient de la PWA via WebView (pivot D8, §1.4). L'ancien objectif « UI native React Native » est abandonné pour le MVP.
- **Pas d'app native cachée derrière la WebView** : le natif n'expose que des capacités device, pas des écrans (anti-dérive D8).
- Pas de paiement, pas de compte/login mot de passe.
- Pas de géoloc background avant slice dédiée + décision privacy.
- Pas de publication stores tant que le MVP (S-Shell + S6) n'est pas vert.

---

## 1.4 Architecture d'exécution — Shell Expo + WebView  *(Décision D8, 2026-06-24)*

**Pivot par rapport au scaffold initial.** L'UI n'est plus re-codée en React Native. Le mobile est une **coquille Expo native** qui **exécute la PWA** (`whatsapp-agent/Dashboard`) dans une `WebView`. Raison structurelle : la PWA est déjà une app mobile complète (mobile-first vérifié — `viewport-fit=cover`, media queries 375/768px, `.bottom-nav` + Signaler central, bottom-sheets, carte `map.js`, tokens orange). La recopier en RN = **re-dériver un asset existant**, jamais pixel-exact. On **exécute** l'asset au lieu de le copier → **visuel 100%**.

### La frontière (le « seam »)

| Couche | Possède | Détail |
|---|---|---|
| **PWA (WebView)** | **Toute l'UI + features web** | rendu, navigation, `/api/buses`, `/api/stops/search`, `/api/route`, `/api/report`, `/api/subscriptions`, `/api/leaderboard`, carte (`map.js`), live WebSocket (`ws.js`) |
| **Natif (Expo)** | **Capacités device** | GPS (foreground + futur background), push natif, permissions, identité device — ce que la PWA **ne peut pas** faire de façon fiable |

> **Règle anti-dérive** : ne pas reconstruire une app native cachée derrière la WebView. Le natif n'expose que des **capacités**, pas des écrans.

**Ce que la WebView donne gratuitement** (c'est la PWA qui tourne) : visuel, browse/search/signal/route/mes-lignes/leaderboard, carte, live WebSocket, géoloc foreground basique.
**Ce que le natif doit AJOUTER** (absent ou non fiable côté web) : GPS fiable cross-platform + futur background ; le **« Je vois le bus »** `/tracking/update` (**net-new — non présent dans la PWA**, voir S6) ; push natif (le web push de `push.js` ne marche pas en WebView mobile, §7.1).

### D8.a — Hébergement de la PWA : distante d'abord

- **Dev / MVP interne** : la WebView charge l'**URL PWA distante**. Itération rapide — corriger le web met l'app à jour **sans rebuild natif**.
- **Pré-store iOS sérieux** : reconsidérer **bundlé** ou au moins un **fallback local minimal** (offline + réduit le risque App Store **règle 4.2** « juste un site dans une app », §7.7).
- **Levier backend** : la PWA résout son backend via `?api=` (query) ou `localStorage.xetu_api_base` (défaut `agent-des-transport-xetu.onrender.com`). Le shell peut donc pointer la PWA sur un backend choisi en chargeant l'URL avec `?api=…`.

### D8.b — Le natif est propriétaire des capacités device dès le départ

On **ne laisse pas** la WebView gérer `navigator.geolocation` (bancal sur iOS WKWebView ; impasse pour le background). `expo-location` est l'**autorité GPS dès la Phase 1**. Idem push : le natif fournit le token (le web push de `push.js` ne marche pas en WebView mobile, §7.1). Coût : +1 colonne native maintenant, mais **zéro réécriture** quand le background arrive — alors que « laisser la WebView gérer le GPS » gagne 2 jours et impose une refonte ensuite.

### D8.c — Bridge minimal (Phase 1 = 3 messages, pas plus)

Transport : **PWA→Native** `window.ReactNativeWebView.postMessage(json)` ; **Native→PWA** `injectJavaScript`. La PWA détecte le shell via la présence de `window.ReactNativeWebView` — **sinon fallback navigateur** : la *même* PWA marche dans un navigateur ET dans le shell.

```
PWA   -> Native : requestLocation      # demande une position foreground
Native -> PWA   : locationResult       # {lat, lon, accuracy} | {error}
Native -> PWA   : nativeCapabilities   # au chargement : {geoloc, push, platform, ...}
```

Plus tard **seulement** :

```
PWA   -> Native : subscribePush
Native -> PWA   : pushTokenResult
```

> Au-delà de ces messages, on recrée une app native cachée → interdit en Phase 1.

### Réutilisable vs parqué (travail Expo existant)

- **Réutilisable** : `src/config.ts`, `src/api.ts`, `src/types.gen.ts`, `src/identity.ts` — servent au bridge (identité device) et aux **écrans natifs** futurs (remplacement progressif).
- **Parqué (superseded par la PWA)** : `src/screens/` (UI RN) et composants liste/cartes RN. Conservés en repo, **hors du chemin d'exécution**.
- **Contrats §3/§4 inchangés** : ils restent la vérité — la PWA tape les mêmes endpoints, et le bridge / les écrans natifs futurs en dépendent.

### Phases

1. **Phase 1 — Shell** : WebView + PWA distante + bridge GPS minimal (slice **S-Shell**). Visuel 100% + colonne native posée.
2. **Phase 2 — Capacités natives** : `/tracking/update` « Je vois le bus » (S6), puis push natif (S9).
3. **Phase 3 — Remplacement progressif** : sortir un écran de la WebView vers du RN natif seulement si un besoin réel le justifie (perf, gestes, background).

---

## 2. Modèle d'identité & session (critique — lu dans le backend)

Le backend **n'a pas d'auth**. Il utilise deux clés selon l'endpoint :

| Clé | Endpoints | Sémantique backend |
|---|---|---|
| `session_id` (≤128 chars) | `/api/subscriptions*` | Identité device pour "Mes lignes" |
| `phone` (≤96 chars) | `/api/report` (interne), `/api/push/*`, `/tracking/update` | Clé générique signaleur. Le web envoie `web_<ip16>` |

**Décision produit (→ à inscrire en Doryx D6) :** générer **un identifiant device stable** à la première ouverture (UUID v4 persisté en stockage local non-secret), et le réutiliser :
- comme `session_id` pour les abonnements ;
- comme `phone` pour `/tracking/update` (ex. `mob_<uuid8>`).

> ⚠️ `phone` n'est jamais un vrai numéro côté mobile. Ne **jamais** demander le numéro de téléphone à l'utilisateur pour ces appels.

---

## 3. Référence de contrat API (dérivée du code, 2026-06-24)

Base URL : `EXPO_PUBLIC_API_BASE_URL` (URL publique Railway du backend). En natif Android émulateur vers backend local : `http://10.0.2.2:<port>`. CORS ne concerne **que** l'Expo web ; le natif en est exempt.

| Méthode | Chemin | Params / Body | Réponses |
|---|---|---|---|
| GET | `/api/buses` | — | `200 {buses[], total, timestamp}` · `{buses:[], error:"db_error"}` |
| GET | `/api/stops/search` | `q` (2-60), `lat?`, `lon?` | `200 {stops[], total, query, via_secteur?}` |
| GET | `/api/route` | `from` (1-80, **alias**), `to` (1-80), `no_transfer?` | `200 {…dynamique…, origin_query, dest_query}` · `422` · `500` |
| POST | `/api/report` | body `ReportPayload` | `201 {id, status:"recorded"}` · `200 {status:"already_recorded"}` · `422` · `429 {error,message,retry_after}` · `500` |
| POST | `/tracking/update` | body `{phone, lat, lon, ligne?}` | `200 {status:"ok",ligne,arret}` · `{status:"no_stop_found"\|"spam"\|"db_error"}` |
| GET | `/api/subscriptions` | `session_id` | `200 {lignes:[str]}` · `400` · `500` |
| POST | `/api/subscriptions` | body `{session_id, ligne}` | `201 {status:"ok", ligne}` · `400` · `500` |
| DELETE | `/api/subscriptions/{ligne}` | `session_id` (query) | `200 {status:"ok", ligne}` · `400` · `500` |
| GET | `/api/leaderboard` | — | `200 {leaderboard[], stats}` · `{…, error:"db_error"}` |
| GET | `/api/push/vapid-public-key` | — | `200 {publicKey}` *(Web Push — voir §7.1)* |
| POST | `/api/push/subscribe` | body `{phone, endpoint, keys{p256dh,auth}}` | `201` · `400` · `409` · `429` · `503` *(Web Push)* |
| DELETE | `/api/push/unsubscribe` | `phone`, `endpoint` (query) | `200` *(Web Push)* |

### Points pointilleux à ne pas rater
- **`/api/route`** : le paramètre s'appelle `from` côté URL (alias Python `from_`). Le **corps de réponse est dynamique** (sortie de `get_graph().find_route`) — **non typable statiquement** depuis l'endpoint. → S4 commence par *capturer* une réponse réelle avant de coder l'écran.
- **`/api/report` champ `source`** : whitelist = `web_dashboard, web_popup_confirm, web_modal, web_sheet, web_geoloc, web_signal`. **Toute autre valeur est silencieusement coercée en `web_dashboard`.** Il n'existe **aucune source `mobile`**. → décision S3 (§7.2).
- **`/api/report` validation `ligne`** : `.strip().upper()` puis doit ∈ `VALID_LINES` (chargé serveur depuis JSON). Une ligne inconnue = `422`. Le mobile ne doit jamais inventer de ligne.
- **`/api/report` bornes GPS** : `lat ∈ [12,16]`, `lon ∈ [-17.7,-11]` (Sénégal) sinon `422`. `/tracking/update` lui accepte `[-90,90]/[-180,180]` (validé ensuite par proximité d'arrêt).
- **Rate limit report** : 5/IP/10min + 30/IP/heure ; **dédup 30s** (même ligne+arrêt+IP → `200 already_recorded`). L'UI doit traiter `200 already_recorded` comme un **succès idempotent**, pas une erreur.
- **`/tracking/update`** renvoie toujours HTTP 200 ; le vrai résultat est dans `status`. `spam` = un appel < 30s. → S6 throttle côté client à ≥ 30s.
- **`/api/subscriptions` ≠ `/api/push/subscribe`** : la 1re = suivre une ligne ("Mes lignes", clé `session_id`) ; la 2de = transport Web Push (clé `phone` + endpoint navigateur). La 1re marche en natif, la 2de **non** (§7.1).

---

## 4. Types partagés (`src/types.gen.ts` — générés depuis OpenAPI)

Source de vérité actuelle :

- Backend : `whatsapp-agent/api/schemas.py` expose les `response_model` FastAPI mobile-facing.
- Mobile : `src/types.gen.ts` est généré depuis `/openapi.json`.
- Commande : `npm run generate:api-types -- <backend-openapi-url-or-file>`.

Ne pas recréer ces types à la main dans l'app. Les extraits ci-dessous décrivent les formes métier attendues ; le code doit importer les types depuis `src/types.gen.ts`.

```ts
// GET /api/buses
export type Confiance = { niveau: 'vert' | 'jaune' | 'rouge'; emoji: string; label: string };
export type RouteWindowStop = { nom: string; index: number; state: 'passed' | 'current' | 'next' };

export type Bus = {
  ligne: string;
  arret_signale: string;
  arret_estime: string;
  lat: number | null;
  lon: number | null;
  au_terminus: boolean;
  arret_index_depart: number | null;
  arret_index_estime: number;
  arrets_total: number;
  next_arret: string | null;
  progress_to_next: number;            // 0..1
  route_window: RouteWindowStop[];
  repart_dans_min: number | null;      // si au_terminus
  minutes_depuis_signalement: number;
  confiance: Confiance;
  go_sessions_count: number;
  confirmation_count: number;
  confidence_level: 'high' | 'medium' | 'low';
  confidence_reason: string;
  tracking_mode: 'live_gps' | 'community' | 'estimated';
  tracking_freshness_sec: number | null;
  tracking_reason: string;
};
export type BusesResponse = { buses: Bus[]; total: number; timestamp: string } | { buses: []; error: 'db_error' };

// GET /api/stops/search
export type StopLine = { numero: string; has_recent: boolean; last_seen_min: number | null };
export type Stop = { nom: string; lat: number | null; lon: number | null; distance_m: number | null; lignes: StopLine[] };
export type StopsSearchResponse = { stops: Stop[]; total: number; query: string; via_secteur?: string };

// POST /api/report
export type ReportPayload = {
  ligne: string; arret: string;
  observation?: string; source?: string; client_ts?: string;
  session_id?: string; lat?: number; lon?: number; nearest_stop?: string; signalement_id?: string;
};
export type ReportOk = { id: string; status: 'recorded' } | { status: 'already_recorded' };
export type ReportRateLimited = { error: 'rate_limited'; message: string; retry_after: number };

// POST /tracking/update
export type TrackingResponse =
  | { status: 'ok'; ligne: string; arret: string }
  | { status: 'no_stop_found' | 'spam' | 'db_error' };

// /api/subscriptions
export type SubscriptionsResponse = { lignes: string[] };

// GET /api/leaderboard
export type Badge = { emoji: string; label: string; niveau: 1 | 2 | 3 | 4 };
export type LeaderboardEntry = {
  rang: number; pseudo: string; name: string; avatar: string; zone: string;
  nb_signalements: number; count: number; fiabilite_score: number; // 0..100
  badge: Badge; badges: string[];
};
export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  stats: { total_signalements_aujourd_hui: number; total_signalements_all_time: number; nb_contributeurs: number };
};

// GET /api/route — enveloppe typée depuis OpenAPI, objets routes internes encore souples.
export type RouteResponse = { origin_query: string; dest_query: string; [k: string]: unknown };
```

---

## 5. Slices (vertical, chacune livre un incrément utilisable)

Convention par slice : **But · User story · Contrat · UI/états · Acceptation · Vérif · Hors-scope · Risques/décisions.** "Vérif" = commande exécutée + observation, jamais "ça compile".

> **Impact de l'architecture WebView (D8) sur les slices ci-dessous.** Sous le shell WebView, l'**UI** de S1, S2, S3, S4, S5, S7 est livrée par la **PWA**. Ces slices restent ici comme **référence de contrat** (endpoints, mapping, acceptation), valides pour le bridge et les futurs écrans natifs — mais ne sont **plus à recoder en RN**. Les slices à **vraie valeur native** sont : **S-Shell** (nouveau, priorité 1), **S6** (GPS live, net-new), **S8** (carte — déjà en partie dans la PWA), **S9** (push natif).

---

### S-Shell — Coquille Expo + WebView  *(NOUVEAU — priorité 1, Décision D8)*

- **But** : afficher la PWA dans une coquille native (visuel 100%) et poser la colonne du bridge GPS.
- **User story** : « J'ouvre l'app mobile et je retrouve exactement ma PWA, en plein écran natif. »
- **Scope Phase 1**
  - installer `react-native-webview` (**valider compat Expo SDK 56 avant** — §7.4) ;
  - `WebViewScreen` charge l'URL PWA (`EXPO_PUBLIC_PWA_URL`, éventuellement suffixée `?api=…` pour cibler le backend — D8.a) ;
  - **allowlist d'origine** : n'autoriser que l'origine PWA + l'origine backend ; bloquer toute navigation hors allowlist (§7.8) ;
  - injecter le **bridge minimal** (D8.c) : `nativeCapabilities` au chargement, `requestLocation` → `locationResult` via `expo-location` (foreground) ;
  - laisser **toute** l'UI à la PWA.
- **États** : PWA chargée (succès) ; échec de chargement → **écran natif** « PWA injoignable, réessayer » (jamais une WebView blanche) ; permission géoloc refusée → `locationResult{error}` propre, la PWA dégrade.
- **Acceptation**
  - L'app rend la PWA à l'identique (visuel 100%).
  - Dans le shell, une demande de position de la PWA passe par le **natif** (`expo-location`), pas par `navigator.geolocation` — vérifiable sur un device iOS où WKWebView échouerait.
  - Navigation vers une origine non-allowlistée **bloquée**.
  - La même PWA, ouverte hors shell (navigateur), continue de marcher (fallback `navigator.geolocation`).
- **Vérif** : `npx.cmd tsc --noEmit` · run émulateur Android → PWA rendue · log bridge : `requestLocation`→`locationResult` observé · test navigation hors-origine bloquée.
- **Hors-scope Phase 1** : push (`subscribePush` — phase ultérieure), background GPS, écrans natifs.
- **Risques** : règle App Store 4.2 si distant (§7.7) ; iOS WKWebView géoloc (mitigé par bridge, §7.6) ; double identité PWA/natif (§7.9).

---

### S0 — Socle & client API typé  *(fait — OpenAPI généré)*

- **But** : transformer le scaffold en base produit stable et typée.
- **Scope**
  - `src/config.ts` : lit `EXPO_PUBLIC_API_BASE_URL`, expose `apiBaseUrl`, `isConfigured`, flags publics.
  - `src/types.gen.ts` : types générés depuis `/openapi.json` (§4).
  - `src/api.ts` : client HTTP strict ; `Bus` vient de `components['schemas']['BusPosition']`.
  - `src/errors.ts` : `ApiError { kind: 'network'|'timeout'|'http'|'parse'; status?; retryAfter?; message }`.
  - `src/identity.ts` : `getDeviceId()` (UUID v4 persisté, `expo` AsyncStorage / SecureStore non requis car non-secret).
- **États transverses** : helper `AsyncState<T> = idle | loading | success(T) | error(ApiError)`.
- **Acceptation**
  - `getApiBaseUrl()` vide → l'app affiche un état "API non configurée" actionnable, jamais un crash.
  - Un appel qui timeout produit `ApiError.kind='timeout'` (vérifiable en pointant une URL morte).
- **Vérif** : `npx.cmd tsc --noEmit` · `npx.cmd expo config --type public` · capture écran web "API non configurée".
- **Hors-scope** : retries, cache.
- **Statut** : `normalizeBuses` est strict sur `{buses}` ; maintenir cette règle avec les types générés.

---

### S1 — Accueil "Bus live"  *(scaffold existant à durcir)*

- **But** : afficher les bus actifs lisiblement, avec confiance et fraîcheur.
- **User story** : « En ouvrant l'app, je vois les bus signalés récemment, lesquels sont fiables, et depuis combien de temps. »
- **Contrat** : `GET /api/buses` → `BusesResponse`.
- **UI / composants** : `BusList`, `BusCard`, `ApiStatusBanner`, `RefreshButton`.
  - `BusCard` affiche : `ligne`, `arret_estime` (fallback `arret_signale`), `next_arret`, badge `confiance` (couleur ↔ `niveau`), `tracking_mode` (libellé FR : live_gps→"GPS live", community→"Confirmé", estimated→"Estimé"), `minutes_depuis_signalement` ("il y a Xmin").
  - `progress_to_next` → barre de progression vers `next_arret`.
  - `au_terminus` + `repart_dans_min` → "Au terminus, repart dans X min".
- **États** : loading (skeleton), empty (`buses:[]` sans erreur → "Aucun bus signalé récemment"), error (`error:'db_error'` ou réseau → message + bouton réessayer).
- **Acceptation**
  - Aucun champ client absent du backend (régression déjà corrigée — garder un test de mapping).
  - `tracking_mode`/`confidence_level` mappés sur des libellés FR, jamais affichés bruts.
  - Tri d'affichage stable (par récence croissante de `minutes_depuis_signalement`).
- **Vérif** : `tsc` · run web sur backend réel → liste rendue ou erreur actionnable · test unitaire `normalizeBuses({buses:[…]})`.
- **Hors-scope** : carte (S8), détail (S2).

---

### S2 — Recherche d'arrêts & détail ligne

- **But** : chercher un lieu/arrêt et voir les lignes + récence.
- **User story** : « Je tape "Liberté 4" et je vois les arrêts proches et quelles lignes y passent, lesquelles ont un bus récent. »
- **Contrat** : `GET /api/stops/search?q=&lat?&lon?` → `StopsSearchResponse`. (Min 2 chars ; sinon ne pas appeler.)
- **UI** : `SearchBar` (debounce 300ms, longueur ≥2), `StopResultList`, `StopCard` (nom, `distance_m` si GPS, puces `lignes[]` avec pastille `has_recent`/`last_seen_min`), bandeau `via_secteur` si présent ("Résultats via secteur : …").
- **États** : typing (<2 chars → hint), loading, empty (`total:0` → "Aucun arrêt trouvé, essaie un quartier"), error.
- **Acceptation**
  - Debounce vérifié : taper "liberte" ne déclenche pas 7 requêtes (≤1 après pause).
  - `distance_m=null` toléré (pas de GPS) → on n'affiche pas la distance.
  - `via_secteur` affiché distinctement quand la résolution passe par un secteur.
- **Vérif** : `tsc` · run web : "liberté 4" renvoie des arrêts · log réseau montre 1 requête après debounce.
- **Hors-scope** : navigation vers itinéraire depuis un arrêt (S4 fera le lien).
- **Pointilleux** : pas d'endpoint "lister tous les arrêts" — **recherche uniquement**. Pas de browse-all.

---

### S3 — Signaler un bus  *(action communautaire centrale)*

- **But** : permettre de signaler un bus vu, avec ou sans GPS.
- **User story** : « Je vois le bus 7 à Castors, je le signale en 2 taps pour aider les autres. »
- **Contrat** : `POST /api/report` (`ReportPayload`). Réponses : `201 recorded`, `200 already_recorded` (= succès), `429 rate_limited`, `422`, `500`.
- **UI** : `ReportSheet` — champ `ligne` (sélection depuis lignes connues, jamais saisie libre non validée), champ `arret` (réutilise S2 pour résoudre un vrai nom d'arrêt, ≥2 chars), `observation` optionnelle (≤200), toggle "joindre ma position" → GPS foreground.
- **Mapping payload**
  - `ligne`, `arret` (obligatoires) ; `observation?` ; `session_id = getDeviceId()` ; `client_ts = new Date().toISOString()`.
  - `source` : voir **décision §7.2** (en attendant : `web_geoloc` si GPS joint, sinon `web_signal`).
  - `lat/lon` seulement si l'utilisateur a accepté la position **et** dans les bornes Sénégal (sinon ne pas envoyer → évite `422`).
- **États / erreurs**
  - `201`/`200` → toast "Signalement pris en compte 🙏" (traiter `already_recorded` comme succès).
  - `429` → afficher `message` backend + désactiver le bouton `retry_after` secondes (compte à rebours).
  - `422` → surligner le champ fautif (ligne inconnue / arrêt trop court / GPS hors zone).
- **Acceptation**
  - Impossible d'envoyer une `ligne` hors `VALID_LINES` depuis l'UI (sélection contrôlée).
  - Double tap rapide même ligne+arrêt → l'UI gère le `200 already_recorded` sans afficher d'erreur.
  - GPS refusé → le signalement part quand même (sans lat/lon).
- **Vérif** : `tsc` · run : signaler une ligne valide → `201` observé (log réseau) · forcer 6 envois → `429` rendu avec compte à rebours.
- **Risque** : la coercion `source` (§7.2) ; bornes GPS strictes (§3).

---

### S4 — Itinéraire simple

- **But** : calculer un trajet origine→destination.
- **User story** : « De Castors à Liberté 6, quelle ligne je prends ? »
- **Contrat** : `GET /api/route?from=&to=&no_transfer?` → `RouteResponse`. Les statuts sont typés ; les objets internes de `routes`, `alt_walk`, `alt_transfer` restent souples et doivent être capturés avant UI fine.
- **Pré-requis bloquant** : tâche S4.0 = appeler l'endpoint live, sauvegarder le JSON, déduire le type. **Ne pas coder l'écran avant.**
- **UI** : `RoutePlanner` (deux champs branchés sur S2 pour résoudre de vrais noms), toggle "sans correspondance" (`no_transfer`), `RouteResult`.
- **États** : loading, `422` (champs manquants), `500` (`route_calculation_failed` → "Itinéraire indisponible"), empty (aucun trajet).
- **Acceptation**
  - `from`/`to` envoyés via le **paramètre `from`** (pas `from_`).
  - Les sous-types UI de `routes` reflètent l'échantillon capturé, pas une hypothèse.
- **Vérif** : capture JSON réelle commitée dans `docs/samples/route.json` · `tsc` · run : un trajet connu rend un résultat.
- **Hors-scope** : tracé sur carte (S8).

---

### S5 — Mes lignes (abonnements)

- **But** : suivre des lignes et les retrouver.
- **Contrat** : `GET /api/subscriptions?session_id=` · `POST {session_id,ligne}` · `DELETE /api/subscriptions/{ligne}?session_id=`.
- **Identité** : `session_id = getDeviceId()` (§2).
- **UI** : `MyLinesScreen` (liste des `lignes` abonnées), bouton suivre/ne plus suivre sur chaque ligne (dans S1/S2 aussi).
- **États** : optimistic update (ajout/retrait immédiat, rollback si `500`).
- **Acceptation**
  - `session_id` stable entre sessions app (même appareil → mêmes lignes).
  - Suivre puis tuer l'app puis rouvrir → la ligne est toujours là (persistance backend).
- **Vérif** : `tsc` · run : suivre L7 → `201` ; recharger → L7 présent ; DELETE → disparaît.
- **Pointilleux** : abonnement ≠ notification push. S5 ne **notifie pas** — il mémorise. La notification réelle dépend de S9.

---

### S6 — Live GPS « Je vois le bus »

> **Sous D8** : le déclencheur « Je vois le bus » n'existe **pas** dans la PWA actuelle (`/tracking/update` n'est jamais appelé côté web — vérifié 2026-06-24). C'est une feature **net-new**. Décision ouverte (§7.6) : l'**ajouter côté PWA** (web change dans `whatsapp-agent`, le natif fournit le GPS via bridge — cohérent avec « PWA possède l'UI ») **ou** la porter dans un overlay natif. Dans les deux cas, le GPS vient du bridge et le **throttle ≥30s reste obligatoire**.

- **But** : laisser un usager dans/à côté du bus pousser sa position pour rafraîchir le tracking.
- **Contrat** : `POST /tracking/update {phone, lat, lon, ligne?}`. Réponses dans `status` (HTTP toujours 200).
- **Identité** : `phone = "mob_" + getDeviceId()` (§2).
- **UI** : bouton "Je vois le bus" → géoloc **foreground** uniquement → 1 envoi. Optionnel : mode "à bord" qui renvoie toutes les ≥30s en foreground.
- **États** : `ok` → "Merci, position partagée (ligne X, arrêt Y)" ; `no_stop_found` → "Aucun arrêt Dem Dikk proche" ; `spam` → throttle silencieux ; `db_error` → réessayer plus tard.
- **Acceptation**
  - **Throttle client ≥ 30s** (le backend renvoie `spam` sinon — ne pas spammer).
  - Permission géoloc refusée → fonctionnalité désactivée proprement, pas de crash.
  - **Aucune géoloc background** (décision séparée requise avant).
- **Vérif** : `tsc` · run émulateur avec position simulée Dakar → `ok` ; 2 appels < 30s → `spam`.
- **Risque privacy** : position = donnée sensible. Texte de consentement clair, envoi sur action explicite seulement.

---

### S7 — Leaderboard communauté

- **But** : valoriser les signaleurs (gamification légère).
- **Contrat** : `GET /api/leaderboard` → `LeaderboardResponse`.
- **UI** : `LeaderboardScreen` (rang, `avatar`, `name` masqué `**** 1234`, `badge.emoji`+`label`, `count`), bandeau stats (`aujourd_hui`, `all_time`, `nb_contributeurs`).
- **Acceptation** : `fiabilite_score` affiché en % (déjà 0-100) ; `pseudo`==`name` (masqué) — ne pas afficher de PII.
- **Vérif** : `tsc` · run : top rendu, stats rendues.
- **Hors-scope** : profil perso, historique.

---

### S8 — Carte native  *(décision D2)*

> **Sous D8** : la PWA embarque déjà une carte (`map.js` / `map.css`) rendue dans la WebView → `react-native-maps` natif **probablement inutile**. Ne garder D2 (carte native) que si la perf/markers l'exigent vraiment après mesure.

- **But** : positionner les bus sur une carte.
- **Décision D2** : MVP = liste/route_window (déjà couvert S1) ; carte réelle = `react-native-maps` (build natif requis → dépend de S-builds).
- **Contrat** : réutilise `GET /api/buses` (`lat`/`lon` quand non `null`).
- **UI** : `MapScreen` avec marqueurs bus ; fallback liste si pas de coords.
- **Acceptation** : bus sans `lat/lon` non placés (pas de marqueur au mauvais endroit — cohérent avec CHG-5 backend).
- **Vérif** : build dev Android + observation marqueurs ; screenshot consigné Doryx.
- **Pré-requis** : `expo-dev-client` / EAS (sort d'Expo Go).

---

### S9 — Push natif  *(NOUVEAU canal backend — voir §7.1)*

> **Sous D8** : l'enregistrement passe par le bridge (`subscribePush` → `pushTokenResult`). Le web push de la PWA (`push.js`) **ne fonctionne pas** en WebView mobile → `expo-notifications` (natif) est le **seul** canal. Le bloqueur backend §7.1 (Web Push ≠ Expo/FCM) reste entier.

- **But** : notifier l'usager qu'un bus de sa ligne suivie est signalé.
- **⚠️ Bloqueur d'architecture** : le push backend actuel est **Web Push (VAPID/pywebpush)** ; un device natif Expo produit un **token Expo/FCM**, pas un endpoint Web Push. **`/api/push/subscribe` est inutilisable en natif.**
- **Travail backend requis** (hors ce repo, à inscrire en dette/decision) :
  - Nouvel endpoint `POST /api/push/expo-register {session_id, expo_push_token, platform}`.
  - Nouveau chemin d'envoi via **Expo Push API** (`https://exp.host/--/api/v2/push/send`) en parallèle de `send_push_notification` (web).
  - Brancher la notification sur le même déclencheur que `notify_abonnes` (signalement d'une ligne suivie).
- **Mobile** : `expo-notifications` (permission, récupération token), enregistrement à l'ouverture si l'utilisateur a des "Mes lignes".
- **Décision D4** : Expo Push Service (recommandé MVP) vs FCM/APNs direct.
- **Acceptation** : notif reçue app fermée (Android) sur un device abonné à une ligne signalée ; token jamais loggé en clair.
- **Vérif** : sur **build dev** (pas web, pas Expo Go pour le scénario complet) ; échec permission géré.
- **Dépend de** : S5 (les lignes suivies) + slice backend Expo push.

---

### S10 — Durcissement release

- **But** : éviter "ça marche seulement sur ma machine".
- **Scope** : tests unitaires purs (normalisation `buses`, mapping `report`, parse `route` capturé) ; états offline/dégradés sur chaque écran ; a11y (tailles texte, contrastes, cibles ≥44px) ; messages d'erreur compréhensibles ; `npm audit --omit=dev`.
- **Acceptation** : les bugs de contrat backend sont attrapés par un test avant démo ; chaque écran a un état offline lisible.
- **Vérif** : `tsc` · suite de tests verte · `expo config` · checklist a11y manuelle.

---

## 6. Exigences non-fonctionnelles

| Domaine | Exigence |
|---|---|
| Réseau | Timeout client 8s ; tout écran réseau a loading/empty/error distincts |
| Offline | Aucun crash hors-ligne ; message + bouton réessayer ; dernier résultat affiché si dispo |
| Perf perçue | Skeletons, pas de spinner plein écran > 1s sans contexte |
| Data | Pas de polling agressif ; refresh manuel + au focus écran |
| Sécurité | Aucun secret en repo/git ; `EXPO_PUBLIC_*` = non-secret uniquement ; pas de PII affichée (le backend masque déjà : `**** 1234`, pas de `signale_par`) |
| Privacy | GPS sur action explicite ; pas de background sans décision dédiée |
| i18n | FR d'abord ; libellés centralisés pour Wolof ultérieur |
| Accessibilité | `accessibilityRole`/`accessibilityLabel` sur actions ; contraste AA |

### Taxonomie d'erreur (uniforme tous écrans)
`network` (pas de connexion) · `timeout` (8s dépassé) · `http_4xx` (afficher `message` backend si présent) · `http_5xx` ("service indisponible, réessaie") · `parse` (réponse inattendue → log + état dégradé).

---

## 7. Risques & décisions ouvertes (à trancher en Doryx)

### 7.1 Push natif incompatible avec le push backend actuel  **[BLOQUEUR connu]**
Le backend ne sait envoyer que du **Web Push** (`/api/push/*`, VAPID, `pywebpush`). Le natif Expo a besoin d'un **canal Expo/FCM** distinct. → S9 nécessite un **nouvel endpoint + nouveau chemin d'envoi backend**, ce n'est pas un branchement sur l'existant. À ne pas découvrir en Phase push.

### 7.2 Source `report` pour le mobile  **[décision D7 à créer]**
La whitelist `source` est 100% `web_*`. Un mobile envoie soit une valeur existante (coercée/imprécise), soit on **ajoute `mobile_signal`/`mobile_geoloc` à la whitelist backend** (1 ligne dans `api/report.py`). Recommandation : **ajouter les sources mobiles** pour une analytics propre ; sinon par défaut `web_geoloc`/`web_signal`.

### 7.3 Shape interne de `/api/route` partiellement souple  **[lever en S4.0]**
`/api/route` expose maintenant une enveloppe `RouteResponse` dans OpenAPI. Les statuts sont typés, mais les entrées de `routes`, `alt_walk`, `alt_transfer` restent des objets souples. Avant l'écran route : capturer au moins 3 réponses réelles (`direct`, `transfer`, `not_found`) et figer les sous-types UI nécessaires.

### 7.4 Claims Expo à reverifier avant builds natifs
La BIBLE référence la doc Expo pour SDK 56, development builds, push et variables d'environnement. Ces sources ont été vérifiées le 2026-06-24, mais doivent être relues avant S8/S9 car les exigences Expo/EAS peuvent évoluer.

### 7.5 Identité device sans auth
`session_id`/`phone` = device id local. Perte/réinstallation = perte des "Mes lignes". Acceptable MVP ; auth réelle = décision produit ultérieure.

### 7.6 « Je vois le bus » (`/tracking/update`) absent de la PWA  **[décision à trancher]**
Vérifié 2026-06-24 : la PWA n'appelle **jamais** `/tracking/update` (les mentions "tracking" = affichage de `tracking_mode` venant de `/api/buses`). C'est donc une feature **net-new**. À trancher : **(a)** l'ajouter à la PWA (web change `whatsapp-agent`, natif fournit le GPS via bridge — cohérent D8) vs **(b)** overlay natif autonome. Recommandation : (a), pour garder « PWA possède l'UI ».

### 7.7 Risque App Store règle 4.2 (wrapper « juste un site »)  **[iOS uniquement]**
Une coquille qui charge une PWA distante peut être refusée par Apple (4.2 « minimum functionality »). Mitigation : l'app utilise de **vraies features device** (géoloc, signaler, push) → en général ça passe. **Play Store non concerné.** → règle D8.a : envisager bundlé / fallback local avant soumission iOS.

### 7.8 Sécurité WebView : allowlist d'origine  **[obligatoire S-Shell]**
La WebView ne doit charger/naviguer que vers l'**origine PWA + origine backend** connues. Bloquer toute autre navigation (`onShouldStartLoadWithRequest`), pas d'ouverture d'URL arbitraire, pas d'injection de secret dans le bundle web. Le bridge n'expose que les capacités de D8.c, rien d'autre.

### 7.9 Double identité PWA ↔ natif  **[seam à résoudre plus tard]**
La PWA a sa propre identité web (`session.js`, `phone = web_<ip>`) ; le natif a `identity.ts` (UUID device). En Phase 1 la PWA garde son identité web (fonctionne). À l'arrivée des écrans natifs / du push natif, les deux stores doivent **converger** (le natif fournit l'identité device à la PWA via un message bridge ultérieur). Non bloquant en Phase 1, mais nommé pour éviter la dérive.

### 7.10 Backend : URL à confirmer (Railway vs Render)  **[à vérifier]**
§3 indique « Railway » ; la PWA pointe par défaut sur `agent-des-transport-xetu.onrender.com` (Render). À confirmer côté `whatsapp-agent` puis aligner §3 / `EXPO_PUBLIC_API_BASE_URL` (règle AGENTS.md : inspecter le backend, puis corriger le PRD).

---

## 8. Matrice de vérification (Definition of Done par slice)

| Slice | Commande | Observation attendue |
|---|---|---|
| **S-Shell** | `tsc --noEmit` + run émulateur Android | PWA rendue à l'identique ; `requestLocation`→`locationResult` via natif observé ; navigation hors-origine bloquée |
| S0 | `tsc --noEmit` + `npm run generate:api-types -- <openapi>` + run web | État "API non configurée" rendu, pas de crash |
| S1 | run web (backend réel) | Liste bus OU erreur actionnable ; mapping testé |
| S2 | run web + log réseau | 1 requête après debounce ; arrêts rendus |
| S3 | run + 6 envois | `201` puis `429` avec compte à rebours |
| S4 | capture `route.json` + run | Type dérivé de l'échantillon ; trajet rendu |
| S5 | run | suivre→recharger→présent ; DELETE→absent |
| S6 | run émulateur GPS simulé | `ok` ; 2 appels <30s → `spam` |
| S7 | run | top + stats rendus, PII masquée |
| S8 | build dev Android | marqueurs ; bus sans coords non placés |
| S9 | build dev | notif app fermée ; token non loggé |
| S10 | tests + `npm audit --omit=dev` | suite verte ; états offline lisibles |

> Règle Xëtu : aucun "terminé" sans commande exécutée + sortie observée. "Ça compile" n'est pas "ça marche".

---

## 9. Backlog ordonné

**Ordre sous architecture D8 (WebView)** — l'UI vient de la PWA, le natif ajoute les capacités :

1. **S-Shell** coquille Expo + WebView + bridge GPS minimal — *priorité 1 (D8)*
2. **S6** « Je vois le bus » `/tracking/update` (net-new ; GPS via bridge)
3. **S9** push natif (bridge `subscribePush` + slice backend Expo push, §7.1)
4. *(carte : déjà dans la PWA — **S8 natif** seulement si la perf l'exige, §S8)*
5. **S0** socle typé — **maintenu** (`config`/`api`/`types`/`identity` réutilisés par le bridge et les écrans natifs futurs)
6. **UI parquée** : **S1, S2, S3, S4, S5, S7** livrées par la PWA — **contrats §3/§4 conservés**, pas de recodage RN
7. **S10** durcissement release

**MVP testable** = **S-Shell** (PWA en WebView, visuel 100%) **+ S6** (GPS live via bridge) sur émulateur/device. **S-Shell peut être prototypé dans Expo Go** tant que les modules utilisés restent inclus dans Expo Go (SDK 56 inclut `react-native-webview` et `expo-location` pour la géoloc foreground). Un **development build** devient obligatoire pour la géoloc background, le push natif avancé, une configuration native spécifique, ou tout module non inclus dans Expo Go. Phase 3 (remplacement progressif d'écrans en RN) = post-MVP, à la demande. Publication stores = fin de chantier (voir règle iOS §7.7).
