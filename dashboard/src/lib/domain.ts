import type { Coord, Fix, Place, Trip, Route } from "./types.ts";
export const isCoord = (v: unknown): v is Coord =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every(Number.isFinite) &&
  Math.abs(v[0]) <= 180 &&
  Math.abs(v[1]) <= 90;
export function meters(a: Coord, b: Coord) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function acceptFix(previous: Fix | undefined, next: Fix) {
  if (
    !isCoord(next.coords) ||
    !Number.isFinite(next.timestamp) ||
    !Number.isInteger(next.segment) ||
    !Number.isFinite(next.accuracy) ||
    next.accuracy > 100 ||
    next.accuracy < 0
  )
    return false;
  if (!previous || previous.segment !== next.segment) return true;
  const seconds = (next.timestamp - previous.timestamp) / 1000;
  return seconds >= 3 && meters(previous.coords, next.coords) / seconds < 80;
}
export function traceDistance(points: Fix[]) {
  return points.reduce(
    (sum, p, i) =>
      sum +
      (i && points[i - 1].segment === p.segment
        ? meters(points[i - 1].coords, p.coords)
        : 0),
    0,
  );
}
export const formatDistance = (m: number, units = "km") =>
  units === "mi"
    ? `${(m / 1609.344).toFixed(1)} mi`
    : m < 1000
      ? `${Math.round(m)} m`
      : `${(m / 1000).toFixed(1)} km`;
export const formatDuration = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`
    : `${Math.max(0, Math.round(seconds / 60))} min`;
export function positionPlace(coords: Coord, name = "Current location"): Place {
  return {
    id: `point-${coords.join(",")}`,
    name,
    address: `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`,
    coords,
    category: "Custom",
  };
}
export function isPlace(v: any): v is Place {
  return (
    v &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.address === "string" &&
    typeof v.category === "string" &&
    isCoord(v.coords)
  );
}
export function isTrip(v: any): v is Trip {
  return (
    v &&
    typeof v.id === "string" &&
    Number.isFinite(Date.parse(v.startedAt)) &&
    Number.isFinite(Date.parse(v.endedAt)) &&
    isPlace(v.origin) &&
    isPlace(v.destination) &&
    ["drive", "cycle", "walk", "transit"].includes(v.mode) &&
    Number.isFinite(v.distance) &&
    v.distance >= 0 &&
    Number.isFinite(v.duration) &&
    v.duration >= 0 &&
    Array.isArray(v.points) &&
    v.points.length > 0 &&
    v.points.every(
      (p: any) =>
        isCoord(p?.coords) &&
        Number.isFinite(p.timestamp) &&
        Number.isInteger(p.segment) &&
        Number.isFinite(p.accuracy) &&
        p.accuracy >= 0 &&
        (p.speed === null || (Number.isFinite(p.speed) && p.speed >= 0)),
    )
  );
}
export function isRoute(v: any): v is Route {
  return (
    v &&
    typeof v.id === "string" &&
    Array.isArray(v.coords) &&
    v.coords.length >= 2 &&
    v.coords.every(isCoord) &&
    Number.isFinite(v.distance) &&
    v.distance >= 0 &&
    Number.isFinite(v.duration) &&
    v.duration >= 0 &&
    Array.isArray(v.steps) &&
    v.steps.every((s: any) => typeof s.text === "string" && isCoord(s.point))
  );
}
export function insights(trips: Trip[], now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const monthly = trips.filter(
    (t) =>
      new Date(t.startedAt).getMonth() === now.getMonth() &&
      new Date(t.startedAt).getFullYear() === now.getFullYear(),
  );
  const weekly = trips.filter(
    (t) => new Date(t.startedAt) >= monday && new Date(t.startedAt) <= now,
  );
  const tally = (key: (t: Trip) => string) =>
    Object.entries(
      trips.reduce<Record<string, number>>((acc, t) => {
        const k = key(t);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
  const label = (p: Place) =>
    /^(Trip|Recovered) (start|end)$/.test(p.name)
      ? `${p.coords[1].toFixed(3)}, ${p.coords[0].toFixed(3)}`
      : p.name;
  const destinations = tally((t) => label(t.destination)),
    modes = tally((t) => t.mode),
    routes = tally((t) => `${label(t.origin)} → ${label(t.destination)}`);
  const days = Array.from({ length: 7 }, (_, i) => ({
    label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    distance: weekly
      .filter((t) => (new Date(t.startedAt).getDay() + 6) % 7 === i)
      .reduce((n, t) => n + t.distance, 0),
  }));
  const morning = trips.filter((t) => {
    const d = new Date(t.startedAt);
    return (
      d.getDay() > 0 && d.getDay() < 6 && d.getHours() >= 6 && d.getHours() < 10
    );
  }).length;
  return {
    count: trips.length,
    distance: trips.reduce((n, t) => n + t.distance, 0),
    average: trips.length
      ? trips.reduce((n, t) => n + t.duration, 0) / trips.length
      : 0,
    weekly,
    monthly,
    destinations,
    modes,
    routes,
    days,
    morning,
  };
}
export function remaining(route: Route, coords: Coord) {
  let nearest = 0,
    min = Infinity;
  route.coords.forEach((p, i) => {
    const d = meters(coords, p);
    if (d < min) {
      min = d;
      nearest = i;
    }
  });
  const left = route.coords
    .slice(nearest)
    .reduce((n, p, i, a) => n + (i ? meters(a[i - 1], p) : 0), 0);
  return {
    distance: left,
    seconds: route.duration * (left / Math.max(1, route.distance)),
    offRoute: min > 100,
    nearest,
  };
}
