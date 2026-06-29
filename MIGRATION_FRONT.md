# MIGRATION FRONT — Portage fidèle Dashboard → Xetu Mobile

> **Document vivant.** Source de vérité du chantier UI. Je le remplis **au fur et à mesure** :
> chaque étape terminée → coche le tracker (§1) + ligne dans le Journal (§7). Le contexte vit
> ici, pas dans le fil de conversation.
>
> **Référence (source de vérité UI)** : `C:\Users\DELL\Desktop\whatsapp-agent\Dashboard`
> (PWA vanilla JS). On NE copie PAS de logique backend — uniquement markup + CSS + icônes.

---

## 0. Objectif & principe

**But** : que `xetu-mobile` *ressemble vraiment* au dashboard `xetudashbord.pages.dev`, **adapté mobile**
(tailles, safe-areas, tab-bar Ionic). Zéro emoji — tout en SVG / icônes CSS. Police alignée.

**Principe — portage 1:1** : on porte le **markup + CSS du dashboard** dans les pages Angular ;
Ionic ne sert plus que de **coquille** (routing, tabs, safe-areas, cycle de vie). On arrête de
« rebâtir à la sauce Ionic » (c'est la cause racine, §2).

**Règle de contrat (AGENTS.md)** : les contrats d'API viennent du code backend, pas de suppositions.
Aucune modification backend dans ce chantier — tout est déjà câblé côté mobile (§3.5).

---

## 1. Statut global — TRACKER (anti-perte de contexte)

Légende statut : ⬜ à faire · 🟦 en cours · ✅ fait & vérifié · ⏸️ en attente décision

| # | Étape | Périmètre | Statut | Vérif |
|---|-------|-----------|--------|-------|
| 0 | Fondations | Tokens manquants (`--font-*`, layout, z-index) + partiel CSS partagé (icônes, animations, primitives) | ✅ | `npm run build` OK (2026-06-29) |
| 1 | Navigation | 4 SVG nav exacts (carte/route/bulle/signet), outline stroke 1.8, fix z-index tab-bar | ✅ | build + visuel preview OK (2026-06-29) |
| 2 | Carte | CTA « Je vois un bus ici », panneau bas hand-rolled (Bus actifs / Top signaleurs), marker = **numéro coloré par fraîcheur**, bus-cards compactes, overlay « Position détectée », bouton locate 38px | ✅ | build + tests (86/86) + **visuel réel confirmé par l'utilisateur** (2026-06-29) |
| 3 | Itinéraire | Champs from/to à pastilles, placeholders « Vous êtes où ? / allez où ? », swap, **Destinations fréquentes**, carte résultat stepper, suppression du bouton « Calculer », index local + onglet Lignes | ✅ | 3a+3b : build + tests (98/98) + visuel preview OK (2026-06-29) |
| 4 | Chat | Header avatar bot + statut, bulle bot à gauche, composer textarea + bouton rond (avion), **suggestions retirées (décision produit)** | ✅ | build + tests (99/99) + visuel preview OK (2026-06-29) |
| 5 | Mes lignes | Titres alignés gauche, état vide cloche SVG, bouton « + S'abonner » outline, **bloc Mon score** (localStorage + paliers), modal abonnement restylée | ✅ | build + tests (111/111) + visuel preview partiel (2026-06-29) |
| 6 | Signalement | Suppr. emojis, wizard 3 étapes (Ligne/Arrêt/Envoi), icônes `xetu-icon--seen/--rider`, tags qualité, écran succès +5 pts | ✅ | build + tests (114/114) + visuel OK |
| 7 | Header `live` + menu | (optionnel/fin) badge `live` + hamburger → Telegram/WhatsApp/thème/avis/partager/CGU/contact + QR | ⏸️ | à valider |

**Décisions actées (validées par l'utilisateur, 2026-06-29)** :
- D1 panneau bas Carte → **Option A** (panneau hand-rolled). Confirmé.
- D3 incrément score → **+1** (pas +5 : « le score doit représenter une contribution réelle, pas un effet visuel marketing »). Confirmé.
- D4 wizard signalement → **version fidèle mais légère d'abord**, testée sur mobile avant d'aller plus loin. Pas tranché en détail, à juger à l'étape 6.
- Étape 7 (header `live`+menu) → **reportée en fin de chantier**, pas prioritaire avant que Carte/Itinéraire/Chat/Mes lignes/Signalement soient propres.
- Étape 5 (Mes lignes) → **9 décisions tranchées par l'utilisateur (2026-06-29)**, voir §4 Étape 5
  et §5 D8-D9. Inclut un **bug de données corrigé** (pas un choix de style) : `LIGNE_NAMES` du modal
  d'abonnement listait 14 lignes fictives (1-12, 218, 219) au lieu des 10 lignes MVP réelles.

**Périmètre autorisé maintenant : Étape 0 + Étape 1 uniquement.** Pas de méga-diff — validation visuelle
étape par étape avant d'enchaîner sur la Carte (étape 2).

**Étape 0 + 1 livrées et vérifiées (2026-06-29, voir Journal §7). En attente du GO utilisateur
avant d'entamer l'Étape 2 (Carte).**

### Contraintes posées par l'utilisateur (s'appliquent à tout le chantier)

- Ne pas toucher au backend.
- Ne pas toucher à la gestion du clavier (logique iOS standalone existante — cf. mémoire `project_ios_pwa_bottom_gap`).
- Ne pas casser le déploiement Cloudflare (`xetu-mobile.pages.dev`).
- Fidélité visuelle au dashboard, mais en **composants Angular/Ionic propres** (pas de copier-coller brut qui casse le typage strict ou les standalone components).
- Vérification après **chaque** étape : `npm run build` + test visuel sur `xetu-mobile.pages.dev` (ou preview locale).
- Ordre : tokens/theme/nav (0+1) → Carte (2) → reste.
- Marker bus : remplacer l'emoji par la **pastille numéro de ligne colorée par fraîcheur** (§3.3) — point jugé prioritaire par l'utilisateur.

### Retours visuels à corriger avant prochain push Cloudflare (2026-06-29)

Ces points viennent du rendu Cloudflare / preview mobile après le push `e42e5d6`. Ils sont à traiter comme une passe de stabilisation UI avant de considérer la migration front comme validée visuellement.

#### P0 — Carte : Leaflet se casse après changement d'onglet

- **Image** : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-d36e0aca-a3b8-4d49-9b8e-5661a3710914.png`
- **Observation utilisateur** : la carte charge bien au départ. Le bug apparaît après avoir changé d'onglet puis être revenu sur **Carte**.
- **Symptôme** : seule la partie haute de Leaflet reste rendue ; une grande zone claire/vide apparaît sous les tuiles.
- **Hypothèse structurelle** : lifecycle Ionic tabs + Leaflet. Le conteneur redevient visible avec une taille différente, mais Leaflet garde son ancienne taille interne.
- **Fichiers probables** : `src/app/features/carte/carte.page.ts`, `src/app/features/carte/carte.page.scss`.
- **Attendu** : ouvrir Carte → aller Itinéraire/Chat/Mes lignes → revenir Carte doit conserver une carte pleine hauteur, sans zone vide.
- **Contraintes** : ne pas recréer toute la map si elle existe déjà ; rappeler `map.invalidateSize()` au bon moment après retour onglet (`ionViewDidEnter`/`requestAnimationFrame`/délai contrôlé) ; vérifier aussi resize/orientation ; nettoyer les listeners.
- **Validation demandée** : reproduction explicite du scénario changement d'onglet + vérification visuelle sur viewport mobile.

#### P1 — Carte : contrôles refresh / cible / zoom à réaligner

- **Image** : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-31cd589d-c0f7-46e4-9b29-a08c03405cdf.png`
- **Observation utilisateur** : les boutons doivent reprendre le rendu de référence : refresh en haut à droite, cible sous refresh, zoom +/− à gauche. Le bouton cible existe déjà mais l'icône a changé.
- **Fichiers probables** : `src/app/features/carte/carte.page.html`, `src/app/features/carte/carte.page.scss`.
- **Attendu** : boutons sombres, cohérents, un peu plus centrés dans la zone carte ; même équilibre visuel pour refresh, cible et zoom ; pas de chevauchement avec CTA ni panneau bas.
- **Contraintes** : conserver les fonctions existantes (`refresh`, `centerOnUser`, zoom Leaflet) ; ne pas modifier le comportement API ; corriger uniquement position, dimensions, icône et style.
- **Validation demandée** : capture/preview mobile montrant les 4 contrôles dans leur position finale.

#### P1 — Carte : panneau "Bus actifs" draggable avec snap points

- **Images** :
  - position basse : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-7a99f197-9225-4d59-ab99-0829aae255f6.png`
  - position haute : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-422ea8d1-aa95-47fc-83f3-8eb102c8f3d6.png`
  - état par défaut trop bas : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-21fcfed4-2a49-45e3-9d5f-ab6a8b7fabd3.png`
- **Observation utilisateur** : le panneau ne doit pas être un simple clic ouvert/fermé. Il doit se glisser verticalement pour laisser l'espace aux users.
- **Observation complémentaire** : l'état par défaut doit remonter un peu. Il doit afficher au minimum du contenu lisible : texte d'état, un bus, ou un signaleur. L'utilisateur ne doit pas voir seulement le CTA + tabs + un panneau presque vide.
- **Attendu** : poignée draggable ; position basse utile, position milieu, position haute ; snap propre ; en position haute, garder un bout de carte visible ; tab-bar toujours visible.
- **Fichiers probables** : `src/app/features/carte/carte.page.html`, `src/app/features/carte/carte.page.scss`, `src/app/features/carte/carte.page.ts`.
- **Contraintes** : ne pas revenir à `ion-modal` ; gérer touch/pointer events proprement ; éviter conflit entre drag du sheet et scroll interne ; rappeler `map.invalidateSize()` si le drag modifie la zone carte ; garder les états Bus actifs / meilleurs signaleurs.
- **Validation demandée** : test manuel drag bas → milieu → haut → bas, avec carte et tab-bar utilisables ; en état par défaut, vérifier qu'au moins une information utile du panneau est visible.

#### P1 — Itinéraire : résultat post-calcul doit remplacer l'état recherche

- **Images** :
  - dashboard attendu / référence : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-6f4795a2-38ce-4ab3-8d8b-5b983b5dc6f0.png`
  - Ionic actuel problématique : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-33902405-5709-4394-97d3-c92d158e409e.png`
- **Observation utilisateur** : après avoir saisi les arrêts départ/destination et lancé le calcul, Ionic n'affiche pas correctement la suite. On voit encore `Yoff` / `Médina` dans les champs en bas, parfois répétés, et il faut cliquer dessus pour revoir les lignes/suggestions. Ce n'est pas le comportement attendu.
- **Problème UX** : l'écran reste dans un état hybride "résultat + recherche active". Après calcul, les champs/suggestions ne doivent pas rester ouverts ni répéter les mêmes lieux sous le résultat.
- **Fichiers probables** : `src/app/features/itineraire/itineraire.page.ts`, `src/app/features/itineraire/itineraire.page.html`, `src/app/features/itineraire/itineraire.page.scss`.
- **Attendu** : après calcul, afficher directement la carte résultat type dashboard (départ → ligne/direct/arrêts → destination, durée estimée, modifier le trajet). Les champs de recherche doivent être fermés/compactés. Les suggestions `Lieux/Lignes` ne doivent plus rester visibles sous le résultat, sauf si l'utilisateur clique explicitement sur "Modifier le trajet" ou retape dans un champ.
- **Contraintes** : ne pas relancer un calcul en cliquant une ligne de suggestion ; ne pas afficher deux fois le même lieu (`Yoff`, `Médina`) ; ne pas garder un loader infini "Calculer en cours..." si le backend échoue ; afficher l'état erreur/réessayer clairement.
- **Validation demandée** : scénario Yoff → Médina : saisir départ/destination → calculer → vérifier que le résultat est lisible immédiatement, que les suggestions sont fermées, et que "Modifier le trajet" est le seul chemin pour rouvrir l'édition.

#### P1 — Navigation : tab-bar flottante et safe-area iOS/Android

- **Image** : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-da281f47-9ca5-45bc-8560-ab259c28a943.png`
- **Observation utilisateur** : la navbar doit être décollée du bas et laisser un espace safe-area iOS/Android.
- **Fichiers probables** : `src/app/tabs/tabs.page.scss`, éventuellement `src/theme/xetu.scss` / `src/global.scss`.
- **Attendu** : tab-bar capsule flottante, marge latérale, ombre douce, marge basse avec `env(safe-area-inset-bottom)`, état actif orange conservé.
- **Contraintes** : ne pas cacher du contenu sous la nav ; vérifier interaction avec panneau Carte ; rendu propre sur iPhone home indicator et Android gesture bar.
- **Validation demandée** : viewport iPhone + Android, tab-bar visible et décollée sans chevauchement.

#### P2 — Mes lignes : modal abonnement trop haut + fermeture non évidente

- **Image** : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-9b47d8fc-02ee-4161-9dbc-647973213e90.png`
- **Observation utilisateur** : le modal "S'abonner à une ligne" monte trop haut et laisse beaucoup d'espace vide en bas. Le geste de glisser vers le bas peut rester, mais il faut aussi un bouton évident pour fermer.
- **Fichiers probables** : `src/app/features/mes-lignes/subscribe-modal.component.html`, `src/app/features/mes-lignes/subscribe-modal.component.scss`, éventuellement `mes-lignes.page.*` selon le wrapper.
- **Attendu** : modal un peu plus bas / mieux ancré visuellement ; contenu compact ; pas de grand vide inutile ; conserver l'effet sheet/glisser ; ajouter un bouton plein largeur de fermeture/annulation en bas du modal.
- **Contraintes** : ne pas masquer les lignes disponibles ; bouton de fermeture clair pour les utilisateurs qui n'ont pas l'intuition du drag ; respecter safe-area bottom ; garder la recherche et la grille des lignes MVP.
- **Validation demandée** : ouvrir Mes lignes → "+ S'abonner" → vérifier position verticale, absence de vide excessif, bouton plein largeur visible, fermeture au bouton + drag fonctionnelle.

#### P0 — Signalement : GPS bloqué, carte absente, "signalements autour de moi" absent

- **Images** :
  - étape arrêt bloquée : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-12ecc88f-ec10-483d-892a-104964575017.png`
  - étape ligne actuelle : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-f8639669-635c-4590-9d1f-c81f71fcd9b5.png`
- **Observation utilisateur** : bug critique. Dans le wizard Signalement, le GPS reste sur "Position en attente...", la carte n'apparaît pas, les "signalements autour de moi" n'apparaissent pas, et l'utilisateur est bloqué à l'étape arrêt.
- **Fichiers probables** : `src/app/features/signalement/signalement-modal.component.ts`, `src/app/features/signalement/signalement-modal.component.html`, `src/app/features/signalement/signalement-modal.component.scss`, `src/app/core/services/api.service.ts` si le contexte nearby/report est mal appelé.
- **Attendu** : après sélection de ligne, l'étape arrêt doit afficher une carte/zone de position exploitable, demander/recevoir la position si permission OK, charger les arrêts proches et/ou signalements autour de l'utilisateur, et toujours proposer une sortie manuelle claire si GPS indisponible.
- **Contraintes** : ne jamais bloquer l'utilisateur uniquement parce que le GPS ne répond pas ; si GPS refuse/timeout, afficher un état clair + champ manuel + bouton continuer ; si GPS fonctionne, appeler le bon endpoint nearby/stops et afficher les résultats ; ne pas rester indéfiniment sur "Position en attente...".
- **Validation demandée** : tester avec GPS autorisé et GPS refusé/timeout. Dans les deux cas, l'utilisateur doit pouvoir atteindre l'étape Envoi. Avec GPS autorisé, les arrêts proches/signalements autour doivent être visibles.

#### P1 — Signalement : couleur de fond et format ligne non fidèles dashboard

- **Images** :
  - signalement mobile trop sombre / fond incorrect : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-f8639669-635c-4590-9d1f-c81f71fcd9b5.png`
  - format attendu avec recherche de ligne : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-0d4f76df-2f2a-4dec-947d-631b7606e723.png`
- **Observation utilisateur** : le fond actuel est trop sombre/noir. L'app doit reprendre la vraie couleur de fond du dashboard. Le format étape ligne doit garder la recherche de ligne comme dans la référence.
- **Fichiers probables** : `src/app/features/signalement/signalement-modal.component.html`, `src/app/features/signalement/signalement-modal.component.scss`, `src/theme/variables.scss`, `src/theme/xetu.scss`.
- **Attendu** : fond aligné dashboard (pas noir plein) ; grille de lignes MVP conservée ; champ "Chercher une ligne..." visible au bon endroit ; contraste et surfaces cohérents avec le reste de l'app.
- **Contraintes** : corriger les tokens/couleurs à la source si la divergence est globale ; ne pas patcher seulement une page si le mauvais fond vient d'une variable globale ; garder accessibilité/contraste.
- **Validation demandée** : comparaison visuelle côte à côte avec dashboard/référence, en particulier écran Signalement étape 1.

#### P1 — Header global : intégrer le header dashboard `live` + hamburger dans Xetu Mobile

- **Image** : `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-32872aae-0a9a-4b4c-9282-e57df86112b0.png`
- **Correction utilisateur** : l'image montre le header du dashboard. Xetu Mobile ne l'a pas encore ; il faut l'intégrer, pas seulement corriger son espacement.
- **Fichiers probables** : `src/app/tabs/*` si header global, ou pages concernées si header local ; vérifier la meilleure structure avant code.
- **Attendu** : ajouter dans Xetu Mobile le header dashboard avec badge `live` à gauche et hamburger à droite, en respectant la safe-area top et le style dashboard.
- **Contraintes** : ne pas créer un header qui mange trop la carte ; ne pas dupliquer le header page par page si un wrapper global propre suffit ; garder hamburger prêt pour le menu futur sans implémenter toute l'étape 7 si hors scope.
- **Validation demandée** : capture en viewport mobile montrant le header dashboard intégré dans Xetu Mobile, avec carte/contenu commençant correctement dessous.

### Retours audit fonctionnel Antigravity Dashboard vs Mobile (2026-06-29)

Source : `C:\Users\DELL\.codex\attachments\ec231599-e569-479c-a12a-41834986eae7\pasted-text.txt`

Ces retours ne remplacent pas les captures utilisateur ci-dessus. Ils ajoutent les écarts fonctionnels profonds entre `whatsapp-agent/Dashboard` et `xetu-mobile`. À traiter comme une phase **Front parity hardening**, avec vérification contre les vrais contrats API avant tout code.

#### P0 — Post-signalement : rafraîchir immédiatement la carte après succès

- **Référence dashboard** : `Dashboard/js/app.js` passe `initSignal({ onSuccess: () => { goTo('home'); _loadData(); } })`.
- **Écart mobile** : `carte.page.ts` ouvre la modale Signalement mais ne traite pas son `dismiss` pour rafraîchir `/api/buses`.
- **Impact** : après un signalement réussi, le bus peut ne pas apparaître immédiatement sur la carte mobile ; l'utilisateur attend le polling.
- **Attendu** : si le modal Signalement se ferme avec un statut de succès (`recorded` ou statut équivalent), retourner/maintenir Carte et lancer immédiatement `getBuses()` puis mettre à jour `StoreService.activeBuses`.
- **Contraintes** : ne pas créer de faux bus local ; ne pas afficher un signalement si le backend répond `already_recorded` sans nouvelle position ; respecter le contrat réel du modal.
- **Validation demandée** : signalement réussi → fermeture/retour Carte → appel immédiat `/api/buses` observable → liste/carte rafraîchie sans attendre 30s.

#### P1 — Carte : sélection d'un bus doit afficher le contexte de ligne

- **Référence dashboard** : `Dashboard/js/home.js` charge les données de ligne, dessine une polyline, ajoute les marqueurs d'arrêts, puis ajuste la carte avec `fitBounds`.
- **Écart mobile** : `selectBus(bus)` recentre seulement la carte sur `[bus.lat, bus.lon]`.
- **Attendu** : au tap sur un bus, afficher au minimum le tracé de la ligne et les arrêts principaux/intermédiaires si les données locales/API disponibles le permettent.
- **Contraintes** : ne pas inventer une trajectoire ; utiliser uniquement `xetu_mvp.json` / données ligne existantes / endpoint réel ; pas de mouvement synthétique ; si trace indisponible, afficher un état sobre "tracé indisponible".
- **Validation demandée** : tap sur un bus → ligne visible ou fallback clair ; aucun crash si ligne inconnue.

#### P1 — Carte : fiche bus sélectionné plus informative

- **Référence dashboard** : une bus-card sélectionnée devient `.bus-card--selected` avec mode signalement, confiance/statut, signaleur si disponible, relance si autorisée.
- **Écart mobile** : les cartes restent compactes et n'exposent presque aucune métadonnée.
- **Attendu** : quand un bus est sélectionné, la carte/liste doit s'étendre pour afficher les métadonnées réellement disponibles dans `Bus`.
- **Contraintes** : vérifier le contrat `/api/buses` avant design ; ne jamais afficher de champ inventé (`reporter`, `confidence`, `relanceAllowed`) s'il n'existe pas ; masquer proprement les lignes indisponibles.
- **Validation demandée** : bus avec données complètes → fiche enrichie ; bus minimal → fiche propre sans `undefined`.

#### P1 — Carte : prochains arrêts du bus sélectionné

- **Référence dashboard** : `home.js` normalise `bus.position`, retrouve l'arrêt courant dans la ligne, puis affiche l'arrêt actuel + les 2 prochains (`bus-stops-preview`).
- **Écart mobile** : aucune timeline/prochains arrêts.
- **Attendu** : si `bus.position` et les arrêts de la ligne sont disponibles, afficher une mini timeline des prochains arrêts dans la fiche bus sélectionnée.
- **Contraintes** : calcul textuel seulement, pas de simulation de progression ; si correspondance impossible, ne pas afficher une timeline trompeuse.
- **Validation demandée** : bus positionné sur un arrêt connu → 3 arrêts visibles ; position inconnue → fallback propre.

#### P2 — Tracking live passager à cadrer avant code

- **Référence dashboard** : `Dashboard/js/signal.js` démarre `/tracking/session/start`, ping `/tracking/session/ping` toutes les 15s, puis stop `/tracking/session/stop` selon état serveur.
- **Écart mobile** : aucun tracking live foreground après signalement mode passager.
- **Impact** : le mode "passager à bord" ne contribue pas à une position fraîche continue côté mobile.
- **Décision requise avant implémentation** : ce point touche batterie, permissions GPS, privacy et cycle de vie app. Présenter 2 options avant code :
  1. tracking foreground simple seulement app ouverte ;
  2. tracking natif plus robuste plus tard avec plugin/capacités dédiées.
- **Contraintes** : ne pas lancer de tracking sans consentement explicite ; prévoir stop visible ; gérer app background/resume ; ne pas mélanger avec le simple `/api/report`.
- **Validation demandée** : seulement après décision produit/technique.

#### P2 — Live indicator / réseau global

- **Référence dashboard** : badge `#live-indicator` affiche `live`, `sync...`, `offline · HH:MM`, avec dernier sync stocké ; `online/offline` déclenchent toasts et état live.
- **Écart mobile** : polling bus simple + quelques listeners réseau localisés, mais pas d'indicateur global cohérent.
- **Attendu** : intégrer le badge live du header avec état global de sync, dernière mise à jour et offline clair.
- **Nuance vérifiée** : `mes-lignes.page.ts` contient déjà des listeners `online/offline`; ne pas dire que mobile n'écoute jamais le réseau. Le manque est une gestion globale visible.
- **Validation demandée** : mode online → live/sync ; API échoue/offline → badge offline + heure dernière réussite.

#### P3 — Menu hamburger, avis, contact, partage, push auto

- **Référence dashboard** : menu hamburger avec partage, CGU/contact/avis ; push auto via `_maybeSubscribePush()` quand WS ouvert et lignes abonnés existantes.
- **Écart mobile** : absent ou non cadré.
- **Priorité** : après P0/P1. Ne pas bloquer la stabilisation Carte/Signalement dessus.
- **Attendu** : garder en backlog, sauf si l'intégration du header nécessite au moins un menu placeholder propre.
- **Validation demandée** : à définir dans une phase séparée.

---

## 2. Cause structurelle racine

```
STRUCTURE TOUCHÉE : choix de composants — Ionic natif (ion-modal, ion-fab, ion-tab-bar)
                    vs markup hand-rolled du dashboard (divs + SVG + CSS custom).
POURQUOI ÇA AUTORISE LE PROBLÈME : chaque écran mobile a été reconstruit « à la sauce Ionic »
                    au lieu de porter le markup/CSS du dashboard. Chaque écran réintroduit donc
                    ses propres écarts (icônes, layout, états vides, CTA) → le même type de
                    défaut se répète sur les 4 écrans.
CE QUE LE PORTAGE FIXE : structure (on supprime la divergence par construction), pas symptôme.
```

Exemple concret du symptôme : `ion-modal` (z-index 999) **masque** `ion-tab-bar` (z-index 10) car
le modal rend dans le portail global d'Ionic, hors de `ion-tabs`. Le porter en `<div>` enfant de
`ion-content` supprime la classe de bug.

---

## 3. Référence figée (extraite du dashboard — ne pas re-lire les sources)

### 3.1 Tokens manquants côté mobile (`src/theme/variables.scss`)

À ajouter (valeurs exactes de `Dashboard/css/variables.css`). Les couleurs/rayons/ombres sont
**déjà alignés** côté mobile ; ce qui manque :

```scss
/* Typographie */
--font-head: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

/* Layout mobile */
--safe-area-factor: 1;
--header-h: 48px;
--stats-h:  48px;
--nav-h:    72px;
--header-gradient: linear-gradient(to bottom, rgba(10,15,30,0.88) 0%, transparent 100%);

/* Z-index (échelle) */
--z-map: 1; --z-ui: 10; --z-header: 20; --z-toast: 100; --z-sheet: 1100;

/* Transitions */
--t-fast: 0.15s ease; --t-normal: 0.25s ease; --t-spring: 0.3s cubic-bezier(0.34,1.56,0.64,1);
```

`--font-mono` est utilisé pour **tous les chiffres/badges** (numéro de ligne, score, durée). Sans lui,
les badges mobiles n'ont pas le rendu « ticket » du dashboard.

> Note (vérifié Étape 0) : les alias dashboard (`--orange`, `--surface2`, `--text`, `--muted`,
> `--border`, `--green`, `--yellow`, `--red`, `--t-fast`…) étaient **déjà présents et identiques**
> dans `variables.scss`. Pas de table de correspondance nécessaire — seuls les tokens listés
> ci-dessus (`--font-*`, layout, z-index) manquaient réellement.

### 3.2 Icônes SVG (à figer ici — copier-coller à l'implémentation)

**Bottom-nav (stroke-width 1.8, fill none, stroke currentColor) :**

- **Carte** (carte pliée) :
  `<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>`
- **Itinéraire** (route) :
  `<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V7a4 4 0 0 1 4-4h4"/><path d="M18 7v10a4 4 0 0 1-4 4H10"/>`
- **Chat IA** (bulle unique) :
  `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`
- **Mes lignes** (signet/bookmark) :
  `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`

**Action / contenu :**

- **Œil** (CTA « Je vois un bus ici », 18px) :
  `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
- **Avion papier** (envoi chat, fill) : `<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>`
- **Swap** (itin) : `<polyline points="17 1 21 5 17 9"/><line x1="3" y1="5" x2="21" y2="5"/><polyline points="7 23 3 19 7 15"/><line x1="21" y1="19" x2="3" y2="19"/>`
- **Bus** (recap/itin, fill) : `<path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>`
- **Pin** (fill) : `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>`
- **Retour/back** : `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`
- **Check succès** : `<polyline points="20 6 9 17 4 12"/>`

**Icônes CSS maison** (à porter depuis `Dashboard/css/components.css`) : `.xetu-icon--pin`,
`--seen` (œil), `--rider` (personne), `--signal-live / --signal-estimated / --signal-stale`,
`.quality-icon--full/--empty/--late/--left`. → à recopier en Étape 0 dans le partiel partagé.

### 3.3 Bus — « affichage par numéro » (exigence explicite)

**Marker carte** (`_busIcon`, `Dashboard/js/home.js:713`) — PAS d'emoji :
- pastille circulaire `size` 34px (40px si sélectionné), `border:3px solid rgba(255,255,255,.7)` (.95 si sélec.),
  `box-shadow:0 2px 12px rgba(0,0,0,.5)`, **numéro de ligne** centré, `color:#0a0f1e`, `font-weight:700`,
  `font-size:11px` (13px si sélec.).
- **couleur = fraîcheur** (`_busAgeColor`) : `≤5min → #00D67F` · `≤15min → #FFD166` · `>15min → #FF4757`.
- `.xetu-pulse` derrière quand non-sélectionné (anim halo).

**Bus-card** (`_renderBusList`, `home.js:461`) :
- `.bus-card-header` = `.bus-badge` (même couleur fraîcheur, numéro) + `.bus-name` (nom ligne) + `.bus-age` (âge court).
- `.bus-position` = pin + position. `.bus-meta-row` = mode (`xetu-icon--seen/--rider` + label) + `.bus-confidence` (icône `signal-*` + label).
- relance si `mode dedans`, ligne `Signalé par ****`.

**Mapping modèle mobile `Bus`** (`src/app/core/models/models.ts`) → champs dashboard :
`minutes_ago` → `minutes_depuis_signalement` · `position` → `arret_signale` · couleur → via `minutes_depuis_signalement` ·
confiance → `confiance.{tone,icon,label}` · mode → `mode` ('vu'→seen, 'dedans'→rider).
Champs absents côté mobile : `name`/`reporter`/`id` → fallback `Ligne {ligne}`, `****`, clé composée `ligne+lat+lon`.

### 3.4 Emojis à supprimer (inventaire)

| Fichier | Ligne | Emoji | Remplacement |
|---|---|---|---|
| `src/app/features/carte/carte.page.ts` | 218 | 🚌 (marker) | pastille numéro (§3.3) |
| `src/app/features/signalement/signalement-modal.component.html` | 20, 148 | 🚌 | SVG bus / `xetu-icon` |
| ″ | 77 | 📍 | SVG pin |
| ″ | 92 | 🔍 | SVG loupe |
| ″ | 142 | 👁️ | `xetu-icon--seen` |
| `src/app/features/mes-lignes/mes-lignes.page.html` | 38 | 🔔 | cloche SVG |
| `src/app/features/chat/chat.page.html` | 22, 23 | 🤖 🚌 | avatar bot SVG (header) |

> Re-grep en début de chaque étape pour confirmer (les n° de ligne peuvent bouger).

### 3.5 Contrats backend (déjà câblés — aucune modif backend)

| Bloc | Source | Statut mobile |
|---|---|---|
| Bus actifs | `getBuses()` → `/api/buses` | ✅ `api.service.ts:56` |
| Top signaleurs | `getLeaderboard()` → `/api/leaderboard` | ✅ `api.service.ts:133` + `LeaderboardResponse` |
| Itinéraire | `getRoute(from,to,no_transfer)` → `/api/route` | ✅ `api.service.ts:62` |
| Recherche arrêt | `searchStops(q,lat,lon)` → `/api/stops/search` | ✅ `api.service.ts:72` |
| Abonnements | `getSubscriptions / create / delete` → `/api/subscriptions` | ✅ `api.service.ts:92-131` |
| Signalement | `reportBus()` → `/api/report` (200 `already_recorded` = succès idempotent) | ✅ `api.service.ts:139` |
| Mon score | `localStorage 'xetu_score'` + paliers (PAS de backend) | voir §3.6 |

### 3.6 Mon score — logique (100 % client, `Dashboard/js/mylines.js:297`)

Paliers (constante `BADGES`) :

| Label | min pts | couleur |
|---|---|---|
| Nouveau | 0 | `#6B7A99` |
| Actif | 5 | `#00D67F` |
| Régulier | 20 | `#FF6B35` |
| Expert | 50 | `#FF6B35` |
| Légende | 100 | `#FFD700` |

- `points` = `localStorage 'xetu_score'` (entier). Incrément **+1** à chaque signalement réussi
  (le dashboard affiche « +5 » sur l'écran succès, mais `incrementScore()` fait **+1** — **confirmé,
  D3 §5**).
- **Règle de déclenchement exacte** (`Dashboard/js/signal.js:980-984`) : l'incrément ne se déclenche
  que si la réponse backend a `status === 'recorded'`. **Jamais sur `already_recorded`** (signalement
  dupliqué/idempotent — pas une contribution nouvelle). Confirmé par l'utilisateur (2026-06-29).
- carte = nombre de points (mono), niveau, barre de progression `pct = min(points/next.min*100, 100)`,
  3 stats (signalements / cette semaine / classement). **`total`/`week`/`rank` ne sont jamais peuplés
  nulle part dans le dashboard réel** (seul le score scalaire est publié) → afficher `—` pour
  semaine/classement comme la référence, ne pas inventer de calcul.
- **CSS morte côté dashboard, à ne pas porter** : ancien layout `.score-circle`/`.score-badge-row`/
  `.score-progress-bar/-fill` (sélecteurs dupliqués, jamais généré par le `_renderScore()` réel — le
  vrai rendu est `.score-block`/`.score-points-card`/`.score-bar-track`/`.score-stats`) ; et
  `BADGES[].iconClass` (`score-badge-icon--new/active/...`) qui est calculé en JS mais **jamais
  inséré** dans le HTML généré — la forme d'icône du badge n'apparaît jamais à l'écran dans le
  dashboard réel.

---

## 4. Plan détaillé par étape

> Avant CHAQUE diff, énoncer : `STRUCTURE TOUCHÉE / POURQUOI / FIXE: symptôme|structure`.
> Un diff = une étape cohérente, puis vérif, puis maj du tracker (§1) + Journal (§7).

### Étape 0 — Fondations design ✅
- **Fichiers** : `src/theme/variables.scss` (tokens §3.1 ajoutés), `src/theme/xetu.scss`
  (`.xetu-icon--*` complétées avec `--seen/--rider/--signal-*`, `.xetu-pulse` + `@keyframes xetuPulse`).
- **Constat** : les alias couleur dashboard→Ionic existaient déjà à l'identique — pas de mapping
  à écrire. `.btn-see-bus`, `.filter-chip`, `slideUp/fadeIn/bounce` existaient aussi déjà dans
  `xetu.scss` → scope réduit aux pièces réellement absentes.
- **Vérif réalisée** : `npm run build` → succès, 9.5s, aucune erreur SCSS/TS (2026-06-29T06:22:37Z).

### Étape 1 — Navigation ✅
- **Fichiers** : `src/app/tabs/tabs.page.html` (4 `<ion-icon>` → 4 `<svg>` inline §3.2),
  `src/app/tabs/tabs.page.scss` (nouveau, `.tab-icon` 22×22px), `src/app/tabs/tabs.page.ts`
  (retrait `IonIcon`/`addIcons`/imports ionicons — plus nécessaires).
- **Fix appliqué** : icônes corrigées (Itinéraire `git-compare`→route à 2 cercles ; Mes lignes
  `list`→signet/bookmark). Coloration actif/inactif (orange/gris) confirmée héritée nativement
  via `:host(.tab-selected){color:var(--color-selected)}` d'Ionic — `currentColor` sur le SVG suffit,
  aucune logique Angular ajoutée.
- **Clavier** : listeners Capacitor `keyboardWillShow/Hide` → `isTabBarVisible` **non touchés**
  (contrainte utilisateur).
- **Vérif réalisée** :
  - `npm run build` → succès, 10.8s, aucune erreur (2026-06-29T06:25:04Z).
  - Visuel via preview locale (`ng serve`, viewport mobile 375×812) sur `/tabs/mes-lignes`,
    `/tabs/itineraire`, `/tabs/chat` : 4 icônes correctes, onglet actif coloré orange, label
    assorti, pas de régression de layout.
  - `/tabs/carte` : tab-bar toujours masquée par le sheet `ion-modal` (bug pré-existant, **hors
    scope** — sera réglé structurellement en Étape 2 via le panneau hand-rolled, §5 D1).
  - Console : uniquement des erreurs réseau backend (pas de backend local dans cette preview) —
    aucune erreur liée aux changements de nav/thème.
  - **Pas de test sur `xetu-mobile.pages.dev`** (ce serait l'ancien build déployé, pas ces
    changements non commités) — vérifié via preview locale à la place.

### Étape 2 — Carte ✅
- **Fichiers** : `carte.page.html/.scss/.ts` (réécriture complète), `carte.page.spec.ts` (DI
  `SessionService` + spies `getNearby`/`getLeaderboard` ajoutés, 6 tests nouveaux), `store.service.ts`
  (`leaderboard` retypé `LeaderboardResponse['leaderboard']` au lieu de `any[]`), `xetu.scss`
  (`.empty-state`/`.empty-icon`/`.empty-text`/`.empty-action` portés, réutilisables Itinéraire/Mes lignes).
- **Structure livrée (markup dashboard `#screen-home`, flex-column — voir §5 D1)** :
  - `#map` flex 1 1 auto (zoom 13 init, `zoomControl:false` — pinch-to-zoom seul, aligné dashboard `map.css`).
  - `.see-bus-wrap > .btn-see-bus` (icône œil SVG + « Je vois un bus ici ») → `openSignalement()`.
  - `.home-bottom` hand-rolled (`<div>` flex-shrink, **pas de `ion-modal`**) : `.panel-grabber` (click-toggle
    `expanded`, pas de drag — confirmé dans `home.js` `_toggleHomePanel`), `.home-col-tabs` (Bus actifs /
    Top signaleurs), `.home-filter-bar` (chips par ligne, masqué si 0 bus), `.home-cols` (2 colonnes empilées
    par `display:none/flex`).
  - Bus-cards **compactes** (badge+nom+âge + position uniquement — `id`/`reporter`/`relance` absents du
    modèle mobile, cf. §3.3 + contrainte utilisateur explicite).
  - Marker = pastille numéro coloré par fraîcheur (34px/40px sélectionné, halo `.xetu-pulse` si non
    sélectionné), `L.divIcon` recréé à chaque refresh/sélection.
  - Overlay « Position détectée » : réutilise la position GPS déjà capturée (pas de second
    `getCurrentPosition`), affiché une fois par session de page (`welcomeShown` flag d'instance),
    non bloquant si `getNearby()` échoue (try/catch silencieux).
  - Bouton locate 38px bas-droite (crosshair SVG, markup identique dashboard `map.css`).
  - Polling 30s (`setInterval`/`clearInterval`) **uniquement** pendant que la vue est active :
    démarré dans `ionViewDidEnter`, nettoyé dans **`ionViewDidLeave` ET `ngOnDestroy`** (double
    garde demandée explicitement par l'utilisateur). Aucun mouvement synthétique/interpolé.
  - Leaderboard : `badgeLabel()` rend `badge.label` si objet, fallback string/`'Contributeur'` si
    absent — ne rend jamais `[object Object]` (bug confirmé présent côté dashboard `home.js`, corrigé
    ici, pas reporté côté backend).
- **Retiré** : `ion-modal`, `ion-fab` mégaphone, `ion-button`/`ion-icon`/`ion-spinner` (remplacés SVG
  inline + boutons natifs), emoji 🚌 et 📍, les 2 boutons flottants 48px haut-droite,
  `getSourceLabel()` (champ `tracking_mode` non affiché dans la version compacte).
- **Non touché (contrainte utilisateur)** : fix Cloudflare Leaflet (`filter:none` + background
  `#dbe6e4` sur `.leaflet-tile-container`/`.leaflet-container`), logique clavier, modal signalement.
- **Vérif réalisée** :
  - `npm run build` → succès après fix `flatMap` (lib cible ne le supportait pas en typecheck strict,
    remplacé par `[].concat(...)`), 48s, aucune erreur (2026-06-29).
  - `npx ng test --watch=false --browsers=ChromeHeadless` → **84/84 SUCCESS** (78 existants + 6
    nouveaux : arrêt polling sur `ionViewDidLeave`, arrêt polling sur `ngOnDestroy`, refetch 30s
    pendant que la vue reste active, fallback `badgeLabel`, overlay affiché une seule fois +
    réutilise la position déjà capturée, overlay non bloquant si `getNearby` échoue).
  - `npx cap sync android` → succès, 6 plugins Capacitor détectés, aucune erreur.
  - Preview locale (`ng serve`, viewport mobile 375×812, route `/tabs/carte`) : capture d'écran
    pixel (`preview_screenshot`) **a échoué par timeout à 3 reprises** (limite de l'outil dans cet
    environnement, pas un bug applicatif confirmé) — vérification de remplacement via
    `preview_snapshot` (arbre d'accessibilité) et `preview_inspect`/`getComputedStyle` :
    tab-bar visible et non masquée (`position:static`, y=756, hauteur 56 — **le bug structurel
    `ion-modal` masquant la tab-bar est résolu**), bouton « Je vois un bus ici » rendu avec fond
    orange (`rgb(255,107,53)`), hauteur 38px, `border-radius:14px`, bouton locate 38×38px en bas
    à droite, panneau bas à 116px de hauteur collapsed, tuiles OSM chargées (200 OK), état vide
    correct affiché en l'absence de bus (pas de backend accessible depuis ce sandbox réseau).

- **Revue post-livraison (2026-06-29, utilisateur + Gemini en exécution, Claude vérifie)** — 2
  corrections appliquées, vérifiées indépendamment par Claude (pas seulement le rapport reçu) :
  1. `makeBusIcon()` injectait `bus.ligne` brut dans le HTML du `L.divIcon` → ajout de
     `escapeHtml()` (`carte.page.ts:358-359,372,445-453`) avant injection. Durcissement défensif
     contre une donnée backend mal formée/contrôlée, pas une régression fonctionnelle constatée.
  2. Le template testait `activeBuses().length === 0` **avant** `error()` → en cas d'échec
     `/api/buses`, l'utilisateur voyait « Aucun bus actif » au lieu du vrai message d'erreur.
     Ordre des `@if/@else if` inversé (`carte.page.html:55-69`) : `error()` est maintenant
     prioritaire.
  - 2 tests ajoutés (`carte.page.spec.ts`) : `'should escape line numbers before injecting
    Leaflet marker HTML'`, `'should expose the API error as the priority bus-list state'`.
  - **Vérification Claude (indépendante, pas seulement le rapport utilisateur)** : lecture du code
    confirmant les deux fixes ; `npm run build` → succès (21.4s, aucune erreur) ; `npx ng test
    --watch=false --browsers=ChromeHeadless` → **86/86 SUCCESS** confirmé en ré-exécution directe.
  - **Vérification visuelle réelle effectuée par l'utilisateur** sur `http://127.0.0.1:4200/tabs/carte`
    (viewport iPhone XR) — résultat rapporté : carte affichée, CTA orange visible, panneau bas
    visible, tab-bar visible (non masquée), `ion-modal`/`ion-fab` = 0 occurrence, tuiles Leaflet
    chargées. **Ceci ferme le risque résiduel** noté précédemment (absence de capture pixel dans
    le sandbox de Claude) — la vérification visuelle réelle a été faite par l'utilisateur lui-même.
  - Serveur de preview arrêté après vérification (port 4200 libre).

### Étape 3 — Itinéraire ⬜

Investigation complète de `Dashboard/js/itin.js` (613 lignes) faite le 2026-06-29 — le plan ci-dessous
remplace la version sommaire précédente. Découpée en **deux sous-étapes** (pas de méga-diff) :

#### Étape 3a — Écran cœur (API seule, tap-to-edit, stepper, freq) ✅
- **Fichiers** : `itineraire.page.ts/.html/.scss` (réécriture complète), `itineraire.page.spec.ts`.
- **Retrait complet** : `ion-input`/`ion-toggle`/`ion-card`/`ion-button`/`ion-icon`/`ion-list`/`ion-item`
  + `addIcons`, `noTransfer`, le bouton « Calculer le trajet », `expandedRoutes` et les listes
  multi-routes (direct/walk/transfer/alt avec stop-list dépliable) — le dashboard n'affiche **que**
  `routes[0]` (la meilleure route), jamais la liste complète.
- **État (signals)** : `fromQuery`, `toQuery`, `activeField: 'from'|'to'|null`, `searchTab:
  'arrets'|'lignes'`, `searchResults`, `isSearching`, `pickInProgress` (garde anti-course blur/pick),
  `stepperState` (objet `{from, busMain, busSub, walk, duration}` dérivé de `routeResult`, calqué
  texte-pour-texte sur `_calcFromTo()` ligne 343-418 de `itin.js` pour chaque `status`).
- **Comportement à porter (1:1 avec `itin.js`)** :
  - clic sur la ligne from/to → devient `<input>` seulement si pas déjà active ; recherche si requête
    déjà ≥ 2 caractères.
  - saisie → debounce 280 ms → recherche.
  - blur → commit valeur si non vide ; fermeture du champ actif après 200 ms si aucun pick en cours.
  - pick d'un résultat (mousedown + touchend, `preventDefault` anti-course avec le blur) → si l'autre
    champ est vide, l'active automatiquement après 150 ms ; sinon calcule directement.
  - clic à l'extérieur de `.itin-fields-card`/`#itin-search-results-wrap` → ferme le champ actif.
  - swap → échange from/to, reset résultat + recherche.
  - **Destinations fréquentes** (Sandaga→Plateau, Liberté 5→Colobane, Yoff→Médina, en dur) → remplit
    les deux champs et calcule immédiatement. Masqué dès que from ou to est non vide.
  - bouton « Modifier le trajet » (carte résultat) → réinitialise tout.
- **Recherche** : `/api/stops/search` uniquement à ce stade (3b ajoute l'enrichissement local).
- **Sécurité** : binding Angular `{{ }}` standard (échappement automatique) — pas d'injection HTML
  brute comme dans `carte.page.ts` (Leaflet `divIcon`), donc pas d'`escapeHtml()` nécessaire ici.
- **Vérif** : `npm run build` + `npx ng test` + visuel + `getRoute()` affiche un résultat dans la
  carte stepper pour chaque statut (`direct`, `walk_direct`, `transfer`, `not_found`, `stop_not_found`,
  `same_stop`, `error`).

#### Étape 3b — Enrichissement index local + onglet « Lignes » ✅
- **Fichiers** : `itineraire.page.ts`, nouveaux assets `src/assets/data/xetu_mvp.json` +
  `src/assets/data/secteurs_dakar.json` (copiés depuis `Dashboard/data/`, **pas** la variante
  `.travel_times.preview.json` — code mort, cf. mémoire `project_tracking_direction`).
- **Port direct depuis `itin.js`** : `_loadStopsLocal` (chemin asset unique Angular, pas besoin du
  fallback 3 chemins du dashboard), `_mergeZonesLocal`, `_addZone`, `_searchStopsLocal`,
  `_searchLignesLocal`, `_localToApiFormat`, `_mergeDisplayStops`, `FALLBACK_ZONES`. `_getRecentLines`
  adapté pour lire `storeService.activeBuses()` (équivalent mobile de `window._xetuStore`).
- **Flux** : au tap sur un champ, charge l'index local une seule fois (cache module, comme
  `_stopIndex` dashboard) ; chaque recherche appelle `/api/stops/search` **et** l'index local en
  parallèle, fusionne via `_mergeDisplayStops` (déduplication par nom normalisé, API prioritaire).
- **Onglet Lignes** : actif par défaut = « Lieux » ; bascule auto si la requête matche un motif
  numéro de ligne (`^\d{1,3}[A-Za-z]?$`) **et** que l'index local a un résultat pour ce numéro ;
  sinon bascule manuelle (clic sur l'onglet). Clic sur une carte ligne → **ne calcule pas de trajet**,
  réinjecte le numéro comme requête de recherche côté « Lieux » (comportement identique au dashboard,
  même s'il est de portée limitée — ported as-is, pas de réinvention).
- **Vérif** : build + visuel + recherche d'un quartier non couvert par l'API (ex. zone de
  `FALLBACK_ZONES`) renvoie un résultat ; recherche d'un numéro de ligne bascule sur l'onglet Lignes.

### Étape 4 — Chat ✅
- **Fichiers** : `chat.page.ts/.html/.scss` (réécriture complète), `chat.page.spec.ts`, `store.service.ts`
  (retrait `chatSuggestions`), `ws.service.ts` (no-op explicite du cas `'welcome'`, sans rendu
  `welcome.suggestions`).
- **Décision produit actée en cours d'étape (utilisateur, 2026-06-29)** : retrait complet des
  suggestions côté mobile. Citation : « Le dashboard ne les affiche plus. Le mobile doit rester
  fidèle au dashboard actuel. Ne pas recréer une fonctionnalité invisible côté référence. »
  Confirmé par lecture directe de `Dashboard/js/chat.js` : `setSuggestions()` cible `#chat-chips`,
  élément absent du DOM réel du dashboard ; même le CSS legacy `.chat-suggestion-chip` ne correspond
  pas à la classe générée par le JS (`chat-chip`) — suggestions catégoriquement mortes côté
  référence, pas un cas limite.
  - Retiré : `chatSuggestions` (signal, `store.service.ts`), le rendu de `welcome.suggestions`,
    `onSuggestionClick()` et
    son exposition (`chat.page.ts`), tout markup/style chips (`chat.page.html/.scss`).
  - Conservé côté protocole : `case 'welcome'` dans `ws.service.ts`, désormais no-op explicite pour
    reconnaître le payload backend sans afficher de suggestions.
  - Conservé : l'interface `WsWelcome` dans `models/models.ts` — documente un contrat backend réel
    (le backend peut continuer à envoyer `welcome.suggestions`), pas du code mort UI au sens de la
    décision utilisateur.
- **Structure portée (markup `#screen-chat`)** : `.chat-header` (avatar bot SVG approximé — pas de
  pixel-tracing du Lucide CDN du dashboard, disclosed comme approximation fidèle, pas un tracé exact)
  + `.chat-status-dot` + `.chat-header-info` (nom statique « Xëtu IA », libellé dynamique
  `statusLabel()`) ; **pas de bouton retour** — Chat est un onglet pair (`ion-tabs`), pas un écran de
  pile de navigation, contrairement au dashboard où `#screen-chat` est accessible par navigation ;
  `.chat-messages-wrap` (bulle de bienvenue permanente + `@for` messages + indicateur typing 3 dots +
  pill de statut) ; `.chat-composer` (textarea native auto-resize 46–96px + bouton rond avion SVG
  identique §3.2).
- **Bug de cascade CSS du dashboard porté fidèlement (pas « corrigé »)** : archéologie de
  `components.css` — une règle `.chat-avatar .chat-status-dot` déclarée *après* les règles
  `.chat-status-dot.status--open/--connecting/--closed` (même spécificité) gagne systématiquement →
  le point et le libellé de statut sont **toujours verts** dans le dashboard réel, seul le **texte**
  du libellé varie (`chat.js: setStatus()`). Porté en CSS statique (`--green` fixe sur
  `.chat-status-dot` et `.chat-header-status`) plutôt que de réintroduire la logique de couleur
  dynamique « voulue mais neutralisée » — cohérent avec la consigne de fidélité au dashboard actuel.
- **Comportements ajoutés au-delà du périmètre initial de l'étape (scope ajouté, pas caché)** : 2
  nouveaux producteurs côté client du `chatStatus` déjà câblé (signal existant, pas de nouvelle
  architecture), calqués sur `_doSend()` de `chat.js` :
  - tentative d'envoi alors que `wsStatus() !== 'open'` → pill « Connexion au chat en cours... » au
    lieu d'un no-op silencieux ;
  - `sendChat()` renvoie `false` malgré un statut affiché « open » → texte restauré dans le composer
    + pill « Connexion instable. Réessaie dans un instant. ».
- **Réutilisation CSS globale** : `@keyframes pulse/slideUp/fadeIn` réutilisées depuis `xetu.scss`
  (chargé globalement via `global.scss`) sans redéfinition locale ; `@keyframes typingBounce` ajoutée
  localement (translateY, pas d'équivalent global avec ce timing).
- **Vérif réalisée** :
  - `npm run build` → succès, 11.52s, aucune erreur/warning (chunk lazy `chat-page` 9.92 kB brut /
    3.20 kB transfert).
  - `npx ng test --watch=false --browsers=ChromeHeadless --progress=false` → **97/97 SUCCESS** avant
    supervision Codex, puis **99/99 SUCCESS** après ajout des tests `WsService` sur l'envoi réussi /
    échoué.
  - Visuel preview locale (`ng serve`, port 4200) : **incident d'infrastructure rencontré et
    résolu** — un processus `ng serve` orphelin d'un segment de conversation antérieur (avant
    compaction du contexte) restait bloqué sur le port 4200, empêchant le nouveau serveur de preview
    de s'y attacher correctement (la réassignation automatique `autoPort` vers un port externe non
    joignable en était la conséquence, pas la cause). Diagnostiqué via `netstat`/`curl` (port interne
    4200 répondait, port externe proxié non joignable), résolu en terminant le processus orphelin
    (`taskkill`, confirmé sans rapport avec le travail de l'utilisateur — artefact de mon propre
    `preview_start` antérieur) puis en redémarrant proprement.
  - Résultat visuel confirmé : header (avatar + point vert + « Xëtu IA » + libellé « Non connecté »
    coloré vert), bulle de bienvenue permanente, composer avec bouton avion orange, **aucune
    suggestion/chip visible**, Chat bien positionné comme onglet pair dans la tab-bar (pas de bouton
    retour). Test d'interaction : saisie + envoi avec `wsStatus` non « open » (pas de backend dans ce
    sandbox) → pill « Connexion au chat en cours... » affichée, texte du composer conservé,
    `sendChat` non appelé — comportement conforme au code.
  - **Non vérifié visuellement** (gap de couverture signalé, pas caché) : alignement réel bulle
    utilisateur (droite, orange) / bulle bot (gauche) avec un vrai aller-retour serveur — aucun
    backend joignable depuis ce sandbox de preview. Couvert uniquement par test unitaire
    (`'should render message bubbles from StoreService after the welcome bubble'`, passant), pas par
    capture visuelle.
  - Serveur de preview arrêté après vérification (port 4200 libre).
- **Risques résiduels (6 fichiers touchés)** : `WsWelcome` reste défini mais n'est plus consommé que
  pour le typage du payload WS (pas de runtime qui le lit) — sans impact si le backend retire ce
  champ un jour ; le SVG de l'avatar bot est une approximation dessinée à la main, pas un tracé pixel
  du Lucide CDN du dashboard — écart visuel mineur possible si comparé côte à côte ; le comportement
  always-green du point/libellé de statut est un bug de cascade CSS du dashboard porté tel quel — si
  le dashboard est corrigé un jour côté référence, cet écart réapparaîtra côté mobile (à
  re-synchroniser à ce moment-là).

### Étape 5 — Mes lignes ✅
- **Fichiers** : `mes-lignes.page.html/.scss/.ts`, `subscribe-modal.component.*`,
  `signalement-modal.component.ts` (hook score), specs associés.
- **Cible (markup `#screen-mylines`)** : `.mylines-section-title` « Mes abonnements » (gauche) + `.mylines-hint`,
  `#subscriptions-list`, `.btn-subscribe` « + S'abonner à une ligne » (outline), `.mylines-divider`,
  section « Mon score » + `.score-card` (§3.6).
- **9 décisions tranchées par l'utilisateur (2026-06-29)**, à appliquer dans ce diff :
  1. **Chrome écran** : retrait `ion-header`/`ion-toolbar`. Écran hand-rolled, titre inline, pas de
     header Ionic — aligné sur `#screen-mylines` qui n'en a aucun.
  2. **Bouton mégaphone retiré** du header Mes lignes (absent du dashboard). Le signalement reste
     porté par Carte / flux dédié.
  3. **Score — hook global** : incrément accroché dans `signalement-modal.component.ts` (pas dans
     `mes-lignes.page.ts`), pour compter un report qu'il soit déclenché depuis Carte ou Mes lignes.
     Règle exacte : **+1 uniquement si `status === 'recorded'`** (jamais sur `already_recorded`,
     jamais +5). Isolé dans un petit service score/localStorage pour éviter la duplication.
  4. **Bug de données corrigé (obligatoire)** : `LIGNE_NAMES` du modal d'abonnement listait 14 lignes
     fictives (1-12, 218, 219) avec de faux noms. Remplacé par le réseau MVP réel —
     `1, 4, 6, 7, 8, 9, 10, 13, 23, 232` — dérivé de `xetu_mvp.json` (même source que
     `apiService.getLocalStopsIndex()` utilisée par `itineraire.page.ts`, même liste que
     `signalement-modal.component.ts.mvpLines`). Tests qui référencent encore 218/219 mis à jour.
  5. **Modal d'abonnement** : aligné sur le dashboard — grille compacte de numéros (`.subscribe-chip`,
     4 colonnes, toggle au tap, fond orange si abonné). Pas de longue liste descriptive façon
     `ion-list`/`ion-item`. La recherche interne peut matcher numéro + nom, mais l'UI principale reste
     la grille compacte.
  6. **CTA persistant** : `+ S'abonner à une ligne` affiché en permanence sous la liste (vide ou non
     vide). Plus de `ion-fab` Ionic pour cette action.
  7. **État vide** : icône cloche fidèle dashboard (CSS/SVG, bordures — pas d'emoji 🔔).
  8. **Push** : rien ajouté dans cette étape. S5 mémorise l'abonnement ; S9 gérera les vraies
     notifications natives plus tard (bloqué côté backend, voir `PRD.md` §7.1/§S9).
  9. **Stats score** : bloc visible reproduit (signalements / cette semaine / classement), mais
     `week`/`rank` affichés en `—` comme la référence — pas de calcul inventé puisque le dashboard ne
     les remplit jamais non plus.
- **Vérif** : build + tests + visuel preview `/tabs/mes-lignes` + abonnement/désabonnement avec les
  lignes MVP réelles + score +1 uniquement après un report `recorded` (pas `already_recorded`).

### Étape 6 — Signalement ⬜
- **Fichiers** : `signalement-modal.component.html/.scss/.ts`.
- **Cible (markup `#screen-signal`)** : wizard 3 étapes (topbar + `sg-progress` Ligne/Arrêt/Envoi),
  step 1 `#ligne-grid`, step 2 mini-map + arrêts proches + saisie manuelle, step 3 récap + mode
  (`sg-mode-option` avec `xetu-icon--seen/--rider`) + tags qualité (`quality-icon--*`) + envoi,
  écran succès (`sg-success-circle` check + carte points).
- **Retrait** : emojis 🚌📍🔍👁️.
- **Décision** : l'actuel est un modal simple ; le porter en wizard 3 étapes = gros morceau.
  **À trancher** : fidélité wizard complet vs version condensée mobile (recommander à l'étape).
- **Vérif** : build + visuel + `reportBus()` → écran succès (+ score §5).

### Étape 7 — Header `live` + menu ⏸️ *(optionnel / fin)*
- `.live-indicator` + `.btn-menu` (hamburger) → overlay menu (Telegram, WhatsApp, Thème, Avis,
  Partager, CGU, Contact, QR). Liens externes : `t.me/XetuBot`, `wa.me/...`, `instagram.com/...`.
- **À valider avec l'utilisateur** avant de l'inclure (ajout conséquent, liens externes).

---

## 5. Décisions d'architecture

- **D1 — Panneau bas Carte** : **Option A** (porter le panneau hand-rolled `.home-bottom` comme enfant
  de `ion-content`) retenue sauf objection. Supprime la classe de bug `ion-modal` masque tab-bar.
  Option B (garder `ion-modal` restylé) rejetée : lutte permanente contre le shadow DOM, rendu jamais 1:1.
- **D2 — CSS partagé** : un partiel `src/theme/_dashboard.scss` importé globalement, + CSS spécifique
  par page dans chaque `*.page.scss`. Évite la duplication des primitives.
- **D3 — Incrément score** : dashboard affiche « +5 » mais `incrementScore()` fait `+1`, cohérent
  avec « nombre de fois que tu as aidé ». **Confirmé.** Précision (2026-06-29) : l'incrément ne se
  déclenche que si la réponse backend a `status === 'recorded'` (jamais sur `already_recorded`,
  `Dashboard/js/signal.js:980-984`).
- **D4 — Wizard signalement** : fidélité complète 3 étapes vs condensé mobile. **À trancher en Étape 6.**
- **D8 — Source des lignes connues (Étape 5)** : `subscribe-modal.component.ts` avait son propre
  `LIGNE_NAMES` codé en dur, désynchronisé du réseau MVP réel (14 lignes fictives vs 10 réelles).
  **Remplacé par la source canonique déjà embarquée** (`xetu_mvp.json` via
  `apiService.getLocalStopsIndex()`), la même que `itineraire.page.ts` et que
  `signalement-modal.component.ts.mvpLines`. Pas un choix de style : c'était une donnée fausse
  exposée à l'utilisateur (lignes inexistantes proposées à l'abonnement, mauvais noms sur les lignes
  qui existent). **Confirmé (utilisateur, 2026-06-29).**
- **D9 — Emplacement du hook score (Étape 5)** : le signalement s'ouvre depuis Carte *et* Mes lignes ;
  ni l'un ni l'autre ne lisait le résultat du modal avant cette étape. Hook posé dans
  `signalement-modal.component.ts` (au moment du dismiss, sur `status === 'recorded'`) plutôt que
  dans chaque page appelante, pour que le score progresse quel que soit l'écran d'origine du report
  — cohérent avec le comportement découplé du dashboard (`store.set('userScore', ...)` global,
  indépendant de l'écran). **Confirmé (utilisateur, 2026-06-29).**
- **D5 — Index local stops (Étape 3)** : **répliqué**, mais en fallback/enrichissement, jamais en
  remplacement. Ordre : `/api/stops/search` d'abord, puis fusion avec l'index local
  (`xetu_mvp.json` + `secteurs_dakar.json` + `FALLBACK_ZONES`) pour les quartiers/hubs/zones que
  l'API ne connaît pas. Coût ~1 Mo embarqué jugé acceptable par l'utilisateur — objectif produit :
  Itinéraire doit retrouver quartiers/hubs/zones comme le dashboard, pas seulement les arrêts API.
  **Confirmé (utilisateur, 2026-06-29).**
- **D6 — Onglet « Lignes » (Étape 3)** : **conservé**, mais secondaire. Onglet « Lieux » actif par
  défaut ; bascule auto vers « Lignes » si la requête ressemble à un numéro/nom de ligne, ou bascule
  manuelle par l'utilisateur. Un tap sur une carte ligne **ne calcule pas de trajet** — il aide
  seulement la recherche/sélection (le backend ne supporte pas de calcul par ligne). **Confirmé.**
- **D7 — UX champs from/to (Étape 3)** : **tap-to-edit** fidèle au dashboard (ligne cliquable au
  repos → `<input>` seulement pendant l'édition → validation au blur/sélection → fermeture au clic
  extérieur). Implémenté en `@HostListener` document-level scoping strict à `.itin-fields-card` /
  `#itin-search-results-wrap`, **sans toucher** à la logique clavier Capacitor/Tabs existante
  (`html.keyboard-open`, mémoire `project_ios_pwa_bottom_gap`). **Confirmé.**

---

## 6. Vérifications (AGENTS.md)

- `npm run build` (compilation Angular) — à chaque étape.
- `npx ng test --watch=false --browsers=ChromeHeadless` — si logique modifiée (score, mapping bus).
- Contrôle visuel via Chrome : comparaison côte à côte avec `xetudashbord.pages.dev`.
- Rapport fidèle : si une vérif n'est pas lancée, le dire. Jamais « fait » sans output.

---

## 7. Journal (rempli au fur et à mesure)

| Date | Étape | Action | Vérif / résultat |
|------|-------|--------|------------------|
| 2026-06-29 | — | Investigation complète (dashboard + mobile, 4 écrans) + rédaction de ce plan | Référence figée §3 |
| 2026-06-29 | 0 | Ajout tokens `--font-*`/layout/z-index (`variables.scss`) + `.xetu-icon--seen/--rider/--signal-*`, `.xetu-pulse`/`@keyframes xetuPulse` (`xetu.scss`) | `npm run build` succès (9.5s), aucune régression |
| 2026-06-29 | 1 | `tabs.page.html/.scss/.ts` : 4 `<ion-icon>` → 4 SVG inline fidèles dashboard, retrait `addIcons`/`IonIcon` | `npm run build` succès (10.8s) + visuel preview locale (mes-lignes/itinéraire/chat OK, carte : tab-bar masquée par bug pré-existant `ion-modal`, hors scope) |
| 2026-06-29 | 2 | GO utilisateur avec 5 contraintes explicites (polling double-garde, badge objet/fallback, overlay non bloquant, bus-card réduite sans champs inventés, ne pas toucher Cloudflare/clavier/signalement) | Contraintes reproduites intégralement en §1 et respectées dans le diff |
| 2026-06-29 | 2 | Réécriture complète `carte.page.ts/.html/.scss` : panneau hand-rolled (plus de `ion-modal`), marker pastille numéro+fraîcheur, polling 30s à double `clearInterval`, overlay « Position détectée » non bloquant une fois/session, `badgeLabel()` défensif, `store.service.ts` leaderboard retypé | `npm run build` succès (48s, après fix `flatMap`→`[].concat`) ; `npx ng test` 84/84 SUCCESS (78 existants + 6 nouveaux ciblant les contraintes) ; `npx cap sync android` succès |
| 2026-06-29 | 2 | Supervision Codex post-diff : échappement HTML du numéro de ligne avant injection `L.divIcon` + priorité de l'état erreur `/api/buses` sur l'état vide | `npm.cmd run build` succès ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → 86/86 SUCCESS (2 tests ajoutés) |
| 2026-06-29 | 2 | Vérification visuelle preview locale (`/tabs/carte`) | `preview_screenshot` a échoué (timeout outil, 3 tentatives) — vérifié à la place via `preview_snapshot`/`preview_inspect`/`getComputedStyle` : tab-bar non masquée, CTA/locate/panel-grabber rendus avec les bons styles, tuiles OSM chargées. **Pas de capture pixel obtenue** — limitation signalée, pas dissimulée |
| 2026-06-29 | 2 | Revue post-livraison : échappement `bus.ligne` dans `makeBusIcon()` (XSS defense-in-depth) + priorité `error()` avant l'état vide « Aucun bus actif » dans le template, 2 tests ajoutés | `npm run build` succès (21.4s) ; `npx ng test` **86/86 SUCCESS** (ré-exécuté indépendamment par Claude, pas seulement rapporté) ; vérification visuelle réelle faite par l'utilisateur sur `127.0.0.1:4200/tabs/carte` (iPhone XR) : carte + CTA + panneau + tab-bar visibles, `ion-modal`/`ion-fab` = 0, tuiles chargées — **ferme le risque résiduel** (capture pixel) noté à la livraison initiale |
| 2026-06-29 | 3 | Investigation `Dashboard/js/itin.js` (613 lignes) — 3 écarts structurels non anticipés par le plan sommaire initial : index local stops (xetu_mvp.json+secteurs_dakar.json+FALLBACK_ZONES), onglet Lignes, UX tap-to-edit. Design présenté à l'utilisateur (2 alternatives par point, recommandation API-seule par coût) | Décision utilisateur : **les 3 répliqués** (D5/D6/D7 §5), avec contraintes : index local en fallback jamais en remplacement, onglet Lignes secondaire sans calcul trajet par ligne, tap-to-edit sans toucher au clavier Capacitor/Tabs. Plan détaillé réécrit en §4 Étape 3 (sous-étapes 3a/3b) |
| 2026-06-29 | 3a | Réécriture complète `itineraire.page.ts/.html/.scss` + `itineraire.page.spec.ts` : retrait `ion-input`/`ion-toggle`/`ion-card`/`ion-button`/`ion-icon`/`ion-list`/`ion-item`/`addIcons`/`noTransfer`/liste multi-routes ; tap-to-edit (debounce 280ms, garde blur/pick 200ms/150ms, dismiss au clic extérieur), carte résultat stepper sur `routes[0]` uniquement (calqué texte-pour-texte sur `_calcFromTo()` de `itin.js`), 3 Destinations fréquentes en dur, icônes SVG pures (pas d'emoji) | `npm run build` succès (17.07s, 0 warning après fusion des doublons CSS `.itin-line-badge-*`/`.itin-btn-*` qui dépassaient le budget 8kb de `anyComponentStyle`) ; `npx ng test --watch=false --browsers=ChromeHeadless` → **93/93 SUCCESS** ; visuel preview locale (`preview_start` port 4200, mobile 375×812) : tap-to-edit OK, recherche débouncée + état vide CSS-only OK, freq shortcuts OK (masqués si champ rempli), sélection freq → carte stepper rendue (branche erreur réseau testée car pas de backend dans ce sandbox preview), « Modifier le trajet » réinitialise tout |
| 2026-06-29 | 3a | Revue post-implémentation : icônes `.itin-step-icon--bus` et `.itin-freq-icon` utilisaient par erreur le glyphe « œil » (copié de `carte.page.html` « Je vois un bus ici ») au lieu du bus réel et de la carte pliée du dashboard ; `.itin-step-icon--origin` n'avait pas le `stroke-width`/rayon exacts | Comparé ligne à ligne avec `Dashboard/index.html:566-576,616-620` et corrigé (3 SVG remplacés à l'identique) ; `npm run build` rejoué après fix → succès, aucun warning |
| 2026-06-29 | 3a | Supervision Codex post-diff : le flux RxJS de recherche mourait après une erreur `/api/stops/search` ; le tap-to-edit ne garantissait pas le focus clavier au premier tap | `catchError` ajouté dans le `switchMap` pour garder la recherche vivante + focus/select programmatique de l'input rendu (`data-field`) ; 2 tests ajoutés ; `npm.cmd run build` succès ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → **95/95 SUCCESS** ; preview local `/tabs/itineraire` : premier tap sur « Vous êtes où ? » → `document.activeElement` = `INPUT.itin-field-input[data-field="from"]` |
| 2026-06-29 | 3b | Port de `_loadStopsLocal`/`_mergeZonesLocal`/`_addZone`/`_searchStopsLocal`/`_searchLignesLocal`/`_localToApiFormat`/`_mergeDisplayStops`/`FALLBACK_ZONES` (`itineraire.page.ts`) : cache module-level (`localIndexPromise`, équivalent `_stopIndex` dashboard), `getLocalStopsIndex()`/`getLocalSecteurs()` ajoutées à `api.service.ts` (lecture `assets/data/*.json`), pipeline de recherche existant étendu en `forkJoin({api, local})` ; onglet Lignes (`searchTab`, `setSearchTab`, `selectLigne`) avec garde `pickInProgress` (250ms, > 200ms du timer de blur) pour empêcher la fermeture du panneau au tap d'une carte ligne ; markup : tabs Lieux/Lignes, légende 3 items (signalé/normal/zone), badge zone, icônes SVG exactes des boutons Partir d'ici/Vers ici | `npm run build` → succès (32.8s), 1 **warning** budget CSS (`itineraire.page.scss` 9.51 kB / seuil avertissement 8 kB, sous le seuil d'erreur 10 kB) ; `npm test -- --watch=false --browsers=ChromeHeadless --progress=false` → **95/95 SUCCESS** (1 assertion d'un test existant corrigée : l'index local/FALLBACK_ZONES reste désormais disponible même si l'API échoue — comportement de résilience voulu, pas une régression) ; aucun nouveau test dédié écrit pour le merge local/onglet Lignes/badge zone (gap de couverture signalé, pas caché) |
| 2026-06-29 | 3b | Vérification visuelle preview locale (`ng serve`, port 4200 — l'auto-assignation `autoPort` de l'outil preview a pointé vers un port 60547 injoignable, contournée en naviguant directement vers `localhost:4200`) | Recherche "Ouakam" → onglets "Lieux (11)"/"Lignes (1)" rendus, légende 3 items, carte zone "Ouakam / Mamelles" avec badge "Hub transport · Ouakam" (provenant de `secteurs_dakar.json`) ; bascule manuelle vers l'onglet Lignes → carte "13 / Ligne 13 / Gare DIEUPPEUL - Gare PALAIS 2" ; tap sur la carte ligne 13 → réinjecte "13" dans le champ, repasse sur l'onglet Lieux, champ reste focus, **aucun calcul de trajet déclenché** (`selectLigne`/`pickInProgress` confirmés fonctionnels) ; pour un numéro à 1 chiffre ("7"), le panneau de résultats disparaît après sélection — **confirmé fidèle au dashboard** (`itin.js:474`, `_renderResults` masque tout résultat si `q.length<2`, donc même comportement source) ; `preview_network` a confirmé que `/api/stops/search` échoue (`ERR_FAILED`, backend Railway injoignable depuis ce sandbox) — **tous les résultats observés viennent donc exclusivement de l'index local** (`xetu_mvp.json`/`secteurs_dakar.json` chargés en 200 OK), validant le chemin de résilience mais sans avoir pu observer visuellement le merge API+local avec une vraie réponse API (seulement couvert par les tests automatisés avec API mockée) ; `preview_console_logs` : aucune erreur liée au code 3b (uniquement les warnings pré-existants de session/WebSocket, hors scope) ; `preview_screenshot` a échoué par timeout (2 tentatives) — pas de capture pixel obtenue, vérifié à la place via `preview_snapshot`/`preview_eval` |
| 2026-06-29 | 3b | Supervision Codex post-diff : le cache local `localIndexPromise` global pouvait contaminer les tests entre instances de `ApiService`, le gap de couverture 3b était réel, et le warning budget CSS restait évitable | Cache remplacé par `WeakMap<ApiService, Promise<LocalIndex>>` (cache par instance, pas global dur) ; 3 tests ajoutés : priorité API sur doublon local, fallback hub/zone depuis `secteurs_dakar.json`, onglet Lignes + `selectLigne()` sans appel `getRoute()` ; bloc CSS stepper résultat déplacé vers `src/theme/xetu.scss` comme primitive partagée pour supprimer le warning `anyComponentStyle` ; `npm.cmd run build` → succès sans warning ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → **98/98 SUCCESS** |
| 2026-06-29 | 4 | Investigation `Dashboard/js/chat.js` + `components.css` : suggestions (`setSuggestions()`/`#chat-chips`) confirmées mortes côté dashboard (élément cible absent du DOM réel, classe générée ne correspond même pas au CSS legacy) ; cascade CSS du point/libellé de statut résolue par archéologie de spécificité/ordre de déclaration — toujours vert dans le rendu réel, seul le texte du libellé varie | Décision utilisateur, citée intégralement dans §4 Étape 4 : retrait complet des suggestions côté mobile, fidélité au dashboard actuel plutôt que recréation d'une fonctionnalité invisible côté référence |
| 2026-06-29 | 4 | Réécriture complète `chat.page.ts/.html/.scss` + `chat.page.spec.ts` ; retrait `chatSuggestions` (`store.service.ts`) et retrait du rendu `welcome.suggestions` ; ajout de 2 comportements pill (`wsStatus!=='open'` → « Connexion au chat en cours... », `sendChat()` échoue → texte restauré + « Connexion instable... ») réutilisant le signal `chatStatus` déjà câblé | `npm run build` → succès (11.52s, 0 warning) ; `npx ng test --watch=false --browsers=ChromeHeadless --progress=false` → **97/97 SUCCESS** |
| 2026-06-29 | 4 | Vérification visuelle preview locale (`/tabs/chat`) — incident : processus `ng serve` orphelin d'un segment de conversation antérieur bloquait le port 4200, causant une réassignation `autoPort` vers un port externe injoignable (diagnostiqué via `netstat`/`curl`, résolu par `taskkill` du processus orphelin + redémarrage propre) | Header (avatar + point vert + « Xëtu IA » + libellé « Non connecté » vert), bulle de bienvenue permanente, composer + bouton avion orange, **aucune suggestion/chip visible**, Chat positionné comme onglet pair sans bouton retour — tous confirmés par `preview_snapshot` + `preview_screenshot` ; test d'interaction : envoi avec `wsStatus` non « open » → pill « Connexion au chat en cours... » affichée, `sendChat` non appelé, texte conservé. **Non vérifié visuellement** : alignement bulle user/bot avec un vrai aller-retour serveur (pas de backend joignable depuis ce sandbox) — couvert uniquement par test unitaire, gap signalé pas caché |
| 2026-06-29 | 4 | Supervision Codex post-diff : bug trouvé dans le chemin `sendChat()` instable — `WsService.sendChat()` ajoutait la bulle utilisateur avant de savoir si `WebSocket.send` réussissait ; `welcome` sans rendu UI devait rester un type de protocole reconnu plutôt que tomber en message inconnu | `sendChat()` ajoute désormais le message utilisateur uniquement après envoi WS réussi ; `case 'welcome'` conservé en no-op explicite (aucune suggestion affichée) ; 2 tests `WsService` ajoutés pour verrouiller succès/échec d'envoi ; `npm.cmd run build` → succès sans warning ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → **99/99 SUCCESS** |
| 2026-06-29 | 5 | Investigation `Dashboard/js/mylines.js` (V2.6) + `#screen-mylines`/CSS + mobile `mes-lignes.page.*`/`subscribe-modal.component.*` actuels. Trouvailles : (1) score 100 % absent côté mobile (aucune trace `xetu_score`/`incrementScore` dans `src/`) ; (2) **bug de données réel** — `LIGNE_NAMES` du modal d'abonnement liste 14 lignes fictives (1-12, 218, 219) au lieu des 10 lignes MVP réelles (`1,4,6,7,8,9,10,13,23,232`), désynchronisé de `signalement-modal.component.ts.mvpLines` et de `xetu_mvp.json` ; (3) CSS morte côté dashboard à ne pas porter (ancien layout `.score-circle`/`.score-badge-row`, et `BADGES[].iconClass` jamais inséré dans le DOM réel) ; (4) incrément score gardé par `status==='recorded'`, jamais sur `already_recorded` (`signal.js:980-984`) ; (5) push hors scope, bloqué par `PRD.md` §S9. Design présenté avec 9 points à trancher (chrome, bouton mégaphone, emplacement du hook score, source des lignes, layout modal, CTA persistant, icône vide, push, stats score) | Décision utilisateur, citée intégralement en §4 Étape 5 et §5 D8-D9 : les 9 points tranchés — retrait chrome Ionic + bouton mégaphone, hook score dans `signalement-modal.component.ts` (pas par page), correction obligatoire de `LIGNE_NAMES` vers la source MVP réelle, modal en grille compacte, CTA persistant, icône cloche SVG, aucun ajout push, stats `week/rank` en `—` fidèles à la référence |
| 2026-06-29 | 5 | Implémentation Mes lignes : `ScoreService` ajouté (`localStorage xetu_score`, paliers dashboard), page Mes lignes hand-rolled sans `ion-header`/FAB, CTA persistant, état vide cloche CSS, score V2.6, modal abonnement en grille compacte, source lignes dérivée de `assets/data/xetu_mvp.json`, hook score dans `signalement-modal.component.ts` seulement sur `status === 'recorded'` | `npm.cmd run build` → succès sans warning ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → **107/107 SUCCESS** avant supervision Codex |
| 2026-06-29 | 5 | Supervision Codex post-diff : risque trouvé dans le modal — le chip gardait un état local `isSubscribed` alors que `subscribe()`/`unsubscribe()` peuvent rollback après erreur backend non retryable ; `ScoreService` n'avait pas de test direct | `subscribe()`/`unsubscribe()` retournent désormais `Promise<boolean>` ; `SubscribeModalComponent.toggleSubscription()` remet le chip dans son état précédent si le parent retourne `false` ; 1 test modal ajouté pour ce rollback + 3 tests `ScoreService` (init, incrément + persistance, paliers) ; `npm.cmd run build` → succès sans warning ; `npm.cmd test -- --watch=false --browsers=ChromeHeadless --progress=false` → **111/111 SUCCESS** |
| 2026-06-29 | 5 | Vérification visuelle légère via navigateur intégré sur `http://127.0.0.1:4200/tabs/mes-lignes` | Page rendue : « Mes abonnements », CTA « + S'abonner à une ligne », bloc « Mon score », aucun `ion-header`, aucun `ion-fab` ; modal abonnement ouvert : **10 chips** exactement `1,4,6,7,8,9,10,13,23,232`, `218/219` absents, bouton « Annuler » présent. Non testé visuellement : aller-retour backend réel de création/suppression d'abonnement ; couvert par tests unitaires/mocks, pas par serveur Railway live |
| 2026-06-29 | 6 | Implémentation Signalement : retrait des composants Ionic, wizard 3 étapes portées depuis dashboard (ligne, map légère, tags/mode), concaténation tags + texte dans l'observation, +1 sur recorded (pas already_recorded) | `npm.cmd run build` → succès ; `npm.cmd test` → **112/112 SUCCESS** |
| 2026-06-29 | 6 | Lot 1 - Cycle de vie de la Carte & Refresh post-signalement : conservation de Leaflet sur changement d'onglets (retrait de `destroyMap()`), `invalidateSize()` sur retour, et refresh `getBuses()` uniquement si `{ success: true, recorded: true }` sur dismiss de la modale. | `npm.cmd run build` → succès ; `npm.cmd test` → **116/116 SUCCESS** (tests de cycle de vie et de rafraîchissement ajoutés) |
| 2026-06-29 | 6 | Lot 2 - Résilience GPS & Arrêts Proches (Signalement) : intégration d'une vraie carte Leaflet légère et stable en étape 2, traitement GPS non-bloquant avec message d'avertissement fallback et bouton Suivant actif, recherche de ligne MVP dans l'étape 1. | `npm.cmd run build` → succès ; `npm.cmd test` → **116/116 SUCCESS** (tests mis à jour et passants) |
| 2026-06-29 | 2 | Lot 3 - Contrôles de la Carte & Panneau Draggable (P1.4, P1.5) : contrôles zoom +/- à gauche (sans animation pour réactivité), refresh/locate à droite (icône cible SVG corrigée), panneau bottom-sheet draggable par pointer events (souris + tactile) avec snaps Bas (~28% utile)/Milieu (50%)/Haut (85%) sans transition en cours de drag. | `npm.cmd run build` → succès ; `npm.cmd test` → **120/120 SUCCESS** (3 tests de zoom/drag ajoutés + garde anti double-action) |
| 2026-06-29 | 4 & 5 | Lot 4 - Ergonomie Itinéraire & Navigation Flottante (P1.6, P1.7) et Lot 5 - Ajustements Modal d'Abonnement & Header (P1.9, P1.10) : masquage des champs de recherche après calcul de l'itinéraire (avec conservation des saisies d'origine), tab-bar flottante en capsule avec safe-area haute/basse, header Dashboard global avec indicateur live clignotant et toggle transparent sur la carte, modal d'abonnement bornée à 50% de hauteur. | `npm.cmd run build` → succès ; `npm.cmd test` → **120/120 SUCCESS** (tests mis à jour et passants) |
<!-- Ajouter une ligne par diff livré. Ne jamais effacer l'historique. -->
