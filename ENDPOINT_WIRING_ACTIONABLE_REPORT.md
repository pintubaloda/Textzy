# Endpoint Wiring Actionable Report

Generated: 2026-03-06 23:13:02 +05:30

## Summary
- Backend routes not referenced by frontend: 105
- Expected internal-only routes: 40
- Frontend wiring candidates: 65
- High priority candidates: 38
- Medium priority candidates: 16
- Low priority candidates: 11

## High Priority Wiring Candidates
- /api/automation/catalogs/node-types
- /api/automation/faq/{id:guid}
- /api/automation/flow-json-schema
- /api/automation/flows/{flowId:guid}
- /api/automation/flows/{flowId:guid}/approvals/{approvalId:guid}/decide
- /api/automation/flows/{flowId:guid}/approvals/request
- /api/automation/flows/{flowId:guid}/data-exchange
- /api/automation/flows/{flowId:guid}/import-meta
- /api/automation/flows/{flowId:guid}/nodes
- /api/automation/flows/{flowId:guid}/run
- /api/automation/flows/{flowId:guid}/send-flow
- /api/automation/flows/{flowId:guid}/simulate
- /api/automation/flows/{flowId:guid}/unpublish
- /api/automation/flows/{flowId:guid}/versions
- /api/automation/flows/{flowId:guid}/versions/{versionId:guid}/publish
- /api/automation/flows/{flowId:guid}/versions/{versionId:guid}/rollback
- /api/automation/flows/{flowId:guid}/versions/{versionId:guid}/validate
- /api/automation/meta/flows/{metaFlowId}
- /api/automation/meta/flows/{metaFlowId}/publish
- /api/automation/metrics/flows
- /api/automation/metrics/flows/events
- /api/automation/runs
- /api/automation/runs/{runId:guid}
- /api/automation/trigger-audit
- /api/inbox/conversations/{id:guid}/assign
- /api/inbox/conversations/{id:guid}/labels
- /api/inbox/conversations/{id:guid}/messages
- /api/inbox/conversations/{id:guid}/notes
- /api/inbox/conversations/{id:guid}/transfer
- /api/team/members/{userId:guid}
- /api/team/members/{userId:guid}/activity
- /api/team/members/{userId:guid}/permissions
- /api/team/members/{userId:guid}/role
- /api/template-lifecycle/{id:guid}/approve
- /api/template-lifecycle/{id:guid}/disable
- /api/template-lifecycle/{id:guid}/reject
- /api/template-lifecycle/{id:guid}/submit
- /api/template-lifecycle/{id:guid}/version

## Medium Priority Wiring Candidates
- /api/billing/invoices/{invoiceId:guid}/download
- /api/billing/invoices/{invoiceId:guid}/verify
- /api/billing/reconciliation/export
- /api/billing/usage/resync
- /api/campaigns/{id:guid}
- /api/contact-data/contacts/{contactId:guid}/custom-fields
- /api/contact-data/contacts/{contactId:guid}/opt-in
- /api/contacts/{id:guid}
- /api/sms/compliance/opt-outs/{id:guid}
- /api/sms/flows/{id:guid}
- /api/sms/inputs/{id:guid}
- /api/sms/sender/{id:guid}
- /api/sms/sender/stats
- /api/sms/senders/{id:guid}
- /api/sms/templates/{id:guid}
- /api/sms/templates/{id:guid}/status

## Low Priority Wiring Candidates
- /api/auth/accept-invite
- /api/auth/devices/{deviceId:guid}
- /api/auth/devices/pair-qr-image
- /api/auth/email-verification/link
- /api/auth/invite-preview
- /api/contact-groups/{id:guid}
- /api/messages/media/{mediaId}
- /api/templates/{id:guid}
- /api/templates/{id:guid}/presets
- /api/tenants
- /api/waba/status

## Expected Internal-Only Routes (No Frontend Wiring Needed)
- /api/email/webhook/resend
- /api/outbound/deadletters
- /api/payments/webhook/{provider}
- /api/platform/billing/plans/{id:guid}
- /api/platform/customers
- /api/platform/customers/{tenantId:guid}
- /api/platform/customers/{tenantId:guid}/activity
- /api/platform/customers/{tenantId:guid}/assign-plan
- /api/platform/customers/{tenantId:guid}/features
- /api/platform/customers/{tenantId:guid}/invoices
- /api/platform/customers/{tenantId:guid}/members
- /api/platform/customers/{tenantId:guid}/subscriptions
- /api/platform/customers/{tenantId:guid}/usage
- /api/platform/customers/users
- /api/platform/outbound-deadletters
- /api/platform/security/signals/{id:guid}/resolve
- /api/platform/settings/{scope}
- /api/platform/tenants
- /api/platform/waba/lookup/by-phone-number-id
- /api/platform/waba/lookup/by-waba-id
- /api/platform/waba/meta/{businessId}/system_users
- /api/platform/waba/meta/{wabaId}/assigned_users
- /api/platform/waba/meta/assigned-users
- /api/platform/waba/meta/businesses
- /api/platform/waba/meta/owned-wabas
- /api/platform/waba/meta/phone-numbers
- /api/platform/waba/meta/register-phone
- /api/platform/waba/meta/subscribed-apps
- /api/platform/waba/meta/system-users
- /api/platform/waba/readiness
- /api/platform/waba-error-policies/{code}
- /api/public/app-updates/manifest
- /api/public/mobile/download
- /api/public/plans
- /api/sms/webhook/tata
- /api/sms/webhook/tata/inbound
- /api/waba/debug/graph-probe
- /api/waba/smoke/readiness
- /api/waba/smoke/run
- /api/waba/webhook
