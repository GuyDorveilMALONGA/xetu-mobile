# Plan d'implémentation — Migration carte Leaflet → MapLibre GL JS (fond OpenFreeMap)

> Statut : **proposition, non implémentée**. Aucune ligne de code carte n'est modifiée tant que ce plan n'est pas validé.
> Cible : `xetu-mobile` (Ionic 8 / Angular 20 / Capacitor 8).
> Données réseau inchangées : `assets/data/xetu_mvp.json` (10 lignes, `geometry_aller`/`geometry_retour` au point près).

---

## 0. Encadré structurel (règle AGENTS.md « Before Each Diff »)

```
STRUCTURE TOUCHED      : couche rendu cartographique (moteur de tuiles + markers + tracés)
                         partagée par 2 composants : carte.page.ts et signalement-modal.component.ts
WHY THE STRUCTURE      : le moteur de carte (Leaflet) est importé indépendamment dans chaque
ALLOWS THIS PROBLEM      composant, avec URL de tuiles codée en dur dans chacun. Aucune abstraction
                         commune → un changement de moteur doit être répété et risque le « split-brain »
                         (deux moteurs embarqués si on n'en migre qu'un).
THIS DIFF FIXES        : structure (remplacement du moteur + suppression de Leaflet) — PAS un symptôme.
```

**Conséquence directe** : migrer **uniquement** `carte.page.ts` laisserait Leaflet (~140 KB) ET MapLibre (~800 KB) tous deux bundlés à cause du modal signalement. Le plan recommandé migre **les deux usages** puis **désinstalle Leaflet**. La variante « carte principale seulement » est documentée en §8 comme repli, avec son coût.

---

## 1. Périmètre réel (inventaire de l'existant)

### Fichiers qui touchent Leaflet
| Fichier | Usage Leaflet | Action |
|---|---|---|
| `src/app/features/carte/carte.page.ts` | `L.map`, `L.tileLayer` (OSM raster), `L.marker`+`L.divIcon` (user + bus), `L.polyline` + `L.circleMarker` (ligne active), `setView`, `fitBounds`, `invalidateSize`, `zoomIn/Out`, `hasLayer/removeLayer` | **Réécrire** |
| `src/app/features/signalement/signalement-modal.component.ts` | `L.map('map-signal')`, `L.tileLayer` (Carto Voyager raster), `L.divIcon` user marker, `setView`, `invalidateSize`, `remove` | **Réécrire** (mini-carte) |
| `src/global.scss:13` | `@import "leaflet/dist/leaflet.css";` | Remplacer par `maplibre-gl/dist/maplibre-gl.css` |
| `src/app/features/carte/carte.page.scss` | `::ng-deep .leaflet-tile-container`, `.leaflet-container`, `.user-location-marker`, `.xetu-bus-marker` | Adapter sélecteurs `.maplibregl-*` |
| `src/app/features/carte/carte.page.html` | classes `leaflet-control-zoom-*` sur boutons **custom** (cosmétiques, câblés à `zoomIn()/zoomOut()`, `zoomControl:false`) | Renommage optionnel (pas bloquant) |
| `package.json` | `leaflet ^1.9.4`, `@types/leaflet ^1.9.21` | Supprimer après migration des 2 composants |

### Données (inchangées)
- `src/app/core/services/api.service.ts:84` — `getLocalStopsIndex(): Observable<XetuMvpData>` → `assets/data/xetu_mvp.json`.
- Modèle `XetuMvpData` (`models.ts:216`) : `geometry_aller/retour: [number, number][]` en ordre **`[lon, lat]`**, `arrets/arrets_retour: {nom, lat, lon}[]`.
- **Point clé** : Leaflet impose `[lat, lon]` donc le code actuel **re-flippe** (`carte.page.ts:585`). MapLibre est nativement `[lon, lat]` → le flip **disparaît**.

---

## 2. Décisions de design (à figer avant code)

