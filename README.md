# Xetu Mobile

Expo mobile app for Xetu. This repo is separate from the backend at `C:\Users\DELL\Desktop\whatsapp-agent` and consumes the backend over HTTP.

## Current Stack

- Expo SDK 56
- React Native 0.85
- React 19.2
- TypeScript
- Doryx MCP wired locally

## Setup

Install dependencies:

```powershell
npm install
```

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

Set the backend URL in `.env`:

```text
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

Only non-secret values belong in `EXPO_PUBLIC_*` variables. Do not put API keys, tokens, service accounts, certificates, or store credentials in this repo.

## Run

Web preview:

```powershell
npx.cmd expo start --web --localhost --port 8082
```

Android emulator:

```powershell
npx.cmd expo start --android
```

If the backend runs locally on the host machine, Android emulator traffic usually needs `http://10.0.2.2:<port>` instead of `localhost`. If the backend is deployed, use its public HTTPS URL.

## Doryx

Doryx is installed for this mobile repo only. It must not reuse the backend `.doryx/` state.

Start the MCP server:

```powershell
npm run doryx:server
```

Doryx runtime state is ignored by git:

- `.doryx/`
- `.doryx-backups/`

## API Types

Generate TypeScript types from the backend OpenAPI contract:

```powershell
npm run generate:api-types -- http://localhost:8000/openapi.json
```

The generated file is `src/types.gen.ts`. If the backend is deployed, pass the deployed `/openapi.json` URL instead.

## Verification

Run focused checks before committing:

```powershell
npx.cmd tsc --noEmit
npx.cmd expo config --type public
```

## Rollback

Rollback to the checkpoint before Doryx was wired:

```powershell
git reset --hard pre-doryx-mobile-2026-06-24
```

## Planning

- Product and release plan: `BIBLE.md`
- Doryx setup record: `DORYX-MOBILE-SETUP.md`
