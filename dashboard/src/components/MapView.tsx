import { forwardRef, lazy, Suspense, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Coord, Fix, Place, Route } from "../lib/types";
export type MapHandle = {
  zoom: (n: number) => void;
  locate: (c: Coord) => void;
  reset: () => void;
  center: () => Coord;
  fit: (c: Coord[]) => void;
};
export type MapProps = {
  origin: Place | null;
  destination: Place | null;
  fix: Fix | null;
  routes: Route[];
  selected: number;
  trace: Fix[];
  theme: string;
  places: Place[];
  onPlace: (p: Place) => void;
  onRoute: (n: number) => void;
  offline: boolean;
  offlineAttribution: string;
  onStatus?: (s: string) => void;
  onFailure?: () => void;
};
const VectorMap = lazy(() => import("./VectorMap"));
const RasterMap = lazy(() => import("./RasterMap"));
function supportsWebGL() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
export default forwardRef<MapHandle, MapProps>(function MapView(props, ref) {
  const [vector, setVector] = useState(supportsWebGL),
    [status, setStatus] = useState("loading"),
    [retry, setRetry] = useState(0);
  const Renderer = vector && !props.offline ? VectorMap : RasterMap;
  return (
    <>
      <Suspense
        fallback={
          <div className="map-status" role="status">
            Loading your map…
          </div>
        }
      >
        <Renderer
          key={`${retry}-${vector}-${props.offline}`}
          ref={ref}
          {...props}
          onStatus={setStatus}
          onFailure={() => {
            setVector(false);
            setStatus("loading");
          }}
        />
      </Suspense>
      {status === "loading" && (
        <div className="map-status" role="status">
          <span className="spinner" /> Loading map…
        </div>
      )}
      {status === "error" && (
        <div className="map-status map-failure" role="alert">
          <strong>Map tiles couldn’t load</strong>
          <span>
            {props.offline
              ? "This area or zoom level has no downloaded tiles. Open a saved region."
              : "The tile service or connection is unavailable. Retry to reconnect."}
          </span>
          <button
            className="outline-button"
            onClick={() => {
              setStatus("loading");
              setRetry((n) => n + 1);
            }}
          >
            <RefreshCw size={16} /> Retry map
          </button>
        </div>
      )}
    </>
  );
});
