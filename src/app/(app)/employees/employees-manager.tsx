"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlideOver } from "@/components/slide-over";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { MapView, type EmpPin } from "@/app/(app)/map/map-view";
import { Plus, Camera, Mail, CheckCircle2, Search, Users, MoreVertical, SlidersHorizontal, Check } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, MobileField } from "@/components/mobile-card";
import { createEmployee, updateEmployee, deleteEmployee, inviteEmployee, resendInvite } from "./actions";

interface Employee {
  id: string; name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
  invite_email: string | null; invite_status: string | null;
}

const blank = {
  name: "", role_title: "", phone: "", pay_rate: 0, require_punch_photo: false,
  doInvite: false, invite_email: "",
};

const SORT_OPTIONS: { v: string; l: string }[] = [
  { v: "name_asc", l: "Name (A–Z)" },
  { v: "name_desc", l: "Name (Z–A)" },
  { v: "role_asc", l: "Role (A–Z)" },
  { v: "pay_desc", l: "Pay rate (high–low)" },
  { v: "pay_asc", l: "Pay rate (low–high)" },
];
const STATUS_FILTERS: { v: string; l: string }[] = [
  { v: "all", l: "All" }, { v: "accepted", l: "Active user" }, { v: "pending", l: "Invite pending" }, { v: "none", l: "No access" },
];

