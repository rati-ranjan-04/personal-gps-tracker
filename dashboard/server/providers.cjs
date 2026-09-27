const CATEGORIES = {
  Restaurants: ["amenity", "restaurant"],
  Coffee: ["amenity", "cafe"],
  Parks: ["leisure", "park"],
  "EV charging": ["amenity", "charging_station"],
  Parking: ["amenity", "parking"],
  "Things to do": ["tourism", "attraction"],
  Hospitals: ["amenity", "hospital"],
  ATMs: ["amenity", "atm"],
  Fuel: ["amenity", "fuel"],
  Pharmacies: ["amenity", "pharmacy"],
};
const coordinate = (c) =>
  Array.isArray(c) &&
  c.length === 2 &&
  c.every(Number.isFinite) &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 90;
function decodePolyline(encoded) {
  if (typeof encoded !== "string" || encoded.length > 1000000)
    throw new Error("Invalid route geometry");
  let index = 0,
    lat = 0,
    lon = 0;
  const coords = [];
  const next = () => {
    let result = 0,
      shift = 0,
      byte;
    do {
      if (index >= encoded.length || shift > 30)
        throw new Error("Invalid route geometry");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lon += next();
    const point = [lon / 1e6, lat / 1e6];
    if (!coordinate(point)) throw new Error("Invalid route coordinates");
    coords.push(point);
  }
  return coords;
}
async function upstream(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(18000),
    headers: {
      Accept: "application/json",
      "User-Agent": "Waypoint/0.2 (self-hostable personal navigation)",
      ...options.headers,
    },
  });
  if (!response.ok)
    throw new Error(
      `Provider request failed (${response.status}). Please try again.`,
    );
  return response.json();
}
function place(feature) {
  const p = feature.properties || {};
  return {
    id: `osm-${p.osm_type}-${p.osm_id}`,
    name: String(p.name || p.street || p.city || "Unnamed place"),
    address: [p.housenumber, p.street, p.city, p.state, p.country]
      .filter(Boolean)
      .join(", "),
    coords: feature.geometry.coordinates,
    category: String(p.osm_value || "Place"),
  };
}
function normalizeTrip(trip, index) {
  if (!trip || !Array.isArray(trip.legs) || !trip.legs.length)
    throw new Error("No route was returned for these locations.");
  const coords = [],
    steps = [];
  for (const leg of trip.legs) {
    const geometry = decodePolyline(leg.shape);
    for (const m of leg.maneuvers || [])
      steps.push({
        text: m.instruction || "Continue",
        road: (m.street_names || []).join(", "),
        distance: m.length * 1000,
        seconds: m.time,
        point: geometry[m.begin_shape_index] || geometry[0],
      });
    coords.push(...geometry);
  }
  if (
    coords.length < 2 ||
    !Number.isFinite(trip.summary?.length) ||
    !Number.isFinite(trip.summary?.time)
  )
    throw new Error("The routing service returned an invalid route.");
  return {
    id: `route-${index}`,
    coords,
    distance: trip.summary.length * 1000,
    duration: trip.summary.time,
    steps,
    provider: "Valhalla",
    label: index === 0 ? "Recommended" : `Alternative ${index}`,
  };
}
async function dispatch(body, env = process.env) {
  if (body.action === "config")
    return {
      transit: !!env.TRANSIT_ROUTER_URL,
      offlineTiles: !!env.OFFLINE_TILE_URL,
      offlineAttribution:
        env.OFFLINE_TILE_ATTRIBUTION || "© OpenStreetMap contributors",
      version: "0.2.0",
    };
  if (body.action === "search") {
    const q = typeof body.query === "string" ? body.query.trim() : "";
    if (q.length < 3 || q.length > 180)
      throw new Error("Enter between 3 and 180 characters.");
    const url = new URL(
      "api/",
      (env.PHOTON_URL || "https://photon.komoot.io/").replace(/\/?$/, "/"),
    );
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "7");
    if (coordinate(body.center)) {
      url.searchParams.set("lon", body.center[0]);
      url.searchParams.set("lat", body.center[1]);
    }
    const data = await upstream(url);
    return {
      places: (data.features || [])
        .filter((f) => coordinate(f.geometry?.coordinates))
        .map(place),
    };
  }
  if (body.action === "nearby") {
    if (!coordinate(body.center) || !CATEGORIES[body.category])
      throw new Error("Choose a location and a supported category.");
    const [key, value] = CATEGORIES[body.category];
    const [lon, lat] = body.center;
    const query = `[out:json][timeout:15];nwr["${key}"="${value}"](around:3000,${lat},${lon});out center 35;`;
    const data = await upstream(
      env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      },
    );
    return {
      places: (data.elements || [])
        .map((p) => ({
          id: `osm-${p.type}-${p.id}`,
          name: p.tags?.name || body.category,
          address:
            [
              p.tags?.["addr:housenumber"],
              p.tags?.["addr:street"],
              p.tags?.["addr:city"],
            ]
              .filter(Boolean)
              .join(" ") || "OpenStreetMap place",
          coords: [p.lon ?? p.center?.lon, p.lat ?? p.center?.lat],
          category: body.category,
        }))
        .filter((p) => coordinate(p.coords)),
    };
  }
  if (body.action === "route") {
    const modes = {
      drive: "auto",
      cycle: "bicycle",
      walk: "pedestrian",
      transit: "multimodal",
    };
    if (
      !modes[body.mode] ||
      !Array.isArray(body.points) ||
      body.points.length < 2 ||
      body.points.length > 5 ||
      !body.points.every(coordinate)
    )
      throw new Error("Choose valid start and destination locations.");
    if (body.mode === "transit" && !env.TRANSIT_ROUTER_URL)
      throw new Error(
        "Transit is unavailable: the deployment needs a routing service with local transit schedules.",
      );
    const p = body.preferences || {};
    const cost = modes[body.mode];
    const options = {};
    if (body.mode === "drive") {
      options.use_tolls = p.avoidTolls ? 0 : 0.5;
      options.use_highways = p.avoidHighways ? 0 : 0.5;
      options.shortest = p.strategy === "shortest";
    }
    if (body.mode === "cycle") {
      options.bicycle_type = ["Road", "Hybrid", "City", "Mountain"].includes(
        p.bicycleType,
      )
        ? p.bicycleType.toLowerCase()
        : "hybrid";
      options.use_hills = p.avoidHills ? 0 : 0.5;
    }
    if (body.mode === "walk") {
      options.walking_speed = p.walkingPace === "relaxed" ? 3.5 : 5.1;
    }
    const json = {
      locations: body.points.map(([lon, lat]) => ({ lon, lat })),
      costing: cost,
      units: "kilometers",
      alternates: body.points.length === 2 ? 2 : 0,
      costing_options: { [cost]: options },
      shape_format: "polyline6",
    };
    if (body.mode === "transit") json.date_time = { type: 0 };
    const base =
      body.mode === "transit"
        ? env.TRANSIT_ROUTER_URL
        : env.VALHALLA_URL || "https://valhalla1.openstreetmap.de";
    const url = new URL(base.replace(/\/$/, "") + "/route");
    url.searchParams.set("json", JSON.stringify(json));
    const data = await upstream(url, {
      headers: env.ROUTING_API_KEY
        ? { Authorization: `Bearer ${env.ROUTING_API_KEY}` }
        : {},
    });
    if (data.error)
      throw new Error(
        "No route is available for these locations and transport mode.",
      );
    return {
      routes: [data.trip, ...(data.alternates || []).map((x) => x.trip)].map(
        normalizeTrip,
      ),
    };
  }
  throw new Error("Unsupported navigation request.");
}
module.exports = {
  dispatch,
  coordinate,
  decodePolyline,
  normalizeTrip,
  CATEGORIES,
};
