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
import { SlideOver } from "@/components/slide-over";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Play, Square, ShoppingCart, Plus, Trash2, Camera, Pencil, FileText, Download, Send, Eye, Printer, Mail, ChevronRight } from "lucide-react";

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
interface Company { id: string; name: string; invoice_from: string | null; default_rate: number; tax_rate: number; logo_url: string | null; }
interface Perms { edit: boolean; punches: boolean; invoiceCreate: boolean; invoiceEdit: boolean; invoiceSend: boolean; isSuperadmin: boolean; }
interface LineItem { name: string; qty?: number; amount: number; }
interface FullInvoice {
  id: string; number: string; status: string; total: number; created_at: string;
  subtotal: number; tax: number; line_items: LineItem[];
  customer_name: string | null; customer_email: string | null;
  notes: string | null; due_date: string | null;
}

export function JobDetail(props: {
  job: Job;
  crew: Employee[];
  allEmployees: Employee[];
  jobItems: JobItem[];
  catalog: CatalogItem[];
  costs: JobCost[];
  punches: Punch[];
  company: Company | null;
  invoices: FullInvoice[];
  companyId: string;
  perms: Perms;
}) {
  const { toast } = useToast();

  const [job, setJob] = React.useState<Job>(props.job);
  const [crew, setCrew] = React.useState<Employee[]>(props.crew);
  const [jobItems, setJobItems] = React.useState<JobItem[]>(props.jobItems);
  const [costs, setCosts] = React.useState<JobCost[]>(props.costs);
  const [punches, setPunches] = React.useState<Punch[]>(props.punches);
  const [invoices, setInvoices] = React.useState<FullInvoice[]>(props.invoices);

  // ---- invoice preview / edit / send state ----
  const DEFAULT_INCLUDE = { logo: true, jobDetails: true, paymentInstructions: true, dueDate: true, prices: true };
  const [viewingInv, setViewingInv] = React.useState<FullInvoice | null>(null);
  const [editingInv, setEditingInv] = React.useState(false);
  const [invDraft, setInvDraft] = React.useState<FullInvoice | null>(null);
  const [savingInvEdit, setSavingInvEdit] = React.useState(false);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendTarget, setSendTarget] = React.useState<FullInvoice | null>(null);
  const [useOverride, setUseOverride] = React.useState(false);
  const [overrideEmail, setOverrideEmail] = React.useState("");
  const [includeOptions, setIncludeOptions] = React.useState({ ...DEFAULT_INCLUDE });
  const [isSending, setIsSending] = React.useState(false);
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

  // ---- invoice edit helpers ----
  function recalcInvDraft(items: LineItem[]) {
    if (!invDraft) return;
    const subtotal = items.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const taxRate = invDraft.subtotal > 0 ? invDraft.tax / invDraft.subtotal : 0;
    const tax = subtotal * taxRate;
    setInvDraft({ ...invDraft, line_items: items, subtotal, tax, total: subtotal + tax });
  }

  async function saveInvEdit() {
    if (!invDraft) return;
    setSavingInvEdit(true);
    const { updateInvoice } = await import("@/app/(app)/invoices/actions");
    const res = await updateInvoice(invDraft.id, {
      customer_name: invDraft.customer_name,
      customer_email: invDraft.customer_email,
      line_items: invDraft.line_items,
      notes: invDraft.notes,
      due_date: invDraft.due_date,
      subtotal: invDraft.subtotal,
      tax: invDraft.tax,
      total: invDraft.total,
    });
    setSavingInvEdit(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    const updated = { ...viewingInv!, ...invDraft };
    setInvoices((all) => all.map((i) => (i.id === updated.id ? updated : i)));
    setViewingInv(updated);
    setEditingInv(false);
    setInvDraft(null);
    toast({ title: "Invoice updated" });
  }

  function openSendDialog(inv: FullInvoice) {
    setSendTarget(inv);
    setUseOverride(false);
    setOverrideEmail("");
    setIncludeOptions({ ...DEFAULT_INCLUDE });
    setSendDialogOpen(true);
  }

  async function doSend() {
    if (!sendTarget) return;
    const email = useOverride ? overrideEmail : sendTarget.customer_email;
    if (!email) return toast({ title: "No email address", variant: "destructive" });
    setIsSending(true);
    const res = await fetch("/api/invoices/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: sendTarget.id,
        overrideEmail: useOverride ? overrideEmail : undefined,
        includeOptions,
      }),
    });
    const json = await res.json();
    setIsSending(false);
    if (!res.ok) return toast({ title: "Send failed", description: json.error, variant: "destructive" });
    if (!useOverride) {
      const updated = { ...sendTarget, status: "sent" };
      setInvoices((all) => all.map((i) => (i.id === sendTarget.id ? updated : i)));
      if (viewingInv?.id === sendTarget.id) setViewingInv(updated);
    }
    setSendDialogOpen(false);
    toast({ title: "Invoice sent" });
  }

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
    setInvoices((inv) => [{
      id: d.id, number: d.number, status: "draft", total: billing.total, created_at: d.created_at,
      subtotal: billing.subtotal, tax: billing.tax, line_items: billing.lines,
      customer_name: job.customer_name, customer_email: job.customer_email,
      notes: null, due_date: null,
    }, ...inv]);
    toast({ title: "Invoice generated", description: d.number });
  }

  async function downloadPdf(inv: FullInvoice) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const company = props.company;
    const pageW = 210; const pageH = 297; const margin = 20; const cw = pageW - margin * 2;
    const blue: [number,number,number] = [30,64,175]; const white: [number,number,number] = [255,255,255];
    const dark: [number,number,number] = [17,24,39]; const gray: [number,number,number] = [100,116,139];
    const lightGray: [number,number,number] = [248,250,252]; const border: [number,number,number] = [226,232,240];

    doc.setFillColor(...blue); doc.rect(0, 0, pageW, 42, "F");

    const companyDisplay = company?.invoice_from || company?.name || "";
    let logoLoaded = false;
    if (company?.logo_url) {
      try {
        const img = new Image(); img.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          img.onload = () => resolve(); img.onerror = () => resolve();
          img.src = company.logo_url!; setTimeout(resolve, 3000);
        });
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          const maxW = 55; const maxH = 18; const ratio = img.naturalWidth / img.naturalHeight;
          let w = maxH * ratio; let h = maxH;
          if (w > maxW) { w = maxW; h = maxW / ratio; }
          doc.addImage(dataUrl, "PNG", margin, (42 - h) / 2, w, h);
          logoLoaded = true;
        }
      } catch { /* fall through */ }
    }
    if (!logoLoaded) {
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
      doc.text(companyDisplay, margin, 24);
    }

    doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
    doc.text("INVOICE", pageW - margin, 19, { align: "right" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(inv.number, pageW - margin, 27, { align: "right" });

    let y = 52;
    doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text("DATE ISSUED", margin, y); doc.text("DUE DATE", margin + 55, y); doc.text("STATUS", margin + 110, y);
    y += 5;
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
    doc.text(fmtDate(inv.created_at), margin, y);
    doc.text(inv.due_date ? fmtDate(inv.due_date) : "—", margin + 55, y);
    doc.setTextColor(inv.status === "sent" ? 22 : 100, inv.status === "sent" ? 163 : 116, inv.status === "sent" ? 74 : 139);
    doc.text(inv.status.toUpperCase(), margin + 110, y);
    doc.setFont("helvetica", "normal"); y += 10;

    doc.setDrawColor(...border); doc.line(margin, y, pageW - margin, y); y += 8;

    doc.setFontSize(8); doc.setTextColor(...gray); doc.text("BILL TO", margin, y); y += 5;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
    doc.text(inv.customer_name ?? "—", margin, y); y += 5;
    if (inv.customer_email) {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
      doc.text(inv.customer_email, margin, y); y += 4;
    }
    doc.setFont("helvetica", "normal"); y += 8;

    doc.setFillColor(...lightGray); doc.rect(margin, y, cw, 8, "F");
    doc.setDrawColor(...border); doc.rect(margin, y, cw, 8, "D");
    doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text("DESCRIPTION", margin + 3, y + 5);
    doc.text("QTY", margin + 120, y + 5, { align: "right" });
    doc.text("AMOUNT", pageW - margin - 3, y + 5, { align: "right" });
    y += 9;

    (inv.line_items ?? []).forEach((l, idx) => {
      if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(margin, y, cw, 8, "F"); }
      doc.setDrawColor(...border); doc.line(margin, y + 8, pageW - margin, y + 8);
      doc.setFontSize(10); doc.setTextColor(...dark);
      const name = l.name.length > 52 ? l.name.slice(0, 49) + "..." : l.name;
      doc.text(name, margin + 3, y + 5.5);
      if (l.qty != null) { doc.setTextColor(...gray); doc.text(String(l.qty), margin + 120, y + 5.5, { align: "right" }); }
      doc.setTextColor(...dark); doc.text(fmtMoney(l.amount), pageW - margin - 3, y + 5.5, { align: "right" });
      y += 9;
    });
    y += 6;

    doc.setFontSize(10); doc.setTextColor(...gray);
    doc.text("Subtotal", pageW - margin - 45, y); doc.setTextColor(...dark);
    doc.text(fmtMoney(inv.subtotal), pageW - margin, y, { align: "right" }); y += 7;
    doc.setTextColor(...gray); doc.text("Tax", pageW - margin - 45, y); doc.setTextColor(...dark);
    doc.text(fmtMoney(inv.tax), pageW - margin, y, { align: "right" }); y += 5;

    doc.setFillColor(...blue); doc.rect(pageW - margin - 60, y, 60, 11, "F");
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
    doc.text("TOTAL", pageW - margin - 57, y + 7.5);
    doc.text(fmtMoney(inv.total), pageW - margin - 3, y + 7.5, { align: "right" });
    doc.setFont("helvetica", "normal"); y += 17;

    if (inv.notes) {
      doc.setFontSize(8); doc.setTextColor(...gray); doc.text("NOTES", margin, y); y += 5;
      doc.setFontSize(9.5); doc.setTextColor(55, 65, 81);
      const noteLines = doc.splitTextToSize(inv.notes, cw);
      doc.text(noteLines, margin, y); y += noteLines.length * 5 + 4;
    }

    doc.setFillColor(...lightGray); doc.rect(0, pageH - 14, pageW, 14, "F");
    doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text("Thank you for your business.", pageW / 2, pageH - 5, { align: "center" });

    doc.save(`${inv.number}.pdf`);
  }

  function printInvoice(inv: FullInvoice) {
    const company = props.company;
    const companyDisplay = company?.invoice_from || company?.name || "";
    const logoHtml = company?.logo_url
      ? `<img src="${company.logo_url}" style="max-height:44px;max-width:160px;object-fit:contain" />`
      : `<span style="font-size:18px;font-weight:700;color:#ffffff">${companyDisplay}</span>`;
    const itemRows = (inv.line_items ?? []).map((l, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td>${l.name}${l.qty ? ` &times; ${l.qty}` : ""}</td>
        <td class="num">${l.qty ?? ""}</td>
        <td class="num">${fmtMoney(l.amount)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${inv.number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827}
.header{background:#1e40af;color:#fff;padding:22px 32px;display:flex;justify-content:space-between;align-items:center}
.inv-label{font-size:22px;font-weight:700;letter-spacing:3px}.inv-num{font-size:12px;color:#bfdbfe;margin-top:2px;text-align:right}
.meta{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:14px 32px;display:flex;gap:36px}
.meta-item label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px}
.meta-item span{font-size:13px;font-weight:600}.body{padding:24px 32px}
.bill-to{margin-bottom:20px}.bill-to .sect{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;display:block;margin-bottom:4px}
.bill-to .name{font-size:15px;font-weight:700}.bill-to .email{font-size:12px;color:#64748b}
table.items{width:100%;border-collapse:collapse}
table.items th{background:#f1f5f9;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left}
table.items td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}.num{text-align:right}
.totals{margin-top:16px;float:right;min-width:220px}
.totals .row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#64748b}
.totals .total{background:#1e40af;color:#fff;font-weight:700;font-size:15px;padding:10px 14px;border-radius:6px;display:flex;justify-content:space-between;margin-top:8px}
.notes{margin-top:24px;clear:both;padding:14px;border-left:4px solid #1e40af;background:#f8fafc;border-radius:4px}
.notes .sect{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px}
.notes p{font-size:13px;color:#374151}
.footer{margin-top:36px;text-align:center;font-size:11px;color:#94a3b8;padding:14px;border-top:1px solid #e2e8f0}
@media print{@page{margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
<body>
<div class="header"><div>${logoHtml}</div><div><div class="inv-label">INVOICE</div><div class="inv-num">${inv.number}</div></div></div>
<div class="meta">
  <div class="meta-item"><label>Issued</label><span>${fmtDate(inv.created_at)}</span></div>
  ${inv.due_date ? `<div class="meta-item"><label>Due</label><span>${fmtDate(inv.due_date)}</span></div>` : ""}
  <div class="meta-item"><label>Status</label><span>${inv.status.toUpperCase()}</span></div>
</div>
<div class="body">
  <div class="bill-to">
    <span class="sect">Bill To</span>
    <div class="name">${inv.customer_name ?? "—"}</div>
    ${inv.customer_email ? `<div class="email">${inv.customer_email}</div>` : ""}
  </div>
  <table class="items">
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal)}</span></div>
    <div class="row"><span>Tax</span><span>${fmtMoney(inv.tax)}</span></div>
    <div class="total"><span>TOTAL</span><span>${fmtMoney(inv.total)}</span></div>
  </div>
  ${inv.notes ? `<div class="notes"><div class="sect">Notes</div><p>${inv.notes}</p></div>` : ""}
</div>
<div class="footer">Thank you for your business. &nbsp;&middot;&nbsp; ${companyDisplay}</div>
</body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
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
          {/* Current billing summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Billing — {job.billing_mode === "itemized" ? "Itemized" : "Per hour"}
              </CardTitle>
            </CardHeader>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.name}{l.qty ? ` × ${l.qty}` : ""}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {billing.lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                        Nothing to bill yet.
                      </TableCell>
                    </TableRow>
                  )}
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

          {/* Invoices list */}
          {invoices.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => { setViewingInv(inv); setEditingInv(false); setInvDraft(null); }}
                      >
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell>{fmtMoney(inv.total)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "sent" ? "success" : "secondary"} className="capitalize">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

      {/* ══════════ INVOICE VIEW / EDIT SLIDE-OVER ══════════ */}
      {(() => {
        const inv = editingInv && invDraft ? invDraft : viewingInv;
        return (
          <SlideOver
            open={!!viewingInv}
            onClose={() => { setViewingInv(null); setEditingInv(false); setInvDraft(null); }}
            width="lg"
            title={
              inv ? (
                <span className="flex items-center gap-2">
                  {inv.number}
                  <Badge variant={inv.status === "sent" ? "success" : "secondary"} className="capitalize text-xs font-normal">
                    {inv.status}
                  </Badge>
                </span>
              ) : undefined
            }
            footer={
              editingInv ? (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setEditingInv(false); setInvDraft(null); }}>Cancel</Button>
                  <Button onClick={saveInvEdit} disabled={savingInvEdit}>
                    {savingInvEdit ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {props.perms.invoiceEdit && (
                    <Button variant="outline" onClick={() => {
                      setInvDraft({ ...viewingInv!, line_items: viewingInv!.line_items?.map(l => ({ ...l })) ?? [] });
                      setEditingInv(true);
                    }}>
                      <Pencil className="h-4 w-4 mr-1.5" /> Edit
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => viewingInv && downloadPdf(viewingInv)}>
                    <Download className="h-4 w-4 mr-1.5" /> Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => viewingInv && printInvoice(viewingInv)}>
                    <Printer className="h-4 w-4 mr-1.5" /> Print
                  </Button>
                  {props.perms.invoiceSend && (
                    <Button onClick={() => { const i = viewingInv!; setViewingInv(null); openSendDialog(i); }}>
                      <Send className="h-4 w-4 mr-1.5" /> Send Invoice
                    </Button>
                  )}
                </div>
              )
            }
          >
            {inv && (
              <div className="space-y-6">
                {/* Letterhead */}
                <div className="flex items-start justify-between rounded-lg border bg-muted/30 p-4">
                  <div>
                    {props.company?.logo_url && (
                      <img src={props.company.logo_url} alt="logo" className="max-h-10 max-w-[160px] object-contain mb-2" />
                    )}
                    <p className="font-semibold text-sm">{props.company?.invoice_from || props.company?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice</p>
                    <p className="font-bold text-xl">{inv.number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Issued {fmtDate(inv.created_at)}</p>
                  </div>
                </div>

                {/* Bill To + Dates */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bill To</p>
                    {editingInv ? (
                      <div className="space-y-2 pt-1">
                        <Input
                          value={invDraft?.customer_name ?? ""}
                          onChange={(e) => setInvDraft(d => d ? { ...d, customer_name: e.target.value } : d)}
                          placeholder="Customer name"
                        />
                        <Input
                          type="email"
                          value={invDraft?.customer_email ?? ""}
                          onChange={(e) => setInvDraft(d => d ? { ...d, customer_email: e.target.value } : d)}
                          placeholder="Email address"
                        />
                      </div>
                    ) : (
                      <div className="pt-1">
                        <p className="font-semibold">{inv.customer_name || "—"}</p>
                        {inv.customer_email && <p className="text-sm text-muted-foreground">{inv.customer_email}</p>}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Issued</p>
                      <p className="text-sm pt-1">{fmtDate(inv.created_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due Date</p>
                      {editingInv ? (
                        <Input
                          type="date"
                          value={invDraft?.due_date ?? ""}
                          onChange={(e) => setInvDraft(d => d ? { ...d, due_date: e.target.value || null } : d)}
                          className="h-8 text-sm mt-1"
                        />
                      ) : (
                        <p className="text-sm pt-1">{inv.due_date ? fmtDate(inv.due_date) : "Not set"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Line items */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Line Items</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right w-16">Qty</TableHead>
                        <TableHead className="text-right w-28">Amount</TableHead>
                        {editingInv && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(editingInv ? invDraft?.line_items : inv.line_items ?? [])?.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {editingInv ? (
                              <Input
                                value={l.name}
                                onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], name: e.target.value }; recalcInvDraft(items); }}
                                className="h-8"
                                placeholder="Description"
                              />
                            ) : l.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingInv ? (
                              <Input
                                type="number"
                                value={l.qty ?? ""}
                                onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], qty: e.target.value ? Number(e.target.value) : undefined }; recalcInvDraft(items); }}
                                className="h-8 w-16 text-right"
                              />
                            ) : (l.qty ?? "—")}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingInv ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={l.amount}
                                onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], amount: Number(e.target.value) }; recalcInvDraft(items); }}
                                className="h-8 w-24 text-right"
                              />
                            ) : fmtMoney(l.amount)}
                          </TableCell>
                          {editingInv && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => recalcInvDraft((invDraft?.line_items ?? []).filter((_, idx) => idx !== i))}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {editingInv && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => recalcInvDraft([...(invDraft?.line_items ?? []), { name: "", amount: 0 }])}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add line item
                    </Button>
                  )}
                </div>

                {/* Totals */}
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span>{fmtMoney(inv.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span><span>{fmtMoney(inv.tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span>{fmtMoney(inv.total)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
                  {editingInv ? (
                    <Textarea
                      value={invDraft?.notes ?? ""}
                      onChange={(e) => setInvDraft(d => d ? { ...d, notes: e.target.value } : d)}
                      placeholder="Payment instructions, thank you note, etc."
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {inv.notes || "No notes"}
                    </p>
                  )}
                </div>
              </div>
            )}
          </SlideOver>
        );
      })()}

      {/* ══════════ INVOICE SEND SLIDE-OVER ══════════ */}
      <SlideOver
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        width="sm"
        title={`Send ${sendTarget?.number ?? "Invoice"}`}
        description="Choose who to send to and what to include."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={doSend} disabled={isSending}>
              <Mail className="h-4 w-4 mr-1.5" />
              {isSending ? "Sending…" : "Send Invoice"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Recipient */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Send to</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="invSendTarget"
                  checked={!useOverride}
                  onChange={() => setUseOverride(false)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Customer on file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sendTarget?.customer_email ?? "No email on file"}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="invSendTarget"
                  checked={useOverride}
                  onChange={() => setUseOverride(true)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Different email address</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Won&apos;t update the invoice</p>
                </div>
              </label>
            </div>
            {useOverride && (
              <Input
                type="email"
                placeholder="Enter email address"
                value={overrideEmail}
                onChange={(e) => setOverrideEmail(e.target.value)}
                autoFocus
              />
            )}
          </div>

          <Separator />

          {/* Include options */}
          <div className="space-y-3">
            <p className="text-sm font-medium">What to include</p>
            {([
              { key: "logo" as const, label: "Company logo & branding", desc: "Shows your logo at the top" },
              { key: "jobDetails" as const, label: "Job details", desc: "Job name and location" },
              { key: "dueDate" as const, label: "Due date", desc: "Payment due date" },
              { key: "prices" as const, label: "Prices & totals", desc: "Line amounts, subtotal, tax, total" },
              { key: "paymentInstructions" as const, label: "Notes", desc: "Payment instructions or message" },
            ]).map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                <Checkbox
                  checked={includeOptions[key]}
                  onCheckedChange={(v) => setIncludeOptions(o => ({ ...o, [key]: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </SlideOver>

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
