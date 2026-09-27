import { useEffect, useState, useId } from "react";
import { MapPin, Search, X, History } from "lucide-react";
import type { Coord, Place } from "../lib/types";
import { search } from "../lib/api";
export default function PlaceSearch({
  center,
  onSelect,
  recents,
  onClear,
  placeholder = "Search a destination",
  autofocus = false,
}: {
  center?: Coord;
  onSelect: (p: Place) => void;
  recents: Place[];
  onClear: () => void;
  placeholder?: string;
  autofocus?: boolean;
}) {
  const resultsId = useId();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Place[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setResults([]);
    setError("");
    if (query.trim().length < 3) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      () =>
        search(query, center, controller.signal)
          .then((value) => {
            if (!controller.signal.aborted) setResults(value);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          }),
      450,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, center?.[0], center?.[1], retry]);
  const choose = (place: Place) => {
    onSelect(place);
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="real-search">
      <div className="search-input">
        <Search size={18} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          autoFocus={autofocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          aria-expanded={open}
          aria-controls={resultsId}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={16} />
          </button>
        )}
      </div>
      {open && (
        <div className="real-results" id={resultsId}>
          <div className="search-label">
            {query ? "SEARCH RESULTS" : "RECENT SEARCHES"}
            <button aria-label="Close results" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          {loading ? (
            <p className="state-line" role="status">
              <span className="spinner" /> Searching places…
            </p>
          ) : error ? (
            <div className="state-line" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry search
              </button>
            </div>
          ) : query.trim().length >= 3 && !results.length ? (
            <p className="state-line">
              No places found. Try a street, city, or landmark.
            </p>
          ) : query && query.trim().length < 3 ? (
            <p className="state-line">Enter at least 3 characters.</p>
          ) : !query && !recents.length ? (
            <p className="state-line">
              Find an address, business, or place anywhere.
            </p>
          ) : null}
          {(query ? results : recents).map((p) => (
            <button className="result-row" key={p.id} onClick={() => choose(p)}>
              {query ? <MapPin size={18} /> : <History size={18} />}
              <span>
                <strong>{p.name}</strong>
                <small>{p.address}</small>
              </span>
            </button>
          ))}
          {!query && recents.length > 0 && (
            <button className="text-button" onClick={onClear}>
              Clear recent searches
            </button>
          )}
        </div>
      )}
    </div>
  );
}
