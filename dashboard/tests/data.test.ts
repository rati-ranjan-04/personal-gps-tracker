import test from "node:test";
import assert from "node:assert/strict";
import {
  isCoordinate,
  isPlace,
  isTrip,
  isRoute,
  places,
  previewRoute,
  readLocal,
} from "../src/data.ts";

test("invalid stored coordinates cannot reach the map engines", () => {
  for (const value of [
    null,
    [],
    [181, 20],
    [30, 91],
    [NaN, 20],
    ["-122", 37],
    [0, 0, 0],
  ])
    assert.equal(isCoordinate(value), false);
  assert.equal(isCoordinate([-122.4, 37.7]), true);
});
test("corrupted trip records are discarded before map selection", () => {
  const trip = {
    id: "test",
    destination: places[0],
    date: "2026-09-27T12:00:00Z",
    distance: 4.9,
    duration: 8,
    mode: "drive",
  };
  assert.equal(isTrip(trip), true);
  assert.equal(
    isTrip({ ...trip, destination: { ...places[0], coords: [] } }),
    false,
  );
  assert.equal(isTrip({ ...trip, date: "not a date" }), false);
  assert.equal(isTrip({ ...trip, duration: Infinity }), false);
  assert.equal(isPlace(null), false);
});
test("offline directions require complete finite routes", () => {
  const route = {
    coords: previewRoute,
    distance: 3.8,
    duration: 12,
    source: "preview",
    steps: ["Head northeast"],
  };
  assert.equal(isRoute(route), true);
  assert.equal(isRoute({ ...route, steps: [] }), false);
  assert.equal(
    isRoute({
      ...route,
      coords: [
        [0, 0],
        [200, 20],
      ],
    }),
    false,
  );
  assert.equal(isRoute({ ...route, distance: -1 }), false);
  assert.equal(isRoute({ ...route, source: "unknown" }), false);
});
test("unavailable browser storage does not prevent startup", () => {
  assert.deepEqual(readLocal("test", ["fallback"]), ["fallback"]);
});