| # | Décision | Recommandation | Alternative |
|---|---|---|---|
| D1 | Périmètre | **Migrer carte + modal, retirer Leaflet** | Carte seule (§8, 2 moteurs bundlés) |
| D2 | Style de fond | OpenFreeMap **`liberty`** vector, libre/sans clé (`https://tiles.openfreemap.org/styles/liberty`) | Raster OSM via style raster MapLibre (plus lourd visuellement, pas de glyphes vectoriels) |
| D3 | Rendu tracé ligne active | **Source GeoJSON + couche `line` + couche `circle`** (1 source, perf, pas de flip) | Garder N markers individuels (anti-pattern MapLibre) |
| D4 | Rendu markers bus | **`maplibregl.Marker({element})`** avec HTML custom (réutilise `makeBusIcon` + `escapeHtml`) | Couche `symbol` (perdrait le pulse CSS et le markup actuel) |
| D5 | Tracé affiché à la sélection | **`geometry_aller` seul** (= comportement actuel, migration ISO-fonctionnelle) | aller+retour (changement produit → hors scope migration) |
| D6 | Testabilité WebGL | **Factory injectable** `MAP_FACTORY_TOKEN` (calque le pattern `GEOLOCATION_TOKEN` déjà en place) | Flag ChromeHeadless `--use-gl=swiftshader` (plus fragile en CI) |

> D5 est volontairement conservateur : ce plan est une **migration de moteur**, pas un changement de comportement. Passer à aller+retour partout sera un diff séparé si souhaité.

---

## 3. Correspondance API Leaflet → MapLibre (référence d'implémentation)

| Intention | Leaflet (actuel) | MapLibre (cible) |
|---|---|---|
| Créer la carte | `L.map('map',{...}).setView([lat,lon],z)` | `new maplibregl.Map({container:'map', style, center:[lon,lat], zoom:z})` |
| Attendre prêt | (synchrone) | `map.on('load', () => {...})` **obligatoire** avant `addSource/addLayer` |
| Fond de carte | `L.tileLayer(url).addTo(map)` | fourni par `style` (D2) |
| Recentrer | `map.setView([lat,lon],z,{animate:false})` | `map.jumpTo({center:[lon,lat], zoom:z})` |
| Ajuster aux bornes | `map.fitBounds(polyline.getBounds(),{padding:[40,40]})` | `map.fitBounds([[w,s],[e,n]], {padding:40, maxZoom:14})` (bornes en `[lon,lat]`) |
| Recalcul taille (drag panel) | `map.invalidateSize()` | `map.resize()` |
| Zoom +/- | `map.zoomIn(1)/zoomOut(1)` | `map.zoomIn()/zoomOut()` |
| Marker user | `L.marker([lat,lon],{icon:L.divIcon(...)})` | `new maplibregl.Marker({element}).setLngLat([lon,lat]).addTo(map)` |
| Déplacer marker | `marker.setLatLng([lat,lon])` | `marker.setLngLat([lon,lat])` |
| Retirer marker | `marker.remove()` | `marker.remove()` |
| Afficher/masquer (filtre) | `addTo(map)` / `map.removeLayer(marker)` | `marker.addTo(map)` / `marker.remove()` (Marker) |
| Tracé ligne | `L.polyline(coords).addTo(map)` | source GeoJSON `LineString` + `addLayer({type:'line'})` |
| Arrêts | `L.circleMarker([lat,lon])` ×N | même source, `addLayer({type:'circle'})` |
| Détruire | `map.remove()` | `map.remove()` |

---

## 4. Découpage en étapes (Work Loop AGENTS.md)

