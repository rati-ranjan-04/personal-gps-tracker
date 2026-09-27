import type { Coord, Mode, Place, Preferences, Route } from "./types";
import { isPlace, isRoute } from "./domain";
export async function request<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/navigation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Unable to connect to the navigation service. Check your connection and retry.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The navigation service is temporarily unavailable. Please retry.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "This service is unavailable. Please retry.");
  return data;
}
export async function search(
  query: string,
  center: Coord | undefined,
  signal: AbortSignal,
) {
  const result = await request<{ places: Place[] }>(
    { action: "search", query, center },
    signal,
  );
  if (!Array.isArray(result?.places))
    throw new Error(
      "The place service returned an invalid response. Please retry.",
    );
  return result.places.filter(isPlace);
}
export async function nearby(
  category: string,
  center: Coord,
  signal: AbortSignal,
) {
  const result = await request<{ places: Place[] }>(
    { action: "nearby", category, center },
    signal,
  );
  if (!Array.isArray(result?.places))
    throw new Error(
      "The place service returned an invalid response. Please retry.",
    );
  return result.places.filter(isPlace);
}
export async function route(
  points: Coord[],
  mode: Mode,
  preferences: Preferences,
  signal: AbortSignal,
) {
  const result = await request<{ routes: Route[] }>(
    { action: "route", points, mode, preferences },
    signal,
  );
  if (!Array.isArray(result?.routes))
    throw new Error(
      "The routing service returned an invalid response. Please retry.",
    );
  const routes = result.routes.filter(isRoute);
  if (!routes.length)
    throw new Error("No route is available for those locations.");
  return routes;
}
