import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bike,
  Bookmark,
  BriefcaseBusiness,
  CarFront,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Coffee,
  Compass,
  Download,
  Footprints,
  History,
  Home,
  Layers,
  Leaf,
  LocateFixed,
  LockKeyhole,
  Map,
  MapPin,
  Menu,
  Minus,
  MoreHorizontal,
  Mountain,
  Navigation,
  Navigation2,
  ParkingCircle,
  Plus,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Trash2,
  TrendingUp,
  Utensils,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import MapView, { type MapHandle } from "./MapView";
import {
  places,
  origin as initialOrigin,
  previewRoute,
  readLocal,
  isTrip,
  isRoute,
  isCoordinate,
  type Place,
  type Route,
  type Trip,
} from "./data";

const navItems = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "trips", label: "My trips", icon: RouteIcon },
  { id: "saved", label: "Saved places", icon: Bookmark },
  { id: "offline", label: "Offline maps", icon: Download },
  { id: "insights", label: "Your insights", icon: TrendingUp },
];
const categories = [
  { name: "Restaurants", icon: Utensils },
  { name: "Coffee", icon: Coffee },
  { name: "Parks", icon: Leaf },
  { name: "EV charging", icon: Zap },
  { name: "Parking", icon: ParkingCircle },
  { name: "Things to do", icon: Mountain },
];
const modes = [
  { id: "drive", label: "Drive", icon: CarFront },
  { id: "cycle", label: "Cycle", icon: Bike },
  { id: "walk", label: "Walk", icon: Footprints },
  { id: "transit", label: "Transit", icon: TrainFront },
];
const initialRoute: Route = {
  coords: previewRoute,
  distance: 3.8,
  duration: 12,
  source: "preview",
  steps: [
    "Head northeast on Market Street",
    "Continue toward the Embarcadero",
    "Arrive at the Ferry Building",
  ],
};
const pictures = {
  park: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=600&q=85",
  coffee:
    "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=85",
  city: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=600&q=85",
};
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-symbol">
        <svg viewBox="0 0 34 34" fill="none">
          <path
            d="m5 25 9-19 5.5 12L30 11 19.5 30 14 18 5 25Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {!small && (
        <span>
          waypoint<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
