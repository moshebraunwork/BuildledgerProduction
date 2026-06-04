"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createJob, deleteJob } from "./actions";
import { setJobStatus } from "./[id]/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/slide-over";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, MobileField } from "@/components/mobile-card";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapView, type JobPin, type EmpPin } from "@/app/(app)/map/map-view";
import { Plus, Search, MoreVertical, CheckCircle, Hammer } from "lucide-react";

interface Job {
  id: string; title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; status: string; estimate: number; billing_mode: string;
  lat: number | null; lng: number | null;
}

const statusVariant: Record<string, "secondary" | "default" | "success"> = {
  scheduled: "secondary", active: "default", complete: "success",
};
const blank = {
  title: "", place: "", scheduled_date: "", customer_name: "", customer_email: "",
  estimate: 0, billing_mode: "itemized",
  lat: null as number | null, lng: null as number | null,
};

export function JobsManager({
  initialJobs, canEdit, canDelete, canMap = false, canSeeEmployees = false, employeePins = [],
}: {
  initialJobs: Job[]; canEdit: boolean; canDelete?: boolean;
  canMap?: boolean; canSeeEmployees?: boolean; employeePins?: EmpPin[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [jobs, setJobs] = React.useState<Job[]>(initialJobs);

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
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sort, setSort] = React.useState("created_desc");
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Job | null>(null);
  // Shared hover between the table and the map. `source` says which side the
  // user is hovering so each side reacts (table hover → pan map; map hover →
  // scroll the row into view) without feedback loops.
  const [hover, setHover] = React.useState<{ id: string; source: "table" | "map" } | null>(null);

  function openJob(job: Job) {
    router.push(`/jobs/${job.id}`);
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

  function rowMenu(e: React.MouseEvent, job: Job) {
    e.preventDefault();
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
    setCtx({ x: e.clientX, y: e.clientY, actions });
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: jobs list */}
        <div className={canMap ? "min-w-0 lg:w-1/2" : "min-w-0 w-full"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">Newest first</SelectItem>
              <SelectItem value="created_asc">Oldest first</SelectItem>
              <SelectItem value="title_asc">Title (A–Z)</SelectItem>
              <SelectItem value="title_desc">Title (Z–A)</SelectItem>
              <SelectItem value="customer_asc">Customer (A–Z)</SelectItem>
              <SelectItem value="scheduled_asc">Scheduled (earliest)</SelectItem>
              <SelectItem value="scheduled_desc">Scheduled (latest)</SelectItem>
              <SelectItem value="estimate_desc">Estimate (high–low)</SelectItem>
              <SelectItem value="estimate_asc">Estimate (low–high)</SelectItem>
              <SelectItem value="status_asc">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canEdit && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New job</Button>}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead><TableHead>Customer</TableHead><TableHead>Scheduled</TableHead>
                  <TableHead>Estimate</TableHead><TableHead>Billing</TableHead><TableHead>Status</TableHead>
                  <TableHead className="w-8"></TableHead>
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
                    <TableCell><Badge variant={statusVariant[j.status] ?? "secondary"} className="capitalize">{j.status}</Badge></TableCell>
                    <TableCell>
                      {/* Touch-friendly context menu button */}
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-accent"
                        onClick={(e) => { e.stopPropagation(); rowMenu(e, j); }}
                        aria-label="More options"
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
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

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {filtered.map((j) => (
          <MobileCard key={j.id} onClick={() => openJob(j)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{j.title}</div>
                {j.place && <div className="truncate text-xs text-muted-foreground">{j.place}</div>}
              </div>
              <Badge variant={statusVariant[j.status] ?? "secondary"} className="shrink-0 capitalize">{j.status}</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <MobileField label="Customer">{j.customer_name ?? "—"}</MobileField>
              <MobileField label="Scheduled">{fmtDate(j.scheduled_date)}</MobileField>
              <MobileField label="Estimate">{fmtMoney(j.estimate)}</MobileField>
              <MobileField label="Billing"><span className="capitalize">{j.billing_mode}</span></MobileField>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded p-1.5 hover:bg-accent"
                onClick={(e) => { e.stopPropagation(); rowMenu(e, j); }}
                aria-label="More options"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </MobileCard>
        ))}
        {filtered.length === 0 && (
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
        )}
      </div>
        </div>

        {/* Right: map of jobs (and employees, if permitted) */}
        {canMap && (
          <div className="lg:sticky lg:top-4 lg:w-1/2">
            <MapView
              jobs={jobPins}
              initialEmployees={employeePins}
              canSeeEmployees={canSeeEmployees}
              onJobClick={(id) => router.push(`/jobs/${id}`)}
              onEmployeeClick={(emp) => { if (emp.employee_id) router.push(`/employees?employee=${emp.employee_id}`); }}
              onJobHover={(id) => {
                if (id) setHover({ id, source: "map" });
                else setHover((h) => (h?.source === "map" ? null : h));
              }}
              highlightJobId={hover?.id ?? null}
              panJobId={hover?.source === "table" ? hover.id : null}
              className="h-[60vh] w-full lg:h-[calc(100vh-9rem)]"
            />
          </div>
        )}
      </div>

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
    </>
  );
}
