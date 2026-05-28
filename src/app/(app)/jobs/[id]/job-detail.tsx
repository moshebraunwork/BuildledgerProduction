"use client";

import * as React from "react";
import {
  addCrew as addCrewAction, removeCrew as removeCrewAction,
  punchIn as punchInAction, punchOut as punchOutAction,
  addJobItem as addJobItemAction, removeJobItem as removeJobItemAction, setJobItemExcluded,
  addJobCost as addJobCostAction, removeJobCost as removeJobCostAction, setJobCostExcluded,
  generateInvoice as generateInvoiceAction, setJobStatus,
} from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Play, Square, ShoppingCart, Plus, Trash2, Camera, Pencil, FileText, Download, Send } from "lucide-react";

// ---- types ----
interface Employee { id: string; name: string; role_title: string | null; pay_rate: number; require_punch_photo: boolean; }
interface JobItem { id: string; item_id: string | null; name: string; qty: number; cost: number; charge: number; excluded: boolean; }
interface CatalogItem { id: string; name: string; cost: number; charge: number; stock: number; }
interface JobCost { id: string; label: string; cost: number; charge: number; excluded: boolean; }
interface Punch {
  id: string; employee_id: string; kind: string; started_at: string; ended_at: string | null;
  note: string | null; started_photo_url: string | null; ended_photo_url: string | null;
}
interface Job {
  id: string; title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; customer_email: string | null; notes: string | null;
  estimate: number; billing_mode: string; billing_rate: number | null; status: string;
  require_punch_photo: boolean;
}
interface Company { id: string; name: string; invoice_from: string | null; default_rate: number; tax_rate: number; }
interface Perms { edit: boolean; punches: boolean; invoiceCreate: boolean; invoiceSend: boolean; isSuperadmin: boolean; }

