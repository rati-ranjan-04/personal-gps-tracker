export type Coord = [number, number];
export type Mode = "drive" | "cycle" | "walk" | "transit";
export type Place = {
  id: string;
  name: string;
  address: string;
  coords: Coord;
  category: string;
};
export type SavedPlace = Place & { savedAt: string };
export type Step = {
  text: string;
  road: string;
  distance: number;
  seconds: number;
  point: Coord;
};
export type Route = {
  id: string;
  coords: Coord[];
  distance: number;
  duration: number;
  steps: Step[];
  provider: string;
  label: string;
};
export type Fix = {
  coords: Coord;
  timestamp: number;
  accuracy: number;
  speed: number | null;
  segment: number;
};
export type Trip = {
  id: string;
  startedAt: string;
  endedAt: string;
  origin: Place;
  destination: Place;
  mode: Mode;
  distance: number;
  duration: number;
  points: Fix[];
};
export type Preferences = {
  avoidTolls: boolean;
  avoidHighways: boolean;
  strategy: "fastest" | "shortest";
  bicycleType: string;
  avoidHills: boolean;
  walkingPace: "normal" | "relaxed";
};
export type Settings = {
  appearance: "light" | "dark" | "system";
  mapStyle: "Standard" | "Dark" | "Terrain";
  units: "km" | "mi";
  mode: Mode;
  autoRecenter: boolean;
  saveHistory: boolean;
  voice: boolean;
  preferences: Preferences;
};
export type Profile = { name: string; avatar: string };
export type Region = {
  id: string;
  name: string;
  center: Coord;
  zoom: number;
  tiles: string[];
  bytes: number;
  createdAt: string;
  attribution: string;
};
export const defaults: Settings = {
  appearance: "system",
  mapStyle: "Standard",
  units: "km",
  mode: "drive",
  autoRecenter: true,
  saveHistory: true,
  voice: false,
  preferences: {
    avoidTolls: false,
    avoidHighways: false,
    strategy: "fastest",
    bicycleType: "Hybrid",
    avoidHills: false,
    walkingPace: "normal",
  },
};
export const categories = [
  "Restaurants",
  "Coffee",
  "Parks",
  "EV charging",
  "Parking",
  "Things to do",
  "Hospitals",
  "ATMs",
  "Fuel",
  "Pharmacies",
];
export const savedCategories = [
  "Home",
  "Work",
  "College",
  "Family",
  "Favorite",
  "Custom",
];
