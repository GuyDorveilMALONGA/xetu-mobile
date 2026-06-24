# Xetu Mobile Bible

Date: 2026-06-24
Repo: `C:\Users\DELL\Desktop\xetu-mobile`
Status: Expo mobile app plan, Doryx-ready

## 1. Constitution

Xetu Mobile est l'application native iOS/Android de Xetu. Elle ne remplace pas le backend `whatsapp-agent`; elle le consomme par API HTTP et garde son propre etat Doryx.

Le produit doit sortir par paliers:

1. Prototype web Expo visible et branche au backend.
2. App Android testable sur emulateur, sans publication.
3. App Android installable via development build.
4. App iOS testable via EAS/cloud mac, quand les comptes Apple sont disponibles.
5. App store-ready, avec push, privacy et analytics minimaux.

## 2. Non-negociables

- Repo mobile separe du backend: pas de code backend copie dans `xetu-mobile`.
- Contrat API derive du backend reel, pas d'hypotheses client.
- Pas de secret dans git: `.env`, certificats, keystores, service accounts et tokens restent hors repo.
- `.doryx/` reste local et ignore par git.
- Expo SDK actuel: `~56.0.12`; verifier la doc versionnee avant d'ajouter une lib native.
- Les variables lues par le client Expo utilisent `EXPO_PUBLIC_*` seulement quand elles sont non secretes.
- Toute feature qui touche push, localisation fond, stores ou identite doit avoir une decision explicite avant implementation.

## 3. Etat actuel

Deja fait:

- Scaffold Expo TypeScript dans `xetu-mobile`.
- Web preview sur `http://localhost:8082/`.
- Runtime web Expo installe: `react-dom`, `react-native-web`, `@expo/metro-runtime`.
- Client API minimal: `GET /api/buses`.
- Mapping bus aligne sur le backend: `arret_estime`, `arret_signale`, `next_arret`.
- Backend CORS autorise `localhost:8081/8082` pour les tests web.
- Doryx MCP cable dans le repo mobile.
- Rollback avant Doryx: `pre-doryx-mobile-2026-06-24`.

Commits de reference:

- `ca17e43 chore: add Expo web runtime`
- `a70e342 fix: align bus cards with backend contract`
- `b56e51e chore: wire Doryx MCP`
- `8613bbc docs: freeze Doryx mobile setup`

## 4. Architecture cible

### Mobile

- Expo SDK 56 / React Native 0.85 / React 19.2.3.
- UI en React Native, pas de WebView PWA.
- Navigation native avec onglets ou stack selon le besoin produit.
- API client centralise dans `src/api.ts`, puis decoupe par domaine si necessaire.
- Etat local simple au depart: React state + hooks. Ajouter TanStack Query seulement quand le cache/retry devient utile.
- Storage local uniquement pour preferences non secretes et session technique.

### Backend

- Source de verite: `C:\Users\DELL\Desktop\whatsapp-agent`.
- Endpoints prioritaires: `/api/buses`, `/api/stops`, `/api/route`, `/api/report`, `/api/leaderboard`, push/subscriptions selon phase.
- CORS web utile pour preview navigateur; le natif Android/iOS n'a pas la meme contrainte navigateur.

### Doryx

- `xetu-mobile` a son propre Doryx.
- Ne jamais reutiliser `.doryx/` du backend.
- Chaque tranche mobile doit commencer par une intention claire: scope, preuves attendues, rollback.

## 5. Decisions a trancher avant code lourd

### D1 - Navigation

Option A, recommandee: Expo Router.
- Plus proche des conventions Expo modernes.
- Bon pour onglets, deep links, ecrans evolutifs.
- Demande de restructurer `App.tsx` vers `app/`.

Option B: React Navigation manuel.
- Plus explicite et classique React Native.
- Moins de magie fichier-route.
- Un peu plus de boilerplate.

Decision par defaut: A, sauf si on veut garder le prototype ultra simple une tranche de plus.

### D2 - Cartographie

Option A, recommandee MVP: carte liste + positions sans SDK map natif.
- Sort vite, fonctionne web/emulateur.
- Suffisant pour verifier le contrat bus et les flux.

Option B: `react-native-maps`.
- Vraie experience carte native.
- Necessite config native/build, cles potentielles, tests Android/iOS.

Decision par defaut: A pour MVP, B quand le parcours principal est stabilise.

### D3 - Builds

Option A, recommandee maintenant: Android emulator + Expo dev server local.
- Gratuit, rapide, adapte a ton poste Windows.

Option B: EAS development build.
- Necessaire pour push distant, liens natifs, icones/splash reels, parity production.
- Demande compte Expo et configuration EAS.

Decision par defaut: A en Phase 1-2, B en Phase 3.

### D4 - Push

Option A, recommandee: Expo Notifications + Expo Push Service pour MVP.
- Plus simple cote mobile/backend.
- Bon pour valider la valeur produit.

