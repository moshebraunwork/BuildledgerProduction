"use client";

import * as React from "react";
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
import { Plus, Camera, Mail, Send, CheckCircle2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { createEmployee, updateEmployee, deleteEmployee, inviteEmployee, resendInvite } from "./actions";

interface Employee {
  id: string; name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
  invite_email: string | null; invite_status: string | null;
}

type SortKey = "name" | "role_title" | "pay_rate";
type SortDir = "asc" | "desc";

const blank = {
  name: "", role_title: "", phone: "", pay_rate: 0, require_punch_photo: false,
  doInvite: false, invite_email: "",
};

export function EmployeesManager({
  initialEmployees, canEdit, canDelete,
}: {
  initialEmployees: Employee[]; canEdit: boolean; canDelete: boolean;
}) {
  const { toast } = useToast();
  const [employees, setEmployees] = React.useState<Employee[]>(initialEmployees);
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [form, setForm] = React.useState<typeof blank>(blank);
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Employee | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3.5 w-3.5 inline" />
      : <ArrowDown className="ml-1 h-3.5 w-3.5 inline" />;
  }

  const filtered = React.useMemo(() => {
    const q2 = q.toLowerCase();
    const list = employees.filter((e) =>
      e.name.toLowerCase().includes(q2) ||
      (e.role_title ?? "").toLowerCase().includes(q2) ||
      (e.phone ?? "").toLowerCase().includes(q2)
    );
    list.sort((a, b) => {
      let av: string | number = (a[sortKey] ?? "") as string | number;
      let bv: string | number = (b[sortKey] ?? "") as string | number;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [employees, q, sortKey, sortDir]);

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

  function rowMenu(e: React.MouseEvent, emp: Employee) {
    e.preventDefault();
    const actions = [
      { label: "View / edit", icon: "edit" as const, onClick: () => startEdit(emp) },
    ];
    if (canDelete) actions.push({ label: "Delete", icon: "delete" as any, onClick: () => setToDelete(emp), destructive: true } as any);
    setCtx({ x: e.clientX, y: e.clientY, actions });
  }

  function inviteBadge(emp: Employee) {
    if (emp.invite_status === "accepted")
      return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active user</Badge>;
    if (emp.invite_status === "pending")
      return <Badge variant="warning" className="gap-1"><Mail className="h-3 w-3" /> Invite pending</Badge>;
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const thClass = "cursor-pointer select-none hover:text-foreground whitespace-nowrap";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && <Button onClick={startNew}><Plus className="h-4 w-4" /> Add employee</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={thClass} onClick={() => toggleSort("name")}>Name <SortIcon col="name" /></TableHead>
                <TableHead className={thClass} onClick={() => toggleSort("role_title")}>Role <SortIcon col="role_title" /></TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className={thClass} onClick={() => toggleSort("pay_rate")}>Pay rate <SortIcon col="pay_rate" /></TableHead>
                <TableHead>Photo</TableHead>
                <TableHead>System access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => (
                <TableRow
                  key={w.id}
                  className="cursor-pointer"
                  onClick={() => startEdit(w)}
                  onContextMenu={(e) => rowMenu(e, w)}
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
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No employees found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

          {/* Add as user section (new employee) */}
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

          {/* Existing employee invite management */}
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
