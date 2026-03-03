# Textzy Android Starter

This Android app implements the new Textzy mobile flow:

- Email/password login
- Project selection and switch-project
- QR pairing login (`/api/public/mobile/pair/exchange`)
- Inbox list/messages/send
- Secure token storage
- Operational telemetry event push

## Prerequisites

- Android Studio Ladybug+ (or newer)
- JDK 17
- Android SDK 34

## Open and Build

1. Open `mobile-android` folder in Android Studio.
2. Let Gradle sync dependencies.
3. Build APK:
   - `Build > Build Bundle(s) / APK(s) > Build APK(s)`
4. APK output:
   - `mobile-android/app/build/outputs/apk/debug/app-debug.apk`

## Configure APK Download in Web Login

In Platform Owner:

- Go to `Platform Settings > App Settings`
- Set:
  - `androidApkUrl`
  - `androidVersionName`
  - `androidVersionCode`
  - `androidReleaseNotesUrl` (optional)

Then login page shows `Download APK` automatically.

## Permissions

Permissions declared:

- Internet
- Camera (QR scan)
- Microphone (voice)
- Media read (image/video)
- Fine/Coarse location (share location)

Request these at runtime only when feature is used.

## Telemetry

The app sends operational telemetry to:

- `POST /api/mobile/telemetry`

Platform owner can view telemetry table at:

- `Platform Settings > App Settings > Daily Mobile Telemetry`

Use operational telemetry only; avoid invasive tracking.