function App() {
  const [page, setPage] = useState("explore");
  const [mobileNav, setMobileNav] = useState(false);
  const [destination, setDestination] = useState<Place>(places[0]);
  const [origin, setOrigin] = useState<[number, number]>(initialOrigin);
  const [originName, setOriginName] = useState("Your location");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mode, setMode] = useState("drive");
  const [route, setRoute] = useState<Route>(initialRoute);
  const [routeBusy, setRouteBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [theme, setTheme] = useState("Standard");
  const [layers, setLayers] = useState(false);
  const [modal, setModal] = useState("");
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState<string[]>(() => {
    const value = readLocal<unknown>("saved", ["home", "work", "coffee"]);
    return Array.isArray(value)
      ? value.filter(
          (id): id is string =>
            typeof id === "string" && places.some((p) => p.id === id),
        )
      : ["home", "work", "coffee"];
  });
  const [trips, setTrips] = useState<Trip[]>(() => {
    const value = readLocal<unknown>("trips", []);
    return Array.isArray(value) ? value.filter(isTrip).slice(0, 100) : [];
  });
  const [remember, setRemember] = useState(
    () => readLocal<boolean>("remember", false) === true,
  );
  const [name, setName] = useState(() => {
    const value = readLocal("name", "Alex");
    return typeof value === "string" ? value.slice(0, 40) : "Alex";
  });
  const [voice, setVoice] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [step, setStep] = useState(0);
  const [offlineRoutes, setOfflineRoutes] = useState<
    { name: string; route: Route }[]
  >(() => {
    const value = readLocal<unknown>("offline", []);
    return Array.isArray(value)
      ? value
          .filter((x) => typeof x?.name === "string" && isRoute(x.route))
          .slice(0, 50)
      : [];
  });
  const [stops, setStops] = useState<Place[]>([]);
  const mapRef = useRef<MapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const requestRef = useRef<AbortController | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );
  const store = (key: string, value: unknown) => {
    try {
      localStorage.setItem(`waypoint-${key}`, JSON.stringify(value));
    } catch {
      notify(
        "Device storage is full or unavailable. Changes will last for this session.",
      );
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setPage("explore");
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setModal("");
        setSearchOpen(false);
        setLayers(false);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const selectPlace = useCallback((place: Place) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setRouteBusy(false);
    setDestination(place);
    setQuery("");
    setSearchOpen(false);
    setNavigating(false);
    setPage("explore");
    setRoute({ ...initialRoute, coords: [], source: "preview" });
    mapRef.current?.locate(place.coords);
  }, []);
  const categoryPlaces = category
    ? places.filter((p) => p.category === category)
    : [];
  const filteredPlaces = places.filter((p) =>
    `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()),
  );
  const savePlace = (place: Place) => {
    const next = saved.includes(place.id)
      ? saved.filter((id) => id !== place.id)
      : [...saved, place.id];
    setSaved(next);
    store("saved", next);
    notify(
      next.includes(place.id)
        ? `${place.name} added to your places`
        : `${place.name} removed from saved places`,
    );
  };
  const changeMode = (next: string) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setRouteBusy(false);
    setMode(next);
    setNavigating(false);
    setRoute({ ...initialRoute, coords: [] });
  };
  async function planRoute() {
    if (mode !== "drive") {
      notify(
        mode === "transit"
          ? "Transit routing needs a local GTFS feed. Try driving for this preview."
          : "Walking and cycling routing need a self-hosted routing profile. Driving is available in this preview.",
      );
      return;
    }
    requestRef.current?.abort();
    requestRef.current = null;
    const controller = new AbortController();
    requestRef.current = controller;
    setRouteBusy(true);
    setNavigating(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const points = [origin, ...stops.map((p) => p.coords), destination.coords]
        .map((c) => c.join(","))
        .join(";");
      const endpoint = (
        import.meta.env.VITE_ROUTER_URL || "https://router.project-osrm.org"
      ).replace(/\/$/, "");
      const response = await fetch(
        `${endpoint}/route/v1/driving/${points}?overview=full&geometries=geojson&steps=true`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Routing service unavailable");
      const data = await response.json();
      const found = data.routes?.[0];
      if (
        data.code !== "Ok" ||
        !Array.isArray(found?.geometry?.coordinates) ||
        found.geometry.coordinates.length < 2 ||
        !found.geometry.coordinates.every(isCoordinate) ||
        !Number.isFinite(found.distance) ||
        !Number.isFinite(found.duration) ||
        !Array.isArray(found.legs)
      )
        throw new Error("No drivable route found");
      const steps = found.legs.flatMap(
        (leg: {
          steps: {
            name: string;
            distance: number;
            maneuver: { type: string; modifier?: string };
          }[];
        }) =>
          leg.steps.map((s) =>
            s.maneuver.type === "arrive"
              ? "Arrive at your destination"
              : `${s.maneuver.type === "depart" ? "Head" : s.maneuver.modifier ? `Turn ${s.maneuver.modifier}` : "Continue"}${s.name ? ` on ${s.name}` : ""}${s.distance >= 100 ? ` for ${(s.distance / 1000).toFixed(1)} km` : ""}`,
          ),
      );
      if (requestRef.current !== controller || controller.signal.aborted)
        return;
      setRoute({
        coords: found.geometry.coordinates,
        distance: found.distance / 1000,
        duration: Math.max(1, Math.round(found.duration / 60)),
        source: "osrm",
        steps: steps.length ? steps : ["Arrive at your destination"],
      });
      notify("Your route is ready. Have a good journey.");
    } catch {
      if (requestRef.current === controller) {
        notify(
          controller.signal.aborted
            ? "Routing timed out. Please try again."
            : "Could not calculate a route. Check your connection and try again.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) setRouteBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      notify("Geolocation is not supported by this browser.");
      return;
    }
    notify("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        requestRef.current?.abort();
        requestRef.current = null;
        setRouteBusy(false);
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        setOrigin(coords);
        setOriginName("Current GPS location");
        setRoute({ ...initialRoute, coords: [] });
        setNavigating(false);
        mapRef.current?.locate(coords);
        notify(
          "Location updated. The map provider receives viewport requests; your GPS position is not saved.",
        );
      },
      () =>
        notify(
          "Location access is unavailable. You can use the San Francisco preview location.",
        ),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }
  function startJourney() {
    setNavigating(true);
    setStep(0);
    if (voice) speak(route.steps[0]);
    if (remember) {
      const trip: Trip = {
        id: crypto.randomUUID(),
        destination,
        date: new Date().toISOString(),
        distance: route.distance,
        duration: route.duration,
        mode,
      };
      const next = [trip, ...trips].slice(0, 100);
      setTrips(next);
      store("trips", next);
    }
  }
  function speak(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } else notify("Voice directions are not supported in this browser.");
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            profile: { name },
            savedPlaces: places.filter((p) => saved.includes(p.id)),
            trips,
            offlineRoutes,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "waypoint-my-data.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Your data has been exported.");
  }
  function cacheRoute() {
    if (!route.coords.length) {
      notify("Plan a route first to save directions.");
      return;
    }
    const next = [
      { name: destination.name, route },
      ...offlineRoutes.filter((r) => r.name !== destination.name),
    ].slice(0, 50);
    setOfflineRoutes(next);
    store("offline", next);
    notify(
      "Route directions saved on this device. Map tiles still require internet.",
    );
  }
  const topPlace = trips.length
    ? [...trips].sort(
        (a, b) =>
          trips.filter((t) => t.destination.id === b.destination.id).length -
          trips.filter((t) => t.destination.id === a.destination.id).length,
      )[0].destination
    : places[1];
  const isPreview = route.source === "preview";
  const activeTitle = navItems.find((n) => n.id === page)?.label || "Explore";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="logo-link"
          href="#"
          aria-label="Waypoint home"
          onClick={(e) => {
            e.preventDefault();
            setPage("explore");
          }}
        >
          <Logo />
        </a>
        <div className="workspace-label">YOUR EVERYDAY, REIMAGINED</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "insights" ? (
                <span className="ai-tag">AI</span>
              ) : item.id === "saved" ? (
                <span className="nav-count">{saved.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-icon">
              <ShieldCheck size={19} />
              <span className="tiny-dot" />
            </div>
            <h3>Your world. Your data.</h3>
            <p>
              A little more peace of mind,
              <br />
              wherever life takes you.
            </p>
            <button onClick={() => setModal("privacy")}>
              Privacy at Waypoint <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="nav-item settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
            <span>Settings & preferences</span>
          </button>
          <button className="profile" onClick={() => setModal("profile")}>
            <span className="avatar">{name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{name || "Traveler"} Morgan</strong>
              <small>Personal workspace</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="tiny-dot" /> Made for the way you move
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="page-heading">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <div>
              <h1>{page === "explore" ? "Explore the world" : activeTitle}</h1>
              <p>
                {page === "explore"
                  ? "Find your way. Make it yours."
                  : "A little more clarity for every journey."}
              </p>
            </div>
          </div>
          <div className="topbar-right">
            <span className="city-label">
              <MapPin size={15} /> San Francisco, CA <ChevronDown size={12} />
            </span>
            <span className="header-divider" />
            <button
              className="private-badge"
              onClick={() => setModal("privacy")}
            >
              <ShieldCheck size={14} />
              <span>Privacy first</span>
            </button>
            <button
              className="header-avatar"
              aria-label="Open profile"
              onClick={() => setModal("profile")}
            >
              {name.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="workspace">
          <section className="planning-panel">
            {page === "explore" ? (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">
                    <span className="tiny-dot" /> A BETTER WAY TO GET THERE
                  </span>
                  <h2>Where to, {name || "traveler"}?</h2>
                  <p>Every great day starts with a direction.</p>
                </div>
                <div className="route-planner">
                  <div className="travel-modes" aria-label="Travel mode">
                    {modes.map((m) => (
                      <button
                        key={m.id}
                        className={mode === m.id ? "selected" : ""}
                        onClick={() => changeMode(m.id)}
                      >
                        <m.icon size={19} />
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="route-fields">
                    <div className="route-dots">
                      <span className="start-dot" />
                      <span className="dotted-line" />
                      <MapPin size={16} />
                    </div>
                    <div className="field-stack">
                      <button
                        className="origin-field"
                        onClick={() => setModal("origin")}
                      >
                        <span>{originName}</span>
                        <LocateFixed size={15} />
                      </button>
                      <div className="destination-field">
                        <input
                          ref={inputRef}
                          aria-label="Search a destination"
                          value={searchOpen ? query : destination.name}
                          placeholder="Where do you want to go?"
                          onFocus={() => {
                            setSearchOpen(true);
                            setQuery("");
                          }}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setSearchOpen(true);
                          }}
                        />
                        <button
                          aria-label="Search destinations"
                          onClick={() => {
                            setSearchOpen(!searchOpen);
                            inputRef.current?.focus();
                          }}
                        >
                          <Search size={17} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="swap-button"
                      aria-label="Swap origin and destination"
                      onClick={() => {
                        requestRef.current?.abort();
                        requestRef.current = null;
                        setRouteBusy(false);
                        setDestination({
                          id: "custom",
                          name: originName,
                          address: "Previous starting point",
                          coords: origin,
                          category: "Personal",
                          minutes: 12,
                        });
                        setOrigin(destination.coords);
                        setOriginName(destination.name);
                        setRoute({ ...initialRoute, coords: [] });
                        setNavigating(false);
                      }}
                    >
                      <ArrowDownUp size={16} />
                    </button>
                  </div>
                  {searchOpen && (
                    <div className="search-results">
                      <div className="search-label">
                        {query ? "MATCHING PLACES" : "EXPLORE SAN FRANCISCO"}
                        <button
                          aria-label="Close search"
                          onClick={() => setSearchOpen(false)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                      {filteredPlaces.length ? (
                        filteredPlaces.slice(0, 6).map((p) => (
                          <button key={p.id} onClick={() => selectPlace(p)}>
                            <span className="search-pin">
                              <MapPin size={16} />
                            </span>
                            <span>
                              <strong>{p.name}</strong>
                              <small>{p.address}</small>
                            </span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))
                      ) : (
                        <div className="empty-search">
                          No places found. Try “park”, “coffee”, or a San
                          Francisco landmark.
                        </div>
                      )}
                    </div>
                  )}
                  {stops.map((stop, index) => (
                    <div className="stop-row" key={stop.id}>
                      <span>{index + 1}</span>
                      {stop.name}
                      <button
                        aria-label={`Remove ${stop.name}`}
                        onClick={() => {
                          requestRef.current?.abort();
                          requestRef.current = null;
                          setRouteBusy(false);
                          setStops(stops.filter((s) => s.id !== stop.id));
                          setRoute({ ...initialRoute, coords: [] });
                          setNavigating(false);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="route-options">
                    <button onClick={() => setModal("stops")}>
                      <Plus size={14} /> Add a stop
                    </button>
                    <button onClick={() => setModal("preferences")}>
                      <SlidersHorizontal size={14} /> Route options
                    </button>
                  </div>
                  <button
                    className="primary-button find-route"
                    onClick={planRoute}
                    disabled={routeBusy}
                  >
                    <RouteIcon size={17} />
                    {routeBusy ? "Finding your way…" : "Find my route"}
                    <ArrowRight size={17} />
                  </button>
                  <p className="routing-disclosure">
                    OpenStreetMap routes ·{" "}
                    {originName === "Your location"
                      ? "Sample start location"
                      : "Selected start location"}
                  </p>
                </div>
                <section className="suggested-section">
                  <div className="section-title">
                    <h3>
                      <Sparkles size={16} /> A little ahead of you
                    </h3>
                    <span className="soft-tag">FOR YOU</span>
                  </div>
                  <button
                    className="prediction-card"
                    onClick={() => selectPlace(topPlace)}
                  >
                    <span className="prediction-icon">
                      <Home size={20} />
                    </span>
                    <span className="prediction-content">
                      <strong>
                        {trips.length
                          ? "Your familiar favorite"
                          : "Home sounds good about now"}
                      </strong>
                      <small>
                        {trips.length
                          ? `You’ve planned ${trips.filter((t) => t.destination.id === topPlace.id).length} trips here`
                          : "Your next chapter is a short ride away."}
                      </small>
                      <span>
                        <span className="tiny-dot" />
                        {topPlace.minutes} min away{" "}
                        <span className="prediction-divider">·</span>
                        {trips.length
                          ? "From your trip history"
                          : "Sample suggestion"}
                      </span>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </section>
                <section className="quick-section">
                  <div className="section-title">
                    <h3>Your go-to places</h3>
                    <button onClick={() => setPage("saved")}>
                      View all <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="quick-places">
                    {[places[1], places[2], places[4]].map((p, i) => {
                      const Icon = [Home, BriefcaseBusiness, Coffee][i];
                      return (
                        <button key={p.id} onClick={() => selectPlace(p)}>
                          <span className={`quick-icon q-${i}`}>
                            <Icon size={19} />
                          </span>
                          <strong>{i === 2 ? "Coffee spot" : p.name}</strong>
                          <small>{p.minutes} min away</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="discover-section">
                  <div className="section-title">
                    <h3>Around the corner</h3>
                    <span className="muted-label">A little inspiration</span>
                  </div>
                  <button
                    className="discovery-card"
                    onClick={() => selectPlace(places[7])}
                  >
                    <img
                      src={pictures.park}
                      alt="Golden Gate Bridge seen from the San Francisco waterfront"
                    />
                    <span className="discovery-shade" />
                    <span className="discovery-label">
                      <span>TAKE THE SCENIC ROUTE</span>
                      <strong>A fresh perspective awaits.</strong>
                      <small>
                        Discover something close to home{" "}
                        <ArrowUpRight size={14} />
                      </small>
                    </span>
                    <span className="discovery-badge">
                      <Compass size={15} />
                    </span>
                  </button>
                </section>
                <div className="panel-footnote">
                  <LockKeyhole size={12} />
                  <span>
                    Your journeys are personal. Let’s keep them that way.
                  </span>
                </div>
              </>
            ) : (
              <>
                <button
                  className="back-link"
                  onClick={() => setPage("explore")}
                >
                  <ArrowLeft size={14} /> Back to exploring
                </button>
                <div className="planner-heading alternate-heading">
                  <span className="eyebrow">YOUR WORLD, IN ONE PLACE</span>
                  <h2>{activeTitle}</h2>
                  <p>
                    {page === "saved"
                      ? "The places that feel a little more like you."
                      : page === "trips"
                        ? "Every journey has a story."
                        : page === "offline"
                          ? "Keep your directions close, wherever you go."
                          : "Make a little more of your everyday."}
                  </p>
                </div>
                {page === "saved" && (
                  <>
                    <div className="section-title">
                      <h3>{saved.length} saved places</h3>
                      <button onClick={() => setModal("save-place")}>
                        <Plus size={14} /> Add new
                      </button>
                    </div>
                    <div className="place-list">
                      {places
                        .filter((p) => saved.includes(p.id))
                        .map((p) => (
                          <article key={p.id}>
                            <button
                              className="place-detail"
                              onClick={() => selectPlace(p)}
                            >
                              <span className="list-icon">
                                <MapPin size={18} />
                              </span>
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.address}</small>
                              </span>
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Unsave ${p.name}`}
                              onClick={() => savePlace(p)}
                            >
                              <Bookmark size={17} fill="currentColor" />
                            </button>
                          </article>
                        ))}
                    </div>
                    {saved.length === 0 && (
                      <div className="empty-state">
                        <Bookmark />
                        <h3>Make yourself at home</h3>
                        <p>Save a place to find it here next time.</p>
                      </div>
                    )}
                    <button
                      className="primary-button full"
                      onClick={() => setModal("save-place")}
                    >
                      <Plus size={17} /> Save a place
                    </button>
                  </>
                )}
                {page === "trips" && (
                  <>
                    <div className="info-banner">
                      <ShieldCheck size={19} />
                      <p>
                        Trip history is{" "}
                        {remember ? "enabled on this device" : "off by default"}
                        .
                        <button onClick={() => setModal("privacy")}>
                          Manage privacy settings <ArrowUpRight size={12} />
                        </button>
                      </p>
                    </div>
                    {trips.length ? (
                      <div className="trip-list">
                        {trips.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => selectPlace(t.destination)}
                          >
                            <span className="list-icon">
                              <RouteIcon size={19} />
                            </span>
                            <span>
                              <strong>{t.destination.name}</strong>
                              <small>
                                {new Date(t.date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}{" "}
                                · {t.distance.toFixed(1)} km · {t.duration} min
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <History size={32} />
                        <h3>A fresh start</h3>
                        <p>
                          Enable local history, then start a route. Your planned
                          journeys will appear here.
                        </p>
                        <button
                          className="outline-button"
                          onClick={() => {
                            setRemember(true);
                            store("remember", true);
                            notify("Local trip history enabled.");
                          }}
                        >
                          Enable trip history
                        </button>
                      </div>
                    )}
                  </>
                )}
                {page === "offline" && (
                  <>
                    <div className="offline-illustration">
                      <Map size={46} />
                      <span>
                        <Download size={19} />
                      </span>
                    </div>
                    <h3 className="standalone-heading">
                      A little preparation. A lot of freedom.
                    </h3>
                    <p className="body-copy">
                      Save route summaries and written directions on this
                      device. Map tiles and new routes require a connection.
                    </p>
                    <button
                      className="primary-button full"
                      onClick={cacheRoute}
                    >
                      <Download size={17} /> Save current route directions
                    </button>
                    <div className="section-title offline-title">
                      <h3>Saved for later</h3>
                      <span className="soft-tag">
                        {offlineRoutes.length} ROUTES
                      </span>
                    </div>
                    {offlineRoutes.map((r, i) => (
                      <div className="offline-route" key={r.name}>
                        <button onClick={() => setModal(`offline-${i}`)}>
                          <span className="list-icon">
                            <RouteIcon size={19} />
                          </span>
                          <span>
                            <strong>{r.name}</strong>
                            <small>
                              {r.route.distance.toFixed(1)} km ·{" "}
                              {r.route.steps.length} directions
                            </small>
                          </span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete downloaded ${r.name} route`}
                          onClick={() => {
                            const next = offlineRoutes.filter(
                              (_, index) => index !== i,
                            );
                            setOfflineRoutes(next);
                            store("offline", next);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <p className="panel-note">
                      Full offline maps and routing require a self-hosted tile
                      and routing service.
                    </p>
                  </>
                )}
                {page === "insights" && (
                  <>
                    <div className="insights-hero">
                      <Sparkles size={24} />
                      <span>YOUR PERSONAL MOBILITY SNAPSHOT</span>
                      <h3>
                        Small journeys.
                        <br />
                        Bigger picture.
                      </h3>
                      <p>Learn a little about the way you move.</p>
                    </div>
                    <div className="stats-grid">
                      <div>
                        <RouteIcon size={18} />
                        <strong>{trips.length}</strong>
                        <span>Planned trips</span>
                      </div>
                      <div>
                        <MapPin size={18} />
                        <strong>
                          {trips.reduce((a, t) => a + t.distance, 0).toFixed(1)}
                          <small> km</small>
                        </strong>
                        <span>Distance planned</span>
                      </div>
                    </div>
                    <div className="section-title">
                      <h3>Your familiar places</h3>
                    </div>
                    {trips.length ? (
                      <div className="insight-place">
                        <Home size={22} />
                        <div>
                          <strong>{topPlace.name}</strong>
                          <p>Your most planned destination</p>
                        </div>
                      </div>
                    ) : (
                      <p className="body-copy">
                        Your insights grow with you. Turn on local trip history
                        to discover your most frequent destinations.
                      </p>
                    )}
                    <div className="info-banner">
                      <LockKeyhole size={18} />
                      <p>
                        Insights use only your locally saved trip plans. No
                        background location tracking.
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          <section
            className={`map-workspace ${theme === "Dark" ? "dark-map" : ""}`}
            aria-label="Map and route preview"
          >
            <MapView
              ref={mapRef}
              route={route}
              destination={destination}
              origin={origin}
              theme={theme}
              showRoute={route.coords.length > 0}
              categoryPlaces={categoryPlaces}
              onPlace={selectPlace}
            />
            <div className="map-top">
              <div className="category-chips">
                {categories.map((c) => (
                  <button
                    key={c.name}
                    className={category === c.name ? "chosen" : ""}
                    onClick={() => {
                      setCategory(category === c.name ? "" : c.name);
                      mapRef.current?.reset();
                    }}
                  >
                    <c.icon size={15} />
                    {c.name}
                  </button>
                ))}
              </div>
              <button
                className="map-menu icon-button"
                aria-label="Map information"
                onClick={() => setModal("map-info")}
              >
                <MoreHorizontal size={21} />
              </button>
            </div>
            <div className="map-context">
              <span className="tiny-dot" />{" "}
              {category
                ? `${categoryPlaces.length} ${category.toLowerCase()} nearby`
                : "A world of possibilities"}
              <span className="context-divider">|</span>San Francisco
            </div>
            <div className="map-city-label">
              <span>SAN FRANCISCO</span>
              <small>Find a different kind of everyday.</small>
            </div>
            {isPreview && route.coords.length > 0 && (
              <div className="route-map-label">
                <CarFront size={16} />
                <strong>12 min</strong>
                <span>Preview route</span>
              </div>
            )}
            <div className="map-controls">
              <button
                aria-label="Reset map bearing and view"
                className="compass-control"
                onClick={() => mapRef.current?.reset()}
              >
                <span>N</span>
                <Navigation2 size={21} />
              </button>
              <div className="zoom-controls">
                <button
                  aria-label="Zoom in"
                  onClick={() => mapRef.current?.zoom(1)}
                >
                  <Plus size={19} />
                </button>
                <span />
                <button
                  aria-label="Zoom out"
                  onClick={() => mapRef.current?.zoom(-1)}
                >
                  <Minus size={19} />
                </button>
              </div>
              <button aria-label="Find my location" onClick={locate}>
                <LocateFixed size={20} />
              </button>
            </div>
            <div className="map-bottom">
              <div className="map-layer-wrap">
                {layers && (
                  <div className="layer-picker">
                    <div className="section-title">
                      <h3>Make it your map</h3>
                      <button
                        aria-label="Close layers"
                        onClick={() => setLayers(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div>
                      {["Standard", "Dark", "Terrain"].map((t) => (
                        <button
                          className={theme === t ? "chosen" : ""}
                          key={t}
                          onClick={() => {
                            setTheme(t);
                            setLayers(false);
                          }}
                        >
                          <span
                            className={`layer-thumbnail ${t.toLowerCase()}`}
                          >
                            <Map size={23} />
                          </span>
                          {t}
                          {theme === t && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="layers-button"
                  onClick={() => setLayers(!layers)}
                >
                  <span className="layers-preview">
                    <Layers size={20} />
                  </span>
                  <span>Map layers</span>
                  <ChevronDown size={13} />
                </button>
              </div>
              <div className="map-data">
                <span className="tiny-dot" /> Open data. Open possibilities.
              </div>
            </div>
            <div className="map-bottom-card">
              {navigating ? (
                <div className="navigation-card">
                  <div className="navigation-top">
                    <span className="navigation-arrow">
                      <ArrowUpRight size={28} />
                    </span>
                    <div>
                      <span className="eyebrow">
                        DIRECTION {step + 1} OF {route.steps.length}
                      </span>
                      <h3>{route.steps[step]}</h3>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Stop navigation"
                      onClick={() => {
                        setNavigating(false);
                        window.speechSynthesis?.cancel();
                        notify("Route preview ended.");
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="navigation-actions">
                    <small>Route preview · follow local road signs</small>
                    <button
                      onClick={() => {
                        if (step < route.steps.length - 1) {
                          setStep(step + 1);
                          if (voice) speak(route.steps[step + 1]);
                        } else {
                          setNavigating(false);
                          notify("You’ve reached the end of your route.");
                        }
                      }}
                    >
                      {step < route.steps.length - 1
                        ? "Next direction"
                        : "Finish"}{" "}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="route-summary-heading">
                    <span className="route-summary-icon">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <h3>
                        {route.coords.length
                          ? "A better route, just for you"
                          : "Your next journey starts here"}
                      </h3>
                      <p>
                        {isPreview
                          ? "Explore a sample journey through the city"
                          : "Calculated with open road data"}
                      </p>
                    </div>
                    <span className="best-route-tag">
                      {isPreview ? "ROUTE PREVIEW" : "READY TO GO"}
                    </span>
                  </div>
                  <div className="route-summary-body">
                    <div className="route-metrics">
                      <div>
                        <strong>
                          {route.coords.length ? route.duration : "—"}
                          <small> min</small>
                        </strong>
                        <span>
                          {isPreview
                            ? "Estimated travel time"
                            : "Estimated driving time"}
                        </span>
                      </div>
                      <div className="metric-divider" />
                      <div>
                        <strong>
                          {route.coords.length
                            ? route.distance.toFixed(1)
                            : "—"}
                          <small> km</small>
                        </strong>
                        <span>
                          Via{" "}
                          {stops.length
                            ? `${stops.length} stop${stops.length > 1 ? "s" : ""}`
                            : isPreview
                              ? "Market Street"
                              : "open roads"}
                        </span>
                      </div>
                    </div>
                    <button
                      className="start-button"
                      disabled={!route.coords.length}
                      onClick={startJourney}
                    >
                      <Navigation size={16} />
                      {isPreview ? "Preview route" : "Start route"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="route-summary-footer">
                    <span>
                      <Leaf size={13} />
                      {isPreview
                        ? "A thoughtful way through the city"
                        : "Open source routing · no live traffic"}
                    </span>
                    <button
                      aria-label="Save route directions"
                      onClick={cacheRoute}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      aria-label={
                        voice
                          ? "Mute voice directions"
                          : "Enable voice directions"
                      }
                      className={voice ? "enabled" : ""}
                      onClick={() => {
                        setVoice(!voice);
                        if (voice) window.speechSynthesis?.cancel();
                        notify(
                          voice
                            ? "Voice directions off"
                            : "Voice directions on",
                        );
                      }}
                    >
                      {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="map-scale">
              <span /> 500 m
            </div>
          </section>
        </main>
        <footer className="app-footer">
          <span>
            <Logo small /> Thoughtfully built for your everyday.
          </span>
          <span>
            <span className="footer-status" /> All journeys start with you{" "}
            <span className="footer-separator">·</span>
            <button onClick={() => setModal("map-info")}>
              Powered by OpenStreetMap <ArrowUpRight size={11} />
            </button>
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "privacy"
              ? "Your privacy, your choice"
              : modal === "settings"
                ? "Make Waypoint yours"
                : modal === "profile"
                  ? "Your personal workspace"
                  : modal === "origin"
                    ? "Choose your starting point"
                    : modal === "stops"
                      ? "A little stop along the way"
                      : modal === "preferences"
                        ? "Your route preferences"
                        : modal === "save-place"
                          ? "Keep a favorite close"
                          : modal === "map-info"
                            ? "A world built on open data"
                            : modal === "delete"
                              ? "Start with a clean slate?"
                              : "Your saved directions"
          }
          onClose={() => setModal("")}
        >
          {["privacy", "settings", "preferences"].includes(modal) && (
            <>
              <div className="modal-intro">
                <span className="modal-feature-icon">
                  {modal === "privacy" ? (
                    <ShieldCheck size={27} />
                  ) : (
                    <SlidersHorizontal size={25} />
                  )}
                </span>
                <p>
                  {modal === "privacy"
                    ? "You decide what stays. Your saved places and preferences are stored in this browser, with no account required."
                    : modal === "preferences"
                      ? "Driving routes use road-network travel time. More routing profiles can be connected to your own routing service."
                      : "A few small choices to make every journey feel more like you."}
                </p>
              </div>
              <label className="setting-row">
                <span>
                  <strong>Remember my trips</strong>
                  <small>Save started route plans in this browser</small>
                </span>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    store("remember", e.target.checked);
                  }}
                />
                <span className="switch" />
              </label>
              <label className="setting-row">
                <span>
                  <strong>Voice directions</strong>
                  <small>Read directions aloud in route preview</small>
                </span>
                <input
                  type="checkbox"
                  checked={voice}
                  onChange={(e) => {
                    setVoice(e.target.checked);
                    if (!e.target.checked) window.speechSynthesis?.cancel();
                  }}
                />
                <span className="switch" />
              </label>
              {modal === "settings" && (
                <div className="setting-row">
                  <span>
                    <strong>Map appearance</strong>
                    <small>A view that feels right</small>
                  </span>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    {["Standard", "Dark", "Terrain"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="privacy-explanation">
                <LockKeyhole size={17} />
                <p>
                  Location is requested only when you tap “Find my location.”
                  Planning a route sends route coordinates to the public OSRM
                  service. Maps load from OpenFreeMap, OpenStreetMap France, or
                  OpenTopoMap; these providers receive your IP address and map
                  requests. Local browser data is not encrypted or synced.
                </p>
              </div>
              <button className="modal-action" onClick={exportData}>
                <Download size={17} /> Export my data <ArrowUpRight size={15} />
              </button>
              <button
                className="modal-action danger-text"
                onClick={() => setModal("delete")}
              >
                <Trash2 size={17} /> Delete my local data{" "}
                <ChevronRight size={15} />
              </button>
            </>
          )}
          {modal === "profile" && (
            <>
              <div className="profile-intro">
                <span className="large-avatar">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="soft-tag">LOCAL PROFILE</span>
                <p>Your own little corner of the world.</p>
              </div>
              <label className="form-label">
                What should we call you?
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="primary-button full"
                onClick={() => {
                  store("name", name.trim() || "Traveler");
                  setName(name.trim() || "Traveler");
                  setModal("");
                  notify("Your profile has been updated.");
                }}
              >
                Save profile <Check size={16} />
              </button>
              <p className="panel-note">
                This profile stays on this device. Account registration and
                multi-device sync are not connected yet.
              </p>
            </>
          )}
          {modal === "origin" && (
            <>
              <p className="body-copy">
                Start from a saved place, or share your current location.
              </p>
              <button
                className="modal-action"
                onClick={() => {
                  locate();
                  setModal("");
                }}
              >
                <LocateFixed size={18} /> Use my current GPS location
              </button>
              {places.slice(0, 4).map((p) => (
                <button
                  className="modal-place"
                  key={p.id}
                  onClick={() => {
                    requestRef.current?.abort();
                    requestRef.current = null;
                    setRouteBusy(false);
                    setOrigin(p.coords);
                    setOriginName(p.name);
                    setRoute({ ...initialRoute, coords: [] });
                    setNavigating(false);
                    setModal("");
                  }}
                >
                  <MapPin size={17} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.address}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </>
          )}
          {["stops", "save-place"].includes(modal) && (
            <>
              <p className="body-copy">
                {modal === "stops"
                  ? "Add up to three places. Your route follows the stop order you choose."
                  : "Save a destination to make your next visit a little easier."}
              </p>
              {places
                .filter((p) =>
                  modal === "save-place"
                    ? !saved.includes(p.id)
                    : p.id !== destination.id &&
                      !stops.some((s) => s.id === p.id),
                )
                .map((p) => (
                  <button
                    className="modal-place"
                    key={p.id}
                    disabled={modal === "stops" && stops.length >= 3}
                    onClick={() => {
                      if (modal === "save-place") savePlace(p);
                      else {
                        requestRef.current?.abort();
                        requestRef.current = null;
                        setRouteBusy(false);
                        setStops([...stops, p]);
                        setRoute({ ...initialRoute, coords: [] });
                        setNavigating(false);
                        notify(`${p.name} added as a stop`);
                      }
                      setModal("");
                    }}
                  >
                    <MapPin size={17} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.address}</small>
                    </span>
                    <Plus size={15} />
                  </button>
                ))}
            </>
          )}
          {modal === "map-info" && (
            <>
              <div className="modal-intro">
                <span className="modal-feature-icon">
                  <Map size={28} />
                </span>
                <p>
                  Good things happen when the world is open. Waypoint uses
                  community-built map data and open source tools.
                </p>
              </div>
              <div className="credits-row">
                <strong>Map rendering</strong>
                <a href="https://maplibre.org" target="_blank" rel="noreferrer">
                  MapLibre GL <ArrowUpRight size={13} />
                </a>
              </div>
              <div className="credits-row">
                <strong>Geographic data</strong>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenStreetMap <ArrowUpRight size={13} />
                </a>
              </div>
              <div className="credits-row">
                <strong>Basemap</strong>
                <span>OpenFreeMap · OSM France · OpenTopoMap</span>
              </div>
              <div className="credits-row">
                <strong>Driving directions</strong>
                <span>OSRM</span>
              </div>
              <p className="panel-note">
                The opening journey and suggestions are illustrative. Route
                times are estimates without live traffic. Search currently
                covers curated San Francisco destinations.
              </p>
            </>
          )}
          {modal === "delete" && (
            <>
              <p className="body-copy">
                This removes your saved places, trips, downloaded directions,
                and preferences from this browser. This can’t be undone.
              </p>
              <button
                className="danger-button full"
                onClick={() => {
                  ["saved", "trips", "offline", "remember", "name"].forEach(
                    (key) => localStorage.removeItem(`waypoint-${key}`),
                  );
                  setSaved([]);
                  setTrips([]);
                  setOfflineRoutes([]);
                  setRemember(false);
                  setName("Traveler");
                  setVoice(false);
                  window.speechSynthesis?.cancel();
                  setModal("");
                  notify("Your local data has been deleted.");
                }}
              >
                Delete my local data
              </button>
              <button
                className="outline-button full"
                onClick={() => setModal("privacy")}
              >
                Keep my data
              </button>
            </>
          )}
          {modal.startsWith("offline-") &&
            (() => {
              const savedRoute = offlineRoutes[Number(modal.split("-")[1])];
              return savedRoute ? (
                <>
                  <h3>{savedRoute.name}</h3>
                  <p className="body-copy">
                    {savedRoute.route.distance.toFixed(1)} km · About{" "}
                    {savedRoute.route.duration} min
                  </p>
                  <ol className="directions-list">
                    {savedRoute.route.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              ) : null;
            })()}
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const element = ref.current;
    const first = element?.querySelector<HTMLElement>("button,input,select,a");
    first?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !element) return;
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,a[href]",
        ),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    element?.addEventListener("keydown", trap);
    return () => {
      previous?.focus();
      element?.removeEventListener("keydown", trap);
    };
  }, []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default App;
