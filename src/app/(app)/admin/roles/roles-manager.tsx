"use client";

import * as React from "react";
import { PERMISSION_GROUPS, type PermissionMap } from "@/lib/permissions";
import { NOTIFICATION_TYPES } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SlideOver } from "@/components/slide-over";
import { DeleteConfirm } from "@/components/row-actions";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2, Lock, MapPin, Bell } from "lucide-react";
import { createRole, updateRole, deleteRole } from "./actions";

type NotifPrefs = Record<string, boolean>;
interface Role { id: string; name: string; permissions: PermissionMap; is_system: boolean; require_location?: boolean; notification_prefs?: NotifPrefs; }

export function RolesManager({ initialRoles }: { initialRoles: Role[] }) {
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>(initialRoles);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [name, setName] = React.useState("");
  const [perms, setPerms] = React.useState<PermissionMap>({});
  const [requireLocation, setRequireLocation] = React.useState(false);
  const [notifPrefs, setNotifPrefs] = React.useState<NotifPrefs>({});
  const [saving, setSaving] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<Role | null>(null);

  function startNew() { setEditing(null); setName(""); setPerms({}); setRequireLocation(false); setNotifPrefs({}); setOpen(true); }
  function startEdit(r: Role) { setEditing(r); setName(r.name); setPerms({ ...r.permissions }); setRequireLocation(!!r.require_location); setNotifPrefs({ ...(r.notification_prefs ?? {}) }); setOpen(true); }
  function toggle(key: string) { setPerms((p) => ({ ...p, [key]: !p[key] })); }
  // Opt-out model: a missing key means "on".
  function notifOn(key: string) { return notifPrefs[key] !== false; }
  function toggleNotif(key: string) { setNotifPrefs((p) => ({ ...p, [key]: p[key] === false ? true : false })); }

  // Quick helper: toggle all perms in a module group at once
  function toggleGroup(keys: string[], value: boolean) {
    setPerms((p) => { const n = { ...p }; keys.forEach((k) => (n[k] = value)); return n; });
  }

  async function save() {
    if (!name.trim()) return toast({ title: "Name required", variant: "destructive" });
    setSaving(true);
    const clean: PermissionMap = Object.fromEntries(Object.entries(perms).filter(([, v]) => v));
    if (editing) {
      const res = await updateRole(editing.id, name.trim(), clean, requireLocation, notifPrefs);
      setSaving(false);
      if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
      setRoles((rs) => rs.map((r) => (r.id === editing.id ? { ...r, name: name.trim(), permissions: clean, require_location: requireLocation, notification_prefs: notifPrefs } : r)));
      toast({ title: "Role updated" });
    } else {
      const res = await createRole(name.trim(), clean, requireLocation, notifPrefs);
      setSaving(false);
      if (res.error) return toast({ title: "Create failed", description: res.error, variant: "destructive" });
      setRoles((rs) => [...rs, res.data as Role]);
      toast({ title: "Role created" });
    }
    setOpen(false);
  }

  async function confirmDelete() {
    if (!toDelete || toDelete.is_system) return;
    const res = await deleteRole(toDelete.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setRoles((rs) => rs.filter((x) => x.id !== toDelete.id));
    toast({ title: "Role deleted" });
  }

  const countPerms = (p: PermissionMap) => Object.values(p).filter(Boolean).length;

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={startNew}><Plus className="h-4 w-4" /> New role</Button></div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id} className="cursor-pointer transition-colors hover:border-primary/50" onClick={() => startEdit(r)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {r.name}
                {r.is_system && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> System</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{countPerms(r.permissions)} permissions</p>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="sm" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                {!r.is_system && <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DeleteConfirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        itemLabel={`role "${toDelete?.name}"`}
        requireTyped={toDelete?.name}
      />

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        width="lg"
        title={editing ? `Edit ${editing.name}` : "New role"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Save changes" : "Create role"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Role name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Field Supervisor" disabled={editing?.is_system} />
            {editing?.is_system && <p className="text-xs text-muted-foreground">System role name can&apos;t change, but you can still adjust its permissions.</p>}
          </div>
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) => {
              const keys = group.perms.map((p) => p.key);
              const allOn = keys.every((k) => perms[k]);
              return (
                <div key={group.module} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{group.module}</h4>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleGroup(keys, !allOn)}
                    >
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.perms.map((p) => (
                      <label key={p.key} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={!!perms[p.key]} onCheckedChange={() => toggle(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Location requirement — a role behavior, not a permission. */}
          <div className="rounded-md border p-3">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-medium">Require location to use the app</span>
                  <span className="block text-xs text-muted-foreground">
                    Members must allow location access; they're tracked and shown on the map.
                  </span>
                </span>
              </span>
              <Switch checked={requireLocation} onCheckedChange={setRequireLocation} />
            </label>
          </div>

          {/* Notification subscriptions for this role. */}
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Notifications</h4>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Choose which activity members with this role are notified about (shown in the bell).
            </p>
            <div className="space-y-2">
              {NOTIFICATION_TYPES.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <span>{t.label}</span>
                  <Switch checked={notifOn(t.key)} onCheckedChange={() => toggleNotif(t.key)} />
                </label>
              ))}
            </div>
          </div>
        </div>
      </SlideOver>
    </>
  );
}
