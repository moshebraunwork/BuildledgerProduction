"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney } from "@/lib/utils";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { createItem, updateItem, deleteItem } from "./actions";

interface Item {
  id: string; name: string; cost: number; charge: number;
  source: string | null; stock: number; low_threshold: number;
}

const blank = { name: "", cost: 0, charge: 0, source: "", stock: 0, low_threshold: 0 };

export function InventoryManager({
  initialItems, canEdit, canDelete,
}: {
  initialItems: Item[]; canEdit: boolean; canDelete: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [form, setForm] = React.useState<typeof blank>(blank);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

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

  async function remove(i: Item) {
    if (!confirm(`Delete "${i.name}"?`)) return;
    const res = await deleteItem(i.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setItems((it) => it.filter((x) => x.id !== i.id));
    toast({ title: "Item deleted" });
  }

  function markup(i: Item) {
    if (!i.cost) return "—";
    return `${Math.round(((i.charge - i.cost) / i.cost) * 100)}%`;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && <Button onClick={startNew}><Plus className="h-4 w-4" /> Add item</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead><TableHead>Cost</TableHead><TableHead>Charge</TableHead>
                <TableHead>Markup</TableHead><TableHead>Stock</TableHead><TableHead>Source</TableHead>
                {(canEdit || canDelete) && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                const low = i.stock <= i.low_threshold;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{fmtMoney(i.cost)}</TableCell>
                    <TableCell>{fmtMoney(i.charge)}</TableCell>
                    <TableCell>{markup(i)}</TableCell>
                    <TableCell><span className="mr-2">{i.stock}</span>{low && <Badge variant="warning">Low</Badge>}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">{i.source ?? "—"}</TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right whitespace-nowrap">
                        {canEdit && <Button variant="ghost" size="sm" onClick={() => startEdit(i)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button variant="ghost" size="sm" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No items found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
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
