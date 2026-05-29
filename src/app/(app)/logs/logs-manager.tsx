"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";

interface LogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: Record<string, any> | null;
  created_at: string;
}

type SortKey = "created_at" | "actor_email" | "action" | "entity";
type SortDir = "asc" | "desc";

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    "job.create": "Created a new job",
    "job.update": "Updated job details",
    "job.delete": "Deleted a job",
    "job.status_change": "Changed job status",
    "invoice.create": "Generated an invoice",
    "invoice.edit": "Edited an invoice",
    "invoice.delete": "Deleted an invoice",
    "invoice.send": "Sent an invoice to customer",
    "user.set_role": "Assigned a role to user",
    "user.enable": "Enabled user account",
    "user.disable": "Disabled user account",
    "user.invite": "Sent a user invitation",
    "user.update_name": "Updated user display name",
    "employee.create": "Added a new employee",
    "worker.update": "Updated employee details",
    "worker.delete": "Removed an employee",
    "item.create": "Added inventory item",
    "item.update": "Updated inventory item",
    "item.delete": "Deleted inventory item",
    "punch.create": "Recorded a punch-in",
    "punch.admin_create": "Admin created a punch entry",
    "punch.admin_update": "Admin edited a punch entry",
    "punch.admin_delete_end": "Admin removed punch end time",
    "punch.admin_delete": "Admin deleted a punch entry",
    "media.upload": "Uploaded media to job",
    "media.delete": "Deleted media from job",
    "job_item.add": "Added item to job",
    "job_item.remove": "Removed item from job",
    "job_cost.add": "Added cost to job",
    "job_cost.remove": "Removed cost from job",
    "job_notes.save": "Updated job notes",
    "company.update": "Updated company settings",
    "profile.update": "Updated user profile",
  };
  return map[action] ?? action.replace(/[._]/g, " ");
}

function ExpandableDetail({ detail }: { detail: Record<string, any> }) {
  const [open, setOpen] = React.useState(false);
  if (!detail || Object.keys(detail).length === 0) return null;
  return (
    <div className="mt-1">
      <button
        className="text-xs text-muted-foreground flex items-center gap-0.5 hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LogsManager({ initialLogs }: { initialLogs: LogEntry[] }) {
  const [q, setQ] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Collect unique action prefixes for filter dropdown
  const actionGroups = React.useMemo(() => {
    const prefixes = new Set<string>();
    initialLogs.forEach((l) => {
      const parts = l.action.split(".");
      if (parts.length >= 1) prefixes.add(parts[0]);
    });
    return Array.from(prefixes).sort();
  }, [initialLogs]);

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
    const list = initialLogs.filter((l) => {
      const matchQ = `${l.actor_email ?? ""} ${l.action} ${l.entity ?? ""} ${l.entity_id ?? ""}`.toLowerCase().includes(q2);
      const matchAction = actionFilter === "all" || l.action.startsWith(actionFilter + ".");
      return matchQ && matchAction;
    });
    list.sort((a, b) => {
      const av = String((a as any)[sortKey] ?? "").toLowerCase();
      const bv = String((b as any)[sortKey] ?? "").toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [initialLogs, q, actionFilter, sortKey, sortDir]);

  const thClass = "cursor-pointer select-none hover:text-foreground whitespace-nowrap";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionGroups.map((g) => (
              <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-2">{filtered.length} entries</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={thClass} onClick={() => toggleSort("created_at")}>
                    When <SortIcon col="created_at" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("actor_email")}>
                    Who <SortIcon col="actor_email" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("action")}>
                    Action <SortIcon col="action" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("entity")}>
                    Target <SortIcon col="entity" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground align-top py-3">
                      {new Date(l.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm align-top py-3">
                      {l.actor_email ?? <span className="text-muted-foreground">system</span>}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="font-medium text-sm">{humanizeAction(l.action)}</div>
                      <Badge variant="secondary" className="font-mono text-[10px] mt-0.5">{l.action}</Badge>
                      {l.detail && <ExpandableDetail detail={l.detail} />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground align-top py-3">
                      {l.entity ? (
                        <div>
                          <span className="capitalize">{l.entity}</span>
                          {l.entity_id && <span className="block font-mono text-[10px]">{String(l.entity_id).slice(0, 12)}</span>}
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