Option B: FCM/APNs direct.
- Plus controle, moins de dependance Expo push service.
- Plus de travail backend, credentials et tests.

Decision par defaut: A jusqu'a preuve que le push direct est necessaire.

### D5 - iOS

Option A, recommandee: EAS cloud build/TestFlight quand le compte Apple existe.
- Compatible Windows.
- Pas besoin d'acheter un Mac immediatement.

Option B: Mac local.
- Meilleur debug iOS.
- Cout materiel.

Decision par defaut: A.

## 6. Plan complet

### Phase 0 - Socle propre

Objectif: transformer le scaffold en base de produit stable.

- [ ] Creer ou confirmer `.env.example` avec `EXPO_PUBLIC_API_BASE_URL`.
- [ ] Ajouter une section dans `README.md`: run web, run Android emulator, Doryx, rollback.
- [ ] Ajouter `src/config.ts` pour centraliser l'URL API et les flags publics.
- [ ] Remplacer les erreurs brutes par un petit modele `ApiError`.
- [ ] Garder `normalizeBuses` strict sur `{ buses: [] }` quand le contrat backend est definitif.

Verification:

```powershell
npx.cmd tsc --noEmit
npx.cmd expo config --type public
```

Definition done:

- Repo clean.
- Web preview toujours visible.
- Aucun secret ajoute.

### Phase 1 - Produit minimum utilisable

Objectif: app mobile utile meme sans publication.

Ecrans:

- [ ] Accueil live: bus actifs, confiance, prochain arret.
- [ ] Detail bus: arret signale, arret estime, fraicheur, route window.
- [ ] Signaler: ligne, arret, sens, commentaire optionnel si backend le supporte.
- [ ] Itineraire simple: depart, arrivee, resultat backend.
- [ ] Parametres: URL backend affichee, version app, diagnostic API.

Implementation:

- [ ] Choisir D1 navigation.
- [ ] Installer les libs via `npx expo install` quand elles sont Expo SDK managed.
- [ ] Decouper `App.tsx` en composants: `BusList`, `BusCard`, `ApiStatus`.
- [ ] Ajouter hooks: `useBuses`, `useApiHealth`.
- [ ] Ajouter etats loading/empty/error par ecran.

Verification:

```powershell
npx.cmd tsc --noEmit
npx.cmd expo start --web --localhost --port 8082
```

Definition done:

- Le navigateur affiche tous les ecrans.
- `/api/buses` charge des donnees reelles ou une erreur actionnable.
- Pas de champ client qui n'existe pas dans le backend.

### Phase 2 - Android local sans publication

Objectif: tester sur Android Studio/emulateur.

Prerequis:

- Android Studio installe.
- AVD Android cree.
- Node compatible Expo SDK 56. La doc Expo SDK 56 indique Node 22.13.x comme minimum cible pour SDK 56.

Tasks:

- [ ] Verifier `node -v` et `npm -v`.
- [ ] Lancer Metro pour Android.
- [ ] Tester `npx.cmd expo start --android` avec emulateur ouvert.
- [ ] Documenter les ports et URLs backend utilisables depuis emulateur.
- [ ] Si le backend est local, gerer `10.0.2.2`; si Railway, utiliser l'URL publique.

Verification:

```powershell
npx.cmd expo start --android
npx.cmd tsc --noEmit
```

Definition done:

- L'app s'ouvre dans l'emulateur.
- Les appels API fonctionnent depuis l'emulateur.
- Screenshot ou observation consignee dans Doryx.

### Phase 3 - Development build Android

Objectif: sortir d'Expo Go quand on ajoute des capacites natives.

Pourquoi: Expo dit que les push distants, les assets natifs et les libs natives non incluses dans Expo Go doivent etre testes en development build, pas seulement Expo Go.

Tasks:

- [ ] Creer compte Expo si absent.
- [ ] Installer/initialiser EAS CLI si decision prise.
- [ ] Ajouter `eas.json` avec profils `development`, `preview`, `production`.
- [ ] Installer `expo-dev-client`.
- [ ] Generer un build Android development avec EAS ou local Android.
- [ ] Installer l'APK sur emulateur.

Verification:

```powershell
npx.cmd expo install expo-dev-client
eas build --platform android --profile development
```

Definition done:

- APK development installe.
- App connectee au serveur de dev.
- Meme comportement que web/emulateur Expo.

### Phase 4 - Push notifications MVP

Objectif: recevoir des notifications de bus sur Android puis iOS.

Decision requise: D4.

Option MVP recommandee:

- Mobile: `expo-notifications`.
- Backend: endpoint de registre token mobile, puis envoi via Expo Push Service.
- Stockage: table tokens cote backend, sans secret dans mobile.

Tasks:

