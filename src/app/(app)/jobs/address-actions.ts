"use server";

import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { geocode } from "@/lib/ai/geo";

// Address lookup for the job form's autocomplete. Reuses the same free
// OpenStreetMap geocoder (with its in-memory cache + rate limiting) the AI uses.
// Read-only; gated by jobs.edit since it's used while creating/editing a job.
export async function searchAddress(query: string): Promise<{ results: { display_name: string; lat: number; lng: number }[] }> {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.edit")) return { results: [] };
  const q = (query || "").trim();
  if (q.length < 3) return { results: [] };
  try {
    const results = await geocode(q, 6);
    return { results };
  } catch {
    return { results: [] };
  }
}
