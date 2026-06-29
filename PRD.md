# Xëtu Mobile — PRD (slices)

> Date : 2026-06-29
> Repo : `C:\Users\DELL\Desktop\xetu-mobile`
> Backend source de vérité : `C:\Users\DELL\Desktop\whatsapp-agent` (FastAPI + Supabase + Redis)
> Statut : spec produit, contrats dérivés du code backend réel (lu, pas supposé)

---

## 0. Place de ce document

Trois artefacts, trois rôles — **ne pas dupliquer entre eux** :

| Doc | Rôle | Ce qu'il contient |
|---|---|---|
| `BIBLE.md` | North-star / roadmap | Vision, paliers, stack technique |
| **`PRD.md` (ici)** | **Quoi exact + contrats + acceptation** | Slices, types, endpoints, critères de done |
| `IONIC_MIGRATION_PLAN.md` | Plan de migration | Phases d'implémentation du strangler pattern |

Règle : un **contrat d'API** va ici (dérivé du backend), pas dans la BIBLE.

---

## 1. Produit

**Xëtu Mobile** = app mobile iOS/Android native construite en **Ionic 8 + Angular 20 (Standalone) + Capacitor 8.x**. Elle ré-implémente l'UI de la PWA existante (`whatsapp-agent/Dashboard`) onglet par onglet (migration progressive via strangler pattern) tout en conservant les capacités natives du device (GPS, push natif, stockage persistant, etc.). Elle **consomme** le backend par HTTP et WebSocket. Elle ne contient **aucune** logique métier transport — la position, la confiance, le routing et l'anti-fraude restent backend.

### 1.1 Utilisateur cible
Usager quotidien du bus à Dakar, smartphone Android entrée/milieu de gamme, réseau intermittent (3G/4G instable), data comptée. Conséquence produit : **léger, tolérant au offline, états d'erreur actionnables**.

### 1.2 Objectifs (MVP)
1. **Carte** : Voir les bus actifs avec niveau de confiance et fraîcheur sur une carte native (Leaflet) + bottom sheet.
2. **Itinéraire** : Chercher un arrêt et calculer un itinéraire simple.
3. **Chat IA** : Dialoguer avec l'agent conversationnel Xëtu via une connexion WebSocket persistante.
4. **Mes lignes** : Suivre ses lignes favorites (abonnements réels) et visualiser son score/badge de fiabilité.

### 1.3 Non-objectifs (explicitement hors MVP)
- **Pas de WebView intégrale** : l'UI de la PWA est ré-implémentée en composants Ionic natifs-like pour une meilleure fluidité et une meilleure intégration du clavier iOS/Android.
- Pas de paiement, pas de compte/login mot de passe (session anonyme automatique).
- Pas de géoloc background avant slice dédiée.
- Pas de publication stores tant que le MVP n'est pas stable.

---

## 1.4 Séquence d'implémentation — Strangler Pattern *(Capacitor 8.x)*

L'application mobile abandonne l'ancienne coquille WebView au profit d'un portage natif progressif en Ionic Angular standalone. 

### La frontière (le « seam »)

| Couche | Possède | Détail |
|---|---|---|
| **Ionic Mobile App** | **UI Native-like + Intégration système** | Rendu des pages (Carte, Itinéraire, Chat, Lignes), gestion des signaux Angular, cycle de vie, saisie clavier fluide |
| **Capacitor Plugins** | **Capacités natives** | Preferences (stockage session), Geolocation (GPS), Keyboard (redimensionnement natif), StatusBar & SplashScreen |
| **FastAPI Backend** | **Logique métier & Données** | WebSocket chat, calcul d'itinéraires, gestion des bus actifs, enregistrement des signalements |

---

### Phases

1. **Phase 1 — Scaffold & Core Infrastructure** : Ionic/Angular/Capacitor, design tokens, 4 tabs, services `SessionService`, `ApiService`, `WsService`, `StoreService`, Android sync.
2. **Phase 2 — Chat IA** : écran chat Ionic réel, WebSocket E2E, états de reconnexion, messages, typing/status/suggestions.
3. **Phase 3 — Mes lignes & score** : abonnements réels via `/api/subscriptions`, score, badge, états empty/error.
4. **Phase 4+ — Itinéraire, signalement, carte, GPS, push** : portage fonctionnel onglet par onglet, avec contrats backend vérifiés avant UI.

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

Base URL : définie dans `src/environments/environment*.ts`. Backend actif : `https://web-production-ccab8.up.railway.app` (Railway). Ne pas réintroduire `EXPO_PUBLIC_*`, Metro, Render ou une URL locale hardcodée comme source d'autorité mobile. Les environnements Angular doivent rester non-secrets ; toute rotation d'URL se fait par configuration d'environnement.

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

## 4. Types partagés — contrat de référence (pas de client typé actif)

