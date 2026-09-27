# Waypoint — Find your way, your way.

A personal GPS, navigation and trip-recording web app with the original Waypoint green palette, Manrope/DM Sans typography, desktop sidebar, and mobile map/bottom-sheet layout. Version 0.2 uses real open-map services and device-local user data. New profiles start empty; no sample trips or identities are mixed into user records.

## Run

Requires Node 24+ and npm:

```bash
cd dashboard
npm ci
cp .env.example .env
npm run dev -- --port 3000
```

Open http://localhost:3000. Production (including offline app shell):

```bash
npm run build
npm start
```

Use HTTPS outside localhost for geolocation, service workers and Cache Storage. Configure provider URLs in `.env` or process environment. `VITE_*` map settings are public **build-time** configuration; server provider credentials never use that prefix.

## Implemented

- Explicit location lookup with permission/loading/denial/timeout states, accuracy and map marker. No GPS access on startup.
- Debounced worldwide Photon place search, editable origin, recent searches and real Overpass nearby categories.
- Valhalla driving, cycling and walking routes with metrics, maneuvers and alternatives when returned. Supported costing preferences persist. Up to three intermediate stops are visited in the selected order.
- Dedicated navigation display, estimated remaining distance/time, nearby road instruction, recenter, exit, off-route recalculation and optional experimental browser speech. No live traffic estimates.
- Saved-place CRUD, coordinates, categories/icons, Home/Work and one-tap directions.
- Opt-in GPS trip recording with pause/resume, elapsed active time, distance, available speed and segmented trace. No connecting line/distance across paused intervals. Completed trips, filtering, details, replay and deletion. Recoverable unfinished recordings never restart tracking automatically.
- Actual-trip analytics: weekly/monthly totals, visited places, mode frequency, average duration, frequent routes and weekday morning activity. These are local descriptive statistics, not a trained predictive model.
- Local profile and appearance/unit/default-mode preferences; Privacy Center with permission status, export and scoped or complete local deletion.
- Map controls, loading/error/retry, correct data attribution and lazy map engines. MapLibre uses OpenFreeMap styles; Leaflet uses OSM France when WebGL2 is unavailable or vector style initialization fails. Terrain uses OpenTopoMap.

## Offline capability

The production service worker caches the application shell and lazy map code. Saved directions can be read offline. **Offline route calculation is not implemented.**

Area downloads are enabled only when `OFFLINE_TILE_URL` points to an operator-owned/licensed raster source that permits offline downloads. Set `OFFLINE_TILE_ATTRIBUTION` accurately. Do not configure public OSM tile servers for bulk downloading. An area currently contains a 3×3 neighborhood around its center at each zoom 12–15 (up to 36 tiles); coverage shrinks at higher zoom. Downloads show progress, actual stored bytes, cancellation and deletion. Browser storage may be evicted; download on the device you intend to use and verify availability before travel.

Transit requires `TRANSIT_ROUTER_URL`, a compatible Valhalla deployment with current local transit schedules. Without it, the interface explicitly reports transit unavailable. Public endpoints have rate/availability limits and no production SLA; configure maintained services or self-host Photon, Overpass, Valhalla and tiles for production volume.

## Data and privacy

GPS is requested by Locate, Start Trip or Navigate. Only explicit recording saves trace history. Pausing/stopping clears its watcher; ending navigation clears its watcher unless a trip is still recording. Browsers may suspend background tabs or locked-screen location: this is not a native background tracking service.

User data lives in versioned `localStorage`; downloaded tiles live in Cache Storage. It is **not encrypted or cloud-synchronized**. Same-origin scripts and anyone with access to the browser profile can access it. Export before clearing browser data. The earlier prototype's sample-data namespace is excluded; Privacy Center's complete deletion removes both namespaces.

Search text and search/route coordinates pass through `/api/navigation` to configured providers. Tile providers receive the visible map area and network address. Google Fonts is an external request. Host/API operators may retain request metadata. Recenter/recalculate or nearby search during navigation can send current coordinates; the complete recorded trace is not uploaded. For a controlled deployment, self-host all providers, styles' glyph/sprite/tile dependencies, and font assets, and configure logging/retention at the reverse proxy.

## Architecture

- `dashboard/src/components`: lazy map engines, search and accessible native dialogs.
- `dashboard/src/hooks`: permission-aware GPS lifecycle and explicit trip-recording state.
- `dashboard/src/lib`: typed records, storage boundary, distance/insight calculations, provider client and offline region downloads.
- `dashboard/server`: same-origin provider adapters, bounded input, timeout handling, basic per-process request limits and production HTTP server.
- `dashboard/api`: Vercel serverless entry points using the same adapters.

Backend auth, encryption, cloud synchronization, live sharing, native mobile background services, trained prediction, traffic, stop-order optimization and offline routing remain future work. Navigation estimates use nearest geometry/maneuver points and lack full map matching; verify real-device behavior before relying on turn-by-turn guidance. Put a TLS reverse proxy and durable/shared rate limits in front of a public self-hosted installation; the included limiter is per-process and keys on socket address.

## Deploy

```bash
docker build -t waypoint-web dashboard
docker run --rm -p 3000:3000 --env-file dashboard/.env waypoint-web
```

The non-root Node image serves both production assets and API endpoints. Runtime environment configures server providers. Custom public map URLs must be present during `npm run build`; for a custom Docker map build, supply those public values to the build stage before its build command. Do not copy private `.env` files into an image.

For Vercel, set `dashboard` as project root and configure private provider variables in project settings. `vercel.json` builds `dist`; functions in `api/` supply search, routing, discovery and permitted tile downloads.

## Verification

```bash
cd dashboard
npm test
npm run build
npm audit
```

Tests cover provider profile mapping, error boundaries, GPS quality/pause segments, actual-data analytics, corrupted records and offline tile selection. Browser verification uses explicitly synthetic GPS; physical-device background behavior and transit feeds require deployment-specific acceptance testing.

Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [OpenMapTiles](https://openmaptiles.org/). Rendering/data services: MapLibre GL JS, Leaflet, OpenFreeMap, OSM France, OpenTopoMap, Photon, Overpass and Valhalla. Respect each provider's attribution, licensing and usage policy.
