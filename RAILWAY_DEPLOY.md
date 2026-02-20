# Railway Deployment Guide (Textzy)

This repo is a monorepo with:
- `/backend-dotnet` (.NET 8 API)
- `/frontend` (React app built by CRACO, served by nginx)

## 1) Create Railway project

1. In Railway, create a **New Project**.
2. Connect GitHub repo: `pintubaloda/Textzy`.
3. Add a **PostgreSQL** service (plugin).

## 2) Deploy Backend Service

Create a new service from the same repo:
- **Source**: GitHub repo
- **Root Directory**: `backend-dotnet`
- **Builder**: Dockerfile
- **Dockerfile Path**: `backend-dotnet/Dockerfile`

Set backend environment variables:
- `ASPNETCORE_ENVIRONMENT=Production`
- `DATABASE_URL` = reference the Railway Postgres URL (or paste external URL)
- `AllowedOrigins=https://<your-frontend-domain>`
- `WhatsApp__AppId=<meta-app-id>`
- `WhatsApp__AppSecret=<meta-app-secret>`
- `WhatsApp__VerifyToken=<random-verify-token>`
- `WhatsApp__EmbeddedSignupConfigId=<meta-embedded-config-id>`
- `WhatsApp__GraphApiBase=https://graph.facebook.com`
- `WhatsApp__ApiVersion=v21.0`

Notes:
- Backend now auto-binds to Railway `$PORT`.
- No start command needed for Docker deploy.

## 3) Deploy Frontend Service

Create another service from the same repo:
- **Source**: GitHub repo
- **Root Directory**: `frontend`
- **Builder**: Dockerfile
- **Dockerfile Path**: `frontend/Dockerfile`

Set frontend environment variables (build-time):
- `REACT_APP_API_BASE=https://<your-backend-domain>`
- `REACT_APP_FACEBOOK_APP_ID=<meta-app-id>`
- `REACT_APP_WABA_EMBEDDED_CONFIG_ID=<meta-embedded-config-id>`
- `VITE_API_BASE=https://<your-backend-domain>`
- `VITE_FACEBOOK_APP_ID=<meta-app-id>`
- `VITE_WABA_EMBEDDED_CONFIG_ID=<meta-embedded-config-id>`

Notes:
- Frontend Docker image serves React SPA via nginx with route fallback to `index.html`.
- Frontend also auto-binds to Railway `$PORT`.

## 4) Custom Domains

1. Assign Railway-generated domains for backend and frontend.
2. (Optional) attach custom domains.
3. Update:
   - backend `AllowedOrigins`
   - frontend `REACT_APP_API_BASE`

## 5) WhatsApp Webhook Settings (Meta)

Use:
- **Webhook Callback URL**: `https://<backend-domain>/api/waba/webhook`
- **Verify Token**: same as `WhatsApp__VerifyToken`

## 6) First Login Check

After deploy:
1. Open frontend URL.
2. Login with seeded account (or your DB users).
3. Ensure API calls go to backend URL.
4. Test `/api/auth/me` and `/api/auth/projects`.

## 7) Troubleshooting

- 502/503 on backend:
  - verify `DATABASE_URL` is present and reachable.
- CORS errors:
  - add exact frontend domain in `AllowedOrigins`.
- WhatsApp verify fails:
  - callback URL/token mismatch between Meta and backend env.
- Session mismatch:
  - clear browser local storage and login again.
