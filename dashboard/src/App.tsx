import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Briefcase,
  GraduationCap,
  Heart,
  Users,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bike,
  Bookmark,
  CarFront,
  Check,
  ChevronRight,
  Compass,
  Download,
  Footprints,
  Home,
  Layers,
  Leaf,
  LocateFixed,
  Map,
  MapPin,
  Maximize,
  Minus,
  Navigation,
  Navigation2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  X,
  Clock3,
  Pencil,
  WifiOff,
  Menu,
} from "lucide-react";
import type { MapHandle } from "./components/MapView";
import PlaceSearch from "./components/PlaceSearch";
import Dialog from "./components/Dialog";
import type {
  Coord,
  Fix,
  Mode,
  Place,
  Profile,
  Region,
  Route,
  SavedPlace,
  Settings,
  Trip,
} from "./lib/types";
import { categories, defaults, savedCategories } from "./lib/types";
import {
  formatDistance,
  formatDuration,
  insights,
  isCoord,
  isPlace,
  isRoute,
  isTrip,
  meters,
  positionPlace,
  remaining,
  traceDistance,
} from "./lib/domain";
import {
  clearLocal,
  exportJSON,
  read,
  useStored,
  write,
} from "./lib/repository";
import { nearby, request, route as calculate } from "./lib/api";
import { clearRegions, deleteRegion, downloadRegion } from "./lib/offline";
import { useLocation } from "./hooks/useLocation";
import { useTracker } from "./hooks/useTracker";
const MapView = lazy(() => import("./components/MapView"));
const navItems = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "trips", label: "My trips", icon: RouteIcon },
  { id: "saved", label: "Saved places", icon: Bookmark },
  { id: "offline", label: "Offline maps", icon: Download },
  { id: "insights", label: "Your insights", icon: TrendingUp },
];
const modes = [
  { id: "drive" as Mode, label: "Drive", icon: CarFront },
  { id: "cycle" as Mode, label: "Cycle", icon: Bike },
  { id: "walk" as Mode, label: "Walk", icon: Footprints },
  { id: "transit" as Mode, label: "Transit", icon: Navigation },
];
const empty: never[] = [];
const savedValid = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (p) => isPlace(p) && typeof (p as SavedPlace).savedAt === "string",
  );
const settingsValid = (v: any) =>
  v &&
  ["light", "dark", "system"].includes(v.appearance) &&
  ["Standard", "Dark", "Terrain"].includes(v.mapStyle) &&
  ["km", "mi"].includes(v.units) &&
  modes.some((m) => m.id === v.mode) &&
  ["autoRecenter", "saveHistory", "voice"].every(
    (k) => typeof v[k] === "boolean",
  ) &&
  v.preferences &&
  typeof v.preferences.avoidTolls === "boolean" &&
  typeof v.preferences.avoidHighways === "boolean" &&
  typeof v.preferences.avoidHills === "boolean" &&
  ["fastest", "shortest"].includes(v.preferences.strategy) &&
  ["Road", "Hybrid", "City", "Mountain"].includes(v.preferences.bicycleType) &&
  ["normal", "relaxed"].includes(v.preferences.walkingPace);
