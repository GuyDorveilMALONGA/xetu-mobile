# Gemini Supervision - Xetu Mobile Remaining Work

Date: 2026-06-30
Supervisor: Codex
Repo mobile: `C:\Users\DELL\Desktop\xetu-mobile`
Backend source of truth: `C:\Users\DELL\Desktop\whatsapp-agent`

## Operating Rules

Gemini must follow `AGENTS.md`, `BIBLE.md`, and `PRD.md` before editing.

Before every diff, state:

```text
STRUCTURE TOUCHED: ...
WHY THE STRUCTURE ALLOWS THIS PROBLEM: ...
THIS DIFF FIXES: symptom | structure
```

Work must be split into small reviewable lots. Do not mix all five chantiers in one diff.

Required gates for each lot:

- inspect the real backend endpoint before adding a mobile call;
- update `src/app/core/models/models.ts` when the real contract differs;
- add or update focused unit tests for changed behavior;
- run `npm run build`;
- run focused tests first, then full Karma only when the scope justifies it;
- run `npx cap sync android` when web/native assets or plugins change;
- report exact command output, not "it works".

## Current Known State

Already handled or integrated:

- Safe area / bottom navigation.
- Mobile map draws selected line geometry and stops.
- Report score increments only on a true `recorded` response.
- Backend distinguishes report rejection statuses:
  - `rejected_spam`
  - `rejected_distance`
  - `rejected_low_confidence`
  - `record_failed`
- `xetu-mobile` was clean before creating this supervision note.

Do not regress these.

## Priority Order

1. Enriched mobile report.
2. `/tracking/relance` mobile.
3. Live tracking mobile sessions.
4. Line / stop detail screens.
5. Native push.
6. Map attribution/provider cleanup.

Native push is intentionally last because the current backend push is Web Push/VAPID, not APNs/FCM.

## Lot 1 - Enriched Mobile Report

Goal: bring mobile closer to Dashboard report behavior without copying backend business logic.

Investigate first:

- `whatsapp-agent/api/report.py`
- `whatsapp-agent/Dashboard/js/signal.js`
- `whatsapp-agent/Dashboard/js/geoloc.js`
- `xetu-mobile/src/app/features/signalement/signalement-modal.component.ts`
- `xetu-mobile/src/app/core/models/models.ts`
- `xetu-mobile/src/assets/data/xetu_mvp.json`

Expected mobile behavior:

- find nearest stop from the selected line and current GPS;
- fill `nearest_stop` when confidence is good enough;
- detect `sens` as `aller` or `retour` when possible;
- when direction cannot be inferred, offer a simple manual choice if product/UI already supports the step cleanly;
- send only fields accepted by backend, unless a backend change is explicitly done in `whatsapp-agent`.

Important backend contract note:

- `/api/report` accepts `nearest_stop`.
- `/api/report` currently does not meaningfully persist/consume `sens` as a typed report field.
- If `sens` must be accepted, implement that as a separate backend lot with tests.

Acceptance:

- GPS refused: report still works without `lat/lon`.
- GPS accepted and near a line stop: payload includes `nearest_stop`.
- Score still increments only on `status === "recorded"` with an id.
- Rejection statuses render as actionable messages, not generic errors.

## Lot 2 - `/tracking/relance` Mobile

Goal: add "Demander position actuelle" on mobile for a relevant active bus/line context.

Investigate first:

- `whatsapp-agent/api/tracking.py`
- `whatsapp-agent/Dashboard/js/api.js`
- `whatsapp-agent/Dashboard/js/home.js`
- `xetu-mobile/src/app/features/carte/carte.page.ts`
- `xetu-mobile/src/app/core/services/api.service.ts`

Acceptance:

- UI exposes the action only where a bus/line context exists.
- API call includes the required payload from the real backend model.
- Busy state prevents double taps.
- Success and failure messages are explicit.

## Lot 3 - Live Tracking Sessions

Goal: implement foreground live tracking only.

Endpoints:

- `POST /tracking/session/start`
- `POST /tracking/session/ping`
- `POST /tracking/session/stop`

Investigate first:

- `whatsapp-agent/api/tracking.py`
- `whatsapp-agent/Dashboard/js/signal.js`
- `xetu-mobile/src/app/core/services/session.service.ts`
- Capacitor geolocation usage already present in mobile.

Boundaries:

- No background geolocation.
- No silent continuous tracking without explicit user action.
- Respect battery and privacy.
- Stop cleanly when user exits the live mode.

Acceptance:

- Start requires foreground GPS permission.
- Ping interval is explicit and cleaned up on stop/destroy.
- Stop works even after an intermediate ping failure.
- UI shows active/inactive/error states.

## Lot 4 - Line / Stop Detail Screens

Goal: add dedicated navigable detail views, not just inline route snippets.

Investigate first:

- `xetu-mobile/src/app/tabs/tabs.routes.ts`
- `xetu-mobile/src/app/features/itineraire/*`
- `xetu-mobile/src/app/features/mes-lignes/*`
- `xetu-mobile/src/assets/data/xetu_mvp.json`
- real backend search/route contracts if live data is needed.

Acceptance:

- Lazy-loaded standalone routes.
- A line detail can show terminus, directions, stops, and recent active bus state when available.
- A stop detail can show lines serving it and recent bus state when available.
- No invented endpoint. Use local network data or existing backend endpoints.

## Lot 5 - Native Push

Do not implement as a simple call to `/api/push/subscribe`.

Current backend `/api/push/*` is Web Push/VAPID. Native mobile needs APNs/FCM.

Required before mobile implementation:

- backend decision: direct FCM/APNs or relay service;
- backend endpoint such as `POST /api/push/native-register`;
- token storage and notification trigger path;
- privacy rule: never log tokens in clear text.

Mobile work only after backend contract exists:

- add `@capacitor/push-notifications`;
- request permission;
- receive token;
- register token with backend;
- handle permission denied and token refresh.

## Lot 6 - Map Attribution / Provider Cleanup

Known decision:

- `attributionControl: false` must not leave maps without visible attribution.
- Prefer a custom discreet attribution matching Xetu UI over the raw Leaflet default control.
- Attribution must match the real provider:
  - `© OpenStreetMap contributors` only for OSM-derived data/tiles;
  - add CARTO/OpenMapTiles/MapTiler only when those providers are actually used.

Acceptance:

- Main map has visible attribution.
- Signalement mini-map has visible attribution.
- No migration to MapLibre unless separately approved.

## Review Checklist For Codex

For each Gemini diff, Codex must verify:

- no unrelated refactor;
- backend contract was inspected, not guessed;
- no secrets or tokens added;
- no native permission added without PRD alignment;
- no regression of safe area, score behavior, or selected-line route drawing;
- tests/build commands were actually run and reported.

