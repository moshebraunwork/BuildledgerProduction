"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { searchAddress } from "@/app/(app)/jobs/address-actions";
import { Loader2, MapPin } from "lucide-react";

export interface AddressValue {
  place: string;
  lat: number | null;
  lng: number | null;
}

// Address field that only accepts a value picked from the live lookup — there is
// no free-text entry. As the user types, it searches OpenStreetMap and shows a
// dropdown; choosing a result commits the address + its coordinates. Typing
// without choosing leaves the previously committed value unchanged (and shows a
// hint), so the stored address is always a real, geocoded place.
export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: AddressValue | null;
  onChange: (v: AddressValue | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState(value?.place ?? "");
  const [results, setResults] = React.useState<{ display_name: string; lat: number; lng: number }[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Whether the current text corresponds to a committed (picked) address.
  const [confirmed, setConfirmed] = React.useState(!!value?.place);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the parent resets the value (e.g. form cleared / reopened).
  React.useEffect(() => {
    setQuery(value?.place ?? "");
    setConfirmed(!!value?.place);
  }, [value?.place]);

  // Close the dropdown on outside click.
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleType(v: string) {
    setQuery(v);
    setConfirmed(false);
    if (v.trim() === "") {
      onChange(null);
      setResults([]);
      setOpen(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      setOpen(true);
      try {
        const res = await searchAddress(v);
        setResults(res.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function pick(r: { display_name: string; lat: number; lng: number }) {
    setQuery(r.display_name);
    setConfirmed(true);
    setOpen(false);
    onChange({ place: r.display_name, lat: r.lat, lng: r.lng });
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder ?? "Start typing an address…"}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => {
          if (results.length) setOpen(true);
        }}
        autoComplete="off"
      />

      {!confirmed && query.trim() !== "" && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
          Pick an address from the list to set the location.
        </p>
      )}
      {confirmed && value?.lat != null && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> Location pinned
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-2 text-sm text-muted-foreground">No matches yet — keep typing.</div>
          )}
          {!loading &&
            results.map((r, i) => (
              <button
                key={`${r.lat},${r.lng},${i}`}
                type="button"
                onClick={() => pick(r)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{r.display_name}</span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
