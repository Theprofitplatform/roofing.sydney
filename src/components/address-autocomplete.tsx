"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type Suggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  toPlace: () => google.maps.places.Place;
};

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

let placesLibPromise: Promise<google.maps.PlacesLibrary> | null = null;

function getPlaces(): Promise<google.maps.PlacesLibrary> {
  if (!GOOGLE_KEY) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set")
    );
  }
  if (!placesLibPromise) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    placesLibPromise = importLibrary("places") as Promise<
      google.maps.PlacesLibrary
    >;
  }
  return placesLibPromise;
}

export function AddressAutocomplete() {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlaces()
      .then((lib) => {
        if (cancelled) return;
        sessionTokenRef.current = new lib.AutocompleteSessionToken();
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const lib = await getPlaces();
        const { suggestions: rawSuggestions } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: sessionTokenRef.current ?? undefined,
            includedRegionCodes: ["au"],
            includedPrimaryTypes: ["street_address", "premise", "subpremise"],
          });

        const parsed: Suggestion[] = rawSuggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => Boolean(p))
          .slice(0, 5)
          .map((p) => ({
            placeId: p.placeId,
            mainText: p.mainText?.text ?? p.text.text,
            secondaryText: p.secondaryText?.text ?? "",
            toPlace: () => p.toPlace(),
          }));

        setSuggestions(parsed);
        setActiveIdx(-1);
        setOpen(parsed.length > 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Autocomplete failed");
      }
    }, 180);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function resolveAndGo(s: Suggestion) {
    setLoading(true);
    setOpen(false);
    try {
      const place = s.toPlace();
      await place.fetchFields({
        fields: ["location", "formattedAddress", "id"],
      });

      const loc = place.location;
      if (!loc) throw new Error("Address has no coordinates");

      const params = new URLSearchParams({
        lat: loc.lat().toFixed(6),
        lng: loc.lng().toFixed(6),
        address:
          place.formattedAddress ?? `${s.mainText}, ${s.secondaryText}`,
        placeId: place.id ?? s.placeId,
      });

      // Session token is consumed once Details is resolved; rotate for next query.
      const lib = await getPlaces();
      sessionTokenRef.current = new lib.AutocompleteSessionToken();

      router.push(`/preview?${params.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIdx === -1 ? 0 : activeIdx;
      if (suggestions[idx]) void resolveAndGo(suggestions[idx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Your home address
      </label>
      <div className="flex items-center gap-2 rounded-2xl border border-border-strong bg-background p-1.5 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-4 focus-within:ring-[var(--ring)]">
        <div className="pl-3 text-muted">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="10"
              r="2.5"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </div>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Enter your Sydney home address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          disabled={loading}
          className="flex-1 bg-transparent py-2.5 text-base text-foreground placeholder:text-muted-2 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => suggestions[0] && resolveAndGo(suggestions[0])}
          disabled={loading || suggestions.length === 0}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Loading…" : "Continue"}
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                void resolveAndGo(s);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`cursor-pointer px-4 py-3 text-left text-sm ${
                i === activeIdx ? "bg-surface" : "bg-background"
              }`}
            >
              <div className="font-medium text-foreground">{s.mainText}</div>
              <div className="text-xs text-muted">{s.secondaryText}</div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
