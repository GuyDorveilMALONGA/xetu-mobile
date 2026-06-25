# Bible Taches Xetu

Date : 2026-06-25  
Plan associe : `C:\Users\DELL\Desktop\xetu-mobile\docs\bible-plan.md`

Ce fichier est la checklist vivante. A chaque fois qu'une tache est realisee et verifiee, on coche ici.

## Preuves ajoutees le 2026-06-25

- Backend `whatsapp-agent` : `python -m pytest tests/test_signalement_mode.py tests/test_tracking_endpoint_mode.py tests/test_signalement_relance.py` -> `10 passed in 1.20s`.
- PWA `whatsapp-agent/Dashboard` : `node --check` sur les fichiers JS touches -> OK.
- PWA `whatsapp-agent/Dashboard` : grep emoji sur `Dashboard/js`, `Dashboard/css`, `Dashboard/index.html` -> aucun match.
- PWA `whatsapp-agent/Dashboard` : grep contrat -> `XetuNative.requestLocation`, `locationResult`, `mode` dans `/api/report` et mapping `/api/buses`.
- Backend `whatsapp-agent` projection/ETA : `python -m pytest tests/test_signalement_mode.py tests/test_tracking_endpoint_mode.py tests/test_signalement_relance.py tests/test_api_buses_trace_eta.py` -> `11 passed in 1.44s`; `/api/buses` expose `trace_progress` et `next_stops_eta`.
- Backend `whatsapp-agent` sens/aval/nuit (2026-06-25 18h13) : `python -m pytest tests/test_signalement_mode.py tests/test_tracking_endpoint_mode.py tests/test_signalement_relance.py tests/test_api_buses_trace_eta.py tests/test_direction_confidence.py tests/test_notify_aval.py tests/test_eta_night_window.py` -> `19 passed in 1.72s` (Doryx `cmd-001`, `overall=PASS`). `/api/buses` expose desormais `direction`, `direction_confidence` (`high`/`low` quand l'arret existe aller+retour, depart par projection GPS si position connue), et `eta_disabled_reason="service_reduit_nuit"` entre 20h et 5h UTC (Dakar=UTC+0). `notify_abonnes()` ne notifie plus les abonnes a arret precis deja depasses par le signalement (filtre aval).
- PWA relance a la demande (2026-06-25 20h21) : `node --check Dashboard\js\api.js`, `node --check Dashboard\js\home.js`, `node --check Dashboard\js\mobile.js` -> OK ; grep no-emoji sur `Dashboard/js`, `Dashboard/css`, `Dashboard/index.html` -> aucun match. Les cartes bus affichent `Signal recent` / `A confirmer` / `Signal ancien`, proposent `Demander position actuelle` uniquement pour un signal `dedans` vieillissant, appellent `POST /tracking/relance`, puis rafraichissent `/api/buses`.
- Backend `bus_state` foreground (2026-06-25 20h43) : `python -m pytest tests/test_tracking_sessions_bus_state.py tests/test_api_buses_trace_eta.py tests/test_tracking_endpoint_mode.py` -> `9 passed in 3.34s` (Doryx `cmd-001`, `overall=PASS`, strong). Ajout schemas SQL `tracking_sessions`, `tracking_pings`, `bus_state`, repository Supabase dans `db/queries.py`, endpoints `/tracking/session/start|ping|stop`, map-match sur trace Dem Dikk, refus off-trace, exposition `tracking_mode="live_gps"` dans `/api/buses` sans phone ni ping brut.
- PWA tracking foreground (2026-06-25 20h49) : `node --check Dashboard\js\signal.js` -> OK ; grep contrat -> `tracking/session/start`, `tracking/session/ping`, `tracking/session/stop`, `xetu_live_tracking` ; grep no-emoji sur `Dashboard/js`, `Dashboard/css`, `Dashboard/index.html` -> aucun match. Le mode `dedans` avec GPS demarre une session live foreground, envoie un ping immediat puis toutes les 15 secondes, et affiche `Arreter le partage`.
- PWA consentement live (2026-06-25 20h58, commit backend `aaaa63a`) : `node --check Dashboard\js\signal.js` -> OK ; grep contrat -> `live-consent`, `_liveConsentAccepted`, `tracking/session/start`, `consent:` ; grep no-emoji cible -> aucun match. Le mode `dedans` affiche une case explicite avant live GPS et ne lance pas `/tracking/session/start` si elle n'est pas cochee.
- Couche spatiale offline (2026-06-25 21h56, commit `2cde084`) : `python scripts\build-spatial-layer.py ...` -> `stops=768`, `deduped_candidates=6043`, `deduped_landmarks=166`, `landmarks_with_links=165`; `python scripts\resolve-spatial-query.py` passe sur `Liberte 6 -> Yoff`, `Police Dieuppeul -> Sandaga`, `ESTG -> destination`; assertion : tous les landmarks restent `needs_review`.
- Suite complete `python -m pytest tests/ -q` (whatsapp-agent) : `2 failed, 172 passed` — les 2 echecs (`test_react_loop.py::test_run_passes_empty_history_to_react_loop`, `test_tools_regression.py::TestReportBus::test_valid_line_and_stop_writes_post_signalement_session`) sont preexistants (verifies par `git stash` sur ce slice, memes echecs avant les changements), non lies a cette slice.

## 0. Gouvernance

- [x] Consolider le brainstorm tracking/carte dans `brainstorm-carte-tracking-streaming.md`.
- [x] Creer le plan spatial dans `spatial-layer-reperes-plan.md`.
- [x] Creer le plan maitre dans `xetu-master-delivery-plan.md`.
- [x] Creer la sequence risk-first dans `xetu-execution-sequence.md`.
- [x] Creer le plan backend contract-first dans `whatsapp-agent/docs/xetu-backend-tracking-contract-plan.md`.
- [x] Creer la bible unique `bible-plan.md`.
- [x] Creer la checklist `bible-taches.md`.
- [x] Realigner la bible : signalement -> notification d'abord, streaming continu ensuite.
- [ ] A chaque nouvelle session, relire `bible-plan.md` avant d'implementer.
- [ ] A chaque tache terminee, cocher ici avec verification.

## 1. Base UI mobile/PWA

- [x] Corriger la modale/grille lignes du flux signalement pour afficher seulement les lignes MVP cartographiees.
- [x] Corriger bottom nav avec safe area et espace bas.
- [x] Corriger theme light et supprimer les icones emoji visibles.
- [ ] Verifier affichage Android petit ecran.
- [ ] Verifier affichage iOS/safe area si disponible.

## 2. Pont GPS app -> PWA -> backend

- [x] Cote PWA, appeler `window.XetuNative.requestLocation(requestId)`.
- [x] Recevoir `locationResult` dans la PWA.
- [x] Envoyer un signalement ponctuel vers le backend avec `mode`.
- [x] Mapper `mode` et `confiance` depuis `/api/buses`.
- [ ] Verifier que la carte affiche le signalement/bus estime.

## 3. Signalement utile sur trace

- [x] Pipeline `record_signalement()` existe cote backend.
- [x] Signalement texte WhatsApp existe.
- [x] Signalement GPS `/tracking/update` existe.
- [x] TTL/expiration existe via `expires_at`.
- [x] `/api/buses` affiche les signalements actifs.
- [x] Notification abonnes ligne existe WhatsApp + PWA.
- [x] Distinguer mode `vu`.
- [x] Distinguer mode `dedans`.
- [x] TTL court pour `vu`.
- [x] Fraicheur plus forte pour `dedans`.
- [x] Projection du signalement sur la trace Dem Dikk.
- [x] Determination du sens probable (projection GPS double-direction si arret ambigu aller/retour, sinon `direction_confidence=low` explicite).
- [x] Affichage carte/listes avec source explicite `vu` / `dedans`.
- [x] Notification abonnes arrets aval (filtre `get_abonnes_aval`, canal WhatsApp seulement — push PWA reste large, voir risques).

## 4. Relance a la demande

- [x] Detecter quand quelqu'un demande une ligne ou ouvre la carte (cartes bus PWA : action relance contextuelle sur signal `dedans` vieillissant).
- [x] Si signal frais : afficher sans relance.
- [x] Si signal vieillissant : dire "apercu a X il y a N min".
- [x] Identifier si le dernier signaleur etait en mode `dedans`.
- [x] Relancer seulement les signaleurs `dedans`.
- [x] Ajouter cooldown par signaleur.
- [x] Ajouter endpoint ou flow de relance.
- [ ] La reponse de relance repasse par `record_signalement()`.
- [ ] Si signal expire : inviter a signaler, sans marqueur.

## 5. Propagation aval et ETA indicatif

- [x] Calculer progression du signalement sur trace.
- [x] Identifier arrets en aval.
- [x] Estimer temps jusqu'aux arrets aval.
- [x] Afficher confiance.
- [x] Ne pas afficher ETA normal apres 20h (fenetre heuristique 20h-5h UTC=Dakar, `eta_disabled_reason=service_reduit_nuit`, a calibrer avec donnees terrain — voir risques).
- [x] Expirer estimation si trop ancienne via TTL signalement.

## 6. Notifications ciblees

- [x] Abonnement ligne existe.
- [ ] Abonnement arret.
- [x] Notification `ligne signalee a X` existe.
- [ ] Notification `bus probablement en approche`.
- [ ] Dedoublonnage notifications.
- [ ] Respecter TTL.

## 7. Je suis dans le bus

- [x] Bouton `Je suis dans le bus`.
- [x] Confirmer ligne dans le wizard existant.
- [x] Envoyer position si GPS disponible.
- [x] Confiance superieure au simple `vu`.
- [x] Ping manuel `toujours dedans` via relance backend.
- [x] Stop manuel quand l'utilisateur descend (bouton PWA `Arreter le partage`, endpoint `/tracking/session/stop`).

## 8. Streaming continu optionnel

- [x] Consentement clair.
- [x] Pings toutes les 10-15 secondes en foreground.
- [x] Backend recoit pings continus.
- [x] Backend map-match chaque ping.
- [x] Backend cree/met a jour `bus_state`.
- [x] `/api/buses` retourne `bus_state`.
- [x] Carte affiche le bus partage par passager via `/api/buses` (`tracking_mode="live_gps"`).
- [x] Stop auto si hors trace ou inactif (off-trace stop cote PWA, expiration `bus_state` 45s).
- [ ] Confiance plus haute si plusieurs contributeurs.

## 9. Spike A1 map-matching mono-trace

- [x] Creer `whatsapp-agent/scripts/mapmatch_trace.py`.
- [x] Accepter input JSONL.
- [x] Accepter input GPX.
- [x] Charger `xetu_mvp.json`.
- [x] Projeter GPS sur `geometry_aller` / `geometry_retour`.
- [x] Produire `matched_samples`, `median_error_m`, `p95_error_m`, `direction_confidence`, `usable`.
- [x] Ajouter fixture synthetique ligne `232`.
- [x] Ajouter tests `tests/test_mapmatch_trace.py`.
- [x] Verifier : `python -m pytest tests/test_mapmatch_trace.py`.
- [x] Verifier CLI : `python scripts/mapmatch_trace.py --line 232 --direction arrets --input tests/fixtures/mapmatch_trace_232.jsonl --output .doryx/runs/mapmatch_trace_232.report.json`.
- [ ] Tester avec une vraie trace terrain.

## 10. Backend sessions propres

- [ ] Definir schema `bus_events`.
- [x] Definir schema `tracking_sessions`.
- [x] Definir schema `tracking_pings`.
- [x] Definir schema `bus_state`.
- [x] Ajouter repository Supabase uniquement dans `db/queries.py`.
- [ ] Endpoint signalement structure sur trace.
- [ ] Endpoint propagation/lecture bus events.
- [x] Ajouter `POST /tracking/session/start`.
- [x] Ajouter `POST /tracking/session/ping`.
- [x] Ajouter `POST /tracking/session/stop`.
- [ ] Tester expiration events/state.
- [x] Tester rejet hors trace.

## 11. Confiance et anti-abus

- [ ] Corriger dette backend P1-5 corroboration cassee.
- [ ] Definir seuils `low`, `medium`, `high`.
- [ ] Signalement simple = confiance basse/moyenne.
- [ ] `Je suis dedans` = confiance plus haute.
- [ ] Deux sources proches = confiance plus haute.
- [ ] Rejeter vitesse impossible.
- [x] Rejeter GPS trop loin de la trace.
- [x] Ne jamais exposer ping brut comme bus live.

## 12. Couche spatiale Dakar

- [x] Generer `spatial_candidates.gemini.all.jsonl`.
- [x] Generer `spatial_landmark_candidates.review.jsonl`.
- [x] Inclure Renaissance, Police Dieuppeul, ESTG, Sandaga, Liberte 6.
- [x] Nettoyer/dedupliquer candidats finaux.
- [x] Produire liens repere -> top 3 arrets proches.
- [ ] Valider 50 reperes prioritaires.
- [x] Creer `xetu_spatial_layer.json` ou equivalent.
- [x] Brancher resolver sur cette couche.

## 13. Resolver et IA

- [ ] Resolver texte + GPS local.
- [x] Cas : `Liberte 6 -> Yoff`.
- [x] Cas : `Police Dieuppeul -> Sandaga`.
- [x] Cas : `ESTG -> destination`.
- [x] Clarification si zone trop vague.
- [ ] Chat IA utilise le resolver, pas l'inverse.

## 14. Beta terrain

- [ ] Organiser test ligne `232`.
- [ ] Tester signalement vu.
- [ ] Tester signalement dedans.
- [ ] Tester notification abonnes.
- [ ] Collecter vraie trace A1.
- [ ] Recruter 2 personnes meme bus pour streaming optionnel.
- [ ] Mesurer comprehension utilisateurs.
- [ ] Ajuster seuils.

## 15. Livraison

- [ ] Privacy courte et claire.
- [ ] Store copy sans surpromesse.
- [ ] Crash/log monitoring.
- [ ] Tests Android.
- [ ] Tests iOS si disponible.
- [ ] Beta fermee.
- [ ] Release publique.
