import { useCallback, useEffect, useRef, useState } from "react";
import type { Fix } from "../lib/types";
export type LocationStatus =
  "idle" | "loading" | "ready" | "denied" | "unavailable" | "timeout";
const messages = {
  denied:
    "Location permission was denied. Enable it in your browser’s site settings, or search for a starting point.",
  unavailable:
    "Your location is unavailable. Move to an area with a clearer GPS signal or select a starting point.",
  timeout:
    "Finding your location took too long. Try again outdoors or choose a starting point.",
};
export function useLocation() {
  const [fix, setFix] = useState<Fix | null>(null),
    [status, setStatus] = useState<LocationStatus>("idle"),
    [permission, setPermission] = useState<PermissionState | "unknown">(
      "unknown",
    ),
    [watching, setWatching] = useState(false);
  const watch = useRef<number | null>(null),
    generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setWatching(false);
  }, []);
  useEffect(() => {
    let permissionStatus: PermissionStatus | undefined,
      cancelled = false;
    const update = () => {
      if (permissionStatus) setPermission(permissionStatus.state);
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (cancelled) return;
        permissionStatus = p;
        update();
        p.addEventListener("change", update);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      permissionStatus?.removeEventListener("change", update);
      generation.current++;
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    };
  }, []);
  const start = useCallback(
    (
      continuous = false,
      onFix?: (fix: Fix) => void,
      onFailure?: () => void,
    ) => {
      stop();
      if (!navigator.geolocation) {
        setStatus("unavailable");
        onFailure?.();
        return;
      }
      const token = ++generation.current;
      setStatus("loading");
      const success = (position: GeolocationPosition) => {
        if (generation.current !== token) return;
        const next: Fix = {
          coords: [position.coords.longitude, position.coords.latitude],
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          timestamp: position.timestamp,
          segment: 0,
        };
        setFix(next);
        setStatus("ready");
        setPermission("granted");
        onFix?.(next);
      };
      const fail = (error: GeolocationPositionError) => {
        if (generation.current !== token) return;
        setStatus(
          error.code === 1
            ? "denied"
            : error.code === 3
              ? "timeout"
              : "unavailable",
        );
        if (error.code === 1) {
          setPermission("denied");
          stop();
        }
        onFailure?.();
      };
      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: continuous ? 2000 : 0,
      };
      if (continuous) {
        setWatching(true);
        watch.current = navigator.geolocation.watchPosition(
          success,
          fail,
          options,
        );
      } else navigator.geolocation.getCurrentPosition(success, fail, options);
    },
    [stop],
  );
  return {
    fix,
    status,
    permission,
    watching,
    start,
    stop,
    error: status in messages ? messages[status as keyof typeof messages] : "",
  };
}
