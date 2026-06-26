# Xetu Mobile Bible

Date: 2026-06-26
Repo: `C:\Users\DELL\Desktop\xetu-mobile`
Status: Coquille WebView, direction figee

## 1. Constitution

Xetu Mobile est l'application iOS/Android de Xetu. Elle est une coquille WebView: `App.tsx` rend un `<WebView>` (natif) ou un `<iframe>` (web) qui charge la PWA Xetu. La PWA est la source unique de l'UI et vit dans le repo backend `whatsapp-agent/Dashboard/`. Le mobile n'a aucun ecran natif et ne reimplemente aucune UI.

Xetu est un produit a trois canaux (WhatsApp, Telegram, Web/PWA) servis par un seul backend (`whatsapp-agent`, FastAPI + Supabase, heberge). Le mobile n'est que la vitrine native de la PWA.

Le produit repond a une seule question: ou est le bus ? Les bus Dem Dikk n'ont pas de GPS; Xetu agrege des signalements crowdsources sur un reseau deterministe (lignes fixes, arrets ordonnes, sens aller/retour, ~1 bus/h).

## 2. La loi produit

Xetu livre une verite (ou est le bus), pas une prediction (quand il arrive).

- Le coeur = localisation honnete: ligne, dernier arret vu, sens, fraicheur ("vu il y a N min"), prochains arrets dans l'ordre.
- L'usager habitue estime son temps lui-meme des qu'il sait ou est le bus. L'app ne le fait pas a sa place.
- L'ETA / l'etat ne sont PAS le coeur. Au mieux un indice optionnel, toujours etiquete "estimation", jamais affiche comme sur.
- Regle d'or, deja codee cote backend (`api/buses.py` V4.3, CHG-5): un marqueur absent vaut mieux qu'un marqueur au mauvais endroit. On ne ment jamais sur la position.
- Metrique qui compte: la fraicheur du dernier-vu par ligne. Signalement, notif, leaderboard servent a la maintenir fraiche.

## 3. Non-negociables

- Repo mobile separe du backend: aucun code backend copie dans `xetu-mobile`.
- La PWA est la seule UI. Pas d'ecran natif RN. Le natif RN historique est supprime (code mort).
- Contrat API derive du backend reel (`whatsapp-agent`), jamais d'hypothese client.
- Pas de secret dans git: `.env`, certificats, keystores, tokens restent hors repo.
- Variables client = `EXPO_PUBLIC_*` uniquement quand non secretes.
- `.doryx/` reste local, ignore par git, distinct du Doryx backend.
- Expo SDK 56 (`~56.0.x`): lire la doc versionnee avant toute lib native.
- Toute feature touchant push, localisation fond, identite ou stores = decision explicite (PRD + Doryx) avant code. Aujourd'hui `push: false` dans `App.tsx`.

## 4. Architecture actuelle

### Coquille mobile (`xetu-mobile`)

- `App.tsx`: `<WebView>` natif / `<iframe>` web vers la PWA. Whitelist d'origines. Pont natif `XetuNative.requestLocation` vers `expo-location` (geoloc foreground a la demande de la PWA). `push: false`.
- `src/config.ts`: seule logique restante. Resout `PWA_URL` et `API_BASE_URL`. La WebView charge `PWA_URL?api=API_BASE_URL`; la PWA lit `?api=` (`Dashboard/js/constants.js`) pour savoir quel backend appeler.
- Dependances natives: `react-native-webview`, `expo-location`, `expo-constants`. Plus de `expo-sqlite`.

### Reseau / test

- Defaut sans friction: PWA prod (`https://xetudashbord.pages.dev`) + backend heberge (`https://agent-des-transport-xetu.onrender.com`). Zero serveur local; marche sur device physique, emulateur, web.
- Dev full-local: laisser `EXPO_PUBLIC_*` vide -> `config.ts` auto-derive l'hote Metro (`expo-constants`).
- Ne jamais hardcoder `10.0.2.2` (alias emulateur Android AVD only; casse device/iOS/web).

### Backend (source de verite: `whatsapp-agent`)

