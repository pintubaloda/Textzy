# Textzy Android Starter

This Android app implements the production mobile flow from your Textzy backend:

- Email/password login
- QR pairing login (`/api/public/mobile/pair/exchange`)
- Project selection and switch-project
- Inbox list/messages/send
- Media upload/send (`/api/messages/upload-whatsapp-media`)
- Share current location as a chat message
- Secure token storage (EncryptedSharedPreferences)
- Operational telemetry push (`/api/mobile/telemetry`)

## Prerequisites

- Android Studio Ladybug+ (or newer)
- JDK 17
- Android SDK 34

## Open and Build

1. Open `mobile-android` folder in Android Studio.
2. Let Gradle sync dependencies.
3. Build Debug APK:
   - `Build > Build Bundle(s) / APK(s) > Build APK(s)`
4. APK output:
   - `mobile-android/app/build/outputs/apk/debug/app-debug.apk`

For release APK, configure signing in Android Studio and build `release`.

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

Request these at runtime only when feature is used:

- Camera: QR scan
- Microphone: voice/audio attachment picker
- Location: share location action
- Media read: image/video picker

## Telemetry

The app sends operational telemetry to:

- `POST /api/mobile/telemetry`

Platform owner can view telemetry table at:

- `Platform Settings > App Settings > Daily Mobile Telemetry`

Use operational telemetry only; avoid invasive tracking.
