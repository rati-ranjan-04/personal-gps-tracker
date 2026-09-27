# Waypoint — Smart AI Navigation Platform

A responsive, privacy-conscious navigation workspace built with React, TypeScript, MapLibre GL and open geographic data. The original authenticated FastAPI device tracker remains available at `/tracker.html`.

## Run the navigation workspace

Requires Node 24+ and npm. From the repository root:

```bash
cd dashboard
npm ci
npm run dev -- --port 3000
```

Open http://localhost:3000. For a production build (including offline application shell):

```bash
npm run build
npm run preview -- --port 3000
```

### Available today

- Responsive Explore workspace, saved places, local trip plans, insights, profile, and privacy settings.
- MapLibre vector maps with a Leaflet raster fallback when WebGL2 is unavailable; standard, dark and terrain views; pan/zoom and POI filters.
- Curated San Francisco destination search, explicit browser GPS lookup, origin selection and swapping, up to three ordered stops.
- Real driving routes from OSRM with distance, estimated duration and written directions. Manually advance through route previews; optional browser text-to-speech.
- Opt-in local trip history, frequency-based destination suggestions, editable local profile, JSON export and confirmed deletion of application data.
- Locally saved route directions and a production service worker for the application shell. Map tiles are not downloaded or cached by the service worker. Offline directions require one successful online load of the production build.

The initial route and destination suggestion are labeled samples. All travel estimates exclude live traffic. Saved trips are route plans, not proof of travel or recorded GPS tracks. Search is limited to the curated SF catalog. Browser storage is not encrypted and is not synchronized.

### Self-hosting and data providers

The default vector styles use OpenFreeMap, raster fallback uses OpenStreetMap France, and terrain uses OpenTopoMap. These providers receive IP addresses and map requests. Routing sends only explicitly selected route coordinates to public OSRM when **Find my route** is pressed. Browser GPS is requested only after an explicit click. Google Fonts and the discovery photograph are external resources; host replacements locally for a deployment without these external requests.

Set the browser-visible build variables in `dashboard/.env.example` to your own map style, raster tile server and OSRM HTTP endpoint. Do not put secrets in `VITE_*` variables. Map styles must also reference your own glyphs, sprites and tile endpoints to fully self-host. Named Dark and Terrain styles currently use public providers; configure their URLs in `src/MapView.tsx` and `src/RasterMap.tsx` when making a completely private deployment. Follow each public provider's usage policy; use owned infrastructure for production volume, bulk download or offline maps.

A static container definition is included:

```bash
docker build -t waypoint-web dashboard
# Frontend only; the device tracker API requires the authenticated Vercel proxy.
docker run --rm -p 3000:80 waypoint-web
```

For Vercel, keep the project root at `dashboard`; `vercel.json` configures the Vite build and preserves the existing `/api` serverless functions. `/tracker.html` uses those authenticated functions. The static nginx container deliberately returns 503 for `/api/` until an authenticated server integration is configured. Serve over HTTPS for browser location, service workers and secure tracker sessions.

### Platform boundaries and next stages

This is a working web foundation, not the complete production ecosystem. Account registration/sync, native background GPS, encrypted local vaults, PostGIS/Redis services, trained behavioral ML models, optimized stop ordering, full offline maps/routing, traffic and GTFS transit feeds are not implemented. Walking, cycling and transit controls explain the missing routing profiles rather than presenting driving results as those modes. The existing tracker backend uses SQLite/PostgreSQL and token authentication.

Next integration points are a multi-user FastAPI identity layer, consent-scoped trip ingestion into PostGIS, a local encrypted store, OSRM/Valhalla profile services, and an opt-in prediction pipeline. Frequency suggestions currently operate only on device-local saved route plans; no LSTM, transformer or reinforcement-learning model is claimed.

### Validation

Run `npm run build` and `npm audit` from `dashboard`, plus the existing backend and proxy checks below. The backend requires Python 3.10+ (verified with 3.12); Python 3.9 cannot evaluate its existing union annotations.

---

## Original device tracker


A consent-based personal location tracker for one explicitly authorized Android device. It provides a FastAPI backend, authenticated location ingestion, SQLite/PostgreSQL-compatible persistence, a private Telegram bot, and a Leaflet/OpenStreetMap dashboard. It does not implement phone-number, SIM, cell-tower, stealth, spyware, or third-party tracking.

## Architecture

Android foreground location service → HTTPS FastAPI API on Render → SQLite/PostgreSQL → private Telegram bot. The dashboard is served by Vercel. Browser requests use Vercel same-origin serverless proxy routes, which inject the backend bearer token server-side. The Render URL and token are never placed in frontend JavaScript, localStorage, or query strings.

## Local backend

