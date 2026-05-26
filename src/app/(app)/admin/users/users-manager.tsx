"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role_id: string | null;
  is_active: boolean;
  is_superadmin: boolean;
}
interface RoleOpt {
  id: string;
  name: string;
}

export function UsersManager({ initialUsers, roles }: { initialUsers: UserRow[]; roles: RoleOpt[] }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<UserRow[]>(initialUsers);

  async function setRole(userId: string, roleId: string) {
    const { error } = await supabase.from("users").update({ role_id: roleId }).eq("id", userId);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role_id: roleId } : x)));
    toast({ title: "Role updated" });
  }

  async function setActive(userId: string, active: boolean) {
    const { error } = await supabase.from("users").update({ is_active: active }).eq("id", userId);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, is_active: active } : x)));
    toast({ title: active ? "User enabled" : "User disabled" });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{u.full_name || "—"}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {u.is_superadmin ? (
                    <Badge>Superadmin</Badge>
                  ) : (
                    <Select value={u.role_id ?? ""} onValueChange={(v) => setRole(u.id, v)}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="No role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {u.is_superadmin ? (
                    <Badge variant="secondary">Always on</Badge>
                  ) : (
                    <Switch checked={u.is_active} onCheckedChange={(v) => setActive(u.id, v)} />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  No users yet. People appear here after they sign in for the first time.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