- FastAPI (`main.py` = orchestrateur, include_router), agent LangGraph (le LLM narre, ne calcule jamais une position), Supabase, donnees reseau = `xetu_mvp.json` (10 lignes deterministes).
- Surface utile: `GET /api/buses`, `/api/stops/search`, `/api/route` (param `from`), `POST /api/report` (200 already_recorded = succes idempotent), `/api/leaderboard`, `/api/subscriptions`, `/api/push/*`, `/tracking/*`.
- Contrats pointus: `/api/stops/search` (pas `/api/stops`); `/api/route` param `from`; `/tracking/update` renvoie 200 meme pour `spam`; `/api/subscriptions` (pas `/api/push/subscribe`).

## 5. Etat actuel

Fait:
- Pivot coquille WebView. Couche native RN supprimee (`src/api.ts`, `src/screens/*`, `src/components/*`, `src/identity.ts`, `src/types.gen.ts`, scripts de generation).
- `src/config.ts` durci: auto-derivation hote Metro + override `EXPO_PUBLIC_*` + fallback PWA prod.
- Backend heberge cable comme defaut de test (corrige le "du mal a tester").
- `tsc --noEmit` exit 0; `expo config` propre (`expo-location` present, `expo-sqlite` absent).

Risque ouvert: rebuild natif requis (dep native + `app.json` changes). Render free tier = cold start possible (~30-50s) au premier hit; le retry/backoff de `App.tsx` couvre ca.

## 6. La sequence (une phase finie avant la suivante)

### Phase 0 - Tester sans friction (en cours)
App ouverte sur un telephone physique -> donnees live, zero serveur local. Backend heberge cable en defaut. Done = vu sur device reel (pas "ca compile"). Verif: `npx.cmd tsc --noEmit`, `npx.cmd expo config --type public`, ouverture device/emulateur.

### Phase 1 - La localisation honnete (le coeur)
La PWA affiche, par ligne: dernier arret vu, sens, fraicheur, prochains arrets. Jamais de faux marqueur. La fraicheur devient l'info centrale de la carte. Done = sur un signalement reel, la carte montre un dernier-vu honnete et date; aucun marqueur invente.

### Phase 2 - Le contrat de verite
Un seul type `/api/buses` qui dit l'etat reel: fraicheur, confiance de sens, raison d'absence de position (`confidence_level`, `eta_disabled_reason`). La PWA l'affiche tel quel. Tout ETA = etiquette "estimation". Done = PWA et backend partagent un contrat type unique; etats honnetes (frais / vieux / inconnu) visibles.

### Phase 3 - La boucle de fraicheur (croissance)
Ce qui pousse a signaler -> plus de signalements -> dernier-vu plus frais. Notifs WhatsApp (canal existant). Incitations (leaderboard) au service de la fraicheur. Done = un cycle signalement -> fraicheur -> usage observable.

## 7. Plus tard / optionnel (gate par decision)

Ne PAS faire tant que Phase 1 n'est pas honnete a l'ecran. Chacun exige une decision PRD + Doryx:
- ETA calcule (travel_time par segment): aujourd'hui 0% rempli, code mort. Reste un indice, jamais le titre.
- Push natif mobile: `push: false` aujourd'hui. Canal notif actuel = WhatsApp.
- Localisation fond / tracking continu: interdit sans decision dediee.
- Builds EAS, iOS/TestFlight, publication stores: quand le coeur est solide.

## 8. Methode

- Contrat d'abord: figer le type backend avant de toucher la PWA. Le contrat vit dans `whatsapp-agent`.
- Diffs petits et verifies. Gemini execute le code; Claude supervise avec une vraie verification (pas le rapport).
- Une source par sujet: tuer le README backend perime (`routes_geometry_v13` fantome), reconcilier les deux `xetu_mvp.json` (racine vs `Dashboard/data/`), degonfler le CORS gere 3x.
- Doryx: respecter l'etat; `VERIFY` = verifier sans editer; jamais de PASS complaisant. `.doryx/` mobile distinct du backend.

## 9. Sources Expo

- SDK 56: https://docs.expo.dev/versions/latest/
- Development builds: https://docs.expo.dev/develop/development-builds/introduction/
- EAS Build: https://docs.expo.dev/build/introduction/
- Push: https://docs.expo.dev/push-notifications/overview/
- Env vars: https://docs.expo.dev/guides/environment-variables/
