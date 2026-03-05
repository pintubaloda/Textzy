# Textzy API Integration (Simple Guide)

This guide is for partner/dev integrations with Textzy for SMS and WhatsApp.

## 1. Base URLs
- Backend API: `https://textzy-backend-production.up.railway.app`
- Frontend: `https://textzy-frontend-production.up.railway.app`

## 2. Security Model (Simple)

### 2.1 Primary auth (supported now)
Use session bearer token from login:
- `POST /api/auth/login`
- Header on protected APIs:
  - `Authorization: Bearer <accessToken>`
  - `X-CSRF-Token: <csrfToken>` for unsafe methods
  - `X-Tenant-Slug: <tenantSlug>` for tenant-bound APIs

### 2.2 API key + API secret profile (recommended integration contract)
For partner-style integrations, use:
- `X-API-Key: <apiKey>`
- `X-API-Secret: <apiSecret>`

Optional:
- IP whitelist at gateway/firewall (recommended).
- Allow only known client IP/CIDR ranges.

Notes:
- Keep key/secret server-to-server only.
- Rotate secrets periodically.
- Use HTTPS only.

## 3. Tenant Context
For tenant APIs, always pass:
- `X-Tenant-Slug: <tenantSlug>`

If one account has multiple projects/tenants:
1. `GET /api/auth/projects`
2. `POST /api/auth/switch-project`
3. Use returned token + selected `tenantSlug` for all calls.

## 4. SMS API (TATA-oriented)

## 4.1 Send SMS through Textzy
Endpoint:
- `POST /api/messages/send`

Headers:
- `Authorization: Bearer <accessToken>`
- `X-CSRF-Token: <csrfToken>`
- `X-Tenant-Slug: <tenantSlug>`
- `Idempotency-Key: <uniqueKey>`

Body example:
```json
{
  "recipient": "919999999999",
  "channel": "Sms",
  "body": "Your OTP is 123456"
}
```

Important:
- SMS credits are checked before send.
- Segment billing:
  - English: 160 chars (single), 153 per segment (multipart)
  - Unicode: 70 chars (single), 67 per segment (multipart)

## 4.2 TATA gateway format used by Textzy
Textzy composes TATA request like:
`https://smsgw.tatatel.co.in:9095/campaignService/campaigns/qs?recipient=<MobileNo>&dr=false&msg=<Message>&user=<Username>&pswd=<Password>&sender=<SenderAddress>&PE_ID=<PEID>&Template_ID=<TemplateID>`

Mapped keys in platform settings scope `sms-gateway`:
- `tataBaseUrl`
- `tataUsername`
- `tataPassword`
- `defaultSenderAddress`
- `defaultPeId`
- `defaultTemplateId`
- `webhookSecret` (for DLR webhook validation)

## 4.3 SMS DLR webhook
Endpoint:
- `POST /api/sms/webhook/tata?tenantSlug=<tenantSlug>`

Security:
- Header: `X-SMS-Webhook-Secret: <webhookSecret>` (or query `secret`)

Inbound opt-out webhook:
- `POST /api/sms/webhook/tata/inbound?tenantSlug=<tenantSlug>`

Supported STOP keywords:
- `stop`, `unsubscribe`, `optout`, `cancel`, `quit`, `end`

## 4.4 SMS template APIs
- `GET /api/sms/templates`
- `POST /api/sms/templates`
- `PUT /api/sms/templates/{id}`
- `DELETE /api/sms/templates/{id}`
- `POST /api/sms/templates/import-csv`

Suggested CSV columns:
- `templateid`
- `name`
- `status`
- `body`
- `senderid`
- `entityid`
- `operator`

## 5. WhatsApp API (Detailed)

## 5.1 Send WhatsApp message
Endpoint:
- `POST /api/messages/send`

Headers:
- `Authorization: Bearer <accessToken>`
- `X-CSRF-Token: <csrfToken>`
- `X-Tenant-Slug: <tenantSlug>`
- `Idempotency-Key: <uniqueKey>`

Session text example:
```json
{
  "recipient": "919999999999",
  "channel": "WhatsApp",
  "body": "Hello from Textzy",
  "useTemplate": false
}
```

Template example:
```json
{
  "recipient": "919999999999",
  "channel": "WhatsApp",
  "useTemplate": true,
  "templateName": "order_update",
  "templateLanguageCode": "en",
  "templateParameters": ["John", "#1234"]
}
```

24-hour rule:
- Non-template send is blocked if WhatsApp customer session window is closed.
- Use approved template when outside session window.

## 5.2 Media upload
- `POST /api/messages/upload-whatsapp-media` (send + queue)
- `POST /api/messages/upload-whatsapp-asset` (template asset upload)

## 5.3 Flow APIs (Meta flow lifecycle)
- `GET /api/automation/meta/flows`
- `POST /api/automation/meta/flows`
- `GET /api/automation/meta/flows/{metaFlowId}`
- `PUT /api/automation/meta/flows/{metaFlowId}`
- `DELETE /api/automation/meta/flows/{metaFlowId}`
- `POST /api/automation/meta/flows/{metaFlowId}/publish`

Flow send + data exchange:
- `POST /api/automation/flows/{flowId}/send-flow`
- `POST /api/automation/flows/{flowId}/data-exchange`

Flow monitoring:
- `GET /api/automation/metrics/flows`
- `GET /api/automation/metrics/flows/events`

## 5.4 WhatsApp webhook
- Verify: `GET /api/waba/webhook`
- Events: `POST /api/waba/webhook`

## 6. Built-in API Sandbox / Simulator

Use these endpoints for non-production smoke simulation with real integration plumbing.

## 6.1 WhatsApp readiness simulator
- `GET /api/waba/smoke/readiness`
Returns configuration + runtime counters.

## 6.2 WhatsApp send simulator
- `POST /api/waba/smoke/run`

Example:
```json
{
  "recipient": "919999999999",
  "sendSessionMessage": true,
  "sessionMessageText": "Smoke test",
  "sendTemplateMessage": false
}
```

## 6.3 SMS simulator
- `POST /api/platform/settings/sms/test`

Example:
```json
{
  "phone": "919999999999",
  "message": "Textzy SMS test",
  "templateId": "1234567890"
}
```

## 6.4 WABA diagnostics
- `GET /api/waba/debug/probe`
- `GET /api/waba/debug/webhook-health`

## 7. Error Handling (Quick)
- `401`: token missing/expired
- `403`: CSRF invalid or permission denied
- `400`: validation issue (bad phone/template/message/etc.)
- `502`: downstream provider/network issue

## 8. Minimal Partner Integration Flow
1. Login and receive token.
2. Fetch/select tenant project.
3. Send messages via `/api/messages/send`.
4. Track delivery via:
   - WhatsApp webhooks/events
   - SMS DLR webhook (`/api/sms/webhook/tata`)
5. Use smoke endpoints before go-live.

## 9. Production Checklist
- HTTPS only
- Idempotency key on every send
- Token rotation/refresh handling
- Optional IP whitelist at edge
- Webhook secret validation enabled
- Tenant slug always included
- Monitor 429/5xx retries and provider latency

## 10. Postman Quick Import
- Collection: `Textzy_API_Integration_Postman_Collection.json`
- Environment: `Textzy_API_Integration_Postman_Environment.json`

Import both files in Postman, fill `email/password`, run:
1. Login
2. Get Projects
3. Switch Project
4. SMS/WhatsApp/Flow/Sandbox requests
