# Android Emulator Handoff - Xetu Mobile

Status: frozen handoff at 2026-06-29 04:35 Africa/Dakar.

## Decision

We stop Android emulator work here for now.

Priority moves to Cloudflare Pages deployment of `xetu-mobile`.
Native/mobile validation will resume later.

## Repo

- Repo: `C:\Users\DELL\Desktop\xetu-mobile`
- Git branch: `master`
- Remote: `origin/master`
- Last pushed migration commit: `de7b9f8 Migrate mobile app to Ionic Angular Capacitor`

## Cloudflare Pages Setup To Use

For the Cloudflare Pages project connected to `GuyDorveilMALONGA/xetu-mobile`:

- Project name: `xetu-mobile`
- Production branch: `master`
- Framework preset: `None` is acceptable
- Build command: `npm run build`
- Build output directory: `www`
- Root directory: leave empty / repository root

The current Angular environment files already point to:

- API: `https://web-production-ccab8.up.railway.app`
- WS: `wss://web-production-ccab8.up.railway.app`

## Android Emulator State Reached

Emulator:

- AVD: `Medium_Phone`
- Serial: `emulator-5554`
- Package: `com.xetu.mobile`
- Main activity: `com.xetu.mobile/.MainActivity`

Commands that worked:

```powershell
npm.cmd run build
npx.cmd cap sync android
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
cd C:\Users\DELL\Desktop\xetu-mobile\android
.\gradlew.bat installDebug --console=plain --no-daemon
adb -s emulator-5554 shell am start -n com.xetu.mobile/.MainActivity
```

Install result reached:

```text
BUILD SUCCESSFUL
Installed on 1 device.
```

## Local Android SDK Issue Fixed On This Machine

Initial Gradle failure:

```text
Failed to install the following SDK components:
platforms;android-36 Android SDK Platform 36
```

Then a second Gradle failure happened because `platforms/android-36` existed but was incomplete and missed `android.jar`.

Temporary local repair done:

```powershell
$sdk="$env:LOCALAPPDATA\Android\Sdk\platforms"
$src=Join-Path $sdk "android-36.1"
$dst=Join-Path $sdk "android-36"
Copy-Item "$src\android.jar" "$dst\android.jar"
Copy-Item "$src\android-stubs-src.jar" "$dst\android-stubs-src.jar"
Copy-Item "$src\build.prop" "$dst\build.prop"
Copy-Item "$src\core-for-system-modules.jar" "$dst\core-for-system-modules.jar"
```

This was a local SDK repair only, not a repo change.

## What Was Observed

First run:

- App launched but showed a dark blank screen.
- Cause found: lazy routing was nested twice under `tabs`.
- Fix applied locally in `src/app/tabs/tabs.routes.ts`:
  - changed child route path from `tabs` to empty path `''`.

After that:

- The Carte screen rendered in the Android emulator.
- Map was visible.
- GPS permission dialog appeared.
- Bottom sheet "Bus actifs" appeared.
- Floating report button appeared.

Screenshot evidence was provided by the user in chat.

## Remaining Runtime Problem

Android showed:

```text
Xetu isn't responding
```

Logs showed repeated backend/session failures:

```text
Access to XMLHttpRequest at 'https://web-production-ccab8.up.railway.app/api/session'
from origin 'https://localhost' has been blocked by CORS policy

WS payload error: Session non autorisee.
WebSocket closed with code 4003.
Session invalid or expired. Resetting session...
```

Interpretation:

- Capacitor Android origin is `https://localhost`.
- Railway backend CORS did not allow `https://localhost`.
- Session creation failed.
- Mobile generated a local fallback session without token.
- WebSocket then connected with an empty/invalid token and looped.
- That loop likely caused the ANR while the GPS permission modal was open.

## Local Fixes Applied But Not Yet Fully Finalized

Backend repo `C:\Users\DELL\Desktop\whatsapp-agent`:

- `main.py` modified locally to allow Capacitor origins:
  - `https://localhost`
  - `http://localhost`
  - `capacitor://localhost`
  - `ionic://localhost`

Mobile repo `C:\Users\DELL\Desktop\xetu-mobile`:

- `src/app/tabs/tabs.routes.ts`
  - fixed lazy tabs route path from `tabs` to `''`.
- `src/app/core/services/ws.service.ts`
  - added guard: do not open WebSocket when session token is missing.
- `src/app/core/services/ws.service.spec.ts`
  - added unit test for missing-token WebSocket guard.

These changes were local at the stop point.

## Verification Completed Before Stop

Backend:

```text
python -m pytest tests -q
250 passed, 8 warnings in 58.55s
```

Warnings were existing Supabase deprecation warnings for `timeout` and `verify`.

Mobile:

```text
npm.cmd run build
Application bundle generation complete.
Output location: C:\Users\DELL\Desktop\xetu-mobile\www
```

Earlier after the routing fix:

```text
npx.cmd ng test --watch=false --browsers=ChromeHeadless
TOTAL: 77 SUCCESS
```

Latest mobile test rerun was interrupted before completion.
Latest `npx cap sync android` after the WebSocket guard was also interrupted.

## Exact Resume Point

When resuming Android validation:

1. Keep the three mobile fixes.
2. Keep/deploy the backend CORS fix.
3. Run:

```powershell
cd C:\Users\DELL\Desktop\xetu-mobile
npm.cmd run build
npx.cmd ng test --watch=false --browsers=ChromeHeadless
npx.cmd cap sync android
cd android
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
.\gradlew.bat installDebug --console=plain --no-daemon
adb -s emulator-5554 shell am force-stop com.xetu.mobile
adb -s emulator-5554 shell am start -n com.xetu.mobile/.MainActivity
```

4. Confirm:

- No Android ANR dialog.
- Map still renders.
- `/api/session` succeeds after backend CORS deployment.
- WebSocket does not loop with code `4003`.

## Do Not Forget

Cloudflare deployment of `xetu-mobile` will use the already pushed commit unless the local fixes are committed and pushed first.
The currently pushed commit `de7b9f8` does not include the local routing/CORS/WebSocket guard fixes unless they are committed after this handoff.
