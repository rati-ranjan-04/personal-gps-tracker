# Waypoint — Smart AI Navigation Platform

Waypoint is a responsive navigation workspace built with React, TypeScript, MapLibre GL and open geographic data. It is an early web foundation for a self-hosted, privacy-focused navigation platform.

## Run locally

Requires Node 24+ and npm. From the repository root:

```bash
cd dashboard
npm ci
npm run dev -- --port 3000
```

Open http://localhost:3000. To build and preview the production app, including its offline application shell:

```bash
npm run build
npm run preview -- --port 3000
```

## What works

- Responsive map and planning interface with standard, dark and terrain views. MapLibre renders vector maps when WebGL2 is available; Leaflet provides an interactive raster fallback.
- Curated San Francisco destination search, opt-in browser GPS lookup, origin selection and swapping, and up to three stops in the order selected.
- Live driving routes from OSRM with distance, estimated duration and written directions. Optional browser text-to-speech reads directions during a route preview.
- Saved places, local profile, opt-in history of *planned* trips, simple frequency-based destination suggestions, local data export and deletion.
- Saved route directions and a production service worker for the application shell. Route summaries remain available offline after a successful online visit.

The initial route and suggestion are labeled samples. Estimated times exclude live traffic. Saved trips are route plans, not recorded GPS travel. Search currently covers the curated San Francisco catalog.

## Data and privacy

The app requests browser GPS only after a user clicks the location control. A route request sends the selected coordinates to OSRM when the user asks to calculate a route. Maps load from OpenFreeMap, OpenStreetMap France and OpenTopoMap; those providers receive map requests and IP addresses. Google Fonts and one discovery photograph are also external resources. Device-local saved places, planned trips and preferences are stored in browser storage; that storage is not encrypted or synchronized. Users can export and delete it from the Privacy panel.

For a private deployment, set the browser-visible URLs in [`dashboard/.env.example`](dashboard/.env.example) to owned map and routing services. An owned vector style must reference owned glyph, sprite and tile endpoints as well. Dark and terrain layer URLs currently live in `dashboard/src/MapView.tsx` and `dashboard/src/RasterMap.tsx`. Replace fonts and imagery with local assets if those external requests are unwanted. Never put secrets in `VITE_*` variables. Follow each public provider's usage policy; use owned infrastructure for production volume and bulk map downloads.

## Deploy

The `dashboard/Dockerfile` builds and serves the static app:

```bash
docker build -t waypoint-web dashboard
docker run --rm -p 3000:80 waypoint-web
```

For Vercel, use `dashboard` as the project root. Its `vercel.json` builds the Vite application into `dist`. Serve over HTTPS for browser location access and service workers.

## Current scope

This repository contains the Waypoint web application. Production account registration, multi-device sync, native background GPS, a FastAPI/PostGIS service, encrypted storage, trained behavior models, stop-order optimization, full offline maps and routing, and transit/traffic feeds are future integrations. Walking, cycling and transit controls explain when a routing profile is unavailable rather than returning driving directions. The current suggestions use device-local planned-route frequency; they are not a trained AI model.

## Checks

From `dashboard`:

```bash
npm test
npm run build
npm audit
```
