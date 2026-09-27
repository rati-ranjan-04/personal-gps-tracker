import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const handler = require("./server/handler.cjs");
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "PHOTON_URL",
    "OVERPASS_URL",
    "VALHALLA_URL",
    "TRANSIT_ROUTER_URL",
    "ROUTING_API_KEY",
    "OFFLINE_TILE_URL",
    "OFFLINE_TILE_ATTRIBUTION",
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [
      react(),
      {
        name: "waypoint-api",
        configureServer(server) {
          server.middlewares.use("/api/navigation", handler);
          server.middlewares.use(
            "/api/offline-tile",
            require("./server/offline.cjs"),
          );
        },
        configurePreviewServer(server) {
          server.middlewares.use("/api/navigation", handler);
          server.middlewares.use(
            "/api/offline-tile",
            require("./server/offline.cjs"),
          );
        },
      },
    ],
    server: { host: "0.0.0.0", port: 3000 },
  };
});
