"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import { Layers, LocateFixed, Loader2, Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEmployeeLocations } from "@/app/(app)/map/actions";

export interface JobPin {
  id: string;
  title: string;
  place: string | null;
  status: string;
  lat: number;
  lng: number;
}
export interface EmpPin {
  employee_id: string | null;
  name: string;
  lat: number;
  lng: number;
  at: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const BRIEFCASE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
const USER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

// Light mode keeps full-colour OpenStreetMap tiles; dark mode uses CARTO's dark
// basemap so the map matches the app theme. Both are free/keyless.
const TILES = {
  light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATTR = "&copy; OpenStreetMap contributors";

export function MapView({
  jobs,
  initialEmployees,
  canSeeEmployees,
  onJobClick,
  onEmployeeClick,
  onJobHover,
  highlightJobId,
  panJobId,
  className,
}: {
  jobs: JobPin[];
  initialEmployees: EmpPin[];
  canSeeEmployees: boolean;
  onJobClick?: (id: string) => void;
  onEmployeeClick?: (emp: EmpPin) => void;
  onJobHover?: (id: string | null) => void;
  highlightJobId?: string | null;
  panJobId?: string | null;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const elRef = React.useRef<HTMLDivElement>(null);
  const LRef = React.useRef<any>(null);
  const ctxRef = React.useRef<{ map: any; tile: any; jobs: any; emps: any; me: any } | null>(null);
  const jobMarkersRef = React.useRef<Map<string, any>>(new Map());
  const onJobRef = React.useRef(onJobClick);
  const onEmpRef = React.useRef(onEmployeeClick);
  const onHoverRef = React.useRef(onJobHover);
  onJobRef.current = onJobClick;
  onEmpRef.current = onEmployeeClick;
  onHoverRef.current = onJobHover;

  const [ready, setReady] = React.useState(false);
  const [employees, setEmployees] = React.useState<EmpPin[]>(initialEmployees);
  const [showJobs, setShowJobs] = React.useState(true);
  const [showEmps, setShowEmps] = React.useState(true);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [myLoc, setMyLoc] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => setEmployees(initialEmployees), [initialEmployees]);

  function jobIcon(highlight: boolean) {
    const L = LRef.current;
    const size = highlight ? 38 : 30;
    const ring = highlight ? ";box-shadow:0 0 0 4px rgba(37,99,235,.35),0 1px 4px rgba(0,0,0,.45)" : ";box-shadow:0 1px 4px rgba(0,0,0,.45)";
    return L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#2563eb;border:2px solid white;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;transition:all .1s${ring}">${BRIEFCASE_SVG}</div>`,
    });
  }
  function empIcon() {
    const L = LRef.current;
    return L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div style="width:30px;height:30px;border-radius:9999px;background:#16a34a;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer">${USER_SVG}</div>`,
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
      map = L.map(elRef.current, { scrollWheelZoom: true, zoomControl: true }).setView([40.7128, -74.006], 9);
      const isDark = document.documentElement.classList.contains("dark");
      const tile = L.tileLayer(isDark ? TILES.dark : TILES.light, { attribution: ATTR, maxZoom: 19 }).addTo(map);
      ctxRef.current = { map, tile, jobs: L.layerGroup(), emps: L.layerGroup(), me: L.layerGroup().addTo(map) };
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      ctxRef.current = null;
      jobMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap tiles with the theme.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.map.removeLayer(ctx.tile);
    ctx.tile = L.tileLayer(resolvedTheme === "dark" ? TILES.dark : TILES.light, { attribution: ATTR, maxZoom: 19 }).addTo(ctx.map);
    ctx.tile.bringToBack();
  }, [resolvedTheme, ready]);

  // (Re)draw all markers when data or readiness changes.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L || !ready) return;
    ctx.jobs.clearLayers();
    ctx.emps.clearLayers();
    jobMarkersRef.current.clear();
    const pts: [number, number][] = [];

    for (const j of jobs) {
      if (!Number.isFinite(+j.lat) || !Number.isFinite(+j.lng)) continue;
      const m = L.marker([+j.lat, +j.lng], { icon: jobIcon(false) })
        .bindTooltip(`${escapeHtml(j.title)}${j.place ? " — " + escapeHtml(j.place) : ""}`)
        .on("click", () => onJobRef.current?.(j.id))
        .on("mouseover", () => onHoverRef.current?.(j.id))
        .on("mouseout", () => onHoverRef.current?.(null));
      m.addTo(ctx.jobs);
      jobMarkersRef.current.set(j.id, m);
      pts.push([+j.lat, +j.lng]);
    }
    for (const e of employees) {
      if (!Number.isFinite(+e.lat) || !Number.isFinite(+e.lng)) continue;
      const when = e.at ? new Date(e.at).toLocaleString() : "unknown time";
      L.marker([+e.lat, +e.lng], { icon: empIcon() })
        .bindTooltip(`${escapeHtml(e.name)} — last seen ${escapeHtml(when)}`)
        .on("click", () => onEmpRef.current?.(e))
        .addTo(ctx.emps);
      pts.push([+e.lat, +e.lng]);
    }
    if (pts.length) ctx.map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, employees, ready]);

  // Layer visibility — depends on `ready` so the layers attach on first load
  // (previously they only appeared after toggling).
  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    if (showJobs) ctx.jobs.addTo(ctx.map);
    else ctx.map.removeLayer(ctx.jobs);
  }, [showJobs, ready, jobs, employees]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    if (showEmps && canSeeEmployees) ctx.emps.addTo(ctx.map);
    else ctx.map.removeLayer(ctx.emps);
  }, [showEmps, canSeeEmployees, ready, jobs, employees]);

  // My-location marker.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.me.clearLayers();
    if (myLoc) L.marker([myLoc.lat, myLoc.lng], { icon: meIcon() }).bindTooltip("You are here").addTo(ctx.me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLoc, ready]);

  // Highlight a job marker (driven by table hover or map hover).
  React.useEffect(() => {
    if (!ready) return;
    for (const [id, m] of jobMarkersRef.current) {
      m.setIcon(jobIcon(id === highlightJobId));
      if (id === highlightJobId) m.setZIndexOffset(1000);
      else m.setZIndexOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightJobId, ready]);

  // Pan to a job when the table requests it (hovering a table row).
  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready || !panJobId) return;
    const job = jobs.find((j) => j.id === panJobId);
    if (!job) return;
    ctx.map.panTo([+job.lat, +job.lng], { animate: true });
    if (ctx.map.getZoom() < 12) ctx.map.setZoom(13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panJobId, ready]);

  // Periodic employee refresh.
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

  // `isolate` confines Leaflet's internal z-index stack to this box, so the map
  // can never paint over page elements like the table's right-click menu.
  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className)}>
      <div ref={elRef} className="absolute inset-0" />

      {/* Floating controls (top-right) */}
      <div className="absolute right-2 top-2 z-[600] flex items-center gap-2">
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-md border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent disabled:opacity-50"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          My location
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
          >
            <Layers className="h-3.5 w-3.5" /> Layers
          </button>
          {filterOpen && (
            <div className="absolute right-0 z-[700] mt-1 w-48 rounded-md border bg-popover p-2 shadow-lg">
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
      </div>
    </div>
  );
}
