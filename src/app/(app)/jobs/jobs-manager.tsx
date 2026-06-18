"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createJob, deleteJob } from "./actions";
import { setJobStatus } from "./[id]/actions";
import { createJobStatus, deleteJobStatus, type JobStatus } from "./status-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/slide-over";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney, fmtDate, cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapView, type JobPin, type EmpPin } from "@/app/(app)/map/map-view";
import { Plus, Search, Hammer, SlidersHorizontal, Check, Map as MapIcon, List as ListIcon, LayoutGrid, GripVertical, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const VIEW_KEY = "buildledger.jobs.layout";
const MOBILE_VIEW_KEY = "buildledger.jobs.mobileView";

interface Job {
  id: string; title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; status: string; estimate: number; billing_mode: string;
  lat: number | null; lng: number | null;
}

// Compact, relative date for the right edge of a mobile row ("Today", "Thu", "May 29").
function listDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (Math.abs(diff) < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const SORT_OPTIONS: { v: string; l: string }[] = [
  { v: "created_desc", l: "Newest first" },
  { v: "created_asc", l: "Oldest first" },
  { v: "title_asc", l: "Title (A–Z)" },
  { v: "title_desc", l: "Title (Z–A)" },
  { v: "customer_asc", l: "Customer (A–Z)" },
  { v: "scheduled_asc", l: "Scheduled (earliest)" },
  { v: "scheduled_desc", l: "Scheduled (latest)" },
  { v: "estimate_desc", l: "Estimate (high–low)" },
  { v: "estimate_asc", l: "Estimate (low–high)" },
  { v: "status_asc", l: "Status" },
];
const blank = {
  title: "", place: "", scheduled_date: "", customer_name: "", customer_email: "",
  estimate: 0, billing_mode: "itemized",
  lat: null as number | null, lng: null as number | null,
};

export function JobsManager({
  initialJobs, canEdit, canDelete, canMap = false, canSeeEmployees = false, employeePins = [],
  initialStatuses = [], canManageStatuses = false,
}: {
  initialJobs: Job[]; canEdit: boolean; canDelete?: boolean;
  canMap?: boolean; canSeeEmployees?: boolean; employeePins?: EmpPin[];
  initialStatuses?: JobStatus[]; canManageStatuses?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = React.useState<Job[]>(initialJobs);
  const [statuses, setStatuses] = React.useState<JobStatus[]>(initialStatuses);
  // List vs. Kanban board layout (Map stays a sub-toggle of the list layout).
  const [layout, setLayout] = React.useState<"list" | "board">("list");
  const [dragId, setDragId] = React.useState<string | null>(null);

  // Lookup helpers for status label/color (works for built-in + custom).
  const statusMeta = React.useCallback(
    (key: string) => statuses.find((s) => s.key === key) ?? { key, label: key, color: "#71717a" } as Partial<JobStatus> & { key: string; label: string; color: string },
    [statuses]
  );
  // Status filter chips, derived from the company's statuses.
  const statusFilters = React.useMemo(
    () => [{ v: "all", l: "All" }, ...statuses.map((s) => ({ v: s.key, l: s.label }))],
    [statuses]
  );

  // Job markers for the embedded map — every job that has coordinates.
  const jobPins = React.useMemo<JobPin[]>(
    () =>
      jobs
        .filter((j) => j.lat != null && j.lng != null)
        .map((j) => ({ id: j.id, title: j.title, place: j.place, status: j.status, lat: Number(j.lat), lng: Number(j.lng) })),
    [jobs]
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(blank);
  const [q, setQ] = React.useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sort, setSort] = React.useState("created_desc");
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Job | null>(null);
  // Shared hover between the table and the map. `source` says which side the
  // user is hovering so each side reacts (table hover → pan map; map hover →
  // scroll the row into view) without feedback loops.
  const [hover, setHover] = React.useState<{ id: string; source: "table" | "map" } | null>(null);
  const [mobileView, setMobileView] = React.useState<"list" | "map">("list");
  // Remember the last view mode across visits.
  React.useEffect(() => {
    try {
      const l = window.localStorage.getItem(VIEW_KEY);
      if (l === "list" || l === "board") setLayout(l);
      const mv = window.localStorage.getItem(MOBILE_VIEW_KEY);
      if (mv === "list" || mv === "map") setMobileView(mv);
    } catch { /* ignore */ }
  }, []);
  React.useEffect(() => { try { window.localStorage.setItem(VIEW_KEY, layout); } catch {} }, [layout]);
  React.useEffect(() => { try { window.localStorage.setItem(MOBILE_VIEW_KEY, mobileView); } catch {} }, [mobileView]);
  const [statusMgrOpen, setStatusMgrOpen] = React.useState(false);
  const [newStatusLabel, setNewStatusLabel] = React.useState("");
  const [newStatusColor, setNewStatusColor] = React.useState("#6366f1");
  const [fsOpen, setFsOpen] = React.useState(false);
  const fsRef = React.useRef<HTMLDivElement>(null);
  // Track the mobile header height so we can push the list below it.
  const mobileHdrRef = React.useRef<HTMLDivElement>(null);
  const [mobileHdrH, setMobileHdrH] = React.useState(0);
  React.useEffect(() => {
    const el = mobileHdrRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMobileHdrH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    if (!fsOpen) return;
    const onDoc = (e: MouseEvent) => { if (fsRef.current && !fsRef.current.contains(e.target as Node)) setFsOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [fsOpen]);
  const activeFilters = (statusFilter !== "all" ? 1 : 0) + (sort !== "created_desc" ? 1 : 0);

  function openJob(job: Job) {
    router.push(`/jobs/${job.id}`);
  }

  // Open the create slide-over when arrived via ⌘K / the header "New job" button
  // (which navigate to /jobs?new=1), then strip the param.
  React.useEffect(() => {
    if (searchParams.get("new") === "1" && canEdit) {
      setCreateOpen(true);
      router.replace("/jobs");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Change a job's status (used by the board drag-and-drop and the move menu).
  async function changeStatus(jobId: string, status: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === status) return;
    setJobs((jj) => jj.map((j) => (j.id === jobId ? { ...j, status } : j)));
    const res = await setJobStatus(jobId, status);
    if (res && (res as any).error) {
      setJobs((jj) => jj.map((j) => (j.id === jobId ? { ...j, status: job.status } : j)));
      toast({ title: "Could not move job", description: (res as any).error, variant: "destructive" });
    }
  }

  // Add a custom status (board column).
  async function addStatus() {
    const label = newStatusLabel.trim();
    if (!label) return;
    const res = await createJobStatus(label, newStatusColor);
    if ((res as any).error) return toast({ title: "Could not add status", description: (res as any).error, variant: "destructive" });
    setStatuses((s) => [...s, (res as any).data as JobStatus]);
    setNewStatusLabel("");
    toast({ title: "Status added" });
  }

  async function removeStatus(s: JobStatus) {
    const res = await deleteJobStatus(s.id);
    if ((res as any).error) return toast({ title: "Could not remove", description: (res as any).error, variant: "destructive" });
    setStatuses((list) => list.filter((x) => x.id !== s.id));
    // Jobs in that status are moved to "scheduled" server-side.
    setJobs((jj) => jj.map((j) => (j.status === s.key ? { ...j, status: "scheduled" } : j)));
    toast({ title: "Status removed" });
  }

  const filtered = React.useMemo(() => {
    const list = jobs.filter((j) => {
      const matchesQ = `${j.title} ${j.customer_name ?? ""} ${j.place ?? ""}`.toLowerCase().includes(q.toLowerCase());
      const matchesStatus = statusFilter === "all" || j.status === statusFilter;
      return matchesQ && matchesStatus;
    });
    const dir = sort.endsWith("_asc") ? 1 : -1;
    const key = sort.replace(/_(asc|desc)$/, "");
    const val = (j: Job): string | number => {
      switch (key) {
        case "title": return (j.title ?? "").toLowerCase();
        case "customer": return (j.customer_name ?? "").toLowerCase();
        case "scheduled": return j.scheduled_date ? Date.parse(j.scheduled_date) : 0;
        case "estimate": return Number(j.estimate) || 0;
        case "status": return (j.status ?? "").toLowerCase();
        default: return 0; // created order = original list order
      }
    };
    if (key !== "created") {
      list.sort((a, b) => {
        const av = val(a), bv = val(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    } else if (dir === 1) {
      list.reverse(); // created_asc = oldest first
    }
    return list;
  }, [jobs, q, statusFilter, sort]);

  // When the map is hovered, bring the matching table row into view.
  React.useEffect(() => {
    if (hover?.source !== "map") return;
    document.getElementById(`jobrow-${hover.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hover]);

  async function create() {
    if (!form.title.trim()) return toast({ title: "Title required", variant: "destructive" });
    const res = await createJob({
      title: form.title.trim(), place: form.place || null, scheduled_date: form.scheduled_date || null,
      customer_name: form.customer_name || null, customer_email: form.customer_email || null,
      estimate: Number(form.estimate), billing_mode: form.billing_mode,
      lat: form.lat, lng: form.lng,
    });
    if (res.error) return toast({ title: "Create failed", description: res.error, variant: "destructive" });
    setJobs((j) => [res.data as Job, ...j]);
    setCreateOpen(false);
    setForm(blank);
    toast({ title: "Job created" });
    // Open the new job immediately
    openJob(res.data as Job);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await deleteJob(toDelete.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setJobs((j) => j.filter((x) => x.id !== toDelete.id));
    toast({ title: "Job deleted" });
  }

  function openJobMenu(job: Job, x: number, y: number) {
    const actions: ContextMenuState["actions"] = [
      { label: "View", icon: "view", onClick: () => openJob(job) },
      { label: "Edit", icon: "edit", onClick: () => openJob(job) },
    ];
    if (job.status !== "complete" && canEdit) {
      actions.push({
        label: "Mark as complete",
        icon: "check",
        onClick: async () => {
          await setJobStatus(job.id, "complete");
          setJobs((jj) => jj.map((j) => j.id === job.id ? { ...j, status: "complete" } : j));
          toast({ title: "Marked complete" });
        },
      });
    }
    if (canDelete) {
      actions.push({ label: "Delete", icon: "delete", onClick: () => setToDelete(job), destructive: true });
    }
    setCtx({ x, y, actions });
  }

  function rowMenu(e: React.MouseEvent, job: Job) {
    e.preventDefault();
    openJobMenu(job, e.clientX, e.clientY);
  }

  return (
    <>
      <div className="hidden md:block">
        <PageHeader title="Jobs" description="All jobs, scheduling, status, and locations.">
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {([
              { v: "list", label: "List", Icon: ListIcon },
              { v: "board", label: "Board", Icon: LayoutGrid },
            ] as const).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setLayout(v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  layout === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {canEdit && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New job</Button>}
        </PageHeader>
      </div>

      {/* Phone header — title, search pill, status chips. Fixed below the global
          top bar so it never scrolls away. `position:fixed` is used (not sticky)
          because the page-enter animation runs a transform on an ancestor, which
          would break sticky during the transition. A sibling spacer div (below)
          reserves the same height in the normal-flow layout so list cards start
          below the header. */}
      <div
        ref={mobileHdrRef}
        className="fixed left-0 right-0 z-20 space-y-3 border-b bg-background px-4 pb-3 pt-4 md:hidden"
        style={{ top: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          {/* List / Board / Map switch */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {([
              { v: "list", Icon: ListIcon, show: true, onPick: () => { setLayout("list"); setMobileView("list"); } },
              { v: "board", Icon: LayoutGrid, show: true, onPick: () => setLayout("board") },
              { v: "map", Icon: MapIcon, show: canMap, onPick: () => { setLayout("list"); setMobileView("map"); } },
            ] as const)
              .filter((o) => o.show)
              .map((o) => {
                const current = layout === "board" ? "board" : mobileView;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={o.onPick}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                      current === o.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                    aria-label={o.v}
                  >
                    <o.Icon className="h-5 w-5" />
                  </button>
                );
              })}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-full bg-muted pl-11 pr-4 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
            placeholder="Search jobs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {layout === "list" && mobileView === "list" && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusFilters.map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setStatusFilter(s.v)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  statusFilter === s.v
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground active:bg-accent"
                )}
              >
                {s.l}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Spacer: same height as the fixed phone header, so the list starts below it. */}
      <div className="-mt-4 md:hidden" style={{ height: mobileHdrH }} aria-hidden />

      {layout === "board" && (
        <JobsBoard
          jobs={jobs}
          q={q}
          statuses={statuses}
          onOpen={openJob}
          onMove={changeStatus}
          canEdit={canEdit}
          canManageStatuses={canManageStatuses}
          onAddStatus={() => setStatusMgrOpen(true)}
          dragId={dragId}
          setDragId={setDragId}
        />
      )}

      {layout === "list" && <>
      {/* Tablet-only List / Map switch (both panes show side-by-side on lg+) */}
      {canMap && (
        <div className="mb-4 hidden rounded-md border p-0.5 md:flex lg:hidden">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileView(v)}
              className={`flex-1 rounded py-1.5 text-sm font-medium capitalize transition-colors ${mobileView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: jobs list */}
        <div className={`min-w-0 ${canMap ? `lg:w-1/2 ${mobileView === "map" ? "hidden lg:block" : ""}` : "w-full"}`}>
      <div className="mb-4 hidden items-center gap-2 md:flex">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="relative" ref={fsRef}>
          <Button variant="outline" size="icon" onClick={() => setFsOpen((o) => !o)} title="Filter & sort" className="relative">
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{activeFilters}</span>}
          </Button>
          {fsOpen && (
            <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border bg-popover p-3 shadow-lg">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {statusFilters.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStatusFilter(s.v)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${statusFilter === s.v ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort by</p>
              <div className="space-y-0.5">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setSort(o.v)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${sort === o.v ? "font-medium text-primary" : ""}`}
                  >
                    {o.l}
                    {sort === o.v && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead><TableHead>Customer</TableHead><TableHead>Scheduled</TableHead>
                  <TableHead>Estimate</TableHead><TableHead>Billing</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((j) => (
                  <TableRow
                    key={j.id}
                    id={`jobrow-${j.id}`}
                    className={`cursor-pointer transition-colors ${hover?.id === j.id ? "bg-primary/10" : ""}`}
                    onClick={() => openJob(j)}
                    onContextMenu={(e) => rowMenu(e, j)}
                    onMouseEnter={() => canMap && j.lat != null && setHover({ id: j.id, source: "table" })}
                    onMouseLeave={() => setHover((h) => (h?.source === "table" ? null : h))}
                  >
                    <TableCell>
                      <div className="font-medium">{j.title}</div>
                      {j.place && <div className="text-xs text-muted-foreground">{j.place}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{j.customer_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(j.scheduled_date)}</TableCell>
                    <TableCell>{fmtMoney(j.estimate)}</TableCell>
                    <TableCell className="text-sm capitalize">{j.billing_mode}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: `${statusMeta(j.status).color}55`, color: statusMeta(j.status).color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusMeta(j.status).color }} />
                        {statusMeta(j.status).label}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={Hammer}
                        title={q || statusFilter !== "all" ? "No matching jobs" : "No jobs yet"}
                        description={q || statusFilter !== "all"
                          ? "Try adjusting your search or status filter."
                          : "Create your first job to start tracking time, items and invoices."}
                        action={canEdit && !q && statusFilter === "all"
                          ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New job</Button>
                          : undefined}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Phone: each job in its own framed card — a bordered, rounded rectangle
          with a status stripe, title, details and a status pill. Long-press for
          actions. */}
      <div className="space-y-3 md:hidden">
        {filtered.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => openJob(j)}
            onContextMenu={(e) => rowMenu(e, j)}
            className="flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors active:bg-accent"
          >
            {/* Status stripe down the left edge of the frame */}
            <span className="w-1.5 shrink-0" style={{ background: statusMeta(j.status).color }} aria-hidden />
            <div className="min-w-0 flex-1 py-3 pr-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[15px] font-semibold">{j.title}</p>
                {listDate(j.scheduled_date) && (
                  <span className="shrink-0 text-xs text-muted-foreground">{listDate(j.scheduled_date)}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {[j.customer_name, j.place].filter(Boolean).join(" · ") || "No customer or location"}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: `${statusMeta(j.status).color}55`, color: statusMeta(j.status).color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusMeta(j.status).color }} />
                  {statusMeta(j.status).label}
                </span>
                {Number(j.estimate) > 0 && (
                  <span className="text-sm font-medium tabular-nums">{fmtMoney(j.estimate)}</span>
                )}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <EmptyState
            icon={Hammer}
            title={q || statusFilter !== "all" ? "No matching jobs" : "No jobs yet"}
            description={q || statusFilter !== "all"
              ? "Try adjusting your search or status filter."
              : "Create your first job to start tracking time, items and invoices."}
          />
        )}
      </div>
        </div>

        {/* Right: map of jobs (and employees, if permitted) */}
        {canMap && (
          // relative z-0 keeps Leaflet's internal z-indexes under the sticky mobile header
          <div className={`relative z-0 lg:sticky lg:top-4 lg:w-1/2 ${mobileView === "list" ? "hidden lg:block" : ""}`}>
            <MapView
              jobs={jobPins}
              initialEmployees={employeePins}
              canSeeEmployees={canSeeEmployees}
              onJobClick={(id) => router.push(`/jobs/${id}`)}
              onJobContext={(id, x, y) => { const job = jobs.find((j) => j.id === id); if (job) openJobMenu(job, x, y); }}
              onEmployeeClick={(emp) => { if (emp.employee_id) router.push(`/employees?employee=${emp.employee_id}`); }}
              onJobHover={(id) => {
                if (id) setHover({ id, source: "map" });
                else setHover((h) => (h?.source === "map" ? null : h));
              }}
              highlightJobId={hover?.id ?? null}
              panJobId={hover?.source === "table" ? hover.id : null}
              className="h-[calc(100dvh-17rem)] min-h-[20rem] w-full md:h-[60vh] lg:h-[calc(100vh-9rem)]"
            />
          </div>
        )}
      </div>
      </>}

      {/* Phone: floating "New job" button, kept clear of the bottom tab bar. */}
      {canEdit && layout === "list" && mobileView === "list" && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 items-center gap-2 rounded-2xl bg-primary px-5 text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 md:hidden"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-semibold">New job</span>
        </button>
      )}

      <RowContextMenu state={ctx} onClose={() => setCtx(null)} />
      <DeleteConfirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        itemLabel={`job "${toDelete?.title}"`}
        requireTyped={toDelete?.title}
      />

      {/* New job slide-over */}
      <SlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New job"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create job</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="min-h-[44px]" /></div>
          <div className="space-y-2">
            <Label>Place / address</Label>
            <AddressAutocomplete
              value={form.place ? { place: form.place, lat: form.lat, lng: form.lng } : null}
              onChange={(v) => setForm({ ...form, place: v?.place ?? "", lat: v?.lat ?? null, lng: v?.lng ?? null })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Customer name</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="min-h-[44px]" /></div>
            <div className="space-y-2"><Label>Customer email</Label><Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className="min-h-[44px]" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Scheduled date</Label><Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className="min-h-[44px]" /></div>
            <div className="space-y-2"><Label>Estimate ($)</Label><Input type="number" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: +e.target.value })} className="min-h-[44px]" /></div>
          </div>
          <div className="space-y-2">
            <Label>Billing mode</Label>
            <Select value={form.billing_mode} onValueChange={(v) => setForm({ ...form, billing_mode: v })}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="itemized">Itemized</SelectItem>
                <SelectItem value="hourly">Per hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SlideOver>

      {/* Manage job statuses (board columns) */}
      <SlideOver
        open={statusMgrOpen}
        onClose={() => setStatusMgrOpen(false)}
        title="Job statuses"
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setStatusMgrOpen(false)}>Done</Button></div>}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Add a status</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newStatusColor}
                onChange={(e) => setNewStatusColor(e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                aria-label="Status color"
              />
              <Input
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addStatus(); }}
                placeholder="e.g. Awaiting parts"
                className="min-h-[44px]"
              />
              <Button onClick={addStatus} disabled={!newStatusLabel.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">New statuses become columns on the board.</p>
          </div>
          <div className="space-y-2">
            <Label>Current statuses</Label>
            <div className="space-y-1.5">
              {statuses.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1 text-sm">{s.label}</span>
                  {s.is_system ? (
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">built-in</span>
                  ) : (
                    <button type="button" onClick={() => removeStatus(s)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${s.label}`}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SlideOver>
    </>
  );
}

// Kanban board — columns are the company's configured job statuses (built-in +
// custom). Desktop reorders by native drag-and-drop; touch devices get per-card
// "move" chips. Both paths call the same `onMove` (setJobStatus).
function JobsBoard({
  jobs, q, statuses, onOpen, onMove, canEdit, canManageStatuses, onAddStatus, dragId, setDragId,
}: {
  jobs: Job[];
  q: string;
  statuses: JobStatus[];
  onOpen: (job: Job) => void;
  onMove: (jobId: string, status: string) => void;
  canEdit: boolean;
  canManageStatuses: boolean;
  onAddStatus: () => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
}) {
  const ql = q.trim().toLowerCase();
  const visible = jobs.filter(
    (j) => !ql || `${j.title} ${j.customer_name ?? ""} ${j.place ?? ""}`.toLowerCase().includes(ql)
  );

  return (
    <div className="ws-fade -mx-1 overflow-x-auto pb-4">
      <div className="flex items-start gap-3 px-1">
        {statuses.map((col) => {
          const cards = visible.filter((j) => j.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
              onDrop={
                canEdit
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      if (id) onMove(id, col.key);
                      setDragId(null);
                    }
                  : undefined
              }
              className="flex w-[80vw] max-w-[20rem] shrink-0 flex-col rounded-xl border bg-muted/30 md:w-72"
            >
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                <span className="truncate text-sm font-semibold uppercase tracking-wide">{col.label}</span>
                <span className="ml-auto rounded-full bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{cards.length}</span>
              </div>
              <div className="flex min-h-[6rem] flex-1 flex-col gap-2 p-2">
                {cards.map((job) => (
                  <div
                    key={job.id}
                    draggable={canEdit}
                    onDragStart={
                      canEdit
                        ? (e) => { e.dataTransfer.setData("text/plain", job.id); e.dataTransfer.effectAllowed = "move"; setDragId(job.id); }
                        : undefined
                    }
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(job)}
                    className={cn(
                      "group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md",
                      canEdit && "md:cursor-grab md:active:cursor-grabbing",
                      dragId === job.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {canEdit && <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground md:block" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{job.title}</p>
                        {job.customer_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{job.customer_name}</p>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                      <span>📅 {listDate(job.scheduled_date) || "—"}</span>
                      {Number(job.estimate) > 0 && <span>{fmtMoney(job.estimate)}</span>}
                    </div>
                    {canEdit && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t pt-2 md:hidden">
                        {statuses.filter((c) => c.key !== job.status).map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onMove(job.id, c.key); }}
                            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground active:bg-accent"
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {canEdit ? "Drop jobs here" : "No jobs"}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Add / manage status column */}
        {canManageStatuses && (
          <button
            type="button"
            onClick={onAddStatus}
            className="flex w-[60vw] max-w-[14rem] shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground md:w-56"
          >
            <Plus className="h-4 w-4" /> Add status
          </button>
        )}
      </div>
    </div>
  );
}
