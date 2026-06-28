# Xetu Mobile Bible

Date: 2026-06-26
Repo: `C:\Users\DELL\Desktop\xetu-mobile`
Status: Coquille WebView, direction figée

## 1. Constitution

Xetu Mobile est l'application iOS/Android de Xetu. Elle est une coquille WebView : `App.tsx` rend un `<WebView>` (natif) ou un `<iframe>` (web) qui charge la PWA Xetu. La PWA est la source unique de l'UI et vit dans le repo backend `whatsapp-agent/Dashboard/`. Le mobile n'a aucun écran natif et ne réimplémente aucune UI.

Xetu est un produit à trois canaux (WhatsApp, Telegram, Web/PWA) servis par un seul backend (`whatsapp-agent`, FastAPI + Supabase, hébergé). Le mobile n'est que la vitrine native de la PWA.

Le produit répond à une seule question : où est le bus ? Les bus Dem Dikk n'ont pas de GPS ; Xetu agrège des signalements crowdsourcés sur un réseau déterministe (lignes fixes, arrêts ordonnés, sens aller/retour, ~1 bus/h).

## 2. La loi produit

Xetu livre une vérité (où est le bus), pas une prédiction (quand il arrive).

- Le cœur = localisation honnête : ligne, dernier arrêt vu, sens, fraîcheur ("vu il y a N min"), prochains arrêts dans l'ordre.
- L'usager habitué estime son temps lui-même dès qu'il sait où est le bus. L'app ne le fait pas à sa place.
- L'ETA / l'état ne sont PAS le cœur. Au mieux un indice optionnel, toujours étiqueté "estimation", jamais affiché comme sûr.
- Règle d'or, déjà codée côté backend (`api/buses.py` V4.3, CHG-5) : un marqueur absent vaut mieux qu'un marqueur au mauvais endroit. On ne ment jamais sur la position.
- Métrique qui compte : la fraîcheur du dernier-vu par ligne. Signalement, notif, leaderboard servent à la maintenir fraîche.

## 3. Non-négociables

- Repo mobile séparé du backend : aucun code backend copié dans `xetu-mobile`.
- La PWA est la seule UI. Pas d'écran natif RN. Le natif RN historique est supprimé (code mort).
- Contrat API dérivé du backend réel (`whatsapp-agent`), jamais d'hypothèse client.
- Pas de secret dans git : `.env`, certificats, keystores, tokens restent hors repo.
- Variables client = `EXPO_PUBLIC_*` uniquement quand non secrètes.
- `.doryx/` reste local, ignoré par git, distinct du Doryx backend.
- Expo SDK 56 (`~56.0.x`) : lire la doc versionnée avant toute lib native.
- Toute feature touchant push, localisation fond, identité ou stores = décision explicite (PRD + Doryx) avant code. Aujourd'hui `push: false` dans `App.tsx`.

## 4. Architecture actuelle

### Coquille mobile (`xetu-mobile`)

- `App.tsx` : `<WebView>` natif / `<iframe>` web vers la PWA. Whitelist d'origines. Pont natif `XetuNative.requestLocation` vers `expo-location` (géoloc foreground à la demande de la PWA). `push: false`.
- `src/config.ts` : seule logique restante. Résout `PWA_URL` et `API_BASE_URL`. La WebView charge `PWA_URL?api=API_BASE_URL` ; la PWA lit `?api=` (`Dashboard/js/constants.js`) pour savoir quel backend appeler.
- Dépendances natives : `react-native-webview`, `expo-location`, `expo-constants`. Plus de `expo-sqlite`.

### Réseau / test

- Défaut sans friction : PWA prod (`https://xetudashbord.pages.dev`) + backend hébergé (`https://agent-des-transport-xetu.onrender.com`). Zéro serveur local ; marche sur device physique, émulateur, web.
- Dev full-local : laisser `EXPO_PUBLIC_*` vide -> `config.ts` auto-dérive l'hôte Metro (`expo-constants`).
- Ne jamais hardcoder `10.0.2.2` (alias émulateur Android AVD only ; casse device/iOS/web).

### Backend (source de vérité : `whatsapp-agent`)

