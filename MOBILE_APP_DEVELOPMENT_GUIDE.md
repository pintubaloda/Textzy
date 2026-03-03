# Textzy Native App Development Guide

This guide is for Android, iOS, macOS, and Windows apps integrating with current Textzy backend.

## 1. Architecture Rules (Mandatory)
- App sends only user credentials and user API calls.
- App must never store or use WABA secrets.
- App should not hardcode tenant/WABA/realtime secrets or static per-project tokens.
- Every user must authenticate with their own login and use only that session token.
- Keep these server-side only:
  - Meta app secret
  - system user token
  - WABA access token
  - webhook verify token
- Backend resolves tenant/project/WABA/token internally from authenticated session + tenant context.

## 2. Base URLs
- Frontend (web): `https://textzy-frontend-production.up.railway.app`
- Backend API: `https://textzy-backend-production.up.railway.app`
- SignalR hub: `https://textzy-backend-production.up.railway.app/hubs/inbox`

## 3. Auth + Session Model (Current Implementation)
- Login creates opaque session token (server session), valid for 12 hours.
- Token is returned in:
  - JSON body: `accessToken`
  - Response headers: `Authorization`, `X-Access-Token`
- CSRF token is returned in header: `X-CSRF-Token` and cookie `textzy_csrf`.
- Refresh endpoint rotates session token (`/api/auth/refresh`).
- Logout revokes current session token (`/api/auth/logout`).

Note: This is session-token rotation, not separate JWT+refresh-token pair yet.

## 4. Required Headers/Cookies
For authenticated API calls:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json` (for JSON payload)
- `X-CSRF-Token: <csrfToken>` for unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`)
- `X-Tenant-Slug: <tenantSlug>` for tenant-bound non-auth APIs

Cookies used by backend:
- `textzy_session` (HttpOnly)
- `textzy_csrf` (readable for double-submit CSRF)

## 5. Project/Tenant Logic (Critical)
- User can belong to multiple projects (tenants).
- App should fetch project list after login:
  - `GET /api/auth/projects`
- When user selects project:
  - `POST /api/auth/switch-project` body `{ "slug": "moneyart" }`
  - Save returned `accessToken`, `tenantSlug`, `role`
- After switching, all tenant APIs must use new token and selected tenant context.

403 on switch-project means user is not mapped to that tenant in `TenantUsers`.

