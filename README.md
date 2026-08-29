# Personal GPS Tracker

A consent-based personal location tracker for an explicitly authorized Android device. It provides a FastAPI backend, authenticated location ingestion, PostgreSQL-compatible persistence, a private Telegram bot, and a Leaflet/OpenStreetMap dashboard. It does not implement phone-number, SIM, cell-tower, stealth, spyware, or third-party tracking.

## Architecture

Android foreground location service → HTTPS FastAPI API → SQLite/PostgreSQL → private Telegram bot and authenticated dashboard.

## Quick start

Copy `.env.example` to `.env`, then set a long random `API_TOKEN`, `SECRET_KEY`, and a numeric `AUTHORIZED_TELEGRAM_USER_ID`. Keep `.env` private. For local development, install the backend dependencies and run:

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000/docs`. Serve the dashboard with `python -m http.server 8080 -d dashboard`, then set `localStorage.gpsApiToken` in the browser console to the API token. The dashboard reads `localStorage.gpsApiUrl`, defaulting to `http://localhost:8000`.

## API flow

Register the authorized Android device with `POST /api/device/register`, call `POST /api/tracking/start`, and send location payloads to `POST /api/location` every 30 seconds while tracking is active. Use `GET /api/location/latest`, `GET /api/location/history?limit=100`, and `GET /api/tracking/status` for reads. Stop with `POST /api/tracking/stop`; delete history only after a deliberate `DELETE /api/location/history` request.

Every protected request uses `Authorization: Bearer $API_TOKEN`. Coordinates and numeric fields are validated server-side. The backend rejects uploads from unregistered devices and rejects uploads when tracking is disabled.

## Telegram bot

Create a bot with Telegram's official BotFather, copy the token into `TELEGRAM_BOT_TOKEN`, and set your own numeric Telegram ID in `AUTHORIZED_TELEGRAM_USER_ID`. The bot supports `/start`, `/help`, `/location`, `/status`, `/track_on`, `/track_off`, and `/history`. All other users receive only `Unauthorized user.` and no device details.

Run it from the project root with `python telegram-bot/bot.py`. Never publish the token.

## Docker and production

For PostgreSQL and containers, copy `.env.example` to `.env`, change the example database password in `docker-compose.yml`, and run `docker compose up -d --build`. Put the backend behind HTTPS using a reverse proxy or managed platform, restrict `CORS_ORIGINS` to the dashboard origin, use a managed PostgreSQL database, and run the bot as a persistent service. Do not commit production secrets.

## Android client boundary

The repository currently contains the Python backend, bot, dashboard, tests, and deployment files. A native Kotlin client must be built in Android Studio with explicit fine/coarse location permission, a visible foreground-service notification, a stop action, configurable 10/15/30/60-second intervals, bounded offline queueing, and exponential retry. It must call the API only after the user starts tracking and must never transmit fake coordinates. For an emulator, `localhost` means the emulator itself; use `10.0.2.2:8000` for a host-machine backend. A physical device needs a LAN/VPN-reachable HTTPS URL.

## Testing

From `personal-gps-tracker`, install requirements and run `pytest -q tests`. Tests cover authentication, coordinate validation, registration, tracking state, upload, latest, and history. Before production, add Android instrumentation tests, reverse-proxy HTTPS tests, Telegram handler tests, and database-backup tests.

## Privacy

Location is collected only while tracking is enabled, tracking is visible, and the user can stop it at any time. Location history is stored according to the configured database. Keep the dashboard private, authorize exactly one Telegram account, rotate tokens if exposed, and use the clear-history endpoint to delete stored records.
