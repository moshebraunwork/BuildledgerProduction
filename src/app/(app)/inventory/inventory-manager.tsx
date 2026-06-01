"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlideOver } from "@/components/slide-over";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney } from "@/lib/utils";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Package, MoreVertical } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, MobileField } from "@/components/mobile-card";
import { createItem, updateItem, deleteItem } from "./actions";

interface Item {
  id: string; name: string; cost: number; charge: number;
  source: string | null; stock: number; low_threshold: number;
}

type SortKey = "name" | "cost" | "charge" | "stock";
type SortDir = "asc" | "desc";

const blank = { name: "", cost: 0, charge: 0, source: "", stock: 0, low_threshold: 0 };

export function InventoryManager({
  initialItems, canEdit, canDelete,
}: {
  initialItems: Item[]; canEdit: boolean; canDelete: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [form, setForm] = React.useState<typeof blank>(blank);
  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Item | null>(null);

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
    const list = items.filter((i) =>
      i.name.toLowerCase().includes(q2) ||
      (i.source ?? "").toLowerCase().includes(q2)
    );
    list.sort((a, b) => {
      let av: string | number = a[sortKey];
      let bv: string | number = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, q, sortKey, sortDir]);

  function startNew() { setEditing(null); setForm(blank); setOpen(true); }
  function startEdit(i: Item) {
    setEditing(i);
    setForm({ name: i.name, cost: i.cost, charge: i.charge, source: i.source ?? "", stock: i.stock, low_threshold: i.low_threshold });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast({ title: "Name required", variant: "destructive" });
    const payload = {
      name: form.name.trim(), cost: Number(form.cost), charge: Number(form.charge),
      source: form.source || null, stock: Number(form.stock), low_threshold: Number(form.low_threshold),
    };
    if (editing) {
      const res = await updateItem(editing.id, payload);
      if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
      setItems((it) => it.map((x) => (x.id === editing.id ? { ...x, ...payload } : x)));
      toast({ title: "Item updated" });
    } else {
      const res = await createItem(payload);
      if (res.error) return toast({ title: "Create failed", description: res.error, variant: "destructive" });
      setItems((it) => [...it, res.data as Item]);
      toast({ title: "Item added" });
    }
    setOpen(false);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await deleteItem(toDelete.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setItems((it) => it.filter((x) => x.id !== toDelete.id));
    toast({ title: "Item deleted" });
  }

  function rowMenu(e: React.MouseEvent, item: Item) {
    e.preventDefault();
    const actions = [{ label: "View / edit", icon: "edit" as const, onClick: () => startEdit(item) }];
    if (canDelete) actions.push({ label: "Delete", icon: "delete" as any, onClick: () => setToDelete(item), destructive: true } as any);
    setCtx({ x: e.clientX, y: e.clientY, actions });
  }

  function markup(i: Item) {
    if (!i.cost) return "—";
    return `${Math.round(((i.charge - i.cost) / i.cost) * 100)}%`;
  }

  const thClass = "cursor-pointer select-none hover:text-foreground whitespace-nowrap";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && <Button onClick={startNew}><Plus className="h-4 w-4" /> Add item</Button>}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={thClass} onClick={() => toggleSort("name")}>
                  Item <SortIcon col="name" />
                </TableHead>
                <TableHead className={thClass} onClick={() => toggleSort("cost")}>
                  Cost <SortIcon col="cost" />
                </TableHead>
                <TableHead className={thClass} onClick={() => toggleSort("charge")}>
                  Charge <SortIcon col="charge" />
                </TableHead>
                <TableHead>Markup</TableHead>
                <TableHead className={thClass} onClick={() => toggleSort("stock")}>
                  Stock <SortIcon col="stock" />
                </TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                const low = i.stock > 0 && i.stock <= i.low_threshold;
                return (
                  <TableRow
                    key={i.id}
                    className="cursor-pointer"
                    onClick={() => startEdit(i)}
                    onContextMenu={(e) => rowMenu(e, i)}
                  >
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{fmtMoney(i.cost)}</TableCell>
                    <TableCell>{fmtMoney(i.charge)}</TableCell>
                    <TableCell>{markup(i)}</TableCell>
                    <TableCell>
                      <span className="mr-2">{i.stock}</span>
                      {i.stock === 0 ? <Badge variant="destructive">Out of stock</Badge> : low ? <Badge variant="warning">Low</Badge> : null}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">{i.source ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Package}
                      title={q ? "No matching items" : "No items yet"}
                      description={q ? "Try a different search term." : "Add catalog items to track stock and pull them into jobs."}
                      action={canEdit && !q ? <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add item</Button> : undefined}
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
        {filtered.map((i) => {
          const low = i.stock > 0 && i.stock <= i.low_threshold;
          return (
            <MobileCard key={i.id} onClick={() => startEdit(i)}>
              <div className="flex items-start justify-between gap-2">
                <div className="truncate font-medium">{i.name}</div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm">{i.stock}</span>
                  {i.stock === 0 ? <Badge variant="destructive">Out</Badge> : low ? <Badge variant="warning">Low</Badge> : null}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                <MobileField label="Cost">{fmtMoney(i.cost)}</MobileField>
                <MobileField label="Charge">{fmtMoney(i.charge)}</MobileField>
                <MobileField label="Markup">{markup(i)}</MobileField>
              </div>
              {i.source && <div className="mt-1 truncate text-xs text-muted-foreground">Source: {i.source}</div>}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="rounded p-1.5 hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); rowMenu(e, i); }}
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </MobileCard>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState
            icon={Package}
            title={q ? "No matching items" : "No items yet"}
            description={q ? "Try a different search term." : "Add catalog items to track stock and pull them into jobs."}
            action={canEdit && !q ? <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add item</Button> : undefined}
          />
        )}
      </div>

      <RowContextMenu state={ctx} onClose={() => setCtx(null)} />
      <DeleteConfirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        itemLabel={toDelete?.name ?? "item"}
      />

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit item" : "Add item"}
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
            <div className="space-y-2"><Label>Cost (paid)</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: +e.target.value })} /></div>
            <div className="space-y-2"><Label>Charge (customer)</Label><Input type="number" value={form.charge} onChange={(e) => setForm({ ...form, charge: +e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Stock count</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: +e.target.value })} /></div>
            <div className="space-y-2"><Label>Low-stock threshold</Label><Input type="number" value={form.low_threshold} onChange={(e) => setForm({ ...form, low_threshold: +e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Source (store name, address, or link)</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
          {editing && markup(editing) !== "—" && (
            <p className="text-xs text-muted-foreground">Current markup: {markup(form as any)}</p>
          )}
        </div>
      </SlideOver>
    </>
  );
}