Copy `.env.example` to `.env`, set a long random `API_TOKEN` and a different `SECRET_KEY`, and keep `.env` private. Then run:

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000/`, `http://localhost:8000/api/health`, and `http://localhost:8000/docs`. The root route returns `{"status":"ok"}` so container health checks do not report a misleading 404.

## Vercel deployment

Create a Vercel project from this repository with **Root Directory** set to `dashboard`. The dashboard contains a Vite React application plus the `dashboard/api` serverless functions. Use `npm run build` with output directory `dist`, as configured by `dashboard/vercel.json`. Open `/tracker.html` for secure device tracking. In Vercel Project Settings → Environment Variables, add only:

```text
API_TOKEN=<the same token configured on Render>
```

`BACKEND_URL` is optional. If omitted, the proxy uses `https://personal-gps-tracker.onrender.com`. Add `BACKEND_URL` only if the Render service URL changes. Do not add `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, or `SECRET_KEY` to the browser-facing project.

Open `/tracker.html` on the Vercel site and enter the same token in the secure access form. The form creates an HttpOnly, Secure, SameSite session cookie. The token is not stored in browser storage and is never sent directly to Render from the browser. Requests to `/api/tracking/*`, `/api/location/*`, and `/api/device/*` are forwarded by Vercel with a server-side `Authorization: Bearer` header.

## Render deployment

Create a Render Web Service from this repository with:

```text
Root Directory: personal-gps-tracker
Runtime: Docker
Dockerfile Path: backend/Dockerfile
Branch: main
```

Set these environment variables on Render:

```text
API_TOKEN=<the same token configured on Vercel>
SECRET_KEY=<a different long random secret>
DATABASE_URL=<Render PostgreSQL URL, preferably the internal URL>
CORS_ORIGINS=https://personal-gps-tracker.vercel.app
```

For a short-lived test, `sqlite:///./gps_tracker.db` can run, but a managed PostgreSQL database is required for durable production history. After saving variables, deploy the latest commit. Verify:

```text
https://<your-render-service>.onrender.com/
https://<your-render-service>.onrender.com/api/health
```

Both should return `{"status":"ok"}`. The default proxy target is `https://personal-gps-tracker.onrender.com`; use the optional Vercel `BACKEND_URL` variable if your actual Render service URL is different.

## API flow

Register the authorized Android device with `POST /api/device/register`, call `POST /api/tracking/start`, and send location payloads to `POST /api/location` every 30 seconds while tracking is active. Use `GET /api/location/latest`, `GET /api/location/history?limit=100`, and `GET /api/tracking/status` for reads. Stop with `POST /api/tracking/stop`; delete history only after a deliberate `DELETE /api/location/history` request.

Protected requests require `Authorization: Bearer $API_TOKEN`. Coordinates and numeric fields are validated server-side. The backend rejects uploads from unregistered devices and rejects uploads when tracking is disabled. `POST /api/tracking/start` and `GET /api/tracking/status` require at least one authorized device registered through `POST /api/device/register`; without one they return HTTP 409 with `Authorized device not registered`. The dashboard displays that safe response directly instead of mislabeling it as an API outage.

## Telegram bot

Create a bot with Telegram's official BotFather, copy the token into `TELEGRAM_BOT_TOKEN`, and set your own numeric Telegram ID in `AUTHORIZED_TELEGRAM_USER_ID`. The bot supports `/start`, `/help`, `/location`, `/status`, `/track_on`, `/track_off`, and `/history`. All other users receive only `Unauthorized user.` and no device details. Run it from the project root with `python telegram-bot/bot.py`. Never publish the Telegram token.

## Testing

From the repository root, install backend requirements and run:

```bash
PYTHONPATH=. pytest -q tests
node --check dashboard/app.js
node --check dashboard/api/session.js
node --check 'dashboard/api/[...path].js'
node tests/test_vercel_proxy.js
```

Tests cover authentication, coordinate validation, registration, tracking state, upload, latest, and history. The dashboard proxy should also be tested after deployment by logging in through the Vercel form and verifying that no API token appears in browser localStorage or the page source.

## Android client boundary

The repository contains the Python backend, bot, dashboard, tests, and deployment files. A native Kotlin client must be built in Android Studio with explicit fine/coarse location permission, a visible foreground-service notification, a stop action, configurable 10/15/30/60-second intervals, bounded offline queueing, and exponential retry. It must call the API only after the user starts tracking and must never transmit fake coordinates. For an emulator, `localhost` means the emulator itself; use `10.0.2.2:8000` for a host-machine backend. A physical device needs a LAN/VPN-reachable HTTPS URL.

## Privacy and security

Location is collected only while tracking is enabled, tracking is visible, and the user can stop it at any time. Location history is stored according to the configured database. Keep the dashboard private, authorize exactly one Telegram account, rotate tokens if exposed, and use the clear-history endpoint to delete stored records. Phone-number location lookup, SIM tracking, hidden surveillance, and permission bypass are intentionally unsupported.