function PlaceIcon({ category }: { category: string }) {
  const Icon =
    (
      {
        Home,
        Work: Briefcase,
        College: GraduationCap,
        Family: Users,
        Favorite: Heart,
      } as Record<string, typeof Home>
    )[category] || MapPin;
  return <Icon size={18} />;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <svg viewBox="0 0 34 34" aria-hidden="true">
          <path
            d="m5 25 9-19 5.5 12L30 11 19.5 30 14 18 5 25Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span>
        waypoint<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Map;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Toggle({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}
function App() {
  const [page, setPage] = useState("explore"),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [more, setMore] = useState(false),
    [sheet, setSheet] = useState(true);
  const [settings, setSettings] = useStored<Settings>(
      "settings",
      defaults,
      settingsValid,
    ),
    [profile, setProfile] = useStored<Profile>(
      "profile",
      { name: "", avatar: "leaf" },
      (v: any) =>
        v && typeof v.name === "string" && typeof v.avatar === "string",
    ),
    [saved, setSaved] = useStored<SavedPlace[]>("saved", [], savedValid),
    [trips, setTrips] = useStored<Trip[]>(
      "trips",
      [],
      (v) => Array.isArray(v) && v.every(isTrip),
    ),
    [recents, setRecents] = useStored<Place[]>(
      "recents",
      [],
      (v) => Array.isArray(v) && v.every(isPlace),
    ),
    [regions, setRegions] = useStored<Region[]>(
      "regions",
      [],
      (v: any) =>
        Array.isArray(v) &&
        v.every(
          (r) =>
            typeof r.id === "string" &&
            isCoord(r.center) &&
            Array.isArray(r.tiles) &&
            Number.isFinite(r.bytes),
        ),
    ),
    [directions, setDirections] = useStored<
      { destination: Place; route: Route }[]
    >(
      "directions",
      [],
      (v: any) =>
        Array.isArray(v) &&
        v.every((x) => isPlace(x.destination) && isRoute(x.route)),
    );
  const [origin, setOrigin] = useState<Place | null>(null),
    [destination, setDestination] = useState<Place | null>(null),
    [mode, setMode] = useState<Mode>(settings.mode),
    [stops, setStops] = useState<Place[]>([]),
    [routes, setRoutes] = useState<Route[]>([]),
    [selected, setSelected] = useState(0),
    [routeStatus, setRouteStatus] = useState("idle"),
    [routeError, setRouteError] = useState(""),
    [routeRetry, setRouteRetry] = useState(0);
  const [category, setCategory] = useState(""),
    [discover, setDiscover] = useState<Place[]>([]),
    [discoveryStatus, setDiscoveryStatus] = useState("idle"),
    [discoveryError, setDiscoveryError] = useState(""),
    [detail, setDetail] = useState<Place | null>(null),
    [viewCenter, setViewCenter] = useState<Coord | undefined>(),
    [layers, setLayers] = useState(false),
    [theme, setTheme] = useState(settings.mapStyle),
    [online, setOnline] = useState(navigator.onLine),
    [offlineRegion, setOfflineRegion] = useState<Region | null>(null);
  const [config, setConfig] = useState({
      transit: false,
      offlineTiles: false,
      offlineAttribution: "© OpenStreetMap contributors",
      version: "0.2.0",
    }),
    [configError, setConfigError] = useState("");
  const [editing, setEditing] = useState<Place | null>(null),
    [savedName, setSavedName] = useState(""),
    [savedCategory, setSavedCategory] = useState("Favorite"),
    [tripQuery, setTripQuery] = useState(""),
    [tripMode, setTripMode] = useState("all"),
    [tripDetail, setTripDetail] = useState<Trip | null>(null),
    [replay, setReplay] = useState<Fix[]>([]),
    [playing, setPlaying] = useState(false),
    [replayIndex, setReplayIndex] = useState(0);
  const [navigation, setNavigation] = useState(false),
    [startingTrip, setStartingTrip] = useState(false),
    [confirm, setConfirm] = useState<{
      title: string;
      body: string;
      action: () => void | Promise<void>;
    } | null>(null),
    [regionName, setRegionName] = useState(""),
    [downloadProgress, setDownloadProgress] = useState<number | null>(null),
    [downloadError, setDownloadError] = useState(""),
    [storageBytes, setStorageBytes] = useState<number | null>(null),
    [profileName, setProfileName] = useState(profile.name),
    [profileAvatar, setProfileAvatar] = useState(profile.avatar),
    [recovered, setRecovered] = useState<any>(() =>
      read(
        "draft",
        null,
        (v: any) =>
          v === null ||
          (Array.isArray(v?.points) &&
            v.points.length > 0 &&
            v.points.every(
              (p: any) =>
                isCoord(p?.coords) &&
                Number.isFinite(p.timestamp) &&
                Number.isFinite(p.accuracy) &&
                Number.isInteger(p.segment),
            ) &&
            Number.isFinite(Date.parse(v.startedAt)) &&
            modes.some((m) => m.id === v.mode) &&
            Number.isFinite(v.duration) &&
            v.duration >= 0),
      ),
    );
  const gps = useLocation(),
    tracker = useTracker(),
    map = useRef<MapHandle>(null),
    mapContainer = useRef<HTMLElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    downloadController = useRef<AbortController | null>(null),
    lastVoice = useRef("");
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const safe = (action: () => void) => {
    try {
      action();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const go = (next: string) => {
    setPage(next);
    setMore(false);
    setSheet(true);
  };
  const updateSettings = (next: Settings) => safe(() => setSettings(next));
  useEffect(() => {
    const listener = () => setOnline(navigator.onLine);
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.appearance =
        settings.appearance === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.appearance);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [settings.appearance]);
  useEffect(() => {
    const controller = new AbortController();
    request<typeof config>({ action: "config" }, controller.signal)
      .then(setConfig)
      .catch((e) => {
        if (!controller.signal.aborted) setConfigError(e.message);
      });
    navigator.storage
      ?.estimate()
      .then((x) => setStorageBytes(x.usage ?? 0))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      downloadController.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const rememberSearch = useCallback(
    (place: Place) => {
      try {
        setRecents(
          [place, ...recents.filter((p) => p.id !== place.id)].slice(0, 12),
        );
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [recents, setRecents, notify],
  );
  const chooseDestination = useCallback(
    (place: Place) => {
      setDestination(place);
      setDetail(null);
      setPage("explore");
      setSheet(true);
      setReplay([]);
      setPlaying(false);
      setOfflineRegion(null);
      setNavigation(false);
      map.current?.locate(place.coords);
      rememberSearch(place);
    },
    [rememberSearch],
  );
  const [discoveryRetry, setDiscoveryRetry] = useState(0);
  const center = viewCenter || origin?.coords || gps.fix?.coords;
  const locate = () => {
    if (tracker.state === "recording") {
      if (gps.fix) map.current?.locate(gps.fix.coords);
      return;
    }
    gps.start(false, (fix) => {
      setOrigin(positionPlace(fix.coords));
      setViewCenter(fix.coords);
      map.current?.locate(fix.coords);
      notify(`Location found · accuracy ±${Math.round(fix.accuracy)} m`);
    });
  };
  useEffect(() => {
    setRoutes([]);
    setSelected(0);
    setRouteError("");
    if (!origin || !destination) {
      setRouteStatus("idle");
      return;
    }
    const controller = new AbortController();
    setRouteStatus("loading");
    const timer = setTimeout(
      () =>
        calculate(
          [origin.coords, ...stops.map((s) => s.coords), destination.coords],
          mode,
          settings.preferences,
          controller.signal,
        )
          .then((result) => {
            if (controller.signal.aborted) return;
            setRoutes(result);
            setRouteStatus("ready");
            map.current?.fit(result[0].coords);
          })
          .catch((e) => {
            if (!controller.signal.aborted) {
              setRouteStatus("error");
              setRouteError(e.message);
            }
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin, destination, mode, settings.preferences, stops, routeRetry]);
  useEffect(() => {
    if (!category || !center) return;
    const controller = new AbortController();
    setDiscoveryStatus("loading");
    setDiscoveryError("");
    setDiscover([]);
    nearby(category, center, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setDiscover(
          result.sort(
            (a, b) => meters(center, a.coords) - meters(center, b.coords),
          ),
        );
        setDiscoveryStatus("ready");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setDiscoveryStatus("error");
          setDiscoveryError(e.message);
        }
      });
    return () => controller.abort();
  }, [category, center?.[0], center?.[1], discoveryRetry]);
  const activeRoute = routes[selected];
  const navigationProgress = useMemo(
    () =>
      activeRoute && gps.fix ? remaining(activeRoute, gps.fix.coords) : null,
    [activeRoute, gps.fix],
  );
  const currentStep = useMemo(() => {
    if (!activeRoute) return null;
    if (!gps.fix) return activeRoute.steps[0];
    return activeRoute.steps.reduce(
      (best, s) =>
        meters(gps.fix!.coords, s.point) < meters(gps.fix!.coords, best.point)
          ? s
          : best,
      activeRoute.steps[0],
    );
  }, [activeRoute, gps.fix]);
  useEffect(() => {
    if (!navigation || !gps.fix) return;
    if (settings.autoRecenter) map.current?.locate(gps.fix.coords);
    if (
      settings.voice &&
      currentStep?.text &&
      lastVoice.current !== currentStep.text
    ) {
      lastVoice.current = currentStep.text;
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(currentStep.text));
      }
    }
  }, [gps.fix, navigation, settings.autoRecenter, settings.voice, currentStep]);
  useEffect(() => {
    if (!playing || !replay.length) return;
    const timer = setInterval(
      () =>
        setReplayIndex((i) => {
          if (i >= replay.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      Math.max(50, Math.min(800, 10000 / replay.length)),
    );
    return () => clearInterval(timer);
  }, [playing, replay]);
  const tracked = tracker.state === "recording" || tracker.state === "paused";
  const wasNavigating = useRef(false);
  useEffect(() => {
    if (wasNavigating.current && !navigation && !tracked) {
      gps.stop();
      window.speechSynthesis?.cancel();
    }
    wasNavigating.current = navigation;
  }, [navigation, tracked, gps.stop]);
  useEffect(() => {
    if (tracker.state === "paused") gps.stop();
  }, [tracker.state]);
  function startTracking() {
    if (tracked || startingTrip) return;
    if (tracker.pending || recovered) {
      setPage("trips");
      setSheet(true);
      notify(
        "Save, export or discard your unfinished recording before starting another trip.",
      );
      return;
    }
    setStartingTrip(true);
    gps.start(
      false,
      (first) => {
        tracker.start(mode, destination);
        tracker.sample(first);
        setStartingTrip(false);
        setOrigin(positionPlace(first.coords, "Trip start"));
        map.current?.locate(first.coords);
        gps.start(
          true,
          (fix) => tracker.sample(fix),
          () => {
            tracker.pause();
            gps.stop();
            notify(
              "Recording paused because GPS is unavailable. Resume when you are ready.",
            );
          },
        );
      },
      () => setStartingTrip(false),
    );
  }
  function saveCompleted(trip: Trip) {
    try {
      const identify = (place: Place) =>
        saved.find((s) => meters(s.coords, place.coords) < 100) || place;
      setTrips([
        {
          ...trip,
          origin: identify(trip.origin),
          destination: identify(trip.destination),
        },
        ...trips,
      ]);
      tracker.clear();
      setRecovered(null);
      notify("Your recorded trip is saved on this device.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function endTrip() {
    gps.stop();
    setNavigation(false);
    window.speechSynthesis?.cancel();
    const trip = tracker.finish();
    if (!trip) {
      tracker.clear();
      notify("No usable GPS points were recorded. No trip was saved.");
      return;
    }
    if (settings.saveHistory) saveCompleted(trip);
    else
      notify(
        "Trip ended. History is off; export or discard the recording below.",
      );
  }
  function startNavigation() {
    if (!activeRoute) return;
    if (tracker.state === "paused") {
      notify("Resume your trip before starting live navigation.");
      return;
    }
    setNavigation(true);
    setSheet(false);
    lastVoice.current = "";
    if (tracked) return;
    gps.start(true);
  }
  function exitNavigation() {
    setNavigation(false);
    setSheet(true);
    if (!tracked) gps.stop();
    window.speechSynthesis?.cancel();
  }
  function editPlace(place: Place) {
    setEditing(place);
    setSavedName(place.name);
    setSavedCategory(
      savedCategories.includes(place.category) ? place.category : "Favorite",
    );
    setModal("save");
  }
  function commitPlace() {
    if (!editing || !savedName.trim()) return;
    safe(() => {
      const item: SavedPlace = {
        ...editing,
        name: savedName.trim(),
        category: savedCategory,
        savedAt: new Date().toISOString(),
      };
      let next = saved.filter((p) => p.id !== item.id);
      if (["Home", "Work"].includes(item.category))
        next = next.map((p) =>
          p.category === item.category ? { ...p, category: "Favorite" } : p,
        );
      setSaved([...next, item]);
      setModal("");
      notify("Place saved. Your next visit is one tap away.");
    });
  }
  function replayTrip(trip: Trip) {
    setTripDetail(trip);
    setReplay(trip.points);
    setReplayIndex(trip.points.length - 1);
    setPlaying(false);
    setPage("trips");
    setSheet(true);
    setModal("");
    map.current?.fit(trip.points.map((p) => p.coords));
  }
  async function download() {
    if (!config.offlineTiles) {
      setDownloadError(
        "The operator must configure a tile source that permits offline downloads. Public map tiles are not bulk-downloaded.",
      );
      return;
    }
    const c = map.current?.center();
    if (!c) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloadProgress(0);
    setDownloadError("");
    try {
      const region = await downloadRegion(
        regionName.trim() || "My offline area",
        c,
        config.offlineAttribution,
        setDownloadProgress,
        controller.signal,
      );
      try {
        setRegions([...regions, region]);
      } catch (e) {
        await deleteRegion(region);
        throw e;
      }
      notify("Area downloaded for offline map viewing.");
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloadProgress(null);
      downloadController.current = null;
    }
  }
  function exportAll() {
    exportJSON({
      version: 2,
      profile,
      settings,
      savedPlaces: saved,
      trips,
      recents,
      regions,
      savedDirections: directions,
      pendingRecording: tracker.pending || recovered,
    });
    notify("Your local data was exported.");
  }
  const ask = (
    title: string,
    body: string,
    action: () => void | Promise<void>,
  ) => setConfirm({ title, body, action });
  const stats = useMemo(() => insights(trips), [trips]);
  const filteredTrips = useMemo(
    () =>
      trips.filter(
        (t) =>
          (tripMode === "all" || t.mode === tripMode) &&
          `${t.destination.name} ${t.origin.name}`
            .toLowerCase()
            .includes(tripQuery.toLowerCase()),
      ),
    [trips, tripQuery, tripMode],
  );
  const displayedPlaces = useMemo(
    () => (detail ? [detail] : category ? discover : empty),
    [detail, category, discover],
  );
  const displayedTrace = useMemo(
    () => (replay.length ? replay.slice(0, replayIndex + 1) : tracker.points),
    [replay, replayIndex, tracker.points],
  );
  const selectedRoutes = useMemo(
    () => (replay.length ? empty : routes),
    [replay.length, routes],
  );
  const onMapPlace = useCallback((place: Place) => {
    setDetail(place);
    setSheet(true);
    setPage("explore");
  }, []);
  const title =
    page === "settings"
      ? "Settings & preferences"
      : page === "privacy"
        ? "Privacy Center"
        : navItems.find((i) => i.id === page)?.label || "Explore";
  const distance = (n: number) => formatDistance(n, settings.units);
  const searchProps = {
    center,
    recents,
    onClear: () => safe(() => setRecents([])),
  };
  const formRouteOptions = (
    <>
      <p className="body-copy">
        These options are supported by Valhalla. Road preferences influence
        route selection; a route may still use an avoided road when no practical
        alternative exists.
      </p>
      {mode === "drive" && (
        <>
          <Toggle
            title="Avoid tolls"
            value={settings.preferences.avoidTolls}
            onChange={(v) =>
              updateSettings({
                ...settings,
                preferences: { ...settings.preferences, avoidTolls: v },
              })
            }
          />
          <Toggle
            title="Avoid highways"
            value={settings.preferences.avoidHighways}
            onChange={(v) =>
              updateSettings({
                ...settings,
                preferences: { ...settings.preferences, avoidHighways: v },
              })
            }
          />
          <label className="form-label">
            Route priority
            <select
              value={settings.preferences.strategy}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  preferences: {
                    ...settings.preferences,
                    strategy: e.target.value as "fastest" | "shortest",
                  },
                })
              }
            >
              <option value="fastest">Prefer faster route</option>
              <option value="shortest">Prefer shorter route</option>
            </select>
          </label>
        </>
      )}
      {mode === "cycle" && (
        <>
          <label className="form-label">
            Bicycle type
            <select
              value={settings.preferences.bicycleType}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  preferences: {
                    ...settings.preferences,
                    bicycleType: e.target.value,
                  },
                })
              }
            >
              {["Hybrid", "Road", "City", "Mountain"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <Toggle
            title="Prefer fewer hills"
            value={settings.preferences.avoidHills}
            onChange={(v) =>
              updateSettings({
                ...settings,
                preferences: { ...settings.preferences, avoidHills: v },
              })
            }
          />
        </>
      )}
      {mode === "walk" && (
        <label className="form-label">
          Walking pace
          <select
            value={settings.preferences.walkingPace}
            onChange={(e) =>
              updateSettings({
                ...settings,
                preferences: {
                  ...settings.preferences,
                  walkingPace: e.target.value as "normal" | "relaxed",
                },
              })
            }
          >
            <option value="normal">Normal · 5.1 km/h</option>
            <option value="relaxed">Relaxed · 3.5 km/h</option>
          </select>
        </label>
      )}
      {mode === "transit" && (
        <p className="body-copy">
          Transit routes use the current departure time.{" "}
          {config.transit
            ? "Available routes depend on the configured local schedules."
            : "No transit timetable service is configured for this deployment."}
        </p>
      )}
    </>
  );
  return (
    <div
      className={`app-shell waypoint-v2 ${navigation ? "navigation-active" : ""}`}
    >
      <aside className="sidebar">
        <button
          className="logo-link"
          onClick={() => go("explore")}
          aria-label="Waypoint home"
        >
          <Brand />
        </button>
        <div className="workspace-label">YOUR EVERYDAY, REIMAGINED</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "saved" && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <h3>Your world. Your choices.</h3>
            <p>Understand what stays on your device and what’s shared.</p>
            <button onClick={() => go("privacy")}>
              Open Privacy Center <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item settings ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            <span>Settings & preferences</span>
          </button>
          <button
            className="profile"
            onClick={() => {
              setProfileName(profile.name);
              setProfileAvatar(profile.avatar);
              setModal("profile");
            }}
          >
            <span className="avatar">
              {profile.avatar === "leaf" ? (
                <Leaf size={19} />
              ) : profile.avatar === "compass" ? (
                <Compass size={19} />
              ) : (
                profile.name.charAt(0).toUpperCase() || "W"
              )}
            </span>
            <span>
              <strong>{profile.name || "Your Waypoint"}</strong>
              <small>Local profile · this device</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="tiny-dot" /> Find your way, your way.
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="page-heading">
            <div>
              <h1>{page === "explore" ? "Explore your world" : title}</h1>
              <p>Find your way. Make it yours.</p>
            </div>
          </div>
          <div className="topbar-right">
            {!online && (
              <span className="offline-badge">
                <WifiOff size={14} /> Offline
              </span>
            )}
            <button
              className="private-badge"
              onClick={() => go("privacy")}
              aria-label="Open Privacy Center"
            >
              <ShieldCheck size={15} /> Privacy first
            </button>
            <button
              className="header-avatar"
              aria-label="Open profile"
              onClick={() => {
                setProfileName(profile.name);
                setProfileAvatar(profile.avatar);
                setModal("profile");
              }}
            >
              {profile.name.charAt(0).toUpperCase() || <Leaf size={17} />}
            </button>
          </div>
        </header>
        <main className="workspace">
          <section
            className={`planning-panel ${sheet ? "sheet-open" : "sheet-collapsed"} ${page !== "explore" ? "content-sheet" : ""}`}
            aria-label={title}
          >
            <button
              className="sheet-toggle"
              aria-label={sheet ? "Collapse panel" : "Expand panel"}
              onClick={() => setSheet(!sheet)}
            >
              <span />
            </button>
            {page === "explore" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">
                    <span className="tiny-dot" /> A BETTER WAY TO GET THERE
                  </span>
                  <h2>
                    {profile.name
                      ? `Where to, ${profile.name}?`
                      : "Where to next?"}
                  </h2>
                  <p>Every great day starts with a direction.</p>
                </div>
                <PlaceSearch {...searchProps} onSelect={chooseDestination} />
                <div className="route-planner">
                  <div className="travel-modes" aria-label="Travel mode">
                    {modes.map((m) => (
                      <button
                        key={m.id}
                        aria-pressed={mode === m.id}
                        className={mode === m.id ? "selected" : ""}
                        onClick={() => {
                          setMode(m.id);
                          setNavigation(false);
                        }}
                      >
                        <m.icon size={19} />
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="route-fields-v2">
                    <button onClick={() => setModal("origin")}>
                      <span className="start-dot" />
                      <span>{origin?.name || "Choose a starting point"}</span>
                      <Search size={15} />
                    </button>
                    <div>
                      <MapPin size={16} />
                      <span>
                        {destination?.name || "Search for your destination"}
                      </span>
                      {origin && destination && (
                        <button
                          aria-label="Swap origin and destination"
                          onClick={() => {
                            const previous = origin;
                            setOrigin(destination);
                            setDestination(previous);
                          }}
                        >
                          <ArrowDownUp size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  {stops.map((s, i) => (
                    <div className="stop-row" key={s.id}>
                      <span>{i + 1}</span>
                      {s.name}
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={() =>
                          setStops(stops.filter((x) => x.id !== s.id))
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                  <div className="route-options">
                    <button
                      disabled={stops.length >= 3}
                      onClick={() => setModal("stop")}
                    >
                      <Plus size={16} /> Add a stop
                    </button>
                    <button onClick={() => setModal("options")}>
                      <SlidersHorizontal size={16} /> Route options
                    </button>
                  </div>
                  {!origin && (
                    <button
                      className="primary-button full"
                      onClick={locate}
                      disabled={gps.status === "loading"}
                    >
                      <LocateFixed size={17} />
                      {gps.status === "loading"
                        ? "Finding your location…"
                        : "Use my current location"}
                    </button>
                  )}
                  {origin && !destination && (
                    <p className="body-copy compact">
                      Search anywhere to plan your next journey.
                    </p>
                  )}
                  {gps.error && (
                    <div className="inline-error" role="alert">
                      {gps.error}
                      <button onClick={locate}>Try location again</button>
                    </div>
                  )}
                  {gps.fix && (
                    <p className="location-status">
                      <span className="tiny-dot" /> Location accuracy ±
                      {Math.round(gps.fix.accuracy)} m
                    </p>
                  )}
                  {routeStatus === "loading" && (
                    <div className="skeleton-route" role="status">
                      <span className="spinner" /> Finding your{" "}
                      {mode === "drive"
                        ? "driving"
                        : mode === "cycle"
                          ? "cycling"
                          : mode === "walk"
                            ? "walking"
                            : "transit"}{" "}
                      route…
                    </div>
                  )}
                  {routeError && (
                    <div className="inline-error" role="alert">
                      {routeError}
                      <button onClick={() => setRouteRetry((n) => n + 1)}>
                        Retry routing
                      </button>
                    </div>
                  )}
                  {routes.length > 0 && (
                    <div className="route-alternatives">
                      {routes.map((r, i) => (
                        <button
                          key={r.id}
                          className={selected === i ? "selected" : ""}
                          aria-pressed={selected === i}
                          onClick={() => {
                            setSelected(i);
                            map.current?.fit(r.coords);
                          }}
                        >
                          <span>
                            <strong>{formatDuration(r.duration)}</strong>
                            <small>{r.label}</small>
                          </span>
                          <span>
                            {distance(r.distance)}
                            {selected === i && <Check size={16} />}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {activeRoute && !tracked && (
                  <button
                    className="outline-button full"
                    disabled={startingTrip}
                    onClick={startTracking}
                  >
                    <Play size={18} />{" "}
                    {startingTrip
                      ? "Waiting for location…"
                      : "Start trip recording"}
                  </button>
                )}
                {detail && (
                  <article className="place-detail-card">
                    <button
                      className="close-detail icon-button"
                      aria-label="Close place details"
                      onClick={() => setDetail(null)}
                    >
                      <X size={17} />
                    </button>
                    <span className="eyebrow">{detail.category}</span>
                    <h3>{detail.name}</h3>
                    <p>{detail.address}</p>
                    {center && (
                      <small>
                        {distance(meters(center, detail.coords))} away ·
                        straight-line distance
                      </small>
                    )}
                    <div className="button-row">
                      <button
                        className="primary-button"
                        onClick={() => chooseDestination(detail)}
                      >
                        <Navigation size={16} /> Navigate
                      </button>
                      <button
                        className="outline-button"
                        onClick={() => editPlace(detail)}
                      >
                        <Bookmark size={16} /> Save
                      </button>
                    </div>
                  </article>
                )}
                <section className="quick-section">
                  <div className="section-title">
                    <h3>Your go-to places</h3>
                    <button onClick={() => go("saved")}>
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {saved.length ? (
                    <div className="quick-places">
                      {saved.slice(0, 3).map((p) => (
                        <button key={p.id} onClick={() => chooseDestination(p)}>
                          <span className="quick-icon">
                            <PlaceIcon category={p.category} />
                          </span>
                          <strong>{p.name}</strong>
                          <small>{p.category}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="soft-empty">
                      <Bookmark size={20} />
                      <p>Save places you visit often for one-tap directions.</p>
                      <button
                        className="text-button"
                        onClick={() => setModal("add-place")}
                      >
                        Save your first place <Plus size={14} />
                      </button>
                    </div>
                  )}
                </section>
                <section className="suggested-section">
                  <div className="section-title">
                    <h3>
                      <Compass size={17} /> Around you
                    </h3>
                    <button
                      onClick={() => {
                        const c = map.current?.center();
                        setViewCenter(c);
                        setDiscoveryRetry((n) => n + 1);
                      }}
                    >
                      Use map center
                    </button>
                  </div>
                  {!center ? (
                    <div className="soft-empty">
                      <p>
                        Use your location or choose a map area to discover
                        nearby places.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="nearby-categories">
                        {categories.map((c) => (
                          <button
                            aria-pressed={category === c}
                            className={category === c ? "selected" : ""}
                            key={c}
                            onClick={() => {
                              setCategory(category === c ? "" : c);
                              setDetail(null);
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      {discoveryStatus === "loading" && category && (
                        <p className="state-line" role="status">
                          <span className="spinner" /> Discovering{" "}
                          {category.toLowerCase()}…
                        </p>
                      )}
                      {discoveryError && (
                        <div role="alert" className="inline-error">
                          {discoveryError}
                          <button
                            onClick={() => {
                              setDiscoveryRetry((n) => n + 1);
                            }}
                          >
                            Retry nearby search
                          </button>
                        </div>
                      )}
                      {category &&
                        discoveryStatus === "ready" &&
                        !discover.length && (
                          <p className="state-line">
                            No {category.toLowerCase()} found within 3 km.
                          </p>
                        )}
                      <div className="nearby-results">
                        {discover.slice(0, 12).map((p) => (
                          <button
                            className="result-row"
                            key={p.id}
                            onClick={() => {
                              setDetail(p);
                              map.current?.locate(p.coords);
                            }}
                          >
                            <MapPin size={18} />
                            <span>
                              <strong>{p.name}</strong>
                              <small>{p.address}</small>
                            </span>
                            <small>{distance(meters(center, p.coords))}</small>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
                <div className="panel-footnote">
                  <ShieldCheck size={14} /> Your journey. Your choices.
                </div>
              </>
            )}
            {page === "saved" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">YOUR WORLD, IN ONE PLACE</span>
                  <h2>Keep your favorites close.</h2>
                  <p>Home, work, and everywhere that matters.</p>
                </div>
                <button
                  className="primary-button full"
                  onClick={() => setModal("add-place")}
                >
                  <Plus size={18} /> Add a saved place
                </button>
                {!saved.length ? (
                  <Empty icon={Bookmark} title="No saved places yet.">
                    Save places you visit often for one-tap directions.
                  </Empty>
                ) : (
                  <div className="saved-list">
                    {saved.map((p) => (
                      <article key={p.id}>
                        <div className="section-title">
                          <span className="category-tag">
                            <PlaceIcon category={p.category} />
                            {p.category}
                          </span>
                          <div className="button-row">
                            <button
                              className="icon-button"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => editPlace(p)}
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Delete ${p.name}`}
                              onClick={() =>
                                ask(
                                  "Delete saved place?",
                                  `Remove ${p.name} from this device?`,
                                  () =>
                                    setSaved(
                                      saved.filter((s) => s.id !== p.id),
                                    ),
                                )
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                        <h3>{p.name}</h3>
                        <p>{p.address}</p>
                        <small>
                          {p.coords[1].toFixed(4)}, {p.coords[0].toFixed(4)}
                        </small>
                        <button
                          className="text-button"
                          onClick={() => chooseDestination(p)}
                        >
                          Get directions <ArrowRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            {page === "trips" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">YOUR JOURNEYS, REMEMBERED</span>
                  <h2>Every trip has a story.</h2>
                  <p>Real journeys, recorded only when you choose.</p>
                </div>
                {!tracked && !startingTrip && (
                  <button
                    className="primary-button full"
                    onClick={startTracking}
                  >
                    <Navigation size={18} /> Start a trip
                  </button>
                )}
                {gps.error && (
                  <p className="inline-error" role="alert">
                    {gps.error}
                  </p>
                )}
                {recovered?.points?.length > 0 && !tracked && (
                  <div className="info-banner">
                    <p>
                      An unfinished recording was recovered. Tracking is off.
                      <button
                        onClick={() => {
                          const points = recovered.points as Fix[];
                          const t: Trip = {
                            id: crypto.randomUUID(),
                            startedAt: recovered.startedAt,
                            endedAt: new Date(
                              points.at(-1)!.timestamp,
                            ).toISOString(),
                            origin: positionPlace(
                              points[0].coords,
                              "Recovered start",
                            ),
                            destination: positionPlace(
                              points.at(-1)!.coords,
                              "Recovered end",
                            ),
                            mode: recovered.mode || "walk",
                            points,
                            duration: recovered.duration,
                            distance: traceDistance(points),
                          };
                          saveCompleted(t);
                        }}
                      >
                        Save recovered trip
                      </button>
                      <button
                        onClick={() =>
                          ask(
                            "Discard recovered recording?",
                            "This unfinished trace will be deleted.",
                            () => {
                              tracker.clear();
                              setRecovered(null);
                            },
                          )
                        }
                      >
                        Discard recording
                      </button>
                    </p>
                  </div>
                )}
                {trips.length > 0 && (
                  <>
                    <div className="trip-filters">
                      <label className="search-input">
                        <Search size={16} />
                        <input
                          aria-label="Search trips"
                          placeholder="Search your trips"
                          value={tripQuery}
                          onChange={(e) => setTripQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter trips by mode"
                        value={tripMode}
                        onChange={(e) => setTripMode(e.target.value)}
                      >
                        <option value="all">All modes</option>
                        {modes.map((m) => (
                          <option value={m.id} key={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="section-title">
                      <h3>{filteredTrips.length} trips</h3>
                      <button
                        onClick={() =>
                          ask(
                            "Clear trip history?",
                            "All recorded trips will be deleted from this device.",
                            () => {
                              setTrips([]);
                              setReplay([]);
                              setTripDetail(null);
                            },
                          )
                        }
                      >
                        Clear history
                      </button>
                    </div>
                  </>
                )}
                {!trips.length ? (
                  <Empty icon={RouteIcon} title="No trips recorded yet.">
                    Start a trip to build your history.
                  </Empty>
                ) : !filteredTrips.length ? (
                  <p className="state-line">No trips match this search.</p>
                ) : (
                  <div className="trip-list">
                    {filteredTrips.map((t) => (
                      <article key={t.id}>
                        <button
                          className="trip-summary"
                          onClick={() => {
                            setTripDetail(t);
                            setModal("trip");
                          }}
                        >
                          <span className="list-icon">
                            <RouteIcon size={20} />
                          </span>
                          <span>
                            <small>
                              {new Date(t.startedAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}{" "}
                              · {t.mode}
                            </small>
                            <strong>
                              {t.origin.name} → {t.destination.name}
                            </strong>
                            <small>
                              {distance(t.distance)} ·{" "}
                              {formatDuration(t.duration)}
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                {replay.length > 0 && (
                  <div className="replay-card">
                    <h3>{tripDetail?.destination.name}</h3>
                    <p>
                      Recorded route replay · {replayIndex + 1} /{" "}
                      {replay.length} GPS points
                    </p>
                    <button
                      className="outline-button"
                      onClick={() => {
                        setReplayIndex(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
                      {playing ? "Pause replay" : "Replay trip"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setReplay([]);
                        setPlaying(false);
                      }}
                    >
                      Close replay
                    </button>
                  </div>
                )}
              </>
            )}
            {page === "offline" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">A LITTLE PREPARATION</span>
                  <h2>Ready for the quieter roads.</h2>
                  <p>Your saved directions, wherever you go.</p>
                </div>
                <div className="offline-status">
                  <span className="tiny-dot" />
                  {online ? "You’re online" : "You’re offline"} ·{" "}
                  {storageBytes === null
                    ? "Storage estimate unavailable"
                    : `${(storageBytes / 1048576).toFixed(1)} MB used by this site`}
                </div>
                <div className="info-banner">
                  <Download size={20} />
                  <p>
                    <strong>Offline map viewing</strong>
                    <br />
                    Downloaded areas work at zoom levels 12–15.
                    <br />
                    <strong>Offline route calculation</strong>
                    <br />
                    Not supported. Calculate new routes while online.
                  </p>
                </div>
                <h3 className="standalone-heading">Download a map area</h3>
                <p className="body-copy">
                  Move the map to your area. The download covers 36 tiles around
                  its center, at four zoom levels. Expected size: about 1–8 MB.
                </p>
                <label className="form-label">
                  Area name
                  <input
                    value={regionName}
                    onChange={(e) => setRegionName(e.target.value)}
                    placeholder="e.g. Around home"
                    maxLength={60}
                  />
                </label>
                {!config.offlineTiles && (
                  <div className="inline-notice">
                    Area downloads need an operator-configured source with
                    offline permission. Public OSM tiles are not
                    bulk-downloaded. Saved directions work now.
                  </div>
                )}
                {downloadProgress !== null ? (
                  <>
                    <progress
                      value={downloadProgress}
                      max="100"
                      aria-label="Region download progress"
                    />
                    <p className="state-line">
                      Downloading {downloadProgress}%
                    </p>
                    <button
                      className="outline-button full"
                      onClick={() => downloadController.current?.abort()}
                    >
                      Cancel download
                    </button>
                  </>
                ) : (
                  <button
                    className="primary-button full"
                    disabled={!config.offlineTiles || !online}
                    onClick={download}
                  >
                    <Download size={17} /> Download current area
                  </button>
                )}
                {downloadError && (
                  <p className="inline-error" role="alert">
                    {downloadError}
                  </p>
                )}
                <div className="section-title offline-title">
                  <h3>Downloaded areas</h3>
                  <span className="soft-tag">{regions.length}</span>
                </div>
                {!regions.length && (
                  <p className="body-copy">No areas downloaded yet.</p>
                )}
                {regions.map((r) => (
                  <div className="offline-route" key={r.id}>
                    <button
                      onClick={() => {
                        setOfflineRegion(r);
                        setTheme("Standard");
                        setTimeout(() => map.current?.locate(r.center), 400);
                        setSheet(false);
                      }}
                    >
                      <Map size={20} />
                      <span>
                        <strong>{r.name}</strong>
                        <small>
                          {(r.bytes / 1048576).toFixed(1)} MB · {r.tiles.length}{" "}
                          tiles
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${r.name}`}
                      onClick={() =>
                        ask("Delete downloaded area?", r.name, async () => {
                          await deleteRegion(r);
                          setRegions(regions.filter((x) => x.id !== r.id));
                          if (offlineRegion?.id === r.id)
                            setOfflineRegion(null);
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                {offlineRegion && (
                  <button
                    className="text-button"
                    onClick={() => setOfflineRegion(null)}
                  >
                    Return to online map
                  </button>
                )}
                <div className="section-title offline-title">
                  <h3>Saved directions</h3>
                </div>
                {activeRoute && destination && (
                  <button
                    className="outline-button full"
                    onClick={() =>
                      safe(() => {
                        setDirections(
                          [
                            { destination, route: activeRoute },
                            ...directions.filter(
                              (r) => r.destination.id !== destination.id,
                            ),
                          ].slice(0, 30),
                        );
                        notify("Directions saved for offline reading.");
                      })
                    }
                  >
                    <Download size={16} /> Save current directions
                  </button>
                )}
                {!directions.length && (
                  <p className="body-copy">
                    Plan a route and save its directions to read them offline.
                  </p>
                )}
                {directions.map((d, i) => (
                  <div className="offline-route" key={d.destination.id}>
                    <button onClick={() => setModal(`directions-${i}`)}>
                      <RouteIcon size={20} />
                      <span>
                        <strong>{d.destination.name}</strong>
                        <small>
                          {distance(d.route.distance)} ·{" "}
                          {formatDuration(d.route.duration)}
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete directions to ${d.destination.name}`}
                      onClick={() =>
                        ask(
                          "Delete saved directions?",
                          d.destination.name,
                          () =>
                            setDirections(directions.filter((_, n) => n !== i)),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {page === "insights" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">
                    YOUR PERSONAL MOBILITY SNAPSHOT
                  </span>
                  <h2>
                    Small journeys.
                    <br />
                    Bigger picture.
                  </h2>
                  <p>Insights from your recorded trips, on your device.</p>
                </div>
                {!trips.length ? (
                  <Empty icon={TrendingUp} title="Not enough trip data yet.">
                    Your insights will appear after you’ve completed a few
                    trips.
                  </Empty>
                ) : (
                  <>
                    <div className="insights-hero">
                      <Sparkles size={25} />
                      <h3>Your week in motion.</h3>
                      <p>
                        You travelled{" "}
                        {distance(
                          stats.weekly.reduce((n, t) => n + t.distance, 0),
                        )}{" "}
                        this week across {stats.weekly.length}{" "}
                        {stats.weekly.length === 1 ? "trip" : "trips"}.
                      </p>
                    </div>
                    <div className="stats-grid">
                      <div>
                        <RouteIcon size={19} />
                        <strong>{stats.count}</strong>
                        <span>Total recorded trips</span>
                      </div>
                      <div>
                        <MapPin size={19} />
                        <strong>{distance(stats.distance)}</strong>
                        <span>Total distance travelled</span>
                      </div>
                      <div>
                        <Clock3 size={19} />
                        <strong>{formatDuration(stats.average)}</strong>
                        <span>Average trip duration</span>
                      </div>
                      <div>
                        <Navigation size={19} />
                        <strong className="capitalize">
                          {stats.modes[0]?.[0]}
                        </strong>
                        <span>Most-used mode</span>
                      </div>
                    </div>
                    <h3 className="standalone-heading">This week</h3>
                    <div
                      className="activity-chart"
                      aria-label="Distance travelled by day this week"
                    >
                      {stats.days.map((day) => (
                        <div
                          key={day.label}
                          title={`${day.label}: ${distance(day.distance)}`}
                        >
                          <span>{distance(day.distance)}</span>
                          <div
                            style={{
                              height: `${Math.max(3, (day.distance / Math.max(1, ...stats.days.map((d) => d.distance))) * 90)}px`,
                            }}
                          />
                          <small>{day.label}</small>
                        </div>
                      ))}
                    </div>
                    <h3 className="standalone-heading">Most visited places</h3>
                    {stats.destinations.slice(0, 4).map(([name, count]) => (
                      <div className="insight-row" key={name}>
                        <span>{name}</span>
                        <strong>{count} visits</strong>
                      </div>
                    ))}
                    <h3 className="standalone-heading">Frequent routes</h3>
                    {stats.routes.slice(0, 3).map(([name, count]) => (
                      <div className="insight-row" key={name}>
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                    <div className="info-banner">
                      <TrendingUp size={19} />
                      <p>
                        This month: {stats.monthly.length} trips covering{" "}
                        {distance(
                          stats.monthly.reduce((n, t) => n + t.distance, 0),
                        )}
                        .<br />
                        {stats.morning >= 3
                          ? `${stats.morning} recorded weekday trips started between 6 and 10 am — a possible morning commute pattern.`
                          : "Not enough weekday morning trips to identify a commute pattern."}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
            {page === "privacy" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">YOUR DATA, YOUR DECISION</span>
                  <h2>Privacy, made clear.</h2>
                  <p>You’re always in control of recording.</p>
                </div>
                <div className="privacy-status">
                  <ShieldCheck size={25} />
                  <div>
                    <strong>Location permission: {gps.permission}</strong>
                    <p>
                      {gps.watching
                        ? "Live location is active."
                        : "Location tracking is off."}
                    </p>
                  </div>
                </div>
                {gps.watching && (
                  <button
                    className="outline-button full"
                    onClick={() => {
                      gps.stop();
                      if (tracker.state === "recording") tracker.pause();
                      exitNavigation();
                    }}
                  >
                    Stop live location access
                  </button>
                )}
                <h3 className="standalone-heading">
                  What stays on this device
                </h3>
                <p className="body-copy">
                  Your local profile, saved places, recent searches, recorded
                  GPS trips, preferences, and saved directions live in this
                  browser. Downloaded map tiles use Cache Storage. None of this
                  local storage is encrypted or cloud-synced.
                </p>
                <h3 className="standalone-heading">What leaves this device</h3>
                <p className="body-copy">
                  Search text, nearby search coordinates and requested route
                  endpoints pass through this deployment’s API to Photon,
                  Overpass and Valhalla (or operator-configured providers). Your
                  map viewport and IP address reach the map tile providers.
                  Recorded GPS traces stay in this browser. Navigation and
                  nearby searches can send current coordinates to these
                  services. External fonts also make network requests. Hosting
                  providers may retain request metadata.
                </p>
                <Toggle
                  title="Save completed trips"
                  detail="Only records after you explicitly start a trip"
                  value={settings.saveHistory}
                  onChange={(v) =>
                    updateSettings({ ...settings, saveHistory: v })
                  }
                />
                <button className="modal-action" onClick={exportAll}>
                  <Download size={18} /> Export my data{" "}
                  <ArrowUpRight size={16} />
                </button>
                <button
                  className="modal-action"
                  onClick={() =>
                    ask(
                      "Clear location history?",
                      "Delete recorded trips and any recoverable unfinished recording. An active recording will be stopped.",
                      () => {
                        gps.stop();
                        tracker.clear();
                        setRecovered(null);
                        setTrips([]);
                        setReplay([]);
                        setNavigation(false);
                      },
                    )
                  }
                >
                  <Trash2 size={18} /> Clear location history
                </button>
                <button
                  className="modal-action"
                  onClick={() =>
                    ask(
                      "Clear saved places?",
                      "This removes all saved places from this browser.",
                      () => setSaved([]),
                    )
                  }
                >
                  <Trash2 size={18} /> Clear saved places
                </button>
                <button
                  className="modal-action"
                  onClick={() =>
                    ask(
                      "Clear recent searches?",
                      "Remove all recent searches on this device.",
                      () => setRecents([]),
                    )
                  }
                >
                  <Trash2 size={18} /> Clear recent searches
                </button>
                <button
                  className="modal-action danger-text"
                  onClick={() =>
                    ask(
                      "Delete all local data?",
                      "This stops location access and deletes your profile, trips, saved places, preferences, searches, and downloaded areas. Export first if you want a copy.",
                      async () => {
                        gps.stop();
                        tracker.clear();
                        downloadController.current?.abort();
                        window.speechSynthesis?.cancel();
                        await clearRegions();
                        clearLocal();
                        location.reload();
                      },
                    )
                  }
                >
                  <Trash2 size={18} /> Delete all local data
                </button>
              </>
            )}
            {page === "settings" && (
              <>
                <div className="planner-heading">
                  <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                  <h2>Your way to Waypoint.</h2>
                  <p>Little choices for a better everyday.</p>
                </div>
                <h3 className="standalone-heading">Appearance</h3>
                <label className="form-label">
                  Theme
                  <select
                    value={settings.appearance}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        appearance: e.target.value as Settings["appearance"],
                      })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">Use system setting</option>
                  </select>
                </label>
                <h3 className="standalone-heading">Map & navigation</h3>
                <label className="form-label">
                  Default map style
                  <select
                    value={settings.mapStyle}
                    onChange={(e) => {
                      updateSettings({
                        ...settings,
                        mapStyle: e.target.value as Settings["mapStyle"],
                      });
                      setTheme(e.target.value as Settings["mapStyle"]);
                    }}
                  >
                    {["Standard", "Dark", "Terrain"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Distance units
                  <select
                    value={settings.units}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        units: e.target.value as "km" | "mi",
                      })
                    }
                  >
                    <option value="km">Kilometers</option>
                    <option value="mi">Miles</option>
                  </select>
                </label>
                <label className="form-label">
                  Default transport mode
                  <select
                    value={settings.mode}
                    onChange={(e) => {
                      updateSettings({
                        ...settings,
                        mode: e.target.value as Mode,
                      });
                      setMode(e.target.value as Mode);
                    }}
                  >
                    {modes.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Toggle
                  title="Auto-recenter during navigation"
                  value={settings.autoRecenter}
                  onChange={(v) =>
                    updateSettings({ ...settings, autoRecenter: v })
                  }
                />
                <Toggle
                  title="Voice directions"
                  detail="Experimental browser speech at nearby maneuver points"
                  value={settings.voice}
                  onChange={(v) => updateSettings({ ...settings, voice: v })}
                />
                <button
                  className="modal-action"
                  onClick={() => setModal("options")}
                >
                  <SlidersHorizontal size={18} /> Route preferences
                </button>
                <button className="modal-action" onClick={() => go("privacy")}>
                  <ShieldCheck size={18} /> Location and privacy controls
                </button>
                <h3 className="standalone-heading about-heading">
                  About Waypoint
                </h3>
                <p className="body-copy">
                  Waypoint — Find your way, your way.
                  <br />
                  Version {config.version}
                  <br />
                  Open-source mapping with MapLibre, Leaflet, Valhalla, Photon
                  and OpenStreetMap.
                </p>
                <a
                  className="text-button"
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap contributors <ArrowUpRight size={14} />
                </a>
                <a
                  className="text-button"
                  href="https://openmaptiles.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenMapTiles <ArrowUpRight size={14} />
                </a>
                {configError && <p className="inline-error">{configError}</p>}
              </>
            )}
          </section>
          <section
            ref={mapContainer}
            className={`map-workspace ${theme === "Dark" ? "dark-map" : ""}`}
            aria-label="Interactive map and navigation"
          >
            <Suspense fallback={<div className="map-status">Loading map…</div>}>
              <MapView
                ref={map}
                origin={replay.length ? tripDetail?.origin || null : origin}
                destination={
                  replay.length ? tripDetail?.destination || null : destination
                }
                fix={gps.fix}
                routes={selectedRoutes}
                selected={selected}
                trace={displayedTrace}
                theme={theme}
                places={displayedPlaces}
                onPlace={onMapPlace}
                onRoute={setSelected}
                offline={!!offlineRegion}
                offlineAttribution={offlineRegion?.attribution || ""}
              />
            </Suspense>
            <div className="mobile-search">
              <button
                aria-label="Open destination search"
                onClick={() => {
                  go("explore");
                  setModal("search");
                }}
              >
                <Search size={19} />
                <span>{destination?.name || "Where do you want to go?"}</span>
                <span className="mobile-brand">W</span>
              </button>
            </div>
            {!navigation && (
              <div className="map-top">
                <div className="map-live-status">
                  <span
                    className={`tiny-dot ${gps.watching ? "pulsing" : ""}`}
                  />
                  {offlineRegion
                    ? `Offline area: ${offlineRegion.name}`
                    : gps.watching
                      ? "Live location active"
                      : gps.fix
                        ? "Your location is ready"
                        : "Explore freely. Locate when you’re ready."}
                </div>
                <button
                  className="icon-button map-menu"
                  aria-label="Fullscreen map"
                  onClick={() => {
                    if (document.fullscreenElement) document.exitFullscreen?.();
                    else if (mapContainer.current?.requestFullscreen)
                      mapContainer.current.requestFullscreen().catch(() => {
                        setSheet(false);
                        notify("Map expanded. Use the panel handle to return.");
                      });
                    else setSheet(false);
                  }}
                >
                  <Maximize size={18} />
                </button>
              </div>
            )}
            <div className="map-controls">
              <button
                className="compass-control"
                aria-label="Reset map orientation"
                onClick={() => map.current?.reset()}
              >
                <span>N</span>
                <Navigation2 size={20} />
              </button>
              <div className="zoom-controls">
                <button
                  aria-label="Zoom in"
                  onClick={() => map.current?.zoom(1)}
                >
                  <Plus size={21} />
                </button>
                <span />
                <button
                  aria-label="Zoom out"
                  onClick={() => map.current?.zoom(-1)}
                >
                  <Minus size={21} />
                </button>
              </div>
              <button
                aria-label="Locate me"
                onClick={
                  navigation && gps.fix
                    ? () => map.current?.locate(gps.fix!.coords)
                    : locate
                }
              >
                <LocateFixed size={21} />
              </button>
            </div>
            <div className="map-bottom">
              <div className="map-layer-wrap">
                {layers && (
                  <div className="layer-picker">
                    <h3>Make it your map</h3>
                    <div>
                      {(["Standard", "Dark", "Terrain"] as const).map((t) => (
                        <button
                          key={t}
                          className={theme === t ? "chosen" : ""}
                          aria-pressed={theme === t}
                          onClick={() => {
                            setTheme(t);
                            setLayers(false);
                          }}
                        >
                          <span
                            className={`layer-thumbnail ${t.toLowerCase()}`}
                          >
                            <Map size={24} />
                          </span>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="layers-button"
                  aria-expanded={layers}
                  onClick={() => setLayers(!layers)}
                >
                  <Layers size={20} /> Map layers
                </button>
              </div>
              <button
                className="map-about"
                onClick={() => setModal("attribution")}
              >
                Map credits & data <ArrowUpRight size={13} />
              </button>
            </div>
            {navigation && activeRoute ? (
              <div className="live-navigation">
                <div className="navigation-instruction">
                  <Navigation size={28} />
                  <div>
                    <span className="eyebrow">
                      {gps.status === "loading"
                        ? "FINDING YOUR LOCATION"
                        : gps.watching
                          ? "LIVE NAVIGATION"
                          : "LOCATION PAUSED"}
                    </span>
                    <h3>{currentStep?.text || "Follow the displayed route"}</h3>
                    <p>{currentStep?.road || "Road name unavailable"}</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Exit navigation"
                    onClick={exitNavigation}
                  >
                    <X size={23} />
                  </button>
                </div>
                <div className="navigation-destination">
                  <strong>
                    {formatDuration(
                      navigationProgress?.seconds ?? activeRoute.duration,
                    )}
                  </strong>
                  <span>
                    {distance(
                      navigationProgress?.distance ?? activeRoute.distance,
                    )}{" "}
                    remaining
                    <br />
                    To {destination?.name}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Recenter navigation"
                    onClick={() =>
                      gps.fix && map.current?.locate(gps.fix.coords)
                    }
                  >
                    <LocateFixed size={24} />
                  </button>
                </div>
                {navigationProgress?.offRoute && (
                  <div className="inline-notice">
                    You may be off route.{" "}
                    <button
                      onClick={() => {
                        if (gps.fix) setOrigin(positionPlace(gps.fix.coords));
                      }}
                    >
                      Recalculate from here
                    </button>
                  </div>
                )}
                {gps.error && <p className="inline-error">{gps.error}</p>}
                <small>
                  GPS estimates · obey current road signs and conditions
                </small>
              </div>
            ) : (
              activeRoute &&
              destination &&
              !replay.length && (
                <div className="map-bottom-card">
                  <div className="route-summary-heading">
                    <span className="route-summary-icon">
                      <RouteIcon size={20} />
                    </span>
                    <div>
                      <h3>{destination.name}</h3>
                      <p>
                        {mode === "drive"
                          ? "Driving"
                          : mode === "cycle"
                            ? "Cycling"
                            : mode === "walk"
                              ? "Walking"
                              : "Transit"}{" "}
                        · {activeRoute.label}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Save destination"
                      onClick={() => editPlace(destination)}
                    >
                      <Bookmark size={18} />
                    </button>
                  </div>
                  <div className="route-summary-body">
                    <div className="route-metrics">
                      <div>
                        <strong>{formatDuration(activeRoute.duration)}</strong>
                        <span>Estimated travel time</span>
                      </div>
                      <div>
                        <strong>{distance(activeRoute.distance)}</strong>
                        <span>No live traffic</span>
                      </div>
                    </div>
                    <button className="start-button" onClick={startNavigation}>
                      <Navigation size={16} /> Navigate <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="route-summary-footer">
                    <span>Open road data · {activeRoute.provider}</span>
                    {!tracked && (
                      <button
                        onClick={startTracking}
                        disabled={startingTrip}
                        aria-label="Start trip recording"
                      >
                        <Play size={18} /> Record trip
                      </button>
                    )}
                    <button
                      aria-label="Save directions for offline reading"
                      onClick={() =>
                        safe(() => {
                          setDirections(
                            [
                              { destination, route: activeRoute },
                              ...directions.filter(
                                (r) => r.destination.id !== destination.id,
                              ),
                            ].slice(0, 30),
                          );
                          notify("Directions saved for offline reading.");
                        })
                      }
                    >
                      <Download size={18} />
                    </button>
                    <button
                      aria-label="View turn-by-turn directions"
                      onClick={() => setModal("directions")}
                    >
                      <RouteIcon size={18} />
                    </button>
                  </div>
                </div>
              )
            )}
          </section>
        </main>
        <footer className="app-footer">
          <span>Waypoint — Find your way, your way.</span>
          <button onClick={() => setModal("attribution")}>
            © OpenStreetMap · © OpenMapTiles <ArrowUpRight size={12} />
          </button>
        </footer>
      </div>
      {(tracked || startingTrip || tracker.pending) && (
        <div className="tracking-bar" role="status">
          <span
            className={`tracking-dot ${tracker.state === "recording" ? "pulsing" : ""}`}
          />
          <div>
            <strong>
              {startingTrip
                ? "Waiting for location permission…"
                : tracker.pending
                  ? "Recording ready to save"
                  : tracker.state === "paused"
                    ? "Trip paused"
                    : "Recording your trip"}
            </strong>
            <small>
              {Math.floor(tracker.elapsed / 60)}:
              {String(tracker.elapsed % 60).padStart(2, "0")} ·{" "}
              {distance(tracker.distance)}
              {gps.fix?.speed != null && tracker.state === "recording"
                ? ` · ${(gps.fix.speed * (settings.units === "mi" ? 2.23694 : 3.6)).toFixed(0)} ${settings.units === "mi" ? "mph" : "km/h"}`
                : ""}
            </small>
          </div>
          {tracked && (
            <>
              <button
                aria-label={
                  tracker.state === "recording" ? "Pause trip" : "Resume trip"
                }
                onClick={() => {
                  if (tracker.state === "recording") {
                    gps.stop();
                    tracker.pause();
                  } else {
                    tracker.resume();
                    gps.start(true, tracker.sample, () => {
                      tracker.pause();
                      gps.stop();
                    });
                  }
                }}
              >
                {tracker.state === "recording" ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} />
                )}
              </button>
              <button aria-label="End trip" onClick={endTrip}>
                <Square size={19} />
                <span>End trip</span>
              </button>
            </>
          )}
          {startingTrip && (
            <button
              onClick={() => {
                gps.stop();
                setStartingTrip(false);
              }}
            >
              Cancel
            </button>
          )}
          {tracker.pending && (
            <>
              <button onClick={() => saveCompleted(tracker.pending!)}>
                Save
              </button>
              <button
                onClick={() =>
                  exportJSON(tracker.pending, "waypoint-recording.json")
                }
              >
                Export
              </button>
              <button
                aria-label="Discard unsaved trip"
                onClick={() =>
                  ask(
                    "Discard unsaved trip?",
                    "This trace will be deleted.",
                    () => tracker.clear(),
                  )
                }
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      )}
      {tracker.storageError && (
        <div className="tracking-error" role="alert">
          {tracker.storageError}
        </div>
      )}
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 3).map((item) => (
          <button
            key={item.id}
            aria-current={page === item.id ? "page" : undefined}
            className={page === item.id ? "active" : ""}
            onClick={() => go(item.id)}
          >
            <item.icon size={22} />
            <span>{item.id === "saved" ? "Saved" : item.label}</span>
          </button>
        ))}
        <button
          className={more ? "active" : ""}
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          <Menu size={22} />
          <span>More</span>
        </button>
      </nav>
      {more && (
        <div className="mobile-more">
          {[
            ...navItems.slice(3),
            { id: "privacy", label: "Privacy Center", icon: ShieldCheck },
            { id: "settings", label: "Settings", icon: Settings2 },
          ].map((i) => (
            <button key={i.id} onClick={() => go(i.id)}>
              <i.icon size={20} />
              {i.label}
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {confirm && (
        <Dialog title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="body-copy">{confirm.body}</p>
          <div className="button-row">
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await confirm.action();
                  setConfirm(null);
                  notify("Your data has been updated.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Confirm deletion
            </button>
            <button className="outline-button" onClick={() => setConfirm(null)}>
              Keep it
            </button>
          </div>
        </Dialog>
      )}
      {modal && (
        <Dialog
          title={
            modal === "origin"
              ? "Choose a starting point"
              : modal === "profile"
                ? "Your personal workspace"
                : modal === "options"
                  ? "Your route preferences"
                  : modal === "save"
                    ? "Save a place that matters"
                    : modal === "add-place"
                      ? "Find a place to save"
                      : modal === "stop"
                        ? "Add a stop along the way"
                        : modal === "search"
                          ? "Where would you like to go?"
                          : modal === "trip"
                            ? "Your recorded journey"
                            : modal === "attribution"
                              ? "A world built on open data"
                              : "Your route directions"
          }
          onClose={() => setModal("")}
        >
          {["origin", "add-place", "stop", "search"].includes(modal) && (
            <>
              {modal === "origin" && (
                <button
                  className="modal-action"
                  onClick={() => {
                    setModal("");
                    locate();
                  }}
                >
                  <LocateFixed size={19} /> Use my current location
                </button>
              )}
              <PlaceSearch
                {...searchProps}
                autofocus
                placeholder={
                  modal === "origin"
                    ? "Search a starting point"
                    : "Search places"
                }
                onSelect={(p) => {
                  rememberSearch(p);
                  if (modal === "add-place") {
                    editPlace(p);
                    return;
                  }
                  if (modal === "origin") setOrigin(p);
                  else if (modal === "stop")
                    setStops([...stops, p].slice(0, 3));
                  else chooseDestination(p);
                  setModal("");
                }}
              />
              {saved.length > 0 && (
                <div className="modal-saved">
                  <h3>Your saved places</h3>
                  {saved.map((p) => (
                    <button
                      className="result-row"
                      key={p.id}
                      onClick={() => {
                        if (modal === "origin") setOrigin(p);
                        else if (modal === "stop")
                          setStops([...stops, p].slice(0, 3));
                        else if (modal === "add-place") {
                          editPlace(p);
                          return;
                        } else chooseDestination(p);
                        setModal("");
                      }}
                    >
                      <MapPin size={17} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.category}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {modal === "add-place" && gps.fix && (
                <button
                  className="text-button"
                  onClick={() =>
                    editPlace(positionPlace(gps.fix!.coords, "My place"))
                  }
                >
                  Save my current location
                </button>
              )}
            </>
          )}
          {modal === "save" && editing && (
            <>
              <label className="form-label">
                Place name
                <input
                  value={savedName}
                  maxLength={80}
                  onChange={(e) => setSavedName(e.target.value)}
                />
              </label>
              <label className="form-label">
                Category / icon
                <select
                  value={savedCategory}
                  onChange={(e) => setSavedCategory(e.target.value)}
                >
                  {savedCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <p className="body-copy">
                {editing.address}
                <br />
                {editing.coords[1].toFixed(5)}, {editing.coords[0].toFixed(5)}
              </p>
              <button
                className="primary-button full"
                disabled={!savedName.trim()}
                onClick={commitPlace}
              >
                <Bookmark size={18} /> Save place
              </button>
            </>
          )}
          {modal === "options" && formRouteOptions}
          {modal === "profile" && (
            <>
              <div className="profile-intro">
                <span className="large-avatar">
                  {profileAvatar === "leaf" ? (
                    <Leaf size={30} />
                  ) : profileAvatar === "compass" ? (
                    <Compass size={30} />
                  ) : (
                    profileName.charAt(0).toUpperCase() || "W"
                  )}
                </span>
                <span className="soft-tag">LOCAL PROFILE · THIS DEVICE</span>
              </div>
              <label className="form-label">
                What should we call you?
                <input
                  value={profileName}
                  maxLength={40}
                  placeholder="Your name"
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </label>
              <label className="form-label">
                Avatar
                <select
                  value={profileAvatar}
                  onChange={(e) => setProfileAvatar(e.target.value)}
                >
                  <option value="leaf">Leaf</option>
                  <option value="compass">Compass</option>
                  <option value="initial">Your initial</option>
                </select>
              </label>
              <button
                className="primary-button full"
                onClick={() =>
                  safe(() => {
                    setProfile({
                      name: profileName.trim(),
                      avatar: profileAvatar,
                    });
                    setModal("");
                    notify("Your local profile is saved.");
                  })
                }
              >
                Save profile <Check size={18} />
              </button>
              <p className="panel-note">
                No sign-in or cloud account is connected. This profile belongs
                to this browser.
              </p>
            </>
          )}
          {modal === "trip" && tripDetail && (
            <>
              <span className="category-tag">{tripDetail.mode}</span>
              <h3>
                {tripDetail.origin.name} → {tripDetail.destination.name}
              </h3>
              <p className="body-copy">
                {new Date(tripDetail.startedAt).toLocaleString()}
                <br />
                {distance(tripDetail.distance)} ·{" "}
                {formatDuration(tripDetail.duration)}
                <br />
                {tripDetail.points.length} recorded GPS points
              </p>
              <button
                className="primary-button full"
                onClick={() => replayTrip(tripDetail)}
              >
                <Play size={17} /> View recorded route
              </button>
              <button
                className="modal-action danger-text"
                onClick={() =>
                  ask(
                    "Delete this trip?",
                    "Its GPS trace and statistics will be removed.",
                    () => {
                      setTrips(trips.filter((t) => t.id !== tripDetail.id));
                      setModal("");
                      setReplay([]);
                      setTripDetail(null);
                    },
                  )
                }
              >
                <Trash2 size={18} /> Delete trip
              </button>
            </>
          )}
          {(modal === "directions" || modal.startsWith("directions-")) &&
            (() => {
              const item =
                modal === "directions"
                  ? { destination, route: activeRoute }
                  : directions[Number(modal.split("-")[1])];
              return item?.route ? (
                <>
                  <h3>{item.destination?.name}</h3>
                  <p className="body-copy">
                    {distance(item.route.distance)} ·{" "}
                    {formatDuration(item.route.duration)}
                  </p>
                  <ol className="directions-list">
                    {item.route.steps.map((step, i) => (
                      <li key={i}>
                        {step.text}
                        <small> {distance(step.distance)}</small>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>No directions are selected.</p>
              );
            })()}
          {modal === "attribution" && (
            <>
              <p className="body-copy">
                Waypoint — Find your way, your way.
                <br />
                Open geographic data, with credit to the people who make it
                possible.
              </p>
              <div className="credits-row">
                <strong>Map data</strong>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap contributors
                </a>
              </div>
              <div className="credits-row">
                <strong>Vector schema</strong>
                <a
                  href="https://openmaptiles.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenMapTiles
                </a>
              </div>
              <div className="credits-row">
                <strong>Maps</strong>
                <span>OpenFreeMap · OSM France</span>
              </div>
              <div className="credits-row">
                <strong>Terrain</strong>
                <span>OpenTopoMap · SRTM</span>
              </div>
              <div className="credits-row">
                <strong>Search & routes</strong>
                <span>Photon · Valhalla · Overpass</span>
              </div>
              <p className="panel-note">
                Provider availability and coverage vary. Route estimates are not
                live traffic or guaranteed travel times.
              </p>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
export default App;
