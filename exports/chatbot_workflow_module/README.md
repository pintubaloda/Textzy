# Textzy Chatbot + Workflow Builder Module Export

This package contains frontend and backend files for the chatbot + flow builder module.

## Folder Structure
- `frontend/`
  - `AutomationsPage.jsx` (builder UI + bot list + workflow + Q&A)
  - `api.js` (API utilities)
  - `index.css` (theme tokens)
- `backend/`
  - `AutomationController.cs` (flow runtime + CRUD + publish lifecycle)
  - `AutomationFaqController.cs` (Q&A KB CRUD)
  - DTO/model/context files for automation entities
- `docs/`
  - `API_DETAILS.md`
  - `COLOR_CODES.md`

## How to integrate
1. Drop backend controller/model/dto/context updates into your API project.
2. Ensure `/api/automation/*` and `/api/automation/faq/*` routes are enabled.
3. Use `AutomationsPage.jsx` in dashboard route (`/dashboard/automations`).
4. Keep `X-Tenant-Slug` + bearer token in frontend requests.

