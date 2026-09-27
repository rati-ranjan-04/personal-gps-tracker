import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Map,
  Marker,
  AttributionControl,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapHandle, MapProps } from "./MapView";
import type { Coord } from "../lib/types";
export default forwardRef<MapHandle, MapProps>(function VectorMap(p, ref) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Map | null>(null);
  const [ready, setReady] = useState(0);
  const styles = {
    Standard:
      import.meta.env.VITE_MAP_STYLE_URL ||
      "https://tiles.openfreemap.org/styles/positron",
    Dark:
      import.meta.env.VITE_DARK_MAP_STYLE_URL ||
      "https://tiles.openfreemap.org/styles/dark",
  };
  const style = () =>
    p.theme === "Terrain"
      ? {
          version: 8 as const,
          sources: {
            terrain: {
              type: "raster" as const,
              tiles: [
                import.meta.env.VITE_TERRAIN_TILE_URL ||
                  "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                "© OpenStreetMap contributors · © OpenTopoMap (CC-BY-SA)",
            },
          },
          layers: [
            { id: "terrain", type: "raster" as const, source: "terrain" },
          ],
        }
      : styles[p.theme as keyof typeof styles] || styles.Standard;
  useImperativeHandle(
    ref,
    () => ({
      zoom: (n) => {
        map.current?.zoomTo(map.current.getZoom() + n);
      },
      locate: (c) => {
        map.current?.flyTo({ center: c, zoom: 14, duration: 700 });
      },
      reset: () => {
        map.current?.easeTo({ bearing: 0, pitch: 0 });
      },
      center: () => {
        const c = map.current?.getCenter();
        return c ? [c.lng, c.lat] : [0, 20];
      },
      fit: (coords) => {
        if (coords.length)
          map.current?.fitBounds(
            coords.reduce(
              (b, c) => b.extend(c),
              new LngLatBounds(coords[0], coords[0]),
            ),
            {
              padding: { top: 90, left: 50, right: 50, bottom: 240 },
              maxZoom: 15,
            },
          );
      },
    }),
    [],
  );
  useEffect(() => {
    if (!container.current) return;
    let instance: Map | undefined;
    let resize: ResizeObserver | undefined;
    const timer = setTimeout(() => p.onFailure?.(), 18000);
    try {
      const initial =
        p.fix?.coords || p.origin?.coords || p.destination?.coords;
      instance = new Map({
        container: container.current,
        style: style(),
        center: initial || [0, 25],
        zoom: initial ? 13 : 2,
        attributionControl: false,
      });
      map.current = instance;
      instance.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: "© OpenStreetMap contributors · © OpenMapTiles",
        }),
        "bottom-right",
      );
      instance.on("style.load", () => {
        clearTimeout(timer);
        setReady((x) => x + 1);
        p.onStatus?.("ready");
      });
      instance.on("error", () => {
        if (!instance?.isStyleLoaded()) p.onFailure?.();
        else p.onStatus?.("error");
      });
      resize = new ResizeObserver(() => instance?.resize());
      resize.observe(container.current);
    } catch {
      p.onFailure?.();
    }
    return () => {
      clearTimeout(timer);
      resize?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (map.current) {
      p.onStatus?.("loading");
      map.current.setStyle(style());
    }
  }, [p.theme]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !instance.isStyleLoaded()) return;
    const lines = p.routes.map((r, index) => ({
      type: "Feature" as const,
      properties: { index, selected: index === p.selected, trace: false },
      geometry: { type: "LineString" as const, coordinates: r.coords },
    }));
    const segments = new globalThis.Map<number, Coord[]>();
    p.trace.forEach((f) => {
      const a = segments.get(f.segment) || [];
      a.push(f.coords);
      segments.set(f.segment, a);
    });
    segments.forEach((coords) => {
      if (coords.length > 1)
        lines.push({
          type: "Feature",
          properties: { index: -1, selected: false, trace: true },
          geometry: { type: "LineString", coordinates: coords },
        });
    });
    const data = { type: "FeatureCollection" as const, features: lines };
    if (instance.getSource("routes"))
      (instance.getSource("routes") as GeoJSONSource).setData(data);
    else instance.addSource("routes", { type: "geojson", data });
    if (!instance.getLayer("route-lines"))
      instance.addLayer({
        id: "route-lines",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["get", "trace"],
            "#bb8650",
            ["get", "selected"],
            "#2f785b",
            "#9aa896",
          ],
          "line-width": ["case", ["get", "selected"], 6, 4],
        },
      });
    const click = (event: any) => {
      const index = event.features?.[0]?.properties?.index;
      if (typeof index === "number" && index >= 0) p.onRoute(index);
    };
    instance.on("click", "route-lines", click);
    return () => {
      instance.off("click", "route-lines", click);
    };
  }, [p.routes, p.selected, p.trace, ready, p.onRoute]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const markers: Marker[] = [];
    const add = (
      coords: Coord,
      className: string,
      label: string,
      callback?: () => void,
    ) => {
      const element = document.createElement(callback ? "button" : "div");
      element.className = className;
      element.setAttribute("aria-label", label);
      element.title = label;
      element.innerHTML = "<span></span>";
      if (callback) element.onclick = callback;
      markers.push(new Marker({ element }).setLngLat(coords).addTo(instance));
    };
    if (p.fix)
      add(
        p.fix.coords,
        "origin-marker",
        `Your location, accuracy ${Math.round(p.fix.accuracy)} meters`,
      );
    else if (p.origin) add(p.origin.coords, "origin-marker", p.origin.name);
    if (p.destination)
      add(p.destination.coords, "destination-marker", p.destination.name);
    p.places.forEach((place) =>
      add(place.coords, "poi-marker", place.name, () => p.onPlace(place)),
    );
    return () => markers.forEach((m) => m.remove());
  }, [p.fix, p.origin, p.destination, p.places, p.onPlace, ready]);
  return (
    <div
      ref={container}
      className="map-canvas"
      aria-label="Interactive OpenStreetMap vector map"
    />
  );
});
