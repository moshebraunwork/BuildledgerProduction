"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import { Layers, LocateFixed, Loader2, Plus, Minus } from "lucide-react";
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

// Job marker colour mirrors the status badge colours.
const STATUS_COLOR: Record<string, string> = {
  scheduled: "#f59e0b", // amber
  active: "#2563eb", // blue
  complete: "#16a34a", // green
};
const ALL_STATUSES = ["scheduled", "active", "complete"] as const;
const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", active: "Active", complete: "Complete" };

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
  onJobContext,
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
  onJobContext?: (id: string, x: number, y: number) => void;
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
  const onCtxRef = React.useRef(onJobContext);
  const onEmpRef = React.useRef(onEmployeeClick);
  const onHoverRef = React.useRef(onJobHover);
  onJobRef.current = onJobClick;
  onCtxRef.current = onJobContext;
  onEmpRef.current = onEmployeeClick;
  onHoverRef.current = onJobHover;

  const [ready, setReady] = React.useState(false);
  const [employees, setEmployees] = React.useState<EmpPin[]>(initialEmployees);
  // Completed jobs are hidden by default.
  const [statusOn, setStatusOn] = React.useState<Record<string, boolean>>({ scheduled: true, active: true, complete: false });
  const [showEmps, setShowEmps] = React.useState(true);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [myLoc, setMyLoc] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => setEmployees(initialEmployees), [initialEmployees]);

  function jobIcon(status: string, highlight: boolean) {
    const L = LRef.current;
    const size = highlight ? 38 : 30;
    const bg = STATUS_COLOR[status] ?? "#2563eb";
    const ring = highlight ? `;box-shadow:0 0 0 4px ${bg}59,0 1px 4px rgba(0,0,0,.45)` : ";box-shadow:0 1px 4px rgba(0,0,0,.45)";
    return L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:2px solid white;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;transition:all .1s${ring}">${BRIEFCASE_SVG}</div>`,
    });
  }
  function empIcon() {
    const L = LRef.current;
    return L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div style="width:30px;height:30px;border-radius:9999px;background:#7c3aed;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer">${USER_SVG}</div>`,
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

  React.useEffect(() => {
    let cancelled = false;
    let map: any;
    (async () => {
      const mod: any = await import("leaflet");
      const L = mod.default ?? mod;
      if (cancelled || !elRef.current) return;
      LRef.current = L;
      // Custom controls replace the default zoom buttons.
      map = L.map(elRef.current, { scrollWheelZoom: true, zoomControl: false }).setView([40.7128, -74.006], 9);
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

  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.map.removeLayer(ctx.tile);
    ctx.tile = L.tileLayer(resolvedTheme === "dark" ? TILES.dark : TILES.light, { attribution: ATTR, maxZoom: 19 }).addTo(ctx.map);
    ctx.tile.bringToBack();
  }, [resolvedTheme, ready]);

  // (Re)draw markers. Jobs are filtered by the per-status layer toggles.
  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L || !ready) return;
    ctx.jobs.clearLayers();
    ctx.emps.clearLayers();
    jobMarkersRef.current.clear();
    const pts: [number, number][] = [];

    for (const j of jobs) {
      if (!statusOn[j.status]) continue;
      if (!Number.isFinite(+j.lat) || !Number.isFinite(+j.lng)) continue;
      const m = L.marker([+j.lat, +j.lng], { icon: jobIcon(j.status, false) })
        .bindTooltip(`${escapeHtml(j.title)}${j.place ? " — " + escapeHtml(j.place) : ""}`)
        .on("click", () => onJobRef.current?.(j.id))
        .on("contextmenu", (ev: any) => {
          ev.originalEvent?.preventDefault?.();
          onCtxRef.current?.(j.id, ev.originalEvent?.clientX ?? 0, ev.originalEvent?.clientY ?? 0);
        })
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
  }, [jobs, employees, ready, statusOn]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    ctx.jobs.addTo(ctx.map); // jobs layer always attached; status toggles control contents
  }, [ready]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    if (showEmps && canSeeEmployees) ctx.emps.addTo(ctx.map);
    else ctx.map.removeLayer(ctx.emps);
  }, [showEmps, canSeeEmployees, ready, jobs, employees]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.me.clearLayers();
    if (myLoc) L.marker([myLoc.lat, myLoc.lng], { icon: meIcon() }).bindTooltip("You are here").addTo(ctx.me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLoc, ready]);

  // Highlight a job marker (table or map hover).
  React.useEffect(() => {
    if (!ready) return;
    const job = (id: string) => jobs.find((j) => j.id === id);
    for (const [id, m] of jobMarkersRef.current) {
      const j = job(id);
      if (!j) continue;
      m.setIcon(jobIcon(j.status, id === highlightJobId));
      m.setZIndexOffset(id === highlightJobId ? 1000 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightJobId, ready]);

  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready || !panJobId) return;
    const job = jobs.find((j) => j.id === panJobId);
    if (!job) return;
    ctx.map.panTo([+job.lat, +job.lng], { animate: true });
    if (ctx.map.getZoom() < 12) ctx.map.setZoom(13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panJobId, ready]);

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

  const ctlBtn =
    "flex h-8 w-8 items-center justify-center rounded-md border bg-background/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent disabled:opacity-50";

  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className)}>
      <div ref={elRef} className="absolute inset-0" />

      {/* Floating icon controls (top-right), all matching style + grouped */}
      <div className="absolute right-2 top-2 z-[600] flex items-center gap-1">
        <button type="button" className={ctlBtn} title="Zoom in" onClick={() => ctxRef.current?.map.zoomIn()}><Plus className="h-4 w-4" /></button>
        <button type="button" className={ctlBtn} title="Zoom out" onClick={() => ctxRef.current?.map.zoomOut()}><Minus className="h-4 w-4" /></button>
        <button type="button" className={ctlBtn} title="My location" onClick={locateMe} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        </button>
        <div className="relative">
          <button type="button" className={ctlBtn} title="Layers & filters" onClick={() => setFilterOpen((o) => !o)}><Layers className="h-4 w-4" /></button>
          {filterOpen && (
            <div className="absolute right-0 z-[700] mt-1 w-52 rounded-md border bg-popover p-2 text-sm shadow-lg">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jobs by status</p>
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]}
                  </span>
                  <input type="checkbox" checked={!!statusOn[s]} onChange={(e) => setStatusOn((m) => ({ ...m, [s]: e.target.checked }))} />
                </label>
              ))}
              {canSeeEmployees && (
                <>
                  <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</p>
                  <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent">
                    <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-[#7c3aed]" /> Employees ({employees.length})</span>
                    <input type="checkbox" checked={showEmps} onChange={(e) => setShowEmps(e.target.checked)} />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
