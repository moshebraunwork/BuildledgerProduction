"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/slide-over";
import { useToast } from "@/components/ui/use-toast";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Plus, UserCheck, AlertTriangle, Mail } from "lucide-react";
import { setUserRole, setUserActive, setUserFullName, getUserLogs, getUserSessions, inviteUser, updateUserEmail, reinviteUser } from "./actions";
import { fmtDate } from "@/lib/utils";

interface UserRow {
  id: string; clerk_user_id: string; email: string; full_name: string | null;
  role_id: string | null; is_active: boolean; is_superadmin: boolean;
}
interface RoleOpt { id: string; name: string; }

type SortKey = "full_name" | "email" | "is_active";
type SortDir = "asc" | "desc";

export function UsersManager({ initialUsers, roles }: { initialUsers: UserRow[]; roles: RoleOpt[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<UserRow[]>(initialUsers);
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("email");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // Invite slide-over
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRoleId, setInviteRoleId] = React.useState<string>("");
  const [inviting, setInviting] = React.useState(false);

  // User detail slide-over
  const [detailUser, setDetailUser] = React.useState<UserRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState<"info" | "logs" | "sessions">("info");
  const [detailLogs, setDetailLogs] = React.useState<any[]>([]);
  const [detailSessions, setDetailSessions] = React.useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = React.useState(false);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);
  const [editEmail, setEditEmail] = React.useState("");
  const [savingEmail, setSavingEmail] = React.useState(false);
  const [reinviting, setReinviting] = React.useState(false);

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

  const activeUsers = React.useMemo(() => {
    const q2 = q.toLowerCase();
    const list = users.filter((u) =>
      u.is_active &&
      (`${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(q2))
    );
    list.sort((a, b) => {
      let av: string | boolean = (a as any)[sortKey] ?? "";
      let bv: string | boolean = (b as any)[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, q, sortKey, sortDir]);

  const pendingUsers = React.useMemo(() =>
    users.filter((u) => !u.is_active && !u.is_superadmin),
    [users]
  );

  async function changeRole(userId: string, roleId: string) {
    const res = await setUserRole(userId, roleId);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role_id: roleId } : x)));
    if (detailUser?.id === userId) setDetailUser((d) => d ? { ...d, role_id: roleId } : d);
    toast({ title: "Role updated" });
  }

  async function changeActive(userId: string, active: boolean) {
    const res = await setUserActive(userId, active);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, is_active: active } : x)));
    if (detailUser?.id === userId) setDetailUser((d) => d ? { ...d, is_active: active } : d);
    toast({ title: active ? "User enabled" : "User disabled" });
  }

  async function saveName() {
    if (!detailUser) return;
    setSavingName(true);
    const res = await setUserFullName(detailUser.id, editName);
    setSavingName(false);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === detailUser.id ? { ...x, full_name: editName || null } : x)));
    setDetailUser((d) => d ? { ...d, full_name: editName || null } : d);
    toast({ title: "Name updated" });
  }

  async function saveEmail() {
    if (!detailUser || !editEmail.trim()) return;
    setSavingEmail(true);
    const res = await updateUserEmail(detailUser.id, editEmail);
    setSavingEmail(false);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === detailUser.id ? { ...x, email: editEmail.trim() } : x)));
    setDetailUser((d) => d ? { ...d, email: editEmail.trim() } : d);
    toast({ title: "Email updated" });
  }

  async function doReinvite() {
    if (!detailUser) return;
    setReinviting(true);
    const res = await reinviteUser(editEmail.trim() || detailUser.email);
    setReinviting(false);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Invitation sent", description: `Sent to ${editEmail.trim() || detailUser.email}` });
  }

  function openDetail(u: UserRow) {
    setDetailUser(u);
    setEditName(u.full_name ?? "");
    setEditEmail(u.email);
    setDetailTab("info");
    setDetailLogs([]);
    setDetailSessions([]);
    setDetailOpen(true);
  }

  async function loadLogs() {
    if (!detailUser) return;
    setLoadingLogs(true);
    const res = await getUserLogs(detailUser.id);
    setLoadingLogs(false);
    if ("data" in res) setDetailLogs(res.data as any[]);
  }

  async function loadSessions() {
    if (!detailUser) return;
    setLoadingSessions(true);
    const res = await getUserSessions(detailUser.clerk_user_id);
    setLoadingSessions(false);
    if ("data" in res) setDetailSessions(res.data as any[]);
  }

  React.useEffect(() => {
    if (detailOpen && detailTab === "logs" && detailLogs.length === 0) loadLogs();
    if (detailOpen && detailTab === "sessions" && detailSessions.length === 0) loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOpen, detailTab]);

  async function doInvite() {
    if (!inviteEmail.trim()) return toast({ title: "Email required", variant: "destructive" });
    setInviting(true);
    const res = await inviteUser(inviteEmail.trim(), (inviteRoleId && inviteRoleId !== "__none__") ? inviteRoleId : null);
    setInviting(false);
    if (res.error) return toast({ title: "Invite failed", description: res.error, variant: "destructive" });
    setInviteOpen(false);
    setInviteEmail(""); setInviteRoleId("");
    toast({ title: "Invitation sent", description: `${inviteEmail} will receive a sign-up link.` });
  }

  const thClass = "cursor-pointer select-none hover:text-foreground whitespace-nowrap";

  return (
    <>
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4 mr-1" /> Invite user</Button>
      </div>

      {/* Active users table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={thClass} onClick={() => toggleSort("full_name")}>User <SortIcon col="full_name" /></TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeUsers.map((u) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => openDetail(u)}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{u.full_name || "—"}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {u.is_superadmin ? <Badge>Superadmin</Badge> : (
                      <Select value={u.role_id ?? ""} onValueChange={(v) => {
                        if (v === "__new__") { router.push("/admin/roles"); return; }
                        changeRole(u.id, v);
                      }}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="No role" /></SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          <SelectItem value="__new__" className="text-primary font-medium border-t mt-1">
                            + Add new role
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {u.is_superadmin ? (
                      <Badge variant="secondary">Always on</Badge>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <Switch
                          checked={u.is_active}
                          disabled={!u.is_active && !u.role_id}
                          onCheckedChange={(v) => changeActive(u.id, v)}
                        />
                        {!u.is_active && !u.role_id && (
                          <span className="text-[11px] text-muted-foreground">Role required</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {activeUsers.length === 0 && (
                <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No active users match your search.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending access requests */}
      {pendingUsers.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold">Pending access requests ({pendingUsers.length})</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Enable access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((u) => (
                    <TableRow key={u.id} className="cursor-pointer" onClick={() => openDetail(u)}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{u.full_name || "—"}</span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={u.role_id ?? ""} onValueChange={(v) => {
                          if (v === "__new__") { router.push("/admin/roles"); return; }
                          changeRole(u.id, v);
                        }}>
                          <SelectTrigger className="w-44"><SelectValue placeholder="Assign role first" /></SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            <SelectItem value="__new__" className="text-primary font-medium border-t mt-1">
                              + Add new role
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            size="sm"
                            disabled={!u.role_id}
                            onClick={() => changeActive(u.id, true)}
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1" /> Enable
                          </Button>
                          {!u.role_id && (
                            <span className="text-[11px] text-muted-foreground">Assign a role first</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite slide-over */}
      <SlideOver
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite user"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={doInvite} disabled={inviting}>{inviting ? "Sending…" : "Send invite"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            They will receive an email with a sign-up link. The role you assign here will be automatically applied when they sign up.
          </p>
          <div className="space-y-2">
            <Label>Email address</Label>
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Role (optional)</Label>
            <Select value={inviteRoleId} onValueChange={(v) => {
              if (v === "__new__") { router.push("/admin/roles"); return; }
              setInviteRoleId(v);
            }}>
              <SelectTrigger><SelectValue placeholder="No role assigned yet" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No role</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                <SelectItem value="__new__" className="text-primary font-medium border-t mt-1">
                  + Add new role
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SlideOver>

      {/* User detail slide-over */}
      <SlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailUser?.full_name || detailUser?.email || "User"}
        width="md"
      >
        {detailUser && (
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex border-b">
              {(["info", "logs", "sessions"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                    detailTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setDetailTab(tab)}
                >
                  {tab === "sessions" ? "Devices" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Info tab */}
            {detailTab === "info" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Login email</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveEmail}
                      disabled={savingEmail || editEmail.trim() === detailUser.email}
                    >
                      {savingEmail ? "…" : "Save"}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2"
                    disabled={reinviting || !editEmail.trim()}
                    onClick={doReinvite}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    {reinviting ? "Sending…" : "Send / resend login invite"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <div className="flex gap-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" />
                    <Button size="sm" onClick={saveName} disabled={savingName || editName === (detailUser.full_name ?? "")}>
                      {savingName ? "…" : "Save"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  {detailUser.is_superadmin ? (
                    <Badge>Superadmin</Badge>
                  ) : (
                    <Select value={detailUser.role_id ?? ""} onValueChange={(v) => {
                      if (v === "__new__") { router.push("/admin/roles"); return; }
                      changeRole(detailUser.id, v);
                    }}>
                      <SelectTrigger><SelectValue placeholder="No role" /></SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        <SelectItem value="__new__" className="text-primary font-medium border-t mt-1">
                          + Add new role
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {!detailUser.is_superadmin && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Account active</div>
                      <div className="text-xs text-muted-foreground">
                        {detailUser.is_active
                          ? "User can log in."
                          : !detailUser.role_id
                          ? "Assign a role before enabling."
                          : "User cannot log in until enabled."}
                      </div>
                    </div>
                    <Switch
                      checked={detailUser.is_active}
                      disabled={!detailUser.is_active && !detailUser.role_id}
                      onCheckedChange={(v) => changeActive(detailUser.id, v)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Logs tab */}
            {detailTab === "logs" && (
              <div>
                {loadingLogs ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
                ) : detailLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded for this user.</p>
                ) : (
                  <div className="space-y-2">
                    {detailLogs.map((l) => (
                      <div key={l.id} className="rounded-md border p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">{l.action}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                        </div>
                        {l.entity && (
                          <p className="text-xs text-muted-foreground">
                            {l.entity}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 8)}` : ""}
                          </p>
                        )}
                        {l.detail && Object.keys(l.detail).length > 0 && (
                          <p className="text-xs text-muted-foreground font-mono">{JSON.stringify(l.detail)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sessions/Devices tab */}
            {detailTab === "sessions" && (
              <div>
                {loadingSessions ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
                ) : detailSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No active sessions found.</p>
                ) : (
                  <div className="space-y-2">
                    {detailSessions.map((s) => (
                      <div key={s.id} className="rounded-md border p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant={s.status === "active" ? "success" : "secondary"} className="capitalize">{s.status}</Badge>
                          <span className="text-xs text-muted-foreground">Session {s.id.slice(0, 8)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created: {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last active: {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString() : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
}
