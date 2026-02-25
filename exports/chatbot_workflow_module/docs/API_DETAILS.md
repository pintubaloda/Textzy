# Chatbot + Workflow Builder API Details

Base backend route group: `/api/automation`
FAQ route group: `/api/automation/faq`

## Authentication / Headers
- `Authorization: Bearer <opaque_token>`
- `X-Tenant-Slug: <tenant-slug>`

## Node Catalog + Limits
- `GET /api/automation/catalogs/node-types`
  - Returns available node types used by the visual builder.
- `GET /api/automation/limits`
  - Returns automation limits and current usage counters.

## Flow CRUD
- `POST /api/automation/flows`
  - Create new bot/flow.
  - Body (`CreateAutomationFlowRequest`):
    - `name`, `description`, `channel` (`waba|sms`), `triggerType`, `triggerConfigJson`, `definitionJson`
- `GET /api/automation/flows`
  - List all flows with status, versions, run stats.
- `GET /api/automation/flows/{flowId}`
  - Flow details + versions.
- `PUT /api/automation/flows/{flowId}`
  - Update flow metadata.
- `DELETE /api/automation/flows/{flowId}`
  - Delete flow and related nodes/versions/runs/approvals.

## Publish Lifecycle
- `POST /api/automation/flows/{flowId}/unpublish`
- `POST /api/automation/flows/{flowId}/versions/{versionId}/publish`
- `POST /api/automation/flows/{flowId}/versions/{versionId}/rollback`

## Versions
- `GET /api/automation/flows/{flowId}/versions`
- `POST /api/automation/flows/{flowId}/versions`
  - Create draft version from builder JSON.

## Approvals
- `POST /api/automation/flows/{flowId}/approvals/request`
- `POST /api/automation/flows/{flowId}/approvals/{approvalId}/decide`

## Nodes
- `POST /api/automation/flows/{flowId}/nodes`
  - Add/Upsert node payload from builder.

## Execute / Debug
- `POST /api/automation/flows/{flowId}/simulate`
  - Dry run / test mode.
- `POST /api/automation/flows/{flowId}/run`
  - Live execution.
  - Supports `idempotencyKey` in payload.
- `GET /api/automation/runs?flowId=<guid>&limit=100`
- `GET /api/automation/runs/{runId}`

## Q&A Knowledge Base (used before handoff)
- `GET /api/automation/faq`
- `POST /api/automation/faq`
- `PUT /api/automation/faq/{id}`
- `DELETE /api/automation/faq/{id}`

## Frontend wiring (already present)
Main UI file:
- `frontend/src/pages/dashboard/AutomationsPage.jsx`

Main API helpers:
- `frontend/src/lib/api.js` (generic API wrappers)
- Automation page directly calls `/api/automation/*` and `/api/automation/faq/*`.

## Key Data Models
- `AutomationFlow`
- `AutomationFlowVersion`
- `AutomationNode`
- `AutomationRun`
- `FaqKnowledgeItem`
- DTOs: `AutomationRequests.cs`

## Notes for production
- Plan limits are enforced before create/publish.
- Idempotency is used for run requests.
- FAQ lookup is integrated in execution path before fallback/handoff.
