# Textzy Mobile Backend Smoke Test (Postman)

Use this sequence to validate production backend before APK rollout.

## 1) Postman Environment Variables

Create an environment (example: `textzy-prod`) with:

- `baseUrl` = `https://textzy-backend-production.up.railway.app`
- `email` = `<test user email>`
- `password` = `<test user password>`
- `tenantSlug` = `` (empty initially)
- `accessToken` = `` (empty initially)
- `csrfToken` = `` (empty initially)
- `conversationId` = `` (set after inbox call)
- `pairingToken` = `` (set from web QR generation)
- `installId` = `postman-install-001`

## 2) Common Header Rules

- Always send `Authorization: Bearer {{accessToken}}` for protected APIs.
- Send `X-CSRF-Token: {{csrfToken}}` for unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) except public endpoints.
- Send `X-Tenant-Slug: {{tenantSlug}}` for tenant-bound non-auth APIs.

## 3) Request Sequence

## 3.1 Login

- Method: `POST`
- URL: `{{baseUrl}}/api/auth/login`
- Headers:
- `Content-Type: application/json`
- Body (raw JSON):

```json
{
  "email": "{{email}}",
  "password": "{{password}}"
}
```

Expected:

- `200 OK`
- token in body `accessToken` or header `X-Access-Token`
- CSRF token in header `X-CSRF-Token`

Postman Tests:

```javascript
const body = pm.response.json();
const access = body.accessToken || pm.response.headers.get("X-Access-Token");
const csrf = pm.response.headers.get("X-CSRF-Token");
pm.environment.set("accessToken", access || "");
pm.environment.set("csrfToken", csrf || "");
pm.test("Login OK", () => pm.expect(pm.response.code).to.eql(200));
pm.test("Access token present", () => pm.expect(access).to.be.a("string").and.not.empty);
```

## 3.2 Get Projects

- Method: `GET`
- URL: `{{baseUrl}}/api/auth/projects`
- Headers:
- `Authorization: Bearer {{accessToken}}`

Expected:

- `200 OK`
- array of projects with `slug`

Postman Tests:

```javascript
const rows = pm.response.json();
pm.test("Projects OK", () => pm.expect(pm.response.code).to.eql(200));
pm.test("Projects non-empty", () => pm.expect(Array.isArray(rows) && rows.length > 0).to.eql(true));
if (rows.length > 0) pm.environment.set("tenantSlug", rows[0].slug || rows[0].Slug || "");
```

## 3.3 Switch Project

- Method: `POST`
- URL: `{{baseUrl}}/api/auth/switch-project`
- Headers:
- `Authorization: Bearer {{accessToken}}`
- `X-CSRF-Token: {{csrfToken}}`
- `Content-Type: application/json`
- Body:

```json
{
  "slug": "{{tenantSlug}}"
}
```

Expected:

- `200 OK`
- returns rotated token and tenant context

Postman Tests:

```javascript
const body = pm.response.json();
const nextAccess = body.accessToken || pm.response.headers.get("X-Access-Token") || pm.environment.get("accessToken");
const nextCsrf = pm.response.headers.get("X-CSRF-Token") || pm.environment.get("csrfToken");
const slug = body.tenantSlug || body.TenantSlug || pm.environment.get("tenantSlug");
pm.environment.set("accessToken", nextAccess);
pm.environment.set("csrfToken", nextCsrf);
pm.environment.set("tenantSlug", slug);
pm.test("Switch project OK", () => pm.expect(pm.response.code).to.eql(200));
```

## 3.4 Inbox Conversations

- Method: `GET`
- URL: `{{baseUrl}}/api/inbox/conversations?take=50`
- Headers:
- `Authorization: Bearer {{accessToken}}`
- `X-Tenant-Slug: {{tenantSlug}}`

Expected:

- `200 OK`
- array response

Postman Tests:

```javascript
const rows = pm.response.json();
pm.test("Inbox conversations OK", () => pm.expect(pm.response.code).to.eql(200));
pm.test("Conversations array", () => pm.expect(Array.isArray(rows)).to.eql(true));
if (Array.isArray(rows) && rows.length > 0) {
  pm.environment.set("conversationId", rows[0].id || rows[0].Id || "");
}
```

## 3.5 Conversation Messages

- Method: `GET`
- URL: `{{baseUrl}}/api/inbox/conversations/{{conversationId}}/messages?take=50`
- Headers:
- `Authorization: Bearer {{accessToken}}`
- `X-Tenant-Slug: {{tenantSlug}}`

Expected:

- `200 OK`

## 3.6 Send Message

- Method: `POST`
- URL: `{{baseUrl}}/api/messages/send`
- Headers:
- `Authorization: Bearer {{accessToken}}`
- `X-CSRF-Token: {{csrfToken}}`
- `X-Tenant-Slug: {{tenantSlug}}`
- `Content-Type: application/json`
- Body:

```json
{
  "recipient": "911234567890",
  "body": "Postman smoke test message",
  "channel": "whatsapp",
  "idempotencyKey": "postman-smoke-{{$timestamp}}"
}
```

Expected:

- `200` or `202` (depends on queue/send implementation)

## 3.7 QR Pair Exchange (Public)

This requires a valid one-time token created from web `Connect Mobile`.

- Method: `POST`
- URL: `{{baseUrl}}/api/public/mobile/pair/exchange`
- Headers:
- `Content-Type: application/json`
- Body:

```json
{
  "pairingToken": "{{pairingToken}}",
  "installId": "{{installId}}",
  "deviceName": "Postman Android",
  "devicePlatform": "android",
  "deviceModel": "postman",
  "osVersion": "14",
  "appVersion": "1.0.0"
}
```

Expected:

- `200 OK` when token valid
- `4xx` when expired/consumed/invalid

## 4) Failure Mapping

- `403 Untrusted origin`:
- Backend `AllowedOrigins` missing frontend origin, or browser request with disallowed origin.
- `403 Invalid CSRF token`:
- Missing/wrong `X-CSRF-Token` on unsafe protected API.
- `401 Missing bearer token`:
- `Authorization` header missing.
- `401 Invalid or expired session`:
- token expired/revoked; login again.

## 5) Pre-release Exit Criteria

- Login + project switch pass for at least 2 users (different roles).
- Inbox list + messages load pass.
- Message send endpoint pass.
- QR exchange pass with valid token and fails correctly on expired token.
- No `Untrusted origin` for valid web origin.

