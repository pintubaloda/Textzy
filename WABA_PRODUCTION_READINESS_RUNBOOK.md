# WABA Production Readiness Runbook

Use this runbook to close WABA pending checks in production.

## 1) Platform readiness scan (all tenants)

Endpoint:

- `GET /api/platform/waba/readiness?deepGraphCheck=true`

What to verify:

- Queue providers:
  - `queue.webhook.configured` equals expected (`redis`/`rabbitmq`/`sqs`)
  - `queue.webhook.active` is not `memory`
  - `queue.outbound.active` is not `memory`
- Tenant WABA:
  - `waba.IsActive=true`
  - `waba.PermissionAuditPassed=true`
  - `waba.WebhookSubscribedAtUtc` exists
  - `waba.graphWebhookSubscribed=true` (when `deepGraphCheck=true`)
- Template readiness:
  - `templates.approved > 0` for tenants that need template fallback
  - watch `templates.pending` and `templates.rejected`
- Runtime:
  - `runtime24h.received > 0` for active projects
  - failure counts should remain low.

## 2) Tenant readiness (current project)

Endpoint:

- `GET /api/waba/smoke/readiness`

Checks:

- `configured=true`
- `waba.OnboardingState=ready`
- `templates.approved` present for 24h fallback use cases
- `runtime24h` shows inbound/outbound status movement.

## 3) Live smoke test (session/template send)

Endpoint:

- `POST /api/waba/smoke/run`

Sample body:

```json
{
  "recipient": "9198XXXXXXXX",
  "sendSessionMessage": true,
  "sessionMessageText": "Textzy smoke test",
  "sendTemplateMessage": false
}
```

Template smoke sample:

```json
{
  "recipient": "9198XXXXXXXX",
  "sendSessionMessage": false,
  "sendTemplateMessage": true,
  "templateName": "your_approved_template",
  "templateLanguageCode": "en",
  "templateParameters": ["John"]
}
```

Expected:

- `sessionWindowOpen` returned
- `sessionSend.ok=true` or `templateSend.ok=true`
- `providerMessageId` returned on success.

## 4) Automate checks (cron/monitor)

Recommended:

1. Every 5-10 min: call `GET /api/platform/waba/readiness?deepGraphCheck=false`.
2. Every 30-60 min: call `GET /api/platform/waba/readiness?deepGraphCheck=true`.
3. Alert on:
   - active queue provider becomes `memory`
   - `waba.graphWebhookSubscribed=false`
   - `waba.PermissionAuditPassed=false`
   - high `runtime24h.failed`.

## 5) Notes

- `NU1900` warning (NuGet vulnerability feed unreachable) is tooling/network related, not a compile blocker.
- In production, `QueueProviders:StrictInProduction=true` now fails startup if configured external queue falls back to memory.