Le client typé actif vit dans `src/app/core/models/models.ts` et les appels passent par `src/app/core/services/api.service.ts`. Les extraits ci-dessous restent la **référence de contrat** dérivée du backend pour auditer les modèles Angular avant chaque écran. Si le backend diverge, inspecter `whatsapp-agent` et mettre à jour les modèles avant de coder l'UI.

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

> **Architecture active : Ionic Angular + Capacitor.** Les slices ci-dessous sont à implémenter dans l'app Ionic, pas dans une WebView Expo/RN. Chaque slice doit consommer les services `ApiService`, `SessionService`, `WsService` et `StoreService`, avec types issus de `src/app/core/models/models.ts`.

---

### S0 — Socle & client API typé  *(Phase 1 — terminé)*

- **But** : fournir l'ossature mobile réelle avant les écrans métier.
- **Scope livré** : Ionic/Angular standalone, Capacitor Android, design tokens, 4 tabs lazy-loaded, services core, modèles TypeScript, tests unitaires.
- **Acceptation** : `npm run build`, `npx ng test --watch=false --browsers=ChromeHeadless`, `node verify-milestone1.js`, `npx cap sync android`.

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

> Le déclencheur « Je vois le bus » est une feature mobile à porter dans l'app Ionic. Le GPS viendra d'un `GeoService` Capacitor, et le **throttle ≥30s reste obligatoire** pour respecter `/tracking/update`.

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

### S8 — Carte Ionic/Leaflet  *(décision D2)*

- **But** : positionner les bus sur une carte.
- **Décision D2** : MVP = Leaflet dans un composant Ionic, avec âge réel de la donnée et aucun faux mouvement.
- **Contrat** : réutilise `GET /api/buses` (`lat`/`lon` quand non `null`).
- **UI** : page Carte avec marqueurs bus ; fallback liste si pas de coords.
- **Acceptation** : bus sans `lat/lon` non placés (pas de marqueur au mauvais endroit — cohérent avec CHG-5 backend).
- **Vérif** : `npm run build` + test navigateur/appareil Android ; observation marqueurs et état vide.

---

### S9 — Push natif  *(NOUVEAU canal backend — voir §7.1)*

