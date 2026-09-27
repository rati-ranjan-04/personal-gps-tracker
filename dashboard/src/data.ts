export type Place = {
  id: string;
  name: string;
  address: string;
  coords: [number, number];
  category: string;
  minutes: number;
};
export const places: Place[] = [
  {
    id: "ferry",
    name: "Ferry Building",
    address: "1 Ferry Building, Embarcadero",
    coords: [-122.3937, 37.7955],
    category: "Landmark",
    minutes: 12,
  },
  {
    id: "home",
    name: "Home",
    address: "Hayes Valley, San Francisco",
    coords: [-122.4241, 37.7768],
    category: "Personal",
    minutes: 8,
  },
  {
    id: "work",
    name: "Work",
    address: "535 Mission Street",
    coords: [-122.3984, 37.7898],
    category: "Personal",
    minutes: 10,
  },
  {
    id: "golden",
    name: "Golden Gate Park",
    address: "501 Stanyan Street, San Francisco",
    coords: [-122.4548, 37.7694],
    category: "Parks",
    minutes: 18,
  },
  {
    id: "coffee",
    name: "Blue Bottle Coffee",
    address: "315 Linden Street, Hayes Valley",
    coords: [-122.4239, 37.7764],
    category: "Coffee",
    minutes: 8,
  },
  {
    id: "dolores",
    name: "Mission Dolores Park",
    address: "Dolores Street & 19th Street",
    coords: [-122.4269, 37.7596],
    category: "Parks",
    minutes: 14,
  },
  {
    id: "tartine",
    name: "Tartine Bakery",
    address: "600 Guerrero Street",
    coords: [-122.4241, 37.7614],
    category: "Restaurants",
    minutes: 13,
  },
  {
    id: "palace",
    name: "Palace of Fine Arts",
    address: "3601 Lyon Street",
    coords: [-122.4484, 37.8029],
    category: "Things to do",
    minutes: 21,
  },
  {
    id: "charging",
    name: "EVgo Charging Station",
    address: "Whole Foods, 450 Rhode Island Street",
    coords: [-122.4027, 37.7645],
    category: "EV charging",
    minutes: 9,
  },
  {
    id: "parking",
    name: "Fifth & Mission Garage",
    address: "833 Mission Street",
    coords: [-122.4067, 37.7831],
    category: "Parking",
    minutes: 6,
  },
];
export const origin: [number, number] = [-122.4168, 37.7749];
export const previewRoute: [number, number][] = [
  origin,
  [-122.4157, 37.7758],
  [-122.414, 37.7771],
  [-122.4117, 37.779],
  [-122.4094, 37.7808],
  [-122.4072, 37.7825],
  [-122.4049, 37.7842],
  [-122.4025, 37.7861],
  [-122.4004, 37.7878],
  [-122.3981, 37.7895],
  [-122.3954, 37.7917],
  [-122.3934, 37.7933],
  [-122.3937, 37.7955],
];
export type Trip = {
  id: string;
  destination: Place;
  date: string;
  distance: number;
  duration: number;
  mode: string;
};
export type Route = {
  coords: [number, number][];
  distance: number;
  duration: number;
  source: "preview" | "osrm";
  steps: string[];
};
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`waypoint-${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function distance(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) *
      Math.cos(b[1] * r) *
      Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function isPlace(value: unknown): value is Place {
  return (
    isRecord(value) &&
    ["id", "name", "address", "category"].every(
      (key) => typeof value[key] === "string",
    ) &&
    isCoordinate(value.coords) &&
    typeof value.minutes === "number" &&
    Number.isFinite(value.minutes) &&
    value.minutes >= 0
  );
}
export function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isPlace(value.destination) &&
    typeof value.date === "string" &&
    Number.isFinite(Date.parse(value.date)) &&
    typeof value.mode === "string" &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    value.distance >= 0 &&
    typeof value.duration === "number" &&
    Number.isFinite(value.duration) &&
    value.duration >= 0
  );
}
export function isRoute(value: unknown): value is Route {
  return (
    isRecord(value) &&
    Array.isArray(value.coords) &&
    value.coords.length > 1 &&
    value.coords.every(isCoordinate) &&
    (value.source === "preview" || value.source === "osrm") &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    value.distance >= 0 &&
    typeof value.duration === "number" &&
    Number.isFinite(value.duration) &&
    value.duration >= 0 &&
    Array.isArray(value.steps) &&
    value.steps.length > 0 &&
    value.steps.every((step) => typeof step === "string")
  );
}
