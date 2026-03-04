# Textzy macOS Desktop Shell

## Run
1. `cd desktop-macos`
2. `npm install`
3. `npm start`

## Build DMG
1. `npm run dist`
2. Output is generated under `desktop-macos/dist/`

## Notes
- This app opens:
  - `https://textzy-frontend-production.up.railway.app/login?platform=macos`
- Node integration is disabled.
- Request host allow-list is enforced in `main.js`.
