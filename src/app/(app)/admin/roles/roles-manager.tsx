"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase-browser";
import { PERMISSION_GROUPS, type PermissionMap } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";

interface Role {
  id: string;
  name: string;
  permissions: PermissionMap;
  is_system: boolean;
}

export function RolesManager({ initialRoles }: { initialRoles: Role[] }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>(initialRoles);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [name, setName] = React.useState("");
  const [perms, setPerms] = React.useState<PermissionMap>({});
  const [saving, setSaving] = React.useState(false);

  function startNew() {
    setEditing(null);
    setName("");
    setPerms({});
    setOpen(true);
  }
  function startEdit(r: Role) {
    setEditing(r);
    setName(r.name);
    setPerms({ ...r.permissions });
    setOpen(true);
  }
  function toggle(key: string) {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  }

  async function save() {
    if (!name.trim()) return toast({ title: "Name required", variant: "destructive" });
    setSaving(true);
    // strip false values to keep the JSON tidy
    const clean: PermissionMap = Object.fromEntries(
      Object.entries(perms).filter(([, v]) => v)
    );
    if (editing) {
      const { error } = await supabase
        .from("roles")
        .update({ name: name.trim(), permissions: clean })
        .eq("id", editing.id);
      setSaving(false);
      if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setRoles((rs) => rs.map((r) => (r.id === editing.id ? { ...r, name: name.trim(), permissions: clean } : r)));
      toast({ title: "Role updated" });
    } else {
      const { data, error } = await supabase
        .from("roles")
        .insert({ name: name.trim(), permissions: clean })
        .select()
        .single();
      setSaving(false);
      if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
      setRoles((rs) => [...rs, data as Role]);
      toast({ title: "Role created" });
    }
    setOpen(false);
  }

  async function remove(r: Role) {
    if (r.is_system) return;
    if (!confirm(`Delete the "${r.name}" role? Users with it will lose its permissions.`)) return;
    const { error } = await supabase.from("roles").delete().eq("id", r.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setRoles((rs) => rs.filter((x) => x.id !== r.id));
    toast({ title: "Role deleted" });
  }

  const countPerms = (p: PermissionMap) => Object.values(p).filter(Boolean).length;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {r.name}
                {r.is_system && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" /> System
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{countPerms(r.permissions)} permissions</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {!r.is_system && (
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit "${editing.name}"` : "New role"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Field Supervisor"
                disabled={editing?.is_system}
              />
              {editing?.is_system && (
                <p className="text-xs text-muted-foreground">
                  System role name can&apos;t change, but you can still adjust its permissions.
                </p>
              )}
            </div>

            <div className="space-y-4 rounded-md border p-4 max-h-[45vh] overflow-y-auto">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.module}>
                  <h4 className="mb-2 text-sm font-semibold">{group.module}</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox checked={!!perms[p.key]} onCheckedChange={() => toggle(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {editing ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
