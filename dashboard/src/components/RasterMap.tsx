import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coord } from "../lib/types";
import type { MapHandle, MapProps } from "./MapView";
const ll = (c: Coord): L.LatLngTuple => [c[1], c[0]];
export default forwardRef<MapHandle, MapProps>(function RasterMap(p, ref) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      zoom: (n) => {
        map.current?.setZoom(map.current.getZoom() + n);
      },
      locate: (c) => {
        map.current?.flyTo(ll(c), 14, { duration: 0.7 });
      },
      reset: () => {
        if (p.fix) map.current?.flyTo(ll(p.fix.coords), 14);
        else if (p.destination) map.current?.panTo(ll(p.destination.coords));
      },
      center: () => {
        const c = map.current?.getCenter();
        return c ? [c.lng, c.lat] : [0, 20];
      },
      fit: (coords) => {
        if (coords.length)
          map.current?.fitBounds(L.latLngBounds(coords.map(ll)), {
            paddingTopLeft: [45, 80],
            paddingBottomRight: [45, 230],
            maxZoom: 15,
          });
      },
    }),
    [p.fix, p.destination],
  );
  useEffect(() => {
    if (!container.current) return;
    const initial = p.fix?.coords || p.origin?.coords || p.destination?.coords;
    const instance = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initial ? ll(initial) : [25, 0], initial ? 13 : 2);
    map.current = instance;
    L.control
      .attribution({ prefix: false, position: "bottomright" })
      .addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    p.onStatus?.("loading");
    let loaded = 0,
      errors = 0;
    const terrain = p.theme === "Terrain";
    const url = p.offline
      ? "/api/offline-tile?z={z}&x={x}&y={y}"
      : terrain
        ? import.meta.env.VITE_TERRAIN_TILE_URL ||
          "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        : import.meta.env.VITE_RASTER_TILE_URL ||
          "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png";
    const attribution = p.offline
      ? p.offlineAttribution
      : import.meta.env.VITE_RASTER_ATTRIBUTION ||
        `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ${terrain ? "OpenTopoMap (CC-BY-SA)" : "OpenStreetMap France"}`;
    const layer = L.tileLayer(url, {
      subdomains: "abc",
      minZoom: p.offline ? 12 : 2,
      maxZoom: p.offline ? 15 : terrain ? 17 : 19,
      attribution,
    }).addTo(instance);
    const timer = setTimeout(
      () => p.onStatus?.(loaded ? "ready" : "error"),
      15000,
    );
    layer.on("loading", () => {
      loaded = 0;
      errors = 0;
    });
    layer.on("tileload", () => {
      loaded++;
      p.onStatus?.("ready");
    });
    layer.on("tileerror", () => {
      errors++;
    });
    layer.on("load", () => {
      clearTimeout(timer);
      p.onStatus?.(loaded ? "ready" : errors ? "error" : "ready");
    });
    return () => {
      clearTimeout(timer);
      layer.off();
      layer.remove();
    };
  }, [p.theme, p.offline, p.offlineAttribution]);
  useEffect(() => {
    if (!map.current) return;
    const group = L.layerGroup().addTo(map.current);
    if (p.fix) {
      L.circle(ll(p.fix.coords), {
        radius: p.fix.accuracy,
        color: "#34745c",
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(group);
      L.circleMarker(ll(p.fix.coords), {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#2a7959",
        fillOpacity: 1,
      }).addTo(group);
    } else if (p.origin)
      L.circleMarker(ll(p.origin.coords), {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#668759",
        fillOpacity: 1,
      }).addTo(group);
    if (p.destination) {
      const marker = L.marker(ll(p.destination.coords), {
        icon: L.divIcon({
          className: "destination-marker",
          html: '<span aria-hidden="true">●</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        }),
        title: p.destination.name,
      });
      marker.bindTooltip(p.destination.name, { direction: "right" });
      marker.addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [p.fix, p.origin, p.destination]);
  useEffect(() => {
    if (!map.current) return;
    const group = L.layerGroup().addTo(map.current);
    p.routes.forEach((route, index) => {
      const chosen = index === p.selected;
      const line = L.polyline(route.coords.map(ll), {
        color: chosen ? "#2f785b" : "#9aa896",
        weight: chosen ? 6 : 4,
        opacity: chosen ? 1 : 0.65,
      }).addTo(group);
      line.on("click", () => p.onRoute(index));
      if (chosen) line.bringToFront();
    });
    return () => {
      group.remove();
    };
  }, [p.routes, p.selected, p.onRoute]);
  useEffect(() => {
    if (!map.current) return;
    const group = L.layerGroup().addTo(map.current);
    const segments = new Map<number, Coord[]>();
    p.trace.forEach((f) => {
      const points = segments.get(f.segment) || [];
      points.push(f.coords);
      segments.set(f.segment, points);
    });
    segments.forEach((points) =>
      L.polyline(points.map(ll), { color: "#bb8650", weight: 5 }).addTo(group),
    );
    return () => {
      group.remove();
    };
  }, [p.trace]);
  useEffect(() => {
    if (!map.current) return;
    const group = L.layerGroup().addTo(map.current);
    p.places.forEach((place) => {
      const button = document.createElement("button");
      button.className = "poi-marker";
      button.setAttribute("aria-label", `View ${place.name}`);
      button.textContent = "●";
      button.onclick = () => p.onPlace(place);
      L.marker(ll(place.coords), {
        icon: L.divIcon({
          className: "poi-container",
          html: button,
          iconSize: [32, 32],
        }),
      }).addTo(group);
    });
    return () => {
      group.remove();
    };
  }, [p.places, p.onPlace]);
  return (
    <div
      ref={container}
      className={`map-canvas raster-map raster-${p.theme.toLowerCase()}`}
      aria-label="Interactive OpenStreetMap"
    />
  );
});
