"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, ScrollText, Monitor, Globe } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MobileCard } from "@/components/mobile-card";
import { CATEGORY_LABELS, humanizeAction, titleizeKey, fmtVal, describeDevice } from "@/lib/audit-labels";

interface LogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

type SortKey = "created_at" | "actor_email" | "action" | "entity";
type SortDir = "asc" | "desc";

// Action labels, category names, device parsing and value formatting are shared
// with the per-user log panel — see @/lib/audit-labels.

// Renders a single audit entry's `detail` as readable rows: a "changes" map is
// shown as "Field: old → new"; everything else as "Key: value".
function DetailView({ detail }: { detail: Record<string, any> }) {
  const { changes, added, removed, ...rest } = detail;
  const restKeys = Object.keys(rest);
  const hasChanges = changes && typeof changes === "object" && Object.keys(changes).length > 0;
  const hasAddRemove = (Array.isArray(added) && added.length) || (Array.isArray(removed) && removed.length);

  if (!hasChanges && !hasAddRemove && restKeys.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      {hasChanges && (
        <div className="space-y-0.5">
          {Object.entries(changes as Record<string, { from: any; to: any }>).map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center gap-1">
              <span className="font-medium text-foreground">{titleizeKey(k)}:</span>
              <span className="text-muted-foreground line-through">{fmtVal(v?.from)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground">{fmtVal(v?.to)}</span>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(added) && added.length > 0 && (
        <div><span className="font-medium text-green-600 dark:text-green-400">Granted:</span> <span className="text-muted-foreground">{added.join(", ")}</span></div>
      )}
      {Array.isArray(removed) && removed.length > 0 && (
        <div><span className="font-medium text-red-600 dark:text-red-400">Revoked:</span> <span className="text-muted-foreground">{removed.join(", ")}</span></div>
      )}
      {restKeys.map((k) => (
        <div key={k} className="flex flex-wrap gap-1">
          <span className="font-medium text-foreground">{titleizeKey(k)}:</span>
          <span className="text-muted-foreground">{fmtVal(rest[k])}</span>
        </div>
      ))}
    </div>
  );
}

export function LogsManager({ initialLogs }: { initialLogs: LogEntry[] }) {
  const [q, setQ] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Collect unique action prefixes for filter dropdown
  const actionGroups = React.useMemo(() => {
    const prefixes = new Set<string>();
    initialLogs.forEach((l) => {
      const prefix = l.action.split(".")[0];
      if (prefix) prefixes.add(prefix);
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
      const haystack = `${l.actor_name ?? ""} ${l.actor_email ?? ""} ${l.action} ${humanizeAction(l.action)} ${l.entity ?? ""} ${l.entity_id ?? ""} ${l.ip_address ?? ""} ${JSON.stringify(l.detail ?? {})}`.toLowerCase();
      const matchQ = haystack.includes(q2);
      const matchAction = actionFilter === "all" || l.action.startsWith(actionFilter + ".") || l.action === actionFilter;
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

  function Who({ l }: { l: LogEntry }) {
    if (!l.actor_email && !l.actor_name) return <span className="text-muted-foreground">system</span>;
    return (
      <div className="min-w-0">
        {l.actor_name && <div className="font-medium truncate">{l.actor_name}</div>}
        <div className="text-xs text-muted-foreground truncate">{l.actor_email}</div>
      </div>
    );
  }

  function hasDetail(l: LogEntry) {
    return l.detail && Object.keys(l.detail).length > 0;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by person, action, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {actionGroups.map((g) => (
              <SelectItem key={g} value={g}>{CATEGORY_LABELS[g] ?? g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-2">{filtered.length} entries</span>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
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
                  <TableHead className="whitespace-nowrap">Device / IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const open = expanded.has(l.id);
                  const expandable = hasDetail(l);
                  const device = describeDevice(l.user_agent);
                  return (
                    <React.Fragment key={l.id}>
                      <TableRow
                        className={expandable ? "cursor-pointer" : undefined}
                        onClick={expandable ? () => toggleRow(l.id) : undefined}
                      >
                        <TableCell className="align-top py-3 pr-0 text-muted-foreground">
                          {expandable && (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground align-top py-3">
                          {new Date(l.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm align-top py-3 max-w-[180px]">
                          <Who l={l} />
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div className="font-medium text-sm">{humanizeAction(l.action)}</div>
                          <Badge variant="secondary" className="font-mono text-[10px] mt-0.5">{l.action}</Badge>
                          {open && l.detail && <DetailView detail={l.detail} />}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top py-3">
                          {l.entity ? (
                            <div>
                              <span className="capitalize">{l.entity}</span>
                              {l.entity_id && <span className="block font-mono text-[10px]">{String(l.entity_id).slice(0, 12)}</span>}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top py-3 whitespace-nowrap">
                          {device && <div className="flex items-center gap-1"><Monitor className="h-3 w-3" />{device}</div>}
                          {l.ip_address && <div className="flex items-center gap-1 font-mono text-[10px]"><Globe className="h-3 w-3" />{l.ip_address}</div>}
                          {!device && !l.ip_address && "—"}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {filtered.map((l) => {
          const device = describeDevice(l.user_agent);
          return (
            <MobileCard key={l.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{humanizeAction(l.action)}</div>
                  <Badge variant="secondary" className="mt-0.5 font-mono text-[10px]">{l.action}</Badge>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {l.actor_name ? `${l.actor_name} (${l.actor_email ?? "—"})` : (l.actor_email ?? "system")}
                {l.entity && <> · <span className="capitalize">{l.entity}</span></>}
              </div>
              {(device || l.ip_address) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {device && <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{device}</span>}
                  {l.ip_address && <span className="flex items-center gap-1 font-mono"><Globe className="h-3 w-3" />{l.ip_address}</span>}
                </div>
              )}
              {l.detail && <DetailView detail={l.detail} />}
            </MobileCard>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState icon={ScrollText} title="No activity yet" description="Sign-ins, sign-outs, and changes will appear here." />
        )}
      </div>
    </>
  );
}
