import test from "node:test";
import assert from "node:assert/strict";
import {
  isCoord,
  isTrip,
  isRoute,
  acceptFix,
  traceDistance,
  insights,
  positionPlace,
  remaining,
} from "../src/lib/domain.ts";
import { regionTiles } from "../src/lib/offline.ts";
import type { Fix, Trip, Route } from "../src/lib/types.ts";
const point: Fix = {
  coords: [-122.4, 37.7],
  timestamp: 10000,
  accuracy: 8,
  speed: 2,
  segment: 0,
};
const end: Fix = { ...point, coords: [-122.399, 37.7], timestamp: 15000 };
const trip: Trip = {
  id: "test",
  origin: positionPlace(point.coords, "Home"),
  destination: positionPlace(end.coords, "Work"),
  mode: "walk",
  startedAt: "2026-09-21T08:00:00Z",
  endedAt: "2026-09-21T08:20:00Z",
  distance: 1000,
  duration: 1200,
  points: [point, end],
};
test("corrupted coordinates and trip history never reach maps", () => {
  for (const c of [
    null,
    [],
    [181, 20],
    [30, 91],
    [NaN, 20],
    ["-122", 37],
    [0, 0, 0],
  ])
    assert.equal(isCoord(c), false);
  assert.equal(isTrip(trip), true);
  for (const patch of [
    { duration: Infinity },
    { startedAt: "bad" },
    { points: [] },
    { mode: "flight" },
    { destination: { ...trip.destination, coords: [] } },
  ])
    assert.equal(isTrip({ ...trip, ...patch }), false);
});
test("GPS sampling rejects noise, rapid duplicate updates and impossible jumps", () => {
  assert.equal(acceptFix(point, end), true);
  assert.equal(acceptFix(point, { ...end, accuracy: 200 }), false);
  assert.equal(acceptFix(point, { ...end, timestamp: 11000 }), false);
  assert.equal(acceptFix(point, { ...end, coords: [-120, 37] }), false);
  assert.equal(acceptFix(undefined, { ...point, accuracy: -1 }), false);
});
test("pauses do not bridge GPS distance across unrecorded travel", () => {
  const resumed = {
    ...end,
    coords: [-120, 37] as [number, number],
    segment: 1,
    timestamp: 30000,
  };
  assert.equal(
    traceDistance([point, end, resumed]),
    traceDistance([point, end]),
  );
  assert.ok(
    traceDistance([point, end]) > 80 && traceDistance([point, end]) < 100,
  );
});
test("insights are derived only from recorded trips and correct week/month", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(insights([], now).count, 0);
  const data = insights(
    [trip, { ...trip, id: "old", startedAt: "2026-08-01T12:00:00Z" }],
    now,
  );
  assert.equal(data.count, 2);
  assert.equal(data.distance, 2000);
  assert.equal(data.average, 1200);
  assert.equal(data.weekly.length, 1);
  assert.equal(data.monthly.length, 1);
  assert.deepEqual(data.modes, [["walk", 2]]);
});
test("route validation and remaining distance use actual geometry", () => {
  const route: Route = {
    id: "route",
    coords: [point.coords, end.coords],
    distance: 88,
    duration: 60,
    steps: [
      { text: "Arrive", road: "", distance: 0, seconds: 0, point: end.coords },
    ],
    provider: "Valhalla",
    label: "Recommended",
  };
  assert.equal(isRoute(route), true);
  assert.equal(isRoute({ ...route, distance: -1 }), false);
  assert.equal(remaining(route, end.coords).distance, 0);
  assert.equal(remaining(route, [-120, 37]).offRoute, true);
});
test("offline region tile selection is bounded and wraps the antimeridian", () => {
  for (const center of [
    [0, 0],
    [180, 85],
    [-180, -85],
  ] as [number, number][]) {
    const tiles = regionTiles(center);
    assert.ok(tiles.length <= 36 && tiles.length > 0);
    assert.equal(new Set(tiles).size, tiles.length);
    for (const tile of tiles) {
      const q = new URL(tile, "http://local").searchParams;
      const z = Number(q.get("z"));
      assert.ok(Number(q.get("x")) >= 0 && Number(q.get("x")) < 2 ** z);
      assert.ok(Number(q.get("y")) >= 0 && Number(q.get("y")) < 2 ** z);
    }
  }
});
