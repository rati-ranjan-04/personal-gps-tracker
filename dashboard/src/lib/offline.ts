import type { Coord, Region } from "./types";
export const tileURL = (z: number, x: number, y: number) =>
  `/api/offline-tile?z=${z}&x=${x}&y=${y}`;
export function regionTiles(center: Coord) {
  const tiles: string[] = [];
  for (let z = 12; z <= 15; z++) {
    const lat = (Math.max(-85, Math.min(85, center[1])) * Math.PI) / 180;
    const cx = Math.floor(((center[0] + 180) / 360) * 2 ** z);
    const cy = Math.floor(
      ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * 2 ** z,
    );
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = (cx + dx + 2 ** z) % 2 ** z,
          y = cy + dy;
        if (y >= 0 && y < 2 ** z) tiles.push(tileURL(z, x, y));
      }
  }
  return tiles;
}
export async function downloadRegion(
  name: string,
  center: Coord,
  attribution: string,
  progress: (n: number) => void,
  signal: AbortSignal,
): Promise<Region> {
  if (!("caches" in window))
    throw new Error(
      "Offline storage needs HTTPS and a browser with Cache Storage support.",
    );
  const id = crypto.randomUUID(),
    tiles = regionTiles(center);
  const cache = await caches.open("waypoint-region-" + id);
  let bytes = 0;
  try {
    for (let i = 0; i < tiles.length; i++) {
      if (signal.aborted) throw new Error("Download cancelled.");
      const response = await fetch(tiles[i], { signal });
      if (
        !response.ok ||
        !(response.headers.get("content-type") || "").startsWith("image/")
      )
        throw new Error(
          "A tile could not be downloaded. Check the offline tile server and retry.",
        );
      const blob = await response.blob();
      bytes += blob.size;
      await cache.put(
        tiles[i],
        new Response(blob, { headers: { "Content-Type": blob.type } }),
      );
      progress(Math.round(((i + 1) / tiles.length) * 100));
    }
    return {
      id,
      name,
      center,
      zoom: 14,
      tiles,
      bytes,
      createdAt: new Date().toISOString(),
      attribution,
    };
  } catch (error) {
    await caches.delete("waypoint-region-" + id);
    throw error;
  }
}
export async function deleteRegion(region: Region) {
  if ("caches" in window) await caches.delete("waypoint-region-" + region.id);
}
export async function clearRegions() {
  if ("caches" in window)
    for (const key of await caches.keys())
      if (key.startsWith("waypoint-region-")) await caches.delete(key);
}
