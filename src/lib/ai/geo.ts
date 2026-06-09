// ============================================================================
// Geocoding for Ask AI's location tools — OpenStreetMap / Nominatim.
//
// Free and keyless. Turns a place described in words ("Evergreen Supermarket,
// Spring Valley") into coordinates, and provides a straight-line distance helper
// so the assistant can rank jobs by how near they are.
//
// Read-only friendly: results are cached in memory only (never written to the
// database), so the assistant still mutates nothing. Calls are serialized and
// spaced ~1.1s apart to respect Nominatim's usage policy (≤1 request/second).
// ============================================================================

const USER_AGENT = "BuildLedger/1.0 (ask-ai assistant)";

export interface GeoResult {
  display_name: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, GeoResult[]>();

// Serialize requests with a ~1.1s gap so we never burst Nominatim. Errors keep
// the chain alive so one failure doesn't wedge later lookups.
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let chain: Promise<unknown> = Promise.resolve();
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(() => fn());
  chain = result.then(() => delay(1100), () => delay(1100));
  return result;
}

// Look up a place/address. Returns up to `limit` candidate matches (best first).
export async function geocode(query: string, limit = 5): Promise<GeoResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  const cached = cache.get(key);
  if (cached) return cached.slice(0, limit);

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const results = await throttle(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((d: any) => ({
        display_name: String(d.display_name ?? ""),
        lat: Number(d.lat),
        lng: Number(d.lon),
      }))
      .filter((r: GeoResult) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  });

  cache.set(key, results);
  return results.slice(0, limit);
}

// Great-circle ("as the crow flies") distance in miles.
export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
