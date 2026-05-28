"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney } from "@/lib/utils";
import { Plus, Pencil, Trash2, Camera } from "lucide-react";
import { createEmployee, updateEmployee, deleteEmployee } from "./actions";

interface Employee {
  id: string; name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
}

const blank = { name: "", role_title: "", phone: "", pay_rate: 0, require_punch_photo: false };

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

  function startNew() { setEditing(null); setForm(blank); setOpen(true); }
  function startEdit(w: Employee) {
    setEditing(w);
    setForm({ name: w.name, role_title: w.role_title ?? "", phone: w.phone ?? "", pay_rate: w.pay_rate, require_punch_photo: w.require_punch_photo });
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
      const res = await createEmployee(payload);
      if (res.error) return toast({ title: "Create failed", description: res.error, variant: "destructive" });
      setEmployees((ws) => [...ws, res.data as Employee]);
      toast({ title: "Employee added" });
    }
    setOpen(false);
  }

  async function remove(w: Employee) {
    if (!confirm(`Remove "${w.name}" from the crew?`)) return;
    const res = await deleteEmployee(w.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setEmployees((ws) => ws.filter((x) => x.id !== w.id));
    toast({ title: "Employee removed" });
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
                <TableHead>Pay rate</TableHead><TableHead>Photo required</TableHead>
                {(canEdit || canDelete) && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-sm">{w.role_title ?? "—"}</TableCell>
                  <TableCell className="text-sm">{w.phone ?? "—"}</TableCell>
                  <TableCell>{fmtMoney(w.pay_rate)}/hr</TableCell>
                  <TableCell>
                    {w.require_punch_photo ? <Badge variant="secondary" className="gap-1"><Camera className="h-3 w-3" /> Required</Badge> : <span className="text-sm text-muted-foreground">No</span>}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right whitespace-nowrap">
                      {canEdit && <Button size="sm" variant="ghost" onClick={() => startEdit(w)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(w)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {employees.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No employees yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Role / title</Label><Input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="e.g. Carpenter" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Pay rate ($/hr)</Label><Input type="number" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: +e.target.value })} /></div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div><div className="text-sm font-medium">Require photo with punches</div><div className="text-xs text-muted-foreground">This worker must attach a photo when punching in.</div></div>
              <Switch checked={form.require_punch_photo} onCheckedChange={(v) => setForm({ ...form, require_punch_photo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
