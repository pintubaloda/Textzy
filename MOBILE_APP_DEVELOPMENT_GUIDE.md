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

App bootstrap response now returns:
- `app` object with above non-secret runtime settings
- `auth` object with current user/tenant/role/permissions

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

## 13. Production Checklist
- Backend `AllowedOrigins` contains app/web origins.
- CORS exposes headers: `Authorization`, `X-Access-Token`, `X-CSRF-Token`.
- App always sends `Authorization` for protected APIs.
- App sends `X-CSRF-Token` for all unsafe methods.
- Tenant switch is always done before tenant-bound screens.
- SignalR reconnect logic re-joins tenant room.
- Token refresh/re-login path is implemented for 401.

## 14. Recommended Next Upgrade (Permanent Hardening)
To align with long-term mobile security model:
- Move to short-lived JWT access token (15–30 min)
- Add long-lived refresh token with revocation list
- Add device/session binding + logout-all
- Keep current rule: all WABA/config secrets remain server-side only

