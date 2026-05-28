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
import { Plus, Camera, Mail, Send, CheckCircle2 } from "lucide-react";
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

export function EmployeesManager({
  initialEmployees, canEdit, canDelete,
}: {
  initialEmployees: Employee[]; canEdit: boolean; canDelete: boolean;
}) {
  const { toast } = useToast();
  const [employees, setEmployees] = React.useState<Employee[]>(initialEmployees);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [form, setForm] = React.useState<typeof blank>(blank);
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Employee | null>(null);

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
      toast({ title: form.doInvite ? "Employee added & invited" : "Employee added" });
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
      return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>;
    if (emp.invite_status === "pending")
      return <Badge variant="warning" className="gap-1"><Mail className="h-3 w-3" /> Invited</Badge>;
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      {canEdit && <div className="mb-4 flex justify-end"><Button onClick={startNew}><Plus className="h-4 w-4" /> Add employee</Button></div>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Phone</TableHead>
                <TableHead>Pay rate</TableHead><TableHead>Photo</TableHead><TableHead>System access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((w) => (
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
              {employees.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No employees yet.</TableCell></TableRow>}
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

          {/* Invite section */}
          {!editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div><div className="text-sm font-medium">Invite to the system</div><div className="text-xs text-muted-foreground">Send a login invitation by email.</div></div>
                <Switch checked={form.doInvite} onCheckedChange={(v) => setForm({ ...form, doInvite: v })} />
              </div>
              {form.doInvite && (
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input type="email" value={form.invite_email} onChange={(e) => setForm({ ...form, invite_email: e.target.value })} placeholder="employee@email.com" />
                </div>
              )}
            </div>
          )}

          {/* Existing employee invite management */}
          {editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-sm font-medium">System access</div>
              {editing.invite_status === "accepted" ? (
                <p className="text-sm text-emerald-600">This employee has accepted their invitation and can log in.</p>
              ) : editing.invite_status === "pending" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Invitation sent to {editing.invite_email} — not accepted yet.</p>
                  <Button size="sm" variant="outline" onClick={() => doResend(editing)}><Send className="h-3.5 w-3.5" /> Resend invitation</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Invite by email</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={form.invite_email}
                      onChange={(e) => setForm({ ...form, invite_email: e.target.value })}
                      placeholder="employee@email.com"
                    />
                    <Button size="sm" onClick={() => editing && form.invite_email && sendInvite(editing, form.invite_email.trim())}>
                      <Mail className="h-3.5 w-3.5" /> Invite
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>
    </>
  );
}