## 6. Auth Endpoints
- `POST /api/auth/login` body: `{ "email": "...", "password": "..." }`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/projects`
- `POST /api/auth/switch-project` body: `{ "slug": "..." }`
- `GET /api/auth/team-members`
- `GET /api/auth/app-bootstrap` (new: runtime app config for logged-in user)
- `GET /api/auth/devices` (connected devices for current user + selected tenant)
- `POST /api/auth/devices/pair-qr` (generate one-time pairing QR payload)
- `DELETE /api/auth/devices/{id}` (revoke connected mobile device)
- `POST /api/public/mobile/pair/exchange` (mobile app exchanges pairing token and receives auth session)

## 6A. Platform Owner App Base Settings (New Module)
Configured in platform owner UI:
- Path: `/dashboard/platform-settings?tab=app-settings`
- Stored scope: `mobile-app` (Platform Settings)

Fields supported:
- `appName`
- `baseDomain`
- `apiBaseUrl`
- `hubPath` (default `/hubs/inbox`)
- `supportUrl`
- `termsUrl`
- `privacyUrl`
- `enforceApiAllowList` (`true`/`false`)
- `allowedApiPrefixes` (newline/csv or JSON array)
- `apiCatalog` (newline/csv or JSON array)
- `maxDevicesPerUser` (default `3`, range `1..20`)
- `pairCodeTtlSeconds` (default `180`, range `60..600`)
- `minSupportedAppVersion` (e.g. `1.0.0`)
- `pairSchemaVersion` (default `1`)

App bootstrap response now returns:
- `app` object with above non-secret runtime settings
- `auth` object with current user/tenant/role/permissions

## 6B. QR Device Pairing Flow (New)
Web side (logged-in user):
1. User opens `Connect Mobile` in dashboard.
2. Web calls `POST /api/auth/devices/pair-qr`.
3. Backend returns:
   - `qrPayload` (JSON string to encode as QR)
   - `pairingToken` (same token inside payload)
   - `expiresAtUtc`
   - device limit summary
4. Web renders QR via backend-hosted image endpoint:
   - `GET /api/auth/devices/pair-qr-image?pairingToken=...`
   - response content type: `image/svg+xml`
   - QR includes Textzy logo overlay in center.
5. Optional fallback: display pairing token text if QR image is unavailable.

App side (scan + login):
1. App scans QR and parses `qrPayload`.
2. App reads `apiBaseUrl`, `tenantSlug`, `token`, `v`, expiry and app version constraints.
3. App calls `POST /api/public/mobile/pair/exchange` with:
   - `pairingToken`
   - `installId` (required unique install identifier)
   - `deviceName`, `devicePlatform`, `deviceModel`, `osVersion`, `appVersion`
4. Backend validates one-time token + expiry + device limit and returns:
   - `accessToken`
   - `csrfToken`
   - `tenantSlug`, `role`, `user`
   - `device` details
5. App uses returned token/session exactly like normal login flow.

Security properties:
- Pairing token is one-time use and short TTL.
- Pairing token is stored hashed server-side.
- Device limit enforced per user + tenant.
- User can revoke devices from web (`DELETE /api/auth/devices/{id}`).
- No third-party QR JavaScript is executed in browser; QR image is served from backend path.
- QR image is delivered from Textzy backend endpoint.
- Current implementation: backend generates QR image response using provider-backed raster + server-side logo overlay (no browser-side QR dependency).
- Textzy logo is embedded in center of QR image payload.
- Pairing endpoints enforce HTTPS transport.

## 6C. Encryption Model (Mobile <-> Backend)
- Transport encryption: HTTPS/TLS required for login, refresh, pairing, and all protected APIs.
- Session credential security:
  - access token sent in `Authorization: Bearer ...`
  - CSRF token required on unsafe methods
  - session token stored hashed server-side
- Pairing security:
  - token stored hashed server-side
  - token is short-lived and one-time-use
  - device binding via `installId` hash
- Pairing QR security:
  - QR endpoint requires authenticated user context
  - pair token must belong to same user + tenant and be unconsumed
  - pair token expiry enforced before QR image is returned
- Sensitive platform secrets remain server-side only (never sent to app).

## 6D. First-Time Mobile Login Policy
- First-time mobile login supports two modes:
  - `Email + Password` (default onboarding path)
  - `QR Pair Login` (only when user is already logged in on web/desktop)
- Recommended UX:
  1. Show `Email Login` and `Scan QR` buttons on first screen.
  2. If login with email/password succeeds: fetch projects and force project selection.
  3. If scan QR succeeds: call pair exchange and continue with returned tenant session.
- If user has exactly one project after login, app may auto-switch that project.

## 6E. Permissions Model (Feature-Based Runtime)
- Do not ask all permissions on app startup.
- Ask permission only when user uses a related feature:
  - Camera: QR scan / camera capture
  - Microphone: voice message recording
  - Media/Storage: attach image/video/file
  - Location: only when user taps `Share Location`
- If permission denied, show fallback UX (text chat still works).

## 6F. Telemetry Policy (Operational, Non-Invasive)
- Telemetry is for reliability and support diagnostics only.
- Use app `installId` (app-generated), not IMEI.
- Allowed telemetry examples:
  - login success/failure
  - app version / os version / device model
  - API latency / error code summary
  - crash summary
- Not allowed by default:
  - continuous GPS tracking
  - covert background surveillance
  - IMEI/MSISDN harvesting without explicit legal basis and consent
- Recommended cadence:
  - send batched telemetry daily or on app open
  - keep data retention policy (e.g., 30-90 days)

## 7. Inbox APIs for Native App
Base: `/api/inbox`
- `GET /conversations?take=100`
- `GET /conversations/{id}/messages?take=80`
- `POST /conversations/{id}/assign`
- `POST /conversations/{id}/transfer`
- `POST /conversations/{id}/labels`
- `POST /conversations/{id}/notes`
- `GET /conversations/{id}/notes?take=50`
- `POST /typing`
- `GET /sla?thresholdMinutes=15`

Message send:
- `POST /api/messages/send`
- Include `Idempotency-Key` header (recommended)

## 8. SignalR (Realtime Inbox)
Connect hub:
- URL: `/hubs/inbox?tenantSlug=<tenantSlug>`
- Auth: access token via `accessTokenFactory` / `accessToken` provider
- Then invoke:
  - `JoinTenantRoom(tenantSlug)`
  - `SetUserActive(tenantSlug, activeConversationId)`
  - `Heartbeat(tenantSlug, activeConversationId)` every ~30s

Listen events:
- `message.queued`
- `message.sent`
- `webhook.inbound`
- `conversation.assigned`
- `conversation.transferred`
- `conversation.labels`
- `conversation.note`
- `conversation.typing`

SignalR storage rule:
- Do not store a separate SignalR token.
- Use the same per-user `accessToken` created at login/switch-project.
- If token rotates on `/api/auth/refresh` or `/api/auth/switch-project`, reconnect hub with latest token.
- Keep only runtime values in memory when possible; if persisted, use secure storage and clear on logout.

If you want zero SignalR config in app binary:
- App stores only backend base URL.
- App calls backend bootstrap (recommended to add `/api/auth/app-bootstrap`) after login.
- Backend returns non-secret runtime values like:
  - `hubPath` (example: `/hubs/inbox`)
  - feature flags
  - polling fallback preference

## 9. FAQ + Chatbot Workflow Behavior
If inbound WhatsApp message arrives:
1. Auto handoff check first (keywords like `talk to agent`, `not satisfied`, `still not working`).
2. If no handoff and no workflow trigger match, system tries FAQ auto-reply.
3. FAQ matching priority: exact > starts_with > contains.
4. Audit logs are written for handoff and FAQ match/fail.

Manage FAQ via:
- `GET /api/automation/faq`
- `POST /api/automation/faq`
- `PUT /api/automation/faq/{id}`
- `DELETE /api/automation/faq/{id}`

Manage chatbot config via:
- `GET /api/chatbot-config`
- `PUT /api/chatbot-config`

## 10. Error Handling Rules
- `204` preflight for CORS is normal (browser behavior).
- `401 Missing bearer token` => token not attached.
- `401 Invalid or expired session` => refresh/login again.
- `403 Invalid CSRF token` => missing/wrong `X-CSRF-Token` on unsafe call.
- `403 Untrusted origin` => backend `AllowedOrigins` mismatch (production).
- `403` on switch-project => user not member of target tenant.
- `500` with blank body => check backend deployment logs immediately.

## 11. Secure Storage by Platform
Store only user session data:
- access token
- csrf token
- selected tenant slug
- minimal profile/role

Use secure stores:
- Android: EncryptedSharedPreferences / Keystore
- iOS/macOS: Keychain
- Windows: Credential Locker / DPAPI

Never store WABA/platform secrets in app.

## 12. Minimal App Login Flow
1. Call `/api/auth/login` with email/password.
2. Read `accessToken` from body or `X-Access-Token` header.
3. Read CSRF from `X-CSRF-Token` header.
4. Call `/api/auth/me`.
5. Call `/api/auth/projects` and let user select project.
6. Call `/api/auth/switch-project`.
7. Start Inbox APIs + SignalR with switched token/tenant.

## 12A. Minimal App QR Login Flow
1. User is already logged in on web and generates QR from `Connect Mobile`.
2. App scans QR and validates `expiresAtUtc`.
3. App calls `/api/public/mobile/pair/exchange`.
4. Store `accessToken`, `csrfToken`, `tenantSlug` securely.
5. Start normal API + SignalR flow with same token.

## 13. Production Checklist
- Backend `AllowedOrigins` contains app/web origins.
- CORS exposes headers: `Authorization`, `X-Access-Token`, `X-CSRF-Token`.
- App always sends `Authorization` for protected APIs.
- App sends `X-CSRF-Token` for all unsafe methods.
- Tenant switch is always done before tenant-bound screens.
- SignalR reconnect logic re-joins tenant room.
- Token refresh/re-login path is implemented for 401.
- QR pairing TTL and device limit are configured in `mobile-app` settings.
- Connected device revoke flow is tested (web remove -> app relogin required after session expiry/revocation policy).
- `GET /api/auth/devices/pair-qr-image` works from production backend and returns SVG QR.

## 14. Recommended Next Upgrade (Permanent Hardening)
To align with long-term mobile security model:
- Move to short-lived JWT access token (15–30 min)
- Add long-lived refresh token with revocation list
- Add device/session binding + logout-all
- Keep current rule: all WABA/config secrets remain server-side only