export function EmployeesManager({
  initialEmployees, canEdit, canDelete, canMap = false, locationPins = [],
}: {
  initialEmployees: Employee[]; canEdit: boolean; canDelete: boolean;
  canMap?: boolean; locationPins?: EmpPin[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [employees, setEmployees] = React.useState<Employee[]>(initialEmployees);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("name_asc");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [form, setForm] = React.useState<typeof blank>(blank);
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Employee | null>(null);
  const [hover, setHover] = React.useState<{ id: string; source: "table" | "map" } | null>(null);

  // Filter/sort popover.
  const [fsOpen, setFsOpen] = React.useState(false);
  const fsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!fsOpen) return;
    const onDoc = (e: MouseEvent) => { if (fsRef.current && !fsRef.current.contains(e.target as Node)) setFsOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [fsOpen]);
  const activeFilters = (statusFilter !== "all" ? 1 : 0) + (sort !== "name_asc" ? 1 : 0);

  const filtered = React.useMemo(() => {
    const q2 = q.toLowerCase();
    const list = employees.filter((e) => {
      const matchesQ =
        e.name.toLowerCase().includes(q2) ||
        (e.role_title ?? "").toLowerCase().includes(q2) ||
        (e.phone ?? "").toLowerCase().includes(q2);
      const isAccepted = e.invite_status === "accepted";
      const isPending = e.invite_status === "pending";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "accepted" && isAccepted) ||
        (statusFilter === "pending" && isPending) ||
        (statusFilter === "none" && !isAccepted && !isPending);
      return matchesQ && matchesStatus;
    });
    const dir = sort.endsWith("_asc") ? 1 : -1;
    const key = sort.replace(/_(asc|desc)$/, "");
    const val = (e: Employee): string | number =>
      key === "pay" ? Number(e.pay_rate) || 0 : key === "role" ? (e.role_title ?? "").toLowerCase() : e.name.toLowerCase();
    list.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [employees, q, sort, statusFilter]);

  function startNew() { setEditing(null); setForm(blank); setOpen(true); }
  function startEdit(w: Employee) {
    setEditing(w);
    setForm({
      name: w.name, role_title: w.role_title ?? "", phone: w.phone ?? "",
      pay_rate: w.pay_rate, require_punch_photo: w.require_punch_photo,
      doInvite: false, invite_email: w.invite_email ?? "",
    });
    setOpen(true);
  }

  // Open a specific employee's detail when arrived at via ?employee=<id>.
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const id = searchParams.get("employee");
    if (!id) return;
    const emp = employees.find((e) => e.id === id);
    if (emp) startEdit(emp);
    router.replace("/employees");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Bring the matching table row into view when hovering the map.
  React.useEffect(() => {
    if (hover?.source !== "map") return;
    document.getElementById(`emprow-${hover.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hover]);

  async function save() {
    if (!form.name.trim()) return toast({ title: "Name required", variant: "destructive" });
    const payload = {
      name: form.name.trim(), role_title: form.role_title || null, phone: form.phone || null,
      pay_rate: Number(form.pay_rate), require_punch_photo: form.require_punch_photo,
    };
    if (editing) {
      const res = await updateEmployee(editing.id, payload);
      if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
      setEmployees((ws) => ws.map((x) => (x.id === editing.id ? { ...x, ...payload } : x)));
      toast({ title: "Employee updated" });
    } else {
      const res = await createEmployee({
        ...payload,
        invite_email: form.doInvite && form.invite_email ? form.invite_email.trim() : null,
      });
      if (res.error) return toast({ title: "Create failed", description: res.error, variant: "destructive" });
      setEmployees((ws) => [...ws, res.data as Employee]);
      toast({ title: form.doInvite ? "Employee added — invite sent" : "Employee added" });
    }
    setOpen(false);
  }

  async function sendInvite(emp: Employee, email: string) {
    const res = await inviteEmployee(emp.id, email);
    if (res.error) return toast({ title: "Invite failed", description: res.error, variant: "destructive" });
    setEmployees((ws) => ws.map((x) => (x.id === emp.id ? { ...x, invite_email: email, invite_status: "pending" } : x)));
    toast({ title: "Invitation sent" });
  }
  async function doResend(emp: Employee) {
    const res = await resendInvite(emp.id);
    if (res.error) return toast({ title: "Resend failed", description: res.error, variant: "destructive" });
    toast({ title: "Invitation resent" });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await deleteEmployee(toDelete.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setEmployees((ws) => ws.filter((x) => x.id !== toDelete.id));
    toast({ title: "Employee removed" });
  }

  function openEmpMenu(emp: Employee, x: number, y: number) {
    const actions = [
      { label: "View / edit", icon: "edit" as const, onClick: () => startEdit(emp) },
    ];
    if (canDelete) actions.push({ label: "Delete", icon: "delete" as any, onClick: () => setToDelete(emp), destructive: true } as any);
    setCtx({ x, y, actions });
  }
  function rowMenu(e: React.MouseEvent, emp: Employee) {
    e.preventDefault();
    openEmpMenu(emp, e.clientX, e.clientY);
  }

  function inviteBadge(emp: Employee) {
    if (emp.invite_status === "accepted")
      return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active user</Badge>;
    if (emp.invite_status === "pending")
      return <Badge variant="warning" className="gap-1"><Mail className="h-3 w-3" /> Invite pending</Badge>;
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      <PageHeader title="Employees" description="Your crew, pay rates, punch settings, and live locations.">
        {canEdit && <Button onClick={startNew}><Plus className="h-4 w-4" /> Add employee</Button>}
      </PageHeader>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: employees list */}
        <div className={canMap ? "min-w-0 lg:w-1/2" : "min-w-0 w-full"}>
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="relative" ref={fsRef}>
              <Button variant="outline" size="icon" onClick={() => setFsOpen((o) => !o)} title="Filter & sort" className="relative">
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{activeFilters}</span>}
              </Button>
              {fsOpen && (
                <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border bg-popover p-3 shadow-lg">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System access</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((s) => (
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Pay rate</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>System access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((w) => (
                    <TableRow
                      key={w.id}
                      id={`emprow-${w.id}`}
                      className={`cursor-pointer transition-colors ${hover?.id === w.id ? "bg-primary/10" : ""}`}
                      onClick={() => startEdit(w)}
                      onContextMenu={(e) => rowMenu(e, w)}
                      onMouseEnter={() => canMap && setHover({ id: w.id, source: "table" })}
                      onMouseLeave={() => setHover((h) => (h?.source === "table" ? null : h))}
                    >
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-sm">{w.role_title ?? "—"}</TableCell>
                      <TableCell className="text-sm">{w.phone ?? "—"}</TableCell>
                      <TableCell>{fmtMoney(w.pay_rate)}/hr</TableCell>
                      <TableCell>
                        {w.require_punch_photo ? <Badge variant="secondary" className="gap-1"><Camera className="h-3 w-3" /> Yes</Badge> : <span className="text-sm text-muted-foreground">No</span>}
                      </TableCell>
                      <TableCell>{inviteBadge(w)}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={Users}
                          title={q || statusFilter !== "all" ? "No matching employees" : "No employees yet"}
                          description={q || statusFilter !== "all" ? "Try a different search or filter." : "Add your crew to assign them to jobs and track their hours."}
                          action={canEdit && !q && statusFilter === "all" ? <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add employee</Button> : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile: card list */}
          <div className="space-y-2 md:hidden">
            {filtered.map((w) => (
              <MobileCard key={w.id} onClick={() => startEdit(w)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{w.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{w.role_title ?? "Crew"}</div>
                  </div>
                  <div className="shrink-0">{inviteBadge(w)}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <MobileField label="Pay">{fmtMoney(w.pay_rate)}/hr</MobileField>
                  <MobileField label="Phone">{w.phone ?? "—"}</MobileField>
                </div>
                {w.require_punch_photo && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3 w-3" /> Punch photo required</div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded p-1.5 hover:bg-accent"
                    onClick={(e) => { e.stopPropagation(); rowMenu(e, w); }}
                    aria-label="More options"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </MobileCard>
            ))}
            {filtered.length === 0 && (
              <EmptyState
                icon={Users}
                title={q || statusFilter !== "all" ? "No matching employees" : "No employees yet"}
                description={q || statusFilter !== "all" ? "Try a different search or filter." : "Add your crew to assign them to jobs and track their hours."}
                action={canEdit && !q && statusFilter === "all" ? <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add employee</Button> : undefined}
              />
            )}
          </div>
        </div>

        {/* Right: map of employee locations */}
        {canMap && (
          <div className="lg:sticky lg:top-4 lg:w-1/2">
            <MapView
              jobs={[]}
              initialEmployees={locationPins}
              canSeeEmployees
              onEmployeeClick={(emp) => { const w = emp.employee_id ? employees.find((x) => x.id === emp.employee_id) : null; if (w) startEdit(w); }}
              onEmpContext={(id, x, y) => { const w = employees.find((x) => x.id === id); if (w) openEmpMenu(w, x, y); }}
              onEmpHover={(id) => {
                if (id) setHover({ id, source: "map" });
                else setHover((h) => (h?.source === "map" ? null : h));
              }}
              highlightEmpId={hover?.id ?? null}
              panEmpId={hover?.source === "table" ? hover.id : null}
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
        itemLabel={toDelete?.name ?? "employee"}
        requireTyped={toDelete?.name}
      />

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit employee" : "Add employee"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Role / title</Label><Input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="e.g. Carpenter" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Pay rate ($/hr)</Label><Input type="number" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: +e.target.value })} /></div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><div className="text-sm font-medium">Require photo with punches</div><div className="text-xs text-muted-foreground">Must attach a photo when punching in.</div></div>
            <Switch checked={form.require_punch_photo} onCheckedChange={(v) => setForm({ ...form, require_punch_photo: v })} />
          </div>

          {!editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Add as system user</div>
                  <div className="text-xs text-muted-foreground">They will automatically receive a login invitation by email.</div>
                </div>
                <Switch checked={form.doInvite} onCheckedChange={(v) => setForm({ ...form, doInvite: v })} />
              </div>
              {form.doInvite && (
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input type="email" value={form.invite_email} onChange={(e) => setForm({ ...form, invite_email: e.target.value })} placeholder="employee@email.com" />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> An invite email will be sent automatically once you save.
                  </p>
                </div>
              )}
            </div>
          )}

          {editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-sm font-medium">System access</div>
              {editing.invite_status === "accepted" && (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Active — this employee can log in.</p>
              )}
              {editing.invite_status === "pending" && (
                <p className="text-xs text-muted-foreground">Invite pending — not accepted yet.</p>
              )}
              <div className="space-y-1">
                <Label>Login email</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={form.invite_email}
                    onChange={(e) => setForm({ ...form, invite_email: e.target.value })}
                    placeholder="employee@email.com"
                  />
                  <Button
                    size="sm"
                    disabled={!form.invite_email}
                    onClick={() => editing && form.invite_email && sendInvite(editing, form.invite_email.trim())}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    {editing.invite_status === "pending" ? "Resend" : editing.invite_status === "accepted" ? "Re-invite" : "Invite"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Change the email and click Invite / Resend to send a new invitation.</p>
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    </>
  );
}