- [ ] Installer `expo-notifications` via `npx expo install`.
- [ ] Ajouter permissions Android/iOS dans config Expo.
- [ ] Creer `src/notifications.ts` pour demander permission et recuperer token.
- [ ] Ajouter endpoint backend pour enregistrer token + platform + session id.
- [ ] Ajouter protection anti-rebinding/token cap cote backend.
- [ ] Ajouter test backend du registre token.
- [ ] Tester sur development build, pas seulement navigateur.

Verification:

- Notification recue app fermee sur Android.
- Token jamais affiche dans les logs publics.
- Echec permission gere proprement.

Definition done:

- Un signalement bus declenche une notification sur un device abonne.
- Dette auth/push documentee si elle reste partielle.

### Phase 5 - Carte et geolocalisation

Objectif: rendre la position bus utile sans exploser le risque privacy.

Decision requise: D2 pour la carte, puis decision separee pour localisation fond.

Tasks MVP carte:

- [ ] Choisir carte liste ou `react-native-maps`.
- [ ] Afficher bus par `lat/lon` quand presents.
- [ ] Afficher route window comme fallback lisible quand pas de carte.
- [ ] Ajouter bouton rafraichir et timestamp de donnees.

Tasks localisation utilisateur:

- [ ] Demander localisation foreground seulement pour itineraire/proximite.
- [ ] Ne pas demander background location avant plan dedie.
- [ ] Ajouter textes de consentement clairs.

Verification:

- Pas de demande permission au lancement si inutile.
- Carte/liste exploitable sur Android emulator.
- Pas de collecte de position sans action explicite.

### Phase 6 - iOS testable

Objectif: avoir une build iOS sans posseder forcement un Mac.

Prerequis:

- Compte Apple Developer si TestFlight ou device reel iOS.
- Compte Expo/EAS.

Tasks:

- [ ] Configurer `ios.bundleIdentifier` dans `app.json`.
- [ ] Configurer icone, splash, nom public.
- [ ] Creer build iOS development via EAS.
- [ ] Tester via TestFlight ou device selon disponibilite.
- [ ] Verifier push iOS si Phase 4 faite.

Verification:

- App ouverte sur iOS/TestFlight.
- API backend fonctionnelle.
- Permissions iOS lisibles et justifiees.

### Phase 7 - Qualite release

Objectif: eviter une app qui marche seulement sur la machine de dev.

Tasks:

- [ ] Ajouter tests unitaires purs pour normalisation API.
- [ ] Ajouter tests de composants critiques si framework choisi.
- [ ] Ajouter checklist manuelle Android/iOS.
- [ ] Ajouter monitoring minimal: erreurs API visibles, logs non secrets.
- [ ] Verifier accessibilite: tailles texte, contrastes, boutons.
- [ ] Verifier offline/degraded states.

Commandes:

```powershell
npx.cmd tsc --noEmit
npx.cmd expo config --type public
npm audit --omit=dev
```

Definition done:

- Les bugs de contrat backend sont attrapes avant demo.
- Les erreurs reseau sont comprensibles pour l'utilisateur.

### Phase 8 - Publication stores

Objectif: preparer Google Play et App Store sans surprise.

Android:

- [ ] Compte Google Play: paiement unique.
- [ ] Package id final dans `android.package`.
- [ ] Build AAB production via EAS.
- [ ] Data Safety: localisation, notifications, donnees utilisateur.
- [ ] Test interne avant production.

IOS:

- [ ] Apple Developer Program: abonnement annuel.
- [ ] Bundle id final dans `ios.bundleIdentifier`.
- [ ] App Store Connect metadata.
- [ ] Privacy nutrition labels.
- [ ] TestFlight avant soumission.

Definition done:

- Builds signes generes.
- Store metadata prete.
- Politique privacy coherente avec les permissions reelles.

## 7. Backlog ordonne

1. Phase 0: README + config + hygiene API.
2. Phase 1: navigation + ecrans principaux.
3. Phase 2: Android emulator fiable.
4. Phase 3: development build Android.
5. Phase 4: push MVP.
6. Phase 5: carte/geoloc foreground.
7. Phase 6: iOS.
8. Phase 7: qualite release.
9. Phase 8: stores.

## 8. Sources Expo consultees

- Expo SDK 56 reference: https://docs.expo.dev/versions/v56.0.0/
- Development builds: https://docs.expo.dev/develop/development-builds/introduction/
- EAS Build: https://docs.expo.dev/build/introduction/
- Push notifications: https://docs.expo.dev/push-notifications/overview/
- Environment variables: https://docs.expo.dev/guides/environment-variables/

## 9. Prochaine tranche recommandee

Doryx tranche proposee: `Phase 0 - Socle propre`.

Scope exact:

- Creer `README.md` mobile.
- Creer `src/config.ts`.
- Durcir `src/api.ts` sur le contrat backend reel.
- Garder web preview fonctionnelle.

Verification minimale:

```powershell
npx.cmd tsc --noEmit
npx.cmd expo config --type public
```
