# AGENTS.md - Xetu Mobile

Short contract for agents working in the Ionic Angular + Capacitor mobile repo.

## Project Context

Xetu Mobile is the native iOS/Android app for Xetu.
It is a separate repo from the backend:

- Mobile repo: `C:\Users\DELL\Desktop\xetu-mobile`
- Backend source of truth: `C:\Users\DELL\Desktop\whatsapp-agent`

The mobile app consumes backend HTTP/WebSocket APIs. Do not copy backend business logic into this repo.

## Product Authorities

Read these before product or source changes:

- `BIBLE.md` - north-star, roadmap, phase order.
- `PRD.md` - exact product slices, backend contracts, acceptance criteria.

Contract rule:

- API contracts come from the backend code, not guesses.
- If `PRD.md` and backend code disagree, inspect backend code and update the PRD before implementing.

## Technical Stack

Current active stack:

- **Ionic Framework**: v8.x (Web Components)
- **Angular**: v20.x (Standalone components, Signals for state management, new control flow, no NgModules)
- **Capacitor**: v8.x (Native bridge, edge-to-edge Android support, Swift Package Manager iOS)
- **TypeScript**: strict mode

Start from:

- https://ionicframework.com/docs
- https://capacitorjs.com/docs
- https://angular.dev

## Before Each Diff

State this before editing:

```text
STRUCTURE TOUCHED: ...
WHY THE STRUCTURE ALLOWS THIS PROBLEM: ...
THIS DIFF FIXES: symptom | structure
```

If you cannot fill it, investigate more.

## Work Loop

1. Investigation: map the relevant area.
2. Design: compare approaches when structure changes or choices are irreversible.
3. Implementation: make one coherent diff and verify it.

Do not read the whole repo by default. Read the docs above, then only the relevant source.

## Mobile Boundaries

- No secrets in repo, logs, or chat output.
- `.env` stays local. Only environment variables defined in environment files may be exposed.
- Do not add push, device identity, background location, store metadata, or native permissions without checking `PRD.md`.
- Backend changes belong in `whatsapp-agent`, with that repo's rules and tests.
- Native app code belongs in `xetu-mobile`.

## Backend Contract Discipline

Before implementing a screen that calls the backend:

- Inspect the real endpoint in `whatsapp-agent`.
- Derive or update TypeScript types from the actual response (defined in `src/app/core/models/models.ts`).
- Preserve details from `PRD.md` / `IONIC_MIGRATION_PLAN.md`, especially:
  - `/api/stops/search`, not `/api/stops`
  - `/api/route` uses query param `from`
  - `/api/report` treats `200 already_recorded` as idempotent success
  - `/tracking/update` returns HTTP 200 even for statuses like `spam`
  - `/api/subscriptions` is not `/api/push/subscribe`

## Verification

Use focused checks first:

- `npm run build` (runs `ng build`, verifies Angular compilation)
- `npx ng test --watch=false --browsers=ChromeHeadless` (runs Karma unit tests)
- `npx cap sync android` (syncs web assets and native plugins with Android)
- `node verify-milestone1.js` (runs milestone checks)

If a check was not run, say so. Never say "done" without executed verification.

## Reporting

Keep chat lean. Final reports should include:

- changes made
- tests/checks run and exact result
- files touched outside scope
- residual risks
