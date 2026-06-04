"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import { Layers, LocateFixed, Loader2, Briefcase, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEmployeeLocations } from "./actions";

export interface JobPin {
  id: string;
  title: string;
  place: string | null;
  status: string;
  lat: number;
  lng: number;
}
export interface EmpPin {
  name: string;
  lat: number;
  lng: number;
  at: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Inline glyphs used inside the map markers (so jobs and people look different).
const BRIEFCASE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
const USER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const TILE_ATTR = "&copy; OpenStreetMap contributors &copy; CARTO";

export function MapView({
  jobs,
  initialEmployees,
  canSeeEmployees,
}: {
  jobs: JobPin[];
  initialEmployees: EmpPin[];
  canSeeEmployees: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const elRef = React.useRef<HTMLDivElement>(null);
  const LRef = React.useRef<any>(null);
  const ctxRef = React.useRef<{ map: any; tile: any; jobs: any; emps: any; me: any } | null>(null);

  const [employees, setEmployees] = React.useState<EmpPin[]>(initialEmployees);
  const [showJobs, setShowJobs] = React.useState(true);
  const [showEmps, setShowEmps] = React.useState(true);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [myLoc, setMyLoc] = React.useState<{ lat: number; lng: number } | null>(null);

  function markerIcon(kind: "job" | "employee") {
    const L = LRef.current;
    const bg = kind === "job" ? "#2563eb" : "#16a34a";
    const glyph = kind === "job" ? BRIEFCASE_SVG : USER_SVG;
    return L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
      html: `<div style="width:30px;height:30px;border-radius:9999px;background:${bg};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff">${glyph}</div>`,
    });
  }
  function meIcon() {
    const L = LRef.current;
    return L.divIcon({
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      html: `<div style="width:18px;height:18px;border-radius:9999px;background:#f59e0b;border:3px solid white;box-shadow:0 0 0 3px rgba(245,158,11,.45)"></div>`,
    });
  }

  // Initialise the map once.
  React.useEffect(() => {
    let cancelled = false;
    let map: any;
    (async () => {
      const mod: any = await import("leaflet");
      const L = mod.default ?? mod;
      if (cancelled || !elRef.current) return;
      LRef.current = L;
      map = L.map(elRef.current, { scrollWheelZoom: true }).setView([40.7128, -74.006], 9);
      const isDark = document.documentElement.classList.contains("dark");
      const tile = L.tileLayer(isDark ? TILES.dark : TILES.light, { attribution: TILE_ATTR, maxZoom: 20 }).addTo(map);
      ctxRef.current = {
        map,
        tile,
        jobs: L.layerGroup(),
        emps: L.layerGroup(),
        me: L.layerGroup().addTo(map),
      };
      drawJobsAndEmps();
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the tile layer when the theme changes.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.map.removeLayer(ctx.tile);
    ctx.tile = L.tileLayer(resolvedTheme === "dark" ? TILES.dark : TILES.light, { attribution: TILE_ATTR, maxZoom: 20 }).addTo(ctx.map);
    ctx.tile.bringToBack();
  }, [resolvedTheme]);

  const drawJobsAndEmps = React.useCallback(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.jobs.clearLayers();
    ctx.emps.clearLayers();
    const pts: [number, number][] = [];

    for (const j of jobs) {
      if (!Number.isFinite(+j.lat) || !Number.isFinite(+j.lng)) continue;
      L.marker([+j.lat, +j.lng], { icon: markerIcon("job") })
        .bindPopup(`<b>${escapeHtml(j.title)}</b><br>${escapeHtml(j.place ?? "")}<br><i>${escapeHtml(j.status)}</i>`)
        .addTo(ctx.jobs);
      pts.push([+j.lat, +j.lng]);
    }
    for (const e of employees) {
      if (!Number.isFinite(+e.lat) || !Number.isFinite(+e.lng)) continue;
      const when = e.at ? new Date(e.at).toLocaleString() : "unknown time";
      L.marker([+e.lat, +e.lng], { icon: markerIcon("employee") })
        .bindPopup(`<b>${escapeHtml(e.name)}</b><br><span style="opacity:.7">Last seen: ${escapeHtml(when)}</span>`)
        .addTo(ctx.emps);
      pts.push([+e.lat, +e.lng]);
    }
    if (pts.length) ctx.map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, employees]);

  React.useEffect(() => {
    drawJobsAndEmps();
  }, [drawJobsAndEmps]);

  // Toggle layer visibility.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (showJobs) ctx.jobs.addTo(ctx.map);
    else ctx.map.removeLayer(ctx.jobs);
  }, [showJobs, employees, jobs]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (showEmps && canSeeEmployees) ctx.emps.addTo(ctx.map);
    else ctx.map.removeLayer(ctx.emps);
  }, [showEmps, canSeeEmployees, employees, jobs]);

  // Draw my-location marker.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.me.clearLayers();
    if (myLoc) L.marker([myLoc.lat, myLoc.lng], { icon: meIcon() }).bindPopup("You are here").addTo(ctx.me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLoc]);

  // Periodically refresh employee positions.
  React.useEffect(() => {
    if (!canSeeEmployees) return;
    const id = setInterval(async () => {
      const res = await getEmployeeLocations();
      if ("employees" in res) setEmployees(res.employees);
    }, 60000);
    return () => clearInterval(id);
  }, [canSeeEmployees]);

  function locateMe() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLoc(loc);
        ctxRef.current?.map.setView([loc.lat, loc.lng], 14);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={locateMe} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          My location
        </Button>

        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setFilterOpen((o) => !o)}>
            <Layers className="h-4 w-4" /> Layers
          </Button>
          {filterOpen && (
            <div className="absolute left-0 z-[500] mt-1 w-52 rounded-md border bg-popover p-2 shadow-lg">
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-blue-600" /> Jobs ({jobs.length})</span>
                <input type="checkbox" checked={showJobs} onChange={(e) => setShowJobs(e.target.checked)} />
              </label>
              {canSeeEmployees && (
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                  <span className="flex items-center gap-2"><User className="h-4 w-4 text-green-600" /> Employees ({employees.length})</span>
                  <input type="checkbox" checked={showEmps} onChange={(e) => setShowEmps(e.target.checked)} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-blue-600" /> Jobs</span>
          {canSeeEmployees && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-green-600" /> Employees</span>}
        </div>
      </div>

      <div ref={elRef} className="h-[calc(100vh-13rem)] min-h-[420px] w-full overflow-hidden rounded-lg border" />
    </div>
  );
}
