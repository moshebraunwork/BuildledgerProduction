"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
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

// Leaflet map (vanilla, loaded client-side) showing job pins and — for
// authorized users — live employee locations that refresh on an interval.
export function MapView({
  jobs,
  initialEmployees,
  canSeeEmployees,
}: {
  jobs: JobPin[];
  initialEmployees: EmpPin[];
  canSeeEmployees: boolean;
}) {
  const elRef = React.useRef<HTMLDivElement>(null);
  const LRef = React.useRef<any>(null);
  const ctxRef = React.useRef<{ map: any; jobLayer: any; empLayer: any } | null>(null);
  const [employees, setEmployees] = React.useState<EmpPin[]>(initialEmployees);

  function dotIcon(color: string) {
    const L = LRef.current;
    return L.divIcon({
      className: "",
      html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      ctxRef.current = { map, jobLayer: L.layerGroup().addTo(map), empLayer: L.layerGroup().addTo(map) };
      drawAll();
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawAll = React.useCallback(() => {
    const ctx = ctxRef.current;
    const L = LRef.current;
    if (!ctx || !L) return;
    ctx.jobLayer.clearLayers();
    ctx.empLayer.clearLayers();
    const pts: [number, number][] = [];

    for (const j of jobs) {
      if (!Number.isFinite(+j.lat) || !Number.isFinite(+j.lng)) continue;
      L.marker([+j.lat, +j.lng], { icon: dotIcon("#2563eb") })
        .bindPopup(`<b>${escapeHtml(j.title)}</b><br>${escapeHtml(j.place ?? "")}<br><i>${escapeHtml(j.status)}</i>`)
        .addTo(ctx.jobLayer);
      pts.push([+j.lat, +j.lng]);
    }
    for (const e of employees) {
      if (!Number.isFinite(+e.lat) || !Number.isFinite(+e.lng)) continue;
      const when = e.at ? new Date(e.at).toLocaleString() : "unknown time";
      L.marker([+e.lat, +e.lng], { icon: dotIcon("#16a34a") })
        .bindPopup(`<b>${escapeHtml(e.name)}</b><br><span style="color:#666">Last seen: ${escapeHtml(when)}</span>`)
        .addTo(ctx.empLayer);
      pts.push([+e.lat, +e.lng]);
    }
    if (pts.length) ctx.map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
  }, [jobs, employees]);

  // Redraw when data changes.
  React.useEffect(() => {
    drawAll();
  }, [drawAll]);

  // Periodically refresh employee positions.
  React.useEffect(() => {
    if (!canSeeEmployees) return;
    const id = setInterval(async () => {
      const res = await getEmployeeLocations();
      if ("employees" in res) setEmployees(res.employees);
    }, 60000);
    return () => clearInterval(id);
  }, [canSeeEmployees]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-blue-600" /> Jobs ({jobs.length})</span>
        {canSeeEmployees && (
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-green-600" /> Employees ({employees.length})</span>
        )}
      </div>
      <div ref={elRef} className="h-[calc(100vh-13rem)] min-h-[420px] w-full overflow-hidden rounded-lg border" />
    </div>
  );
}
