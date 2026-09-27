import { useCallback, useState } from "react";
const prefix = "waypoint:v2:";
export function read<T>(
  key: string,
  fallback: T,
  validate?: (v: unknown) => boolean,
): T {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return !validate || validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    throw new Error(
      "Your device could not save this data. Free some browser storage, or export your data first.",
    );
  }
}
export function useStored<T>(
  key: string,
  initial: T,
  validate?: (v: unknown) => boolean,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => read(key, initial, validate));
  const save = useCallback(
    (next: T) => {
      write(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, save];
}
export function clearLocal() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith("waypoint-") || key.startsWith(prefix))
      localStorage.removeItem(key);
}
export function exportJSON(value: unknown, name = "waypoint-data.json") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