### Étape 1 — Dépendance & CSS
1. `npm install maplibre-gl` (+ types inclus dans le paquet, pas de `@types`).
2. `src/global.scss` : remplacer la ligne 13 `@import "leaflet/dist/leaflet.css"` par `@import "maplibre-gl/dist/maplibre-gl.css"`.
3. **Ne pas** encore retirer Leaflet (le modal l'utilise toujours).
- **Vérif** : `npm run build` compile.

### Étape 2 — Factory injectable (testabilité, D6)
1. Créer `src/app/core/services/map.factory.ts` : token `MAP_FACTORY_TOKEN` + impl par défaut `(opts) => new maplibregl.Map(opts)`.
2. Provider par défaut dans la config app ; les specs injecteront un faux (carte no-op) → pas de WebGL en CI.
- Calque exact du pattern `GEOLOCATION_TOKEN` (`carte.page.ts:7,76`).

### Étape 3 — `carte.page.ts` (cœur)
Réécrire, bloc par bloc, en conservant signaux/UX/panel drag intacts (seul le moteur change) :
1. `initMap()` : `Map({style:'…/liberty', center:[-17.4677,14.7167], zoom:13})` ; déplacer la logique post-init dans `map.on('load')`.
2. `fetchUserLocation()` → `updateUserMarker` via `maplibregl.Marker` (réutilise la div `.blue-dot`).
3. `updateBusMarkers()` : `maplibregl.Marker({element})` ; `element.innerHTML` = sortie de `makeBusIcon` (garder `escapeHtml`) ; clic via `element.addEventListener`.
4. `filterMarkers()` : `marker.addTo(map)` / `marker.remove()`.
5. `drawLineGeometry()` : construire un `FeatureCollection` (LineString `geometry_aller` **sans flip** + Points arrêts en `[lon,lat]`), `map.addSource('active-line', …)` + 2 couches ; `fitBounds` sur les bornes calculées.
6. `clearActiveLine()` : `removeLayer`+`removeSource` (gardés idempotents).
7. `zoomIn/Out`, `centerOnUser`, `togglePanel/onDragEnd` : `resize()` au lieu de `invalidateSize()`.
8. `destroyMap()` : `map.remove()`.
- **Vérif** : `npm run build` + rendu navigateur (cf. §6).

### Étape 4 — `carte.page.scss`
1. Remplacer `::ng-deep .leaflet-container` → `.maplibregl-canvas-container`/`.maplibregl-map` (fond `#dbe6e4`).
2. Conserver `.user-location-marker`/`.blue-dot`/`.xetu-bus-marker` (markers = DOM custom, classes inchangées).
3. Retirer la règle `.leaflet-tile-container { filter:none }` (sans objet en vectoriel).

### Étape 5 — `signalement-modal.component.ts` (mini-carte)
1. Même substitution : `Map({style:liberty, center:[-17.4677,14.7167], zoom:14})`.
2. `updateUserMarker` → `maplibregl.Marker`.
3. `destroyMap` → `map.remove()`.
- Garde le même token factory (testable).

### Étape 6 — Purge Leaflet
1. `npm uninstall leaflet @types/leaflet`.
2. `grep -ri leaflet src/` → ne doit rester que d'éventuels noms de classes CSS cosmétiques (boutons zoom) ; décider renommage `leaflet-control-zoom-*` → `map-zoom-*` (optionnel, HTML+SCSS).
- **Vérif** : `npm run build` (échoue si un import résiduel subsiste — filet de sécurité).

### Étape 7 — Tests
1. `carte.page.spec.ts` : fournir le faux `MAP_FACTORY_TOKEN` ; **re-cibler** le test « should escape line numbers before injecting Leaflet marker HTML » sur le nouveau constructeur de marker (la logique `escapeHtml` est conservée, le test reste valide en visant `makeBusIcon`/`element.innerHTML`).
2. `signalement-modal.component.spec.ts` : idem faux factory.
3. `npx ng test --watch=false --browsers=ChromeHeadless`.

---

## 5. Détail technique sensible — coordonnées (source d'erreur n°1)

- `xetu_mvp.json` : `geometry_*` = `[lon, lat]`, `arrets` = `{lat, lon}`.
- **Leaflet (avant)** : tout en `[lat, lon]` → flip explicite `([lon,lat])=>[lat,lon]` + `[stop.lat, stop.lon]`.
- **MapLibre (après)** : tout en `[lon, lat]` →
  - LineString : `geometry_aller` **tel quel** (plus de flip).
  - Arrêts : `[stop.lon, stop.lat]`.
  - `center`/`setLngLat`/bornes `fitBounds` : `[lon, lat]`.
- **Garde-fou** : un point mal flippé tombe dans l'océan Atlantique (lat≈-17) → immédiatement visible au rendu navigateur (§6).

---

## 6. Vérification (AGENTS.md — preuve obligatoire)

1. `npm run build` → compilation Angular OK (les warnings budget SCSS préexistants ne sont pas bloquants).
2. `npx ng test --watch=false --browsers=ChromeHeadless` → suites carte + signalement vertes.
3. Rendu réel (preview navigateur) :
   - fond OpenFreeMap visible, centré Dakar ;
   - filtre d'une ligne → tracé `aller` + arrêts s'affichent, `fitBounds` cadre la presqu'île ;
   - clic marker bus → sélection + tracé ; pulse/markers OK ;
   - drag du panneau → `resize()` sans tuiles grises.
4. `npx cap sync android` → assets web synchronisés (WebGL dispo en WebView moderne, cf. §7).

> Aucune affirmation « ça marche » sans l'output de 1–3 affiché.

---

## 7. Risques résiduels

| Risque | Impact | Mitigation |
|---|---|---|
| **WebGL en WebView Capacitor** | MapLibre exige WebGL ; échec = carte blanche sur device | Vérifier sur AVD réel via `cap sync` + run ; WebView Android/iOS récents supportent WebGL. Garder `try/catch` autour de `initMap`. |
| **WebGL en ChromeHeadless (CI)** | Tests qui instancient la carte plantent | D6 : factory faux en test, la vraie carte n'est jamais créée en unit test. |
| **Poids bundle** | maplibre-gl ≈ 800 KB (≈200 KB gzip) vs leaflet 140 KB | Compensé par la **purge Leaflet** (§Étape 6) ; net acceptable. Si carte-seule (§8), surcoût net assumé. |
| **Requêtes réseau 1er chargement** | vectoriel = style + glyphes (fonts pbf) + sprites depuis `tiles.openfreemap.org` | Même dépendance réseau que l'OSM raster actuel ; option future : self-host le style. Pas de régression offline (déjà online-only). |
| **Dépendance à un tiers gratuit** | OpenFreeMap = service communautaire sans SLA | Style/URL centralisés dans la factory → bascule triviale vers MapTiler (avec clé) ou self-host si besoin. |
| **Tracé aller uniquement** | inchangé vs aujourd'hui | Conscient (D5) ; aller+retour = diff produit séparé. |

---

## 8. Variante de repli — « carte principale seulement »

Si seule `carte.page.ts` doit migrer (modal laissé en Leaflet) :
- Sauter Étapes 5 et 6 (ni migration modal, ni `npm uninstall leaflet`).
- `global.scss` doit **importer les deux** CSS (leaflet + maplibre).
- **Coût** : deux moteurs cartographiques bundlés en permanence (~940 KB cumulés). C'est le « split-brain » signalé en §0 — accepté seulement comme étape transitoire, pas comme état cible.

---

## 9. Définition de « terminé »

- [ ] `npm run build` exécuté, output OK affiché.
- [ ] `npx ng test` exécuté, suites carte + signalement vertes.
- [ ] Rendu navigateur : tracés `xetu_mvp.json` identiques à l'actuel, fond OpenFreeMap.
- [ ] `npx cap sync android` OK ; carte vérifiée sur AVD (WebGL).
- [ ] `grep -ri leaflet src/` ne renvoie que des noms de classes cosmétiques (ou rien).
- [ ] Fichiers hors scope touchés : aucun (sinon listés).
- [ ] Risques résiduels §7 confirmés/levés.
```
