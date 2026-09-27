import { useEffect, useRef, useState, useMemo } from "react";
import type { Fix, Mode, Place, Trip } from "../lib/types";
import { acceptFix, meters, positionPlace, traceDistance } from "../lib/domain";
import { write } from "../lib/repository";
export function useTracker() {
  const [state, setState] = useState<
      "idle" | "recording" | "paused" | "finished"
    >("idle"),
    [points, setPoints] = useState<Fix[]>([]),
    [elapsed, setElapsed] = useState(0),
    [pending, setPending] = useState<Trip | null>(null),
    [storageError, setStorageError] = useState("");
  const pointsRef = useRef<Fix[]>([]),
    active = useRef(false),
    started = useRef(""),
    duration = useRef(0),
    resumed = useRef(0),
    segment = useRef(0),
    mode = useRef<Mode>("drive"),
    destination = useRef<Place | null>(null),
    origin = useRef<Place | null>(null);
  const currentDuration = () =>
    duration.current +
    (active.current ? (Date.now() - resumed.current) / 1000 : 0);
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(
      () => setElapsed(Math.floor(currentDuration())),
      1000,
    );
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
    };
  }, [state]);
  function start(travelMode: Mode, target: Place | null) {
    pointsRef.current = [];
    setPoints([]);
    setPending(null);
    mode.current = travelMode;
    destination.current = target;
    origin.current = null;
    started.current = new Date().toISOString();
    duration.current = 0;
    resumed.current = Date.now();
    segment.current = 0;
    active.current = true;
    setElapsed(0);
    setState("recording");
  }
  function sample(fix: Fix) {
    if (!active.current) return;
    const point = { ...fix, segment: segment.current };
    if (!acceptFix(pointsRef.current.at(-1), point)) return;
    if (pointsRef.current.length >= 20000) {
      pause();
      setStorageError(
        "This trip reached its recording limit. End this trip and start another.",
      );
      return;
    }
    pointsRef.current = [...pointsRef.current, point];
    setPoints(pointsRef.current);
    if (!origin.current)
      origin.current = positionPlace(fix.coords, "Trip start");
    try {
      write("draft", {
        points: pointsRef.current,
        startedAt: started.current,
        duration: currentDuration(),
        mode: mode.current,
        destination: destination.current,
      });
    } catch (e) {
      setStorageError((e as Error).message);
    }
  }
  function pause() {
    if (!active.current) return;
    duration.current = currentDuration();
    active.current = false;
    setElapsed(Math.floor(duration.current));
    setState("paused");
  }
  function resume() {
    segment.current++;
    resumed.current = Date.now();
    active.current = true;
    setState("recording");
  }
  function finish() {
    duration.current = currentDuration();
    active.current = false;
    setState("finished");
    const last = pointsRef.current.at(-1);
    if (!last || !origin.current) return null;
    const trip: Trip = {
      id: crypto.randomUUID(),
      startedAt: started.current,
      endedAt: new Date().toISOString(),
      origin: origin.current,
      destination:
        destination.current &&
        meters(destination.current.coords, last.coords) < 150
          ? {
              ...destination.current,
              name: `Near ${destination.current.name}`,
              coords: last.coords,
            }
          : positionPlace(last.coords, "Trip end"),
      mode: mode.current,
      duration: duration.current,
      distance: traceDistance(pointsRef.current),
      points: pointsRef.current,
    };
    setPending(trip);
    return trip;
  }
  function clear() {
    active.current = false;
    pointsRef.current = [];
    setPoints([]);
    setPending(null);
    setState("idle");
    setStorageError("");
    localStorage.removeItem("waypoint:v2:draft");
  }
  return {
    state,
    points,
    elapsed,
    pending,
    storageError,
    start,
    sample,
    pause,
    resume,
    finish,
    clear,
    distance: useMemo(() => traceDistance(points), [points]),
  };
}