- **But** : notifier l'usager qu'un bus de sa ligne suivie est signalé.
- **⚠️ Bloqueur d'architecture** : le push backend actuel est **Web Push (VAPID/pywebpush)** ; une app Capacitor native doit passer par APNs/FCM via un plugin push natif, pas par un endpoint Web Push navigateur. **`/api/push/subscribe` est inutilisable en natif.**
- **Travail backend requis** (hors ce repo, à inscrire en dette/decision) :
  - Nouvel endpoint `POST /api/push/native-register {session_id, push_token, platform}`.
  - Nouveau chemin d'envoi via APNs/FCM en parallèle de `send_push_notification` (web).
  - Brancher la notification sur le même déclencheur que `notify_abonnes` (signalement d'une ligne suivie).
- **Mobile** : plugin push Capacitor (permission, récupération token), enregistrement à l'ouverture si l'utilisateur a des "Mes lignes".
- **Décision D4** : FCM/APNs direct vs service relais.
- **Acceptation** : notif reçue app fermée (Android) sur un device abonné à une ligne signalée ; token jamais loggé en clair.
- **Vérif** : sur build natif Android/iOS ; échec permission géré.
- **Dépend de** : S5 (les lignes suivies) + slice backend push natif.

---

### S10 — Durcissement release

- **But** : éviter "ça marche seulement sur ma machine".
- **Scope** : tests unitaires purs (normalisation `buses`, mapping `report`, parse `route` capturé) ; états offline/dégradés sur chaque écran ; a11y (tailles texte, contrastes, cibles ≥44px) ; messages d'erreur compréhensibles ; `npm audit --omit=dev`.
- **Acceptation** : les bugs de contrat backend sont attrapés par un test avant démo ; chaque écran a un état offline lisible.
- **Vérif** : `npm run build` · suite de tests verte · `npx cap sync android` · checklist a11y manuelle.

---

## 6. Exigences non-fonctionnelles

| Domaine | Exigence |
|---|---|
| Réseau | Timeout client 8s ; tout écran réseau a loading/empty/error distincts |
| Offline | Aucun crash hors-ligne ; message + bouton réessayer ; dernier résultat affiché si dispo |
| Perf perçue | Skeletons, pas de spinner plein écran > 1s sans contexte |
| Data | Pas de polling agressif ; refresh manuel + au focus écran |
| Sécurité | Aucun secret en repo/git ; fichiers d'environnement Angular = non-secrets uniquement ; pas de PII affichée (le backend masque déjà : `**** 1234`, pas de `signale_par`) |
| Privacy | GPS sur action explicite ; pas de background sans décision dédiée |
| i18n | FR d'abord ; libellés centralisés pour Wolof ultérieur |
| Accessibilité | `accessibilityRole`/`accessibilityLabel` sur actions ; contraste AA |

### Taxonomie d'erreur (uniforme tous écrans)
`network` (pas de connexion) · `timeout` (8s dépassé) · `http_4xx` (afficher `message` backend si présent) · `http_5xx` ("service indisponible, réessaie") · `parse` (réponse inattendue → log + état dégradé).

---

## 7. Risques & décisions ouvertes (à trancher en Doryx)

### 7.1 Push natif incompatible avec le push backend actuel  **[BLOQUEUR connu]**
Le backend ne sait envoyer que du **Web Push** (`/api/push/*`, VAPID, `pywebpush`). Le natif Capacitor a besoin d'un **canal APNs/FCM** distinct. → S9 nécessite un **nouvel endpoint + nouveau chemin d'envoi backend**, ce n'est pas un branchement sur l'existant. À ne pas découvrir en Phase push.

### 7.2 Source `report` pour le mobile  **[décision D7 à créer]**
La whitelist `source` est 100% `web_*`. Un mobile envoie soit une valeur existante (coercée/imprécise), soit on **ajoute `mobile_signal`/`mobile_geoloc` à la whitelist backend** (1 ligne dans `api/report.py`). Recommandation : **ajouter les sources mobiles** pour une analytics propre ; sinon par défaut `web_geoloc`/`web_signal`.

### 7.3 Shape interne de `/api/route` partiellement souple  **[lever en S4.0]**
`/api/route` expose maintenant une enveloppe `RouteResponse` dans OpenAPI. Les statuts sont typés, mais les entrées de `routes`, `alt_walk`, `alt_transfer` restent des objets souples. Avant l'écran route : capturer au moins 3 réponses réelles (`direct`, `transfer`, `not_found`) et figer les sous-types UI nécessaires.

### 7.4 Claims Capacitor/Ionic à revérifier avant builds natifs
Relire les docs versionnées Ionic, Capacitor et Angular avant d'ajouter des plugins natifs, permissions, push, stockage sensible, ou builds store. Les exigences iOS/Android et Capacitor 8 peuvent évoluer.

### 7.5 Identité device sans auth
`session_id`/`phone` = device id local. Perte/réinstallation = perte des "Mes lignes". Acceptable MVP ; auth réelle = décision produit ultérieure.

### 7.6 « Je vois le bus » (`/tracking/update`)  **[feature mobile à porter]**
Le bouton doit être implémenté dans l'app Ionic avec position Capacitor, puis appeler `/tracking/update`. Il doit gérer les statuts métier dans le body (`ok`, `no_stop_found`, `spam`, `db_error`) et throttler les appels à ≥30s.

### 7.7 Risque stores  **[iOS/Android]**
L'app ne doit pas être un simple emballage de contenu distant. Le build Capacitor doit embarquer l'UI Angular et fournir de vraies capacités device : GPS, push natif, stockage persistant et comportement offline/erreur lisible.

### 7.8 Sécurité client mobile
Le mobile ne doit appeler que les origines backend configurées, ne doit embarquer aucun secret, et ne doit jamais appeler directement DeepSeek, Agno ou un provider IA. L'agent reste derrière FastAPI.

### 7.9 Identité device sans auth
La session anonyme locale doit rester stable entre ouvertures. La perte/réinstallation de l'app peut perdre les lignes suivies ; acceptable MVP, mais à signaler avant stores.

### 7.10 Backend : Railway actif
Le mobile pointe sur `https://web-production-ccab8.up.railway.app` dans `src/environments/environment*.ts`. Si cette URL change, modifier les environnements Angular et revérifier `/api/buses`, `/api/stops/search`, `/api/route` et le WebSocket.

---

## 8. Matrice de vérification (Definition of Done par slice)

| Slice | Commande | Observation attendue |
|---|---|---|
| S0 | `npm run build` + `npx ng test --watch=false --browsers=ChromeHeadless` + `node verify-milestone1.js` + `npx cap sync android` | Build Angular, tests core, checks milestone et sync Android verts |
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

**Ordre sous architecture Ionic/Capacitor** :

1. **S0** socle typé — Phase 1.
2. **S2 / Chat IA** — WebSocket réel, états de connexion, messages, suggestions.
3. **S5 / Mes lignes & score** — abonnements persistants et score utilisateur.
4. **S4 / Itinéraire** — recherche d'arrêts + route, après capture de réponses réelles.
5. **S3 + S6 / Signalement & GPS** — signalement manuel puis `/tracking/update` avec position Capacitor.
6. **S1 + S8 / Carte** — bus actifs, carte Leaflet, âge réel de la donnée.
7. **S9** push natif — après endpoint backend APNs/FCM.
8. **S10** durcissement release.

**MVP testable** = Chat IA + Mes lignes + Itinéraire + signalement GPS basique, avec build Angular vert, sync Android, et tests E2E appareil dès que le runtime natif est prêt.
