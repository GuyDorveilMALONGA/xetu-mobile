# AGENTS.md - Xetu Mobile

Short contract for agents working in the Expo mobile repo.

## Project Context

Xetu Mobile is the native iOS/Android app for Xetu.
It is a separate repo from the backend:

- Mobile repo: `C:\Users\DELL\Desktop\xetu-mobile`
- Backend source of truth: `C:\Users\DELL\Desktop\whatsapp-agent`

The mobile app consumes backend HTTP APIs. Do not copy backend business logic
into this repo.

## Product Authorities

Read these before product or source changes:

- `BIBLE.md` - north-star, roadmap, phase order.
- `PRD.md` - exact product slices, backend contracts, acceptance criteria.
- `DORYX-MOBILE-SETUP.md` - Doryx MCP wiring and rollback.
- `.doryx/decisions.md` when present - local Doryx decisions/backlog.

Contract rule:

- API contracts come from the backend code, not guesses.
- If `PRD.md` and backend code disagree, inspect backend code and update the
  PRD before implementing.
- Decisions belong in Doryx. The Bible/PRD may reference them but should not
  become a second decision source.

## Expo Version Rule

Expo changes quickly. Before adding native libraries, build tooling, push,
notifications, permissions, EAS, Android, or iOS config, read the exact Expo
SDK docs for this project version.

Current stack:

- Expo SDK 56
- React Native 0.85
- React 19.2
- TypeScript

Start from:

- https://docs.expo.dev/versions/latest/
- https://docs.expo.dev/develop/development-builds/introduction/
- https://docs.expo.dev/build/introduction/
- https://docs.expo.dev/push-notifications/overview/
- https://docs.expo.dev/guides/environment-variables/

## Doryx State

If `.doryx/state.json` exists, Doryx is active.

- `INTAKE` / `PLAN`: investigate and design only.
- `EXECUTE`: source edits allowed.
- `VERIFY`: verification only; no source edits.
- `REVIEW`: review evidence only.
- `DONE` / `CANCELLED`: start/reset/archive intentionally before new work.

Never fake verification, review, or PASS artifacts.

`.doryx/` is ignored by git. It is local runtime state for this mobile repo and
must not be confused with the backend Doryx state.

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

Do not read the whole repo by default. Read the docs above, then only the
relevant source.

## Mobile Boundaries

- No secrets in repo, logs, Doryx memory, or chat output.
- `.env` stays local. Only non-secret `EXPO_PUBLIC_*` values may be exposed to
  the app bundle.
- Do not add push, device identity, background location, store metadata, or
  native permissions without checking `PRD.md` and recording the needed Doryx
  decision.
- Backend changes belong in `whatsapp-agent`, with that repo's rules and tests.
- Native app code belongs in `xetu-mobile`.

## Backend Contract Discipline

Before implementing a screen that calls the backend:

- Inspect the real endpoint in `whatsapp-agent`.
- Derive or update TypeScript types from the actual response.
- Preserve pointy details from `PRD.md`, especially:
  - `/api/stops/search`, not `/api/stops`
  - `/api/route` uses query param `from`
  - `/api/report` treats `200 already_recorded` as idempotent success
  - `/tracking/update` returns HTTP 200 even for statuses like `spam`
  - `/api/subscriptions` is not `/api/push/subscribe`

## Verification

Use focused checks first:

- `npx.cmd tsc --noEmit`
- `npx.cmd expo config --type public`
- web preview at `http://localhost:8082/` when UI changes
- Android emulator checks when native behavior is touched

If a check was not run, say so. Never say "done" without executed verification.

## Reporting

Keep chat lean. Final reports should include:

- changes made
- tests/checks run and exact result
- files touched outside scope
- residual risks for 3+ files, backend changes, native permissions, push, or
  store work
