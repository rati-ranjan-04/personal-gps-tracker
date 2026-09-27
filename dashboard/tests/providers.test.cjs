const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dispatch,
  normalizeTrip,
  decodePolyline,
} = require("../server/providers.cjs");
function encode(points) {
  let prev = [0, 0];
  return points
    .map(([lon, lat]) => {
      const next = [Math.round(lat * 1e6), Math.round(lon * 1e6)];
      const out = next
        .map((n, i) => {
          let v = n - prev[i];
          v = v < 0 ? ~(v << 1) : v << 1;
          let s = "";
          while (v >= 32) {
            s += String.fromCharCode((32 | (v & 31)) + 63);
            v >>>= 5;
          }
          return s + String.fromCharCode(v + 63);
        })
        .join("");
      prev = next;
      return out;
    })
    .join("");
}
const points = [
  [-122.4, 37.7],
  [-122.399, 37.7],
];
const trip = {
  summary: { length: 0.088, time: 60 },
  legs: [
    {
      shape: encode(points),
      maneuvers: [
        {
          instruction: "Continue",
          street_names: ["Test Street"],
          length: 0.088,
          time: 60,
          begin_shape_index: 0,
        },
      ],
    },
  ],
};
test("Valhalla polyline6 and metric normalization", () => {
  assert.deepEqual(decodePolyline(trip.legs[0].shape), points);
  const r = normalizeTrip(trip, 0);
  assert.equal(r.distance, 88);
  assert.equal(r.duration, 60);
  assert.equal(r.steps[0].road, "Test Street");
  assert.throws(() => decodePolyline("~"));
  assert.throws(() => normalizeTrip({}, 0));
});
test("each mode sends supported costing options and returns real alternatives", async () => {
  const original = global.fetch;
  let json;
  global.fetch = async (url) => {
    json = JSON.parse(new URL(url).searchParams.get("json"));
    return Response.json({ trip, alternates: [{ trip }] });
  };
  try {
    const r = await dispatch(
      {
        action: "route",
        mode: "cycle",
        points,
        preferences: { bicycleType: "City", avoidHills: true },
      },
      {},
    );
    assert.equal(json.costing, "bicycle");
    assert.equal(json.costing_options.bicycle.bicycle_type, "city");
    assert.equal(json.costing_options.bicycle.use_hills, 0);
    assert.equal(r.routes.length, 2);
    await dispatch(
      {
        action: "route",
        mode: "drive",
        points,
        preferences: {
          avoidTolls: true,
          avoidHighways: true,
          strategy: "shortest",
        },
      },
      {},
    );
    assert.equal(json.costing_options.auto.use_tolls, 0);
    assert.equal(json.costing_options.auto.shortest, true);
    await dispatch(
      {
        action: "route",
        mode: "walk",
        points,
        preferences: { walkingPace: "relaxed" },
      },
      {},
    );
    assert.equal(json.costing_options.pedestrian.walking_speed, 3.5);
    await assert.rejects(
      () => dispatch({ action: "route", mode: "transit", points }, {}),
      /Transit is unavailable/,
    );
    await assert.rejects(
      () => dispatch({ action: "route", mode: "flight", points }, {}),
      /valid start/,
    );
  } finally {
    global.fetch = original;
  }
});
test("search removes invalid provider geometry and escapes queries", async () => {
  const original = global.fetch;
  let requested;
  global.fetch = async (url) => {
    requested = new URL(url);
    return Response.json({
      features: [
        {
          properties: { osm_id: 1, osm_type: "N", name: "Test" },
          geometry: { coordinates: [0, 0] },
        },
        { properties: {}, geometry: { coordinates: [999, 0] } },
      ],
    });
  };
  try {
    const r = await dispatch(
      { action: "search", query: "cafe & park", center: [10, 20] },
      {},
    );
    assert.equal(requested.searchParams.get("q"), "cafe & park");
    assert.equal(r.places.length, 1);
    assert.equal(requested.searchParams.get("lat"), "20");
  } finally {
    global.fetch = original;
  }
});
test("nearby rejects untrusted categories and malformed coordinates before upstream requests", async () => {
  await assert.rejects(
    () =>
      dispatch(
        { action: "nearby", center: [0, 0], category: "[injection]" },
        {},
      ),
    /supported category/,
  );
  await assert.rejects(
    () =>
      dispatch({ action: "nearby", center: [0, 100], category: "Coffee" }, {}),
    /supported category/,
  );
  assert.deepEqual(await dispatch({ action: "config" }, {}), {
    transit: false,
    offlineTiles: false,
    offlineAttribution: "© OpenStreetMap contributors",
    version: "0.2.0",
  });
});
test("upstream failures never become fabricated routes", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(
      () => dispatch({ action: "route", mode: "drive", points }, {}),
      /503/,
    );
  } finally {
    global.fetch = original;
  }
});