- FastAPI (`main.py` = orchestrateur, include_router), agent LangGraph (le LLM narre, ne calcule jamais une position), Supabase, données réseau = `xetu_mvp.json` (10 lignes déterministes).
- Surface utile : `GET /api/buses`, `/api/stops/search`, `/api/route` (param `from`), `POST /api/report` (200 already_recorded = succès idempotent), `/api/leaderboard`, `/api/subscriptions`, `/api/push/*`, `/tracking/*`.
- Contrats pointus : `/api/stops/search` (pas `/api/stops`) ; `/api/route` param `from` ; `/tracking/update` renvoie 200 même pour `spam` ; `/api/subscriptions` (pas `/api/push/subscribe`).

## 5. État actuel

Fait :
- Pivot coquille WebView. Couche native RN supprimée (`src/api.ts`, `src/screens/*`, `src/components/*`, `src/identity.ts`, `src/types.gen.ts`, scripts de génération).
- `src/config.ts` durci : auto-dérivation hôte Metro + override `EXPO_PUBLIC_*` + fallback PWA prod.
- Backend hébergé câblé comme défaut de test (corrige le "du mal à tester").
- `tsc --noEmit` exit 0 ; `expo config` propre (`expo-location` présent, `expo-sqlite` absent).

Risque ouvert : rebuild natif requis (dep native + `app.json` changes). Render free tier = cold start possible (~30-50s) au premier hit ; le retry/backoff de `App.tsx` couvre ça.

## 6. La séquence (une phase finie avant la suivante)

### Phase 0 - Tester sans friction (en cours)
App ouverte sur un téléphone physique -> données live, zéro serveur local. Backend hébergé câblé en défaut. Done = vu sur device réel (pas "ça compile"). Vérif : `npx.cmd tsc --noEmit`, `npx.cmd expo config --type public`, ouverture device/émulateur.

### Phase 1 - La localisation honnête (le cœur)
La PWA affiche, par ligne : dernier arrêt vu, sens, fraîcheur, prochains arrêts. Jamais de faux marqueur. La fraîcheur devient l'info centrale de la carte. Done = sur un signalement réel, la carte montre un dernier-vu honnête et daté ; aucun marqueur inventé.

### Phase 2 - Le contrat de vérité
Un seul type `/api/buses` qui dit l'état réel : fraîcheur, confiance de sens, raison d'absence de position (`confidence_level`, `eta_disabled_reason`). La PWA l'affiche tel quel. Tout ETA = étiquette "estimation". Done = PWA et backend partagent un contrat type unique ; états honnêtes (frais / vieux / inconnu) visibles.

### Phase 3 - La boucle de fraîcheur (croissance)
Ce qui pousse à signaler -> plus de signalements -> dernier-vu plus frais. Notifs WhatsApp (canal existant). Incitations (leaderboard) au service de la fraîcheur. Done = un cycle signalement -> fraîcheur -> usage observable.

## 7. Plus tard / optionnel (soumis à décision)

Ne PAS faire tant que Phase 1 n'est pas honnête à l'écran. Chacun exige une décision PRD + Doryx :
- ETA calculé (travel_time par segment) : aujourd'hui 0% rempli, code mort. Reste un indice, jamais le titre.
- Push natif mobile : `push: false` aujourd'hui. Canal notif actuel = WhatsApp.
- Localisation fond / tracking continu : interdit sans décision dédiée.
- Builds EAS, iOS/TestFlight, publication stores : quand le cœur est solide.

## 8. Méthode

- Contrat d'abord : figer le type backend avant de toucher la PWA. Le contrat vit dans `whatsapp-agent`.
- Diffs petits et vérifiés. Gemini exécute le code ; Claude supervise avec une vraie vérification (pas le rapport).
- Une source par sujet : tuer le README backend périmé (`routes_geometry_v13` fantôme), réconcilier les deux `xetu_mvp.json` (racine vs `Dashboard/data/`), dégonfler le CORS géré 3x.
- Doryx : respecter l'état ; `VERIFY` = vérifier sans éditer ; jamais de PASS complaisant. `.doryx/` mobile distinct du backend.

## 9. Sources Expo

- SDK 56 : https://docs.expo.dev/versions/latest/
- Development builds : https://docs.expo.dev/develop/development-builds/introduction/
- EAS Build : https://docs.expo.dev/build/introduction/
- Push : https://docs.expo.dev/push-notifications/overview/
- Env vars : https://docs.expo.dev/guides/environment-variables/
