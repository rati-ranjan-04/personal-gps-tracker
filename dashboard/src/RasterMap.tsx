import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapHandle, MapProps } from "./MapView";
const pointIcon =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const latLng = (point: [number, number]): L.LatLngTuple => [point[1], point[0]];
const RasterMap = forwardRef<MapHandle, MapProps>(function RasterMap(
  { route, destination, origin, theme, showRoute, categoryPlaces, onPlace },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      zoom: (amount) => {
        map.current?.setZoom((map.current?.getZoom() || 13) + amount);
      },
      locate: (coords) => {
        map.current?.flyTo(latLng(coords), 14, { duration: 1 });
      },
      reset: () => {
        map.current?.flyTo([37.785, -122.416], 13, { duration: 1 });
      },
    }),
    [],
  );
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
    }).setView([37.785, -122.416], 13);
    map.current = instance;
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const terrain = theme === "Terrain";
    const url = terrain
      ? "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
      : "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png";
    const layer = L.tileLayer(import.meta.env.VITE_RASTER_TILE_URL || url, {
      maxZoom: terrain ? 17 : 19,
      subdomains: "abc",
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
        (terrain
          ? "© OpenTopoMap (CC-BY-SA)"
          : '<a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>'),
    }).addTo(map.current);
    return () => {
      layer.remove();
    };
  }, [theme]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !showRoute) return;
    const group = L.layerGroup().addTo(instance);
    const points = route.coords.map(latLng);
    L.polyline(points, {
      color: "#fff",
      weight: 10,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    L.polyline(points, {
      color: "#357660",
      weight: 5,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    L.marker(latLng(origin), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "origin-marker",
        html: "<span></span>",
        iconSize: [35, 35],
        iconAnchor: [17, 17],
      }),
    }).addTo(group);
    const element = document.createElement("div");
    element.innerHTML = pointIcon;
    const label = document.createElement("div");
    label.className = "map-place-label";
    label.textContent = destination.name;
    element.appendChild(label);
    L.marker(latLng(destination.coords), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "destination-marker",
        html: element.innerHTML,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      }),
    }).addTo(group);
    if (route.source === "osrm")
      instance.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [60, 120],
        paddingBottomRight: [60, 250],
        maxZoom: 14,
      });
    return () => {
      group.remove();
    };
  }, [route, origin, destination, showRoute]);
  useEffect(() => {
    if (!map.current) return;
    const group = L.layerGroup().addTo(map.current);
    categoryPlaces.forEach((place) => {
      const button = document.createElement("button");
      button.className = "poi-marker";
      button.setAttribute("aria-label", place.name);
      button.innerHTML = pointIcon;
      const text = document.createElement("span");
      text.textContent = place.name;
      button.appendChild(text);
      button.onclick = () => onPlace(place);
      L.marker(latLng(place.coords), {
        icon: L.divIcon({
          className: "poi-container",
          html: button,
          iconSize: [29, 29],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
    });
    return () => {
      group.remove();
    };
  }, [categoryPlaces, onPlace]);
  return (
    <div
      ref={container}
      className={`map-canvas raster-map raster-${theme.toLowerCase()}`}
      aria-label="Interactive OpenStreetMap of San Francisco"
    />
  );
});
export default RasterMap;
