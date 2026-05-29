"use client";

import * as React from "react";
import { createJob, deleteJob } from "./actions";
import { setJobStatus } from "./[id]/actions";
import { JobSlideOver, type JobSlideOverPerms } from "./job-slide-over";
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
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Plus, Search, MoreVertical, CheckCircle } from "lucide-react";

interface Job {
  id: string; title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; status: string; estimate: number; billing_mode: string;
}

const statusVariant: Record<string, "secondary" | "default" | "success"> = {
  scheduled: "secondary", active: "default", complete: "success",
};
const blank = { title: "", place: "", scheduled_date: "", customer_name: "", customer_email: "", estimate: 0, billing_mode: "itemized" };

export function JobsManager({
  initialJobs, canEdit, canDelete, perms,
}: {
  initialJobs: Job[]; canEdit: boolean; canDelete?: boolean; perms: JobSlideOverPerms;
}) {
  const { toast } = useToast();
  const [jobs, setJobs] = React.useState<Job[]>(initialJobs);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(blank);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Job | null>(null);

  // Slide-over state
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [slideOpen, setSlideOpen] = React.useState(false);
  const [slideInitialTab, setSlideInitialTab] = React.useState("overview");

  function openJob(job: Job, tab = "overview") {
    setSelectedJobId(job.id);
    setSlideInitialTab(tab);
    setSlideOpen(true);
  }

  const filtered = jobs.filter((j) => {
    const matchesQ = `${j.title} ${j.customer_name ?? ""} ${j.place ?? ""}`.toLowerCase().includes(q.toLowerCase());
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesQ && matchesStatus;
  });

  async function create() {
    if (!form.title.trim()) return toast({ title: "Title required", variant: "destructive" });
    const res = await createJob({
      title: form.title.trim(), place: form.place || null, scheduled_date: form.scheduled_date || null,
      customer_name: form.customer_name || null, customer_email: form.customer_email || null,
      estimate: Number(form.estimate), billing_mode: form.billing_mode,
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
      { label: "View", icon: "view", onClick: () => openJob(job, "overview") },
      { label: "Edit", icon: "edit", onClick: () => openJob(job, "overview") },
    ];
    if (job.status !== "complete" && perms.jobEdit) {
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
        </div>
        {canEdit && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New job</Button>}
      </div>

      <Card>
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
                    className="cursor-pointer"
                    onClick={() => openJob(j)}
                    onContextMenu={(e) => rowMenu(e, j)}
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
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No jobs found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
          <div className="space-y-2"><Label>Place / address</Label><Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className="min-h-[44px]" /></div>
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

      {/* Job detail slide-over */}
      <JobSlideOver
        jobId={selectedJobId}
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        initialTab={slideInitialTab}
        perms={perms}
        onJobUpdated={(updated) => {
          setJobs((jj) => jj.map((j) => j.id === updated.id ? { ...j, ...updated } : j));
        }}
        onJobDeleted={(id) => {
          setJobs((jj) => jj.filter((j) => j.id !== id));
          setSlideOpen(false);
        }}
      />
    </>
  );
}
