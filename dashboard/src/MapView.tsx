import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import type { Place, Route } from "./data";
import RasterMap from "./RasterMap";

export type MapHandle = {
  zoom: (amount: number) => void;
  locate: (coords: [number, number]) => void;
  reset: () => void;
};
export type MapProps = {
  route: Route;
  destination: Place;
  origin: [number, number];
  theme: string;
  showRoute: boolean;
  categoryPlaces: Place[];
  onPlace: (place: Place) => void;
};
const styles: Record<string, string | StyleSpecification> = {
  Standard: "https://tiles.openfreemap.org/styles/positron",
  Dark: "https://tiles.openfreemap.org/styles/dark",
  Terrain: {
    version: 8,
    sources: {
      terrain: {
        type: "raster",
        tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution:
          "© OpenStreetMap contributors · SRTM | © OpenTopoMap (CC-BY-SA)",
        maxzoom: 17,
      },
    },
    layers: [{ id: "terrain", type: "raster", source: "terrain" }],
  },
};
const pointIcon =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const VectorMap = forwardRef<MapHandle, MapProps>(function VectorMap(
  { route, destination, origin, theme, showRoute, categoryPlaces, onPlace },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      zoom: (amount) =>
        map.current?.zoomTo((map.current?.getZoom() ?? 13) + amount),
      locate: (coords) =>
        map.current?.flyTo({ center: coords, zoom: 14.5, duration: 1000 }),
      reset: () =>
        map.current?.flyTo({
          center: [-122.416, 37.785],
          zoom: 12.75,
          bearing: 0,
          pitch: 0,
          duration: 900,
        }),
    }),
    [],
  );
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({
        container: container.current,
        style: import.meta.env.VITE_MAP_STYLE_URL || styles.Standard,
        center: [-122.416, 37.785],
        zoom: 12.75,
        minZoom: 3,
        maxZoom: 18,
        attributionControl: false,
      });
      map.current = instance;
      instance.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      instance.on("load", () => {
        setLoaded(true);
        setError(false);
      });
      instance.on("error", () => {
        if (!instance.isStyleLoaded()) setError(true);
      });
      const resize = new ResizeObserver(() => instance.resize());
      resize.observe(container.current);
      return () => {
        resize.disconnect();
        instance.remove();
        map.current = null;
      };
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: route.coords },
    };
    const draw = () => {
      if (!instance.getSource("journey"))
        instance.addSource("journey", { type: "geojson", data });
      else (instance.getSource("journey") as GeoJSONSource).setData(data);
      if (!instance.getLayer("journey-casing"))
        instance.addLayer({
          id: "journey-casing",
          type: "line",
          source: "journey",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 10 },
        });
      if (!instance.getLayer("journey-line"))
        instance.addLayer({
          id: "journey-line",
          type: "line",
          source: "journey",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2e7966", "line-width": 5 },
        });
      ["journey-casing", "journey-line"].forEach((id) =>
        instance.setLayoutProperty(
          id,
          "visibility",
          showRoute ? "visible" : "none",
        ),
      );
    };
    if (instance.isStyleLoaded()) draw();
    instance.on("style.load", draw);
    const originElement = document.createElement("div");
    originElement.className = "origin-marker";
    originElement.innerHTML = "<span></span>";
    const destinationElement = document.createElement("div");
    destinationElement.className = "destination-marker";
    destinationElement.innerHTML = pointIcon;
    const label = document.createElement("div");
    label.className = "map-place-label";
    label.textContent = destination.name;
    destinationElement.appendChild(label);
    const markers: maplibregl.Marker[] = [];
    if (showRoute) {
      markers.push(
        new maplibregl.Marker({ element: originElement })
          .setLngLat(origin)
          .addTo(instance),
      );
      markers.push(
        new maplibregl.Marker({ element: destinationElement, anchor: "bottom" })
          .setLngLat(destination.coords)
          .addTo(instance),
      );
    }
    return () => {
      instance.off("style.load", draw);
      markers.forEach((marker) => marker.remove());
    };
  }, [loaded, route, destination, origin, showRoute]);
  useEffect(() => {
    if (!map.current || !loaded) return;
    map.current.setStyle(
      theme === "Standard"
        ? import.meta.env.VITE_MAP_STYLE_URL || styles.Standard
        : styles[theme],
    );
  }, [theme, loaded]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || route.source !== "osrm") return;
    const bounds = route.coords.reduce(
      (bounds, point) => bounds.extend(point),
      new maplibregl.LngLatBounds(route.coords[0], route.coords[0]),
    );
    instance.fitBounds(bounds, { padding: 110, maxZoom: 14.5, duration: 1200 });
  }, [route, loaded]);
  useEffect(() => {
    if (!map.current || !loaded) return;
    const markers = categoryPlaces.map((place) => {
      const element = document.createElement("button");
      element.className = "poi-marker";
      element.setAttribute("aria-label", place.name);
      element.innerHTML = pointIcon;
      const label = document.createElement("span");
      label.textContent = place.name;
      element.appendChild(label);
      element.onclick = () => onPlace(place);
      return new maplibregl.Marker({ element })
        .setLngLat(place.coords)
        .addTo(map.current!);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [categoryPlaces, loaded, onPlace]);
  return (
    <>
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive OpenStreetMap of San Francisco"
      />
      {error && !loaded && (
        <div className="map-error">
          Map tiles are unavailable. Check your connection to load the map.
        </div>
      )}
    </>
  );
});
const MapView = forwardRef<MapHandle, MapProps>(function MapView(props, ref) {
  const [webgl] = useState(() => {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      if (!context) return false;
      context.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  });
  return webgl ? (
    <VectorMap ref={ref} {...props} />
  ) : (
    <RasterMap ref={ref} {...props} />
  );
});
export default MapView;