export function JobDetail(props: {
  job: Job;
  crew: Employee[];
  allEmployees: Employee[];
  jobItems: JobItem[];
  catalog: CatalogItem[];
  costs: JobCost[];
  punches: Punch[];
  company: Company | null;
  invoices: { id: string; number: string; status: string; total: number; created_at: string }[];
  companyId: string;
  perms: Perms;
}) {
  const { toast } = useToast();

  const [job, setJob] = React.useState<Job>(props.job);
  const [crew, setCrew] = React.useState<Employee[]>(props.crew);
  const [jobItems, setJobItems] = React.useState<JobItem[]>(props.jobItems);
  const [costs, setCosts] = React.useState<JobCost[]>(props.costs);
  const [punches, setPunches] = React.useState<Punch[]>(props.punches);
  const [invoices, setInvoices] = React.useState(props.invoices);
  const [now, setNow] = React.useState(Date.now());

  // tick every second for live timers
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- crew management ----
  const availableToAdd = props.allEmployees.filter((w) => !crew.some((c) => c.id === w.id));

  async function addCrew(workerId: string) {
    const worker = props.allEmployees.find((w) => w.id === workerId);
    if (!worker) return;
    const res = await addCrewAction(job.id, workerId);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCrew((c) => [...c, worker]);
  }
  async function removeCrew(workerId: string) {
    const res = await removeCrewAction(job.id, workerId);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCrew((c) => c.filter((w) => w.id !== workerId));
  }

  // ---- punch system ----
  const openPunch = (workerId: string) => punches.find((p) => p.employee_id === workerId && !p.ended_at);

  // requirement: photo needed if job OR worker requires it
  function photoRequired(worker: Employee) {
    return job.require_punch_photo || worker.require_punch_photo;
  }

  const [punchDialog, setPunchDialog] = React.useState<{
    worker: Employee; kind: "site" | "store"; mode: "in" | "out"; punchId?: string;
  } | null>(null);
  const [punchNote, setPunchNote] = React.useState("");
  const [punchFile, setPunchFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  function startPunchFlow(worker: Employee, kind: "site" | "store") {
    setPunchNote("");
    setPunchFile(null);
    setPunchDialog({ worker, kind, mode: "in" });
  }
  function stopPunchFlow(worker: Employee, punch: Punch) {
    setPunchNote(punch.note ?? "");
    setPunchFile(null);
    setPunchDialog({ worker, kind: punch.kind as "site" | "store", mode: "out", punchId: punch.id });
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!punchFile) return null;
    const fd = new FormData();
    fd.append("file", punchFile);
    fd.append("prefix", `punch-photos/${job.id}`);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Photo upload failed", description: json.error, variant: "destructive" });
      throw new Error(json.error);
    }
    return json.url as string;
  }

  async function confirmPunch() {
    if (!punchDialog) return;
    const { worker, kind, mode, punchId } = punchDialog;

    if (mode === "in" && photoRequired(worker) && !punchFile) {
      return toast({ title: "Photo required", description: "This punch requires a photo.", variant: "destructive" });
    }
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto();
      if (mode === "in") {
        const res = await punchInAction({
          jobId: job.id, workerId: worker.id, kind, note: punchNote || null, photoUrl,
        });
        if (res.error) throw new Error(res.error);
        setPunches((p) => [res.data as Punch, ...p]);
        if (job.status === "scheduled") setJob((j) => ({ ...j, status: "active" }));
      } else {
        const res = await punchOutAction({ punchId: punchId!, note: punchNote || null, photoUrl });
        if (res.error) throw new Error(res.error);
        setPunches((p) =>
          p.map((x) => (x.id === punchId ? { ...x, ended_at: new Date().toISOString(), note: punchNote || null, ended_photo_url: photoUrl } : x))
        );
      }
      setPunchDialog(null);
    } catch {
      /* toasted above */
    } finally {
      setBusy(false);
    }
  }

  // hours worked per worker (site only, and total)
  function workerSeconds(workerId: string, kind?: "site" | "store") {
    return punches
      .filter((p) => p.employee_id === workerId && (kind ? p.kind === kind : true))
      .reduce((s, p) => {
        const end = p.ended_at ? new Date(p.ended_at).getTime() : now;
        return s + Math.max(0, end - new Date(p.started_at).getTime());
      }, 0) / 1000;
  }
  function fmtDur(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }

  // ---- items on job (draw from catalog) ----
  const [itemDialog, setItemDialog] = React.useState(false);
  const [pickItem, setPickItem] = React.useState<string>("");
  const [pickQty, setPickQty] = React.useState(1);

  async function addItem() {
    const cat = props.catalog.find((c) => c.id === pickItem);
    if (!cat) return;
    const res = await addJobItemAction({
      jobId: job.id, itemId: cat.id, name: cat.name, qty: pickQty,
      cost: cat.cost, charge: cat.charge, currentStock: cat.stock,
    });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setJobItems((it) => [...it, res.data as JobItem]);
    setItemDialog(false);
    setPickItem("");
    setPickQty(1);
    toast({ title: "Item added", description: `${pickQty} × ${cat.name} (stock reduced)` });
  }
  async function removeItem(it: JobItem) {
    const res = await removeJobItemAction(it.id);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setJobItems((arr) => arr.filter((x) => x.id !== it.id));
  }
  async function toggleItemExcluded(it: JobItem) {
    const next = !it.excluded;
    await setJobItemExcluded(it.id, next);
    setJobItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, excluded: next } : x)));
  }

  // ---- one-time costs ----
  const [costDialog, setCostDialog] = React.useState(false);
  const [costForm, setCostForm] = React.useState({ label: "", cost: 0, charge: 0 });
  async function addCost() {
    if (!costForm.label.trim()) return;
    const res = await addJobCostAction({ jobId: job.id, label: costForm.label.trim(), cost: costForm.cost, charge: costForm.charge });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCosts((c) => [...c, res.data as JobCost]);
    setCostDialog(false);
    setCostForm({ label: "", cost: 0, charge: 0 });
  }
  async function removeCost(c: JobCost) {
    await removeJobCostAction(c.id);
    setCosts((arr) => arr.filter((x) => x.id !== c.id));
  }
  async function toggleCostExcluded(c: JobCost) {
    const next = !c.excluded;
    await setJobCostExcluded(c.id, next);
    setCosts((arr) => arr.map((x) => (x.id === c.id ? { ...x, excluded: next } : x)));
  }

  // ---- billing math ----
  const [excludeStoreTime, setExcludeStoreTime] = React.useState(true);
  const rate = job.billing_rate ?? props.company?.default_rate ?? 0;
  const taxRate = props.company?.tax_rate ?? 0;

  const billing = React.useMemo(() => {
    const lines: { name: string; qty?: number; amount: number }[] = [];

    if (job.billing_mode === "itemized") {
      for (const it of jobItems) {
        if (it.excluded) continue;
        lines.push({ name: it.name, qty: it.qty, amount: it.charge * it.qty });
      }
    } else {
      // hourly: bill labor per worker
      for (const w of crew) {
        const totalSec = workerSeconds(w.id);
        const storeSec = workerSeconds(w.id, "store");
        const billSec = excludeStoreTime ? totalSec - storeSec : totalSec;
        const hours = billSec / 3600;
        if (hours > 0) lines.push({ name: `Labor — ${w.name}`, amount: hours * rate });
      }
    }

    // one-time costs apply in both modes
    for (const c of costs) {
      if (c.excluded) continue;
      lines.push({ name: c.label, amount: c.charge });
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const tax = subtotal * taxRate;
    return { lines, subtotal, tax, total: subtotal + tax };
  }, [job.billing_mode, jobItems, costs, crew, excludeStoreTime, rate, taxRate, now]);

  // ---- generate invoice ----
  const [generating, setGenerating] = React.useState(false);
  async function generateInvoice() {
    setGenerating(true);
    const res = await generateInvoiceAction({
      jobId: job.id,
      customerName: job.customer_name,
      customerEmail: job.customer_email,
      subtotal: billing.subtotal,
      tax: billing.tax,
      total: billing.total,
      lineItems: billing.lines,
    });
    setGenerating(false);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    const d = res.data as any;
    setInvoices((inv) => [{ id: d.id, number: d.number, status: "draft", total: billing.total, created_at: d.created_at }, ...inv]);
    toast({ title: "Invoice generated", description: d.number });
  }

  async function sendInvoice(invoiceId: string) {
    const res = await fetch("/api/invoices/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    const json = await res.json();
    if (!res.ok) return toast({ title: "Send failed", description: json.error, variant: "destructive" });
    setInvoices((inv) => inv.map((i) => (i.id === invoiceId ? { ...i, status: "sent" } : i)));
    toast({ title: "Invoice sent", description: "Emailed to the customer." });
  }

  async function downloadPdf(invoiceId: string, number: string) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Invoice ${number}`, 14, 20);
    doc.setFontSize(11);
    doc.text(`${props.company?.invoice_from ?? props.company?.name ?? ""}`, 14, 30);
    doc.text(`Bill to: ${job.customer_name ?? ""}`, 14, 37);
    let y = 50;
    billing.lines.forEach((l) => {
      doc.text(`${l.name}${l.qty ? ` x${l.qty}` : ""}`, 14, y);
      doc.text(fmtMoney(l.amount), 180, y, { align: "right" });
      y += 8;
    });
    y += 4;
    doc.text("Subtotal", 140, y); doc.text(fmtMoney(billing.subtotal), 180, y, { align: "right" }); y += 7;
    doc.text("Tax", 140, y); doc.text(fmtMoney(billing.tax), 180, y, { align: "right" }); y += 7;
    doc.setFontSize(13);
    doc.text("Total", 140, y); doc.text(fmtMoney(billing.total), 180, y, { align: "right" });
    doc.save(`${number}.pdf`);
  }

  const statusVariant: Record<string, "secondary" | "default" | "success"> = {
    scheduled: "secondary", active: "default", complete: "success",
  };

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <Badge variant={statusVariant[job.status] ?? "secondary"} className="capitalize">{job.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {job.place ?? "No location"} · {fmtDate(job.scheduled_date)} · {job.customer_name ?? "No customer"}
          </p>
        </div>
        {props.perms.edit && job.status !== "complete" && (
          <Button
            variant="outline"
            onClick={async () => {
              await setJobStatus(job.id, "complete");
              setJob((j) => ({ ...j, status: "complete" }));
              toast({ title: "Job marked complete" });
            }}
          >
            Mark complete
          </Button>
        )}
      </div>

      <Tabs defaultValue="time">
        <TabsList>
          <TabsTrigger value="time">Time & Crew</TabsTrigger>
          <TabsTrigger value="items">Items & Costs</TabsTrigger>
          <TabsTrigger value="billing">Billing & Invoice</TabsTrigger>
        </TabsList>

        {/* ===================== TIME & CREW ===================== */}
        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Crew & live time</CardTitle>
              {props.perms.edit && availableToAdd.length > 0 && (
                <Select onValueChange={addCrew}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Add crew member" /></SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {crew.length === 0 && <p className="text-sm text-muted-foreground">No crew assigned yet.</p>}
              {crew.map((w) => {
                const open = openPunch(w.id);
                const totalSec = workerSeconds(w.id);
                return (
                  <div key={w.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {w.name}
                        {photoRequired(w) && <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {w.role_title ?? "Crew"} · {fmtDur(totalSec)} logged
                        {open && <span className="ml-2 text-emerald-600">● {open.kind === "store" ? "on store run" : "on site"}</span>}
                      </div>
                    </div>
                    {props.perms.punches && (
                      <div className="flex gap-2">
                        {!open ? (
                          <>
                            <Button size="sm" onClick={() => startPunchFlow(w, "site")}>
                              <Play className="h-3.5 w-3.5" /> Punch in
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => startPunchFlow(w, "store")}>
                              <ShoppingCart className="h-3.5 w-3.5" /> Store run
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="destructive" onClick={() => stopPunchFlow(w, open)}>
                            <Square className="h-3.5 w-3.5" /> Clock out
                          </Button>
                        )}
                        {props.perms.edit && (
                          <Button size="sm" variant="ghost" onClick={() => removeCrew(w.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* punch history */}
          <Card>
            <CardHeader><CardTitle className="text-base">Punch history</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead><TableHead>Type</TableHead>
                    <TableHead>Start</TableHead><TableHead>End</TableHead>
                    <TableHead>Duration</TableHead><TableHead>Note</TableHead><TableHead>Photos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {punches.map((p) => {
                    const w = crew.find((c) => c.id === p.employee_id) ?? props.allEmployees.find((x) => x.id === p.employee_id);
                    const end = p.ended_at ? new Date(p.ended_at).getTime() : now;
                    const dur = (end - new Date(p.started_at).getTime()) / 1000;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{w?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{p.kind}</Badge></TableCell>
                        <TableCell className="text-xs">{new Date(p.started_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{p.ended_at ? new Date(p.ended_at).toLocaleString() : <span className="text-emerald-600">running</span>}</TableCell>
                        <TableCell className="text-xs">{fmtDur(dur)}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{p.note ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {p.started_photo_url && <a href={p.started_photo_url} target="_blank" rel="noreferrer"><Camera className="h-4 w-4 text-muted-foreground" /></a>}
                            {p.ended_photo_url && <a href={p.ended_photo_url} target="_blank" rel="noreferrer"><Camera className="h-4 w-4" /></a>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {punches.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No punches yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== ITEMS & COSTS ===================== */}
        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Items used</CardTitle>
              {props.perms.edit && (
                <Button size="sm" onClick={() => setItemDialog(true)}><Plus className="h-4 w-4" /> Add item</Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Charge ea.</TableHead>
                    <TableHead>Line total</TableHead><TableHead>On invoice</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobItems.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell>{it.qty}</TableCell>
                      <TableCell>{fmtMoney(it.charge)}</TableCell>
                      <TableCell>{fmtMoney(it.charge * it.qty)}</TableCell>
                      <TableCell>
                        <Checkbox checked={!it.excluded} onCheckedChange={() => toggleItemExcluded(it)} />
                      </TableCell>
                      <TableCell className="text-right">
                        {props.perms.edit && <Button size="sm" variant="ghost" onClick={() => removeItem(it)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {jobItems.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No items added.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">One-time costs</CardTitle>
              {props.perms.edit && (
                <Button size="sm" onClick={() => setCostDialog(true)}><Plus className="h-4 w-4" /> Add cost</Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead><TableHead>Charge</TableHead>
                    <TableHead>On invoice</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell>{fmtMoney(c.charge)}</TableCell>
                      <TableCell><Checkbox checked={!c.excluded} onCheckedChange={() => toggleCostExcluded(c)} /></TableCell>
                      <TableCell className="text-right">
                        {props.perms.edit && <Button size="sm" variant="ghost" onClick={() => removeCost(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {costs.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No one-time costs.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== BILLING & INVOICE ===================== */}
        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Billing — {job.billing_mode === "itemized" ? "Itemized" : "Per hour"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {job.billing_mode === "hourly" && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Exclude store-run time from billing</div>
                    <div className="text-xs text-muted-foreground">Rate: {fmtMoney(rate)}/hr</div>
                  </div>
                  <Switch checked={excludeStoreTime} onCheckedChange={setExcludeStoreTime} />
                </div>
              )}
              <Table>
                <TableHeader><TableRow><TableHead>Line</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {billing.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.name}{l.qty ? ` × ${l.qty}` : ""}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {billing.lines.length === 0 && <TableRow><TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">Nothing to bill yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
              <div className="ml-auto w-56 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(billing.subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmtMoney(billing.tax)}</span></div>
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{fmtMoney(billing.total)}</span></div>
              </div>
              {props.perms.invoiceCreate && (
                <div className="flex justify-end">
                  <Button onClick={generateInvoice} disabled={generating || billing.lines.length === 0}>
                    <FileText className="h-4 w-4" /> Generate invoice
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {invoices.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell>{fmtMoney(inv.total)}</TableCell>
                        <TableCell><Badge variant={inv.status === "sent" ? "success" : "secondary"} className="capitalize">{inv.status}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv.id, inv.number)}><Download className="h-3.5 w-3.5" /> PDF</Button>
                          {props.perms.invoiceSend && inv.status !== "sent" && (
                            <Button size="sm" variant="ghost" onClick={() => sendInvoice(inv.id)}><Send className="h-3.5 w-3.5" /> Send</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ---- punch dialog ---- */}
      <Dialog open={!!punchDialog} onOpenChange={(o) => !o && setPunchDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {punchDialog?.mode === "in"
                ? `${punchDialog?.kind === "store" ? "Start store run" : "Punch in"} — ${punchDialog?.worker.name}`
                : `Clock out — ${punchDialog?.worker.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Note {punchDialog?.mode === "in" ? "(optional)" : ""}</Label>
              <Input value={punchNote} onChange={(e) => setPunchNote(e.target.value)} placeholder="What's happening…" />
            </div>
            <div className="space-y-2">
              <Label>
                Photo {punchDialog && photoRequired(punchDialog.worker) && punchDialog.mode === "in" ? "(required)" : "(optional)"}
              </Label>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => setPunchFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPunchDialog(null)}>Cancel</Button>
            <Button onClick={confirmPunch} disabled={busy}>
              {punchDialog?.mode === "in" ? "Start" : "Clock out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- add item dialog ---- */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add item to job</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={pickItem} onValueChange={setPickItem}>
                <SelectTrigger><SelectValue placeholder="Choose from catalog" /></SelectTrigger>
                <SelectContent>
                  {props.catalog.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.stock} in stock)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Math.max(1, +e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={!pickItem}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- add cost dialog ---- */}
      <Dialog open={costDialog} onOpenChange={setCostDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add one-time cost</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Label</Label><Input value={costForm.label} onChange={(e) => setCostForm({ ...costForm, label: e.target.value })} placeholder="e.g. Dumpster rental" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Cost (paid)</Label><Input type="number" value={costForm.cost} onChange={(e) => setCostForm({ ...costForm, cost: +e.target.value })} /></div>
              <div className="space-y-2"><Label>Charge (customer)</Label><Input type="number" value={costForm.charge} onChange={(e) => setCostForm({ ...costForm, charge: +e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostDialog(false)}>Cancel</Button>
            <Button onClick={addCost}>Add cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
