"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlideOver } from "@/components/slide-over";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Download, Send, Printer, Plus, Trash2, Mail, X, Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Pencil, Eye } from "lucide-react";
import { updateInvoice, deleteInvoice, markInvoicePaid, markInvoiceUnpaid } from "./actions";

interface LineItem { name: string; qty?: number; amount: number; }
interface Invoice {
  id: string;
  number: string;
  customer_name: string | null;
  customer_email: string | null;
  subtotal: number;
  tax: number;
  total: number;
  line_items: LineItem[];
  notes: string | null;
  due_date: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  job_id: string | null;
}
interface Company {
  id: string;
  name: string;
  invoice_from: string | null;
  logo_url: string | null;
}

type SortKey = "number" | "customer_name" | "created_at" | "due_date" | "total" | "status";
type SortDir = "asc" | "desc";

const DEFAULT_INCLUDE = {
  logo: true,
  jobDetails: true,
  paymentInstructions: true,
  dueDate: true,
  prices: true,
};

export function InvoicesManager({
  initialInvoices,
  company,
  canSend,
  canEdit,
  canDelete,
}: {
  initialInvoices: Invoice[];
  company: Company | null;
  canSend: boolean;
  canEdit: boolean;
  canDelete?: boolean;
}) {
  const { toast } = useToast();
  const [invoices, setInvoices] = React.useState<Invoice[]>(initialInvoices);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [viewing, setViewing] = React.useState<Invoice | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Invoice | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);

  const [sendSlideOpen, setSendSlideOpen] = React.useState(false);
  const [sendTarget, setSendTarget] = React.useState<Invoice | null>(null);
  const [useOverride, setUseOverride] = React.useState(false);
  const [overrideEmail, setOverrideEmail] = React.useState("");
  const [includeOptions, setIncludeOptions] = React.useState({ ...DEFAULT_INCLUDE });
  const [isSending, setIsSending] = React.useState(false);

  const [ctx, setCtx] = React.useState<ContextMenuState | null>(null);
  const [toDelete, setToDelete] = React.useState<Invoice | null>(null);

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
    const list = invoices.filter((i) => {
      const matchQ = `${i.number} ${i.customer_name ?? ""} ${i.customer_email ?? ""}`.toLowerCase().includes(q2);
      const matchStatus = statusFilter === "all" || i.status === statusFilter;
      return matchQ && matchStatus;
    });
    list.sort((a, b) => {
      let av: string | number = (a as any)[sortKey] ?? "";
      let bv: string | number = (b as any)[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [invoices, q, statusFilter, sortKey, sortDir]);

  function openViewing(inv: Invoice) {
    setViewing(inv);
    setEditing(false);
    setDraft(null);
  }

  function startEdit() {
    if (!viewing) return;
    setDraft({ ...viewing, line_items: viewing.line_items?.map((l) => ({ ...l })) ?? [] });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }

  function recalcDraft(items: LineItem[]) {
    if (!draft) return;
    const subtotal = items.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const taxRate = draft.subtotal > 0 ? draft.tax / draft.subtotal : 0;
    const tax = subtotal * taxRate;
    setDraft({ ...draft, line_items: items, subtotal, tax, total: subtotal + tax });
  }

  async function saveEdit() {
    if (!draft) return;
    setSavingEdit(true);
    const res = await updateInvoice(draft.id, {
      customer_name: draft.customer_name,
      customer_email: draft.customer_email,
      line_items: draft.line_items,
      notes: draft.notes,
      due_date: draft.due_date,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
    });
    setSavingEdit(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    const updated = { ...viewing!, ...draft };
    setInvoices((all) => all.map((i) => (i.id === updated.id ? updated : i)));
    setViewing(updated);
    setEditing(false);
    setDraft(null);
    toast({ title: "Invoice updated" });
  }

  function openSendDialog(inv: Invoice) {
    setSendTarget(inv);
    setUseOverride(false);
    setOverrideEmail("");
    setIncludeOptions({ ...DEFAULT_INCLUDE });
    setSendSlideOpen(true);
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
      if (viewing?.id === sendTarget.id) setViewing(updated);
    }
    setSendSlideOpen(false);
    toast({ title: "Invoice sent" });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await deleteInvoice(toDelete.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setInvoices((all) => all.filter((i) => i.id !== toDelete.id));
    if (viewing?.id === toDelete.id) setViewing(null);
    toast({ title: "Invoice deleted" });
  }

  function rowMenu(e: React.MouseEvent, inv: Invoice) {
    e.preventDefault();
    const actions: ContextMenuState["actions"] = [
      { label: "View", icon: "view", onClick: () => openViewing(inv) },
    ];
    if (canEdit && inv.status === "draft") {
      actions.push({ label: "Edit", icon: "edit", onClick: () => { openViewing(inv); setTimeout(startEdit, 50); } });
    }
    actions.push({ label: "Download PDF", icon: "download", onClick: () => downloadPdf(inv) });
    actions.push({ label: "Print", icon: "print", onClick: () => printInvoice(inv) });
    if (canSend) {
      actions.push({ label: "Send invoice", icon: "send", onClick: () => openSendDialog(inv) });
    }
    if (canEdit && inv.status === "sent") {
      actions.push({ label: "Mark paid", icon: "check", onClick: () => setInvoicePaid(inv, true) });
    }
    if (canEdit && inv.status === "paid") {
      actions.push({ label: "Mark unpaid", icon: "check", onClick: () => setInvoicePaid(inv, false) });
    }
    if (canDelete && inv.status === "draft") {
      actions.push({ label: "Delete", icon: "delete", onClick: () => setToDelete(inv), destructive: true });
    }
    setCtx({ x: e.clientX, y: e.clientY, actions });
  }

  async function setInvoicePaid(inv: Invoice, paid: boolean) {
    const res = paid ? await markInvoicePaid(inv.id) : await markInvoiceUnpaid(inv.id);
    if (res?.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    const next = paid ? "paid" : "sent";
    setInvoices((all) => all.map((i) => (i.id === inv.id ? { ...i, status: next } : i)));
    toast({ title: paid ? "Invoice marked paid" : "Invoice marked unpaid" });
  }

  async function downloadPdf(inv: Invoice) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 20;
    const cw = pageW - margin * 2;

    const blue: [number, number, number] = [30, 64, 175];
    const white: [number, number, number] = [255, 255, 255];
    const dark: [number, number, number] = [17, 24, 39];
    const gray: [number, number, number] = [100, 116, 139];
    const lightGray: [number, number, number] = [248, 250, 252];
    const border: [number, number, number] = [226, 232, 240];

    doc.setFillColor(...blue);
    doc.rect(0, 0, pageW, 42, "F");

    const companyDisplay = company?.invoice_from || company?.name || "";
    let logoLoaded = false;
    if (company?.logo_url) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = company.logo_url!;
          setTimeout(resolve, 3000);
        });
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          const maxW = 55; const maxH = 18;
          const ratio = img.naturalWidth / img.naturalHeight;
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
    if (inv.status === "sent") doc.setTextColor(22, 163, 74); else doc.setTextColor(...gray);
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
    doc.text("AMOUNT", pageW - margin - 3, y + 5, { align: "right" }); y += 9;

    const items = inv.line_items ?? [];
    items.forEach((l, idx) => {
      if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(margin, y, cw, 8, "F"); }
      doc.setDrawColor(...border); doc.line(margin, y + 8, pageW - margin, y + 8);
      doc.setFontSize(10); doc.setTextColor(...dark);
      const name = l.name.length > 52 ? l.name.slice(0, 49) + "..." : l.name;
      doc.text(name, margin + 3, y + 5.5);
      if (l.qty != null) { doc.setTextColor(...gray); doc.text(String(l.qty), margin + 120, y + 5.5, { align: "right" }); }
      doc.setTextColor(...dark); doc.text(fmtMoney(l.amount), pageW - margin - 3, y + 5.5, { align: "right" }); y += 9;
    });
    y += 6;

    doc.setFontSize(10); doc.setTextColor(...gray);
    doc.text("Subtotal", pageW - margin - 45, y); doc.setTextColor(...dark); doc.text(fmtMoney(inv.subtotal), pageW - margin, y, { align: "right" }); y += 7;
    doc.setTextColor(...gray); doc.text("Tax", pageW - margin - 45, y); doc.setTextColor(...dark); doc.text(fmtMoney(inv.tax), pageW - margin, y, { align: "right" }); y += 5;
    doc.setFillColor(...blue); doc.rect(pageW - margin - 60, y, 60, 11, "F");
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
    doc.text("TOTAL", pageW - margin - 57, y + 7.5); doc.text(fmtMoney(inv.total), pageW - margin - 3, y + 7.5, { align: "right" });
    doc.setFont("helvetica", "normal"); y += 17;

    if (inv.notes) {
      doc.setFontSize(8); doc.setTextColor(...gray); doc.text("NOTES", margin, y); y += 5;
      doc.setFontSize(9.5); doc.setTextColor(55, 65, 81);
      const noteLines = doc.splitTextToSize(inv.notes, cw); doc.text(noteLines, margin, y); y += noteLines.length * 5 + 4;
    }

    doc.setFillColor(...lightGray); doc.rect(0, pageH - 14, pageW, 14, "F");
    doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text("Thank you for your business.", pageW / 2, pageH - 5, { align: "center" });
    doc.save(`${inv.number}.pdf`);
  }

  function printInvoice(inv: Invoice) {
    const companyDisplay = company?.invoice_from || company?.name || "";
    const logoHtml = company?.logo_url
      ? `<img src="${company.logo_url}" style="max-height:44px;max-width:160px;object-fit:contain" />`
      : `<span style="font-size:18px;font-weight:700;color:#ffffff">${companyDisplay}</span>`;

    const itemRows = (inv.line_items ?? [])
      .map((l, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td>${l.name}${l.qty ? ` &times; ${l.qty}` : ""}</td>
        <td class="num">${l.qty ?? ""}</td>
        <td class="num">${fmtMoney(l.amount)}</td></tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Invoice ${inv.number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827}
.header{background:#1e40af;color:#fff;padding:22px 32px;display:flex;justify-content:space-between;align-items:center}
.inv-label{font-size:22px;font-weight:700;letter-spacing:3px}.inv-num{font-size:12px;color:#bfdbfe;margin-top:2px;text-align:right}
.meta{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:14px 32px;display:flex;gap:36px}
.meta-item label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px}
.meta-item span{font-size:13px;font-weight:600}.body{padding:24px 32px}.bill-to{margin-bottom:20px}
.bill-to .sect{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;display:block;margin-bottom:4px}
.bill-to .name{font-size:15px;font-weight:700}.bill-to .email{font-size:12px;color:#64748b}
table.items{width:100%;border-collapse:collapse}
table.items th{background:#f1f5f9;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left}
table.items td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}.num{text-align:right}
.totals{margin-top:16px;float:right;min-width:220px}
.totals .row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#64748b}
.totals .total{background:#1e40af;color:#fff;font-weight:700;font-size:15px;padding:10px 14px;border-radius:6px;display:flex;justify-content:space-between;margin-top:8px}
.notes{margin-top:24px;clear:both;padding:14px;border-left:4px solid #1e40af;background:#f8fafc;border-radius:4px}
.notes .sect{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px}
.notes p{font-size:13px;color:#374151}.footer{margin-top:36px;text-align:center;font-size:11px;color:#94a3b8;padding:14px;border-top:1px solid #e2e8f0}
@media print{@page{margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
<body><div class="header"><div>${logoHtml}</div><div><div class="inv-label">INVOICE</div><div class="inv-num">${inv.number}</div></div></div>
<div class="meta"><div class="meta-item"><label>Issued</label><span>${fmtDate(inv.created_at)}</span></div>
${inv.due_date ? `<div class="meta-item"><label>Due</label><span>${fmtDate(inv.due_date)}</span></div>` : ""}
<div class="meta-item"><label>Status</label><span>${inv.status.toUpperCase()}</span></div></div>
<div class="body"><div class="bill-to"><span class="sect">Bill To</span><div class="name">${inv.customer_name ?? "—"}</div>
${inv.customer_email ? `<div class="email">${inv.customer_email}</div>` : ""}</div>
<table class="items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
<tbody>${itemRows}</tbody></table>
<div class="totals"><div class="row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal)}</span></div>
<div class="row"><span>Tax</span><span>${fmtMoney(inv.tax)}</span></div>
<div class="total"><span>TOTAL</span><span>${fmtMoney(inv.total)}</span></div></div>
${inv.notes ? `<div class="notes"><div class="sect">Notes</div><p>${inv.notes}</p></div>` : ""}
</div><div class="footer">Thank you for your business. &nbsp;&middot;&nbsp; ${companyDisplay}</div></body></html>`;

    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  }

  const current = editing && draft ? draft : viewing;
  const thClass = "cursor-pointer select-none hover:text-foreground whitespace-nowrap";

  return (
    <>
      {/* Search + filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={thClass} onClick={() => toggleSort("number")}>
                    Number <SortIcon col="number" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("customer_name")}>
                    Customer <SortIcon col="customer_name" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("created_at")}>
                    Created <SortIcon col="created_at" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("due_date")}>
                    Due <SortIcon col="due_date" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("total")}>
                    Total <SortIcon col="total" />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort("status")}>
                    Status <SortIcon col="status" />
                  </TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => openViewing(inv)}
                    onContextMenu={(e) => rowMenu(e, inv)}
                  >
                    <TableCell className="font-medium">{inv.number}</TableCell>
                    <TableCell className="text-sm">{inv.customer_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(inv.created_at)}</TableCell>
                    <TableCell className="text-sm">{inv.due_date ? fmtDate(inv.due_date) : "—"}</TableCell>
                    <TableCell>{fmtMoney(inv.total)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "success" : inv.status === "sent" ? "default" : "secondary"} className="capitalize">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-accent"
                        onClick={(e) => { e.stopPropagation(); rowMenu(e, inv); }}
                        aria-label="More options"
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No invoices yet. Generate one from a job&apos;s billing tab.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RowContextMenu state={ctx} onClose={() => setCtx(null)} />
      <DeleteConfirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        itemLabel={`invoice ${toDelete?.number}`}
      />

      {/* ── Invoice detail slide-over ── */}
      <SlideOver
        open={!!viewing}
        onClose={() => { setViewing(null); setEditing(false); setDraft(null); }}
        title={current ? current.number : "Invoice"}
        width="lg"
        footer={
          current ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadPdf(viewing!)}>
                  <Download className="h-4 w-4 mr-1.5" /> Download
                </Button>
                <Button variant="outline" size="sm" onClick={() => printInvoice(viewing!)}>
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={saveEdit} disabled={savingEdit}>
                      {savingEdit ? "Saving…" : "Save changes"}
                    </Button>
                  </>
                ) : (
                  <>
                    {canEdit && current.status === "draft" && (
                      <Button variant="outline" size="sm" onClick={startEdit}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                    )}
                    {canSend && (
                      <Button size="sm" onClick={() => { const inv = viewing!; setViewing(null); openSendDialog(inv); }}>
                        <Send className="h-4 w-4 mr-1.5" /> Send Invoice
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {current && (
          <div className="space-y-6">
            {/* Letterhead */}
            <div className="flex justify-between items-start gap-4 rounded-lg border bg-muted/30 p-4">
              <div>
                {company?.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo_url} alt="logo" className="max-h-10 max-w-[160px] object-contain mb-2" />
                )}
                <p className="font-semibold text-sm">{company?.invoice_from || company?.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice</p>
                <p className="font-bold text-xl">{current.number}</p>
                <Badge variant={current.status === "sent" ? "success" : "secondary"} className="capitalize mt-1">
                  {current.status}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Issued {fmtDate(current.created_at)}</p>
              </div>
            </div>

            {/* Bill To + Dates */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bill To</p>
                {editing ? (
                  <div className="space-y-2">
                    <Input value={draft?.customer_name ?? ""} onChange={(e) => setDraft((d) => d ? { ...d, customer_name: e.target.value } : d)} placeholder="Customer name" />
                    <Input type="email" value={draft?.customer_email ?? ""} onChange={(e) => setDraft((d) => d ? { ...d, customer_email: e.target.value } : d)} placeholder="Customer email" />
                  </div>
                ) : (
                  <>
                    <p className="font-semibold">{current.customer_name || "—"}</p>
                    {current.customer_email && <p className="text-sm text-muted-foreground">{current.customer_email}</p>}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Issue Date</p>
                  <p className="text-sm">{fmtDate(current.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Due Date</p>
                  {editing ? (
                    <Input type="date" value={draft?.due_date ?? ""} onChange={(e) => setDraft((d) => d ? { ...d, due_date: e.target.value || null } : d)} className="h-8 text-sm" />
                  ) : (
                    <p className="text-sm">{current.due_date ? fmtDate(current.due_date) : "—"}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Line items */}
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-16">Qty</TableHead>
                    <TableHead className="text-right w-28">Amount</TableHead>
                    {editing && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(editing ? draft?.line_items : current.line_items ?? [])?.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {editing ? (
                          <Input value={l.name} onChange={(e) => { const it = [...(draft?.line_items ?? [])]; it[i] = { ...it[i], name: e.target.value }; recalcDraft(it); }} className="h-7" />
                        ) : l.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {editing ? (
                          <Input type="number" value={l.qty ?? ""} onChange={(e) => { const it = [...(draft?.line_items ?? [])]; it[i] = { ...it[i], qty: e.target.value ? Number(e.target.value) : undefined }; recalcDraft(it); }} className="h-7 w-16 text-right" />
                        ) : (l.qty ?? "—")}
                      </TableCell>
                      <TableCell className="text-right">
                        {editing ? (
                          <Input type="number" step="0.01" value={l.amount} onChange={(e) => { const it = [...(draft?.line_items ?? [])]; it[i] = { ...it[i], amount: Number(e.target.value) }; recalcDraft(it); }} className="h-7 w-24 text-right" />
                        ) : fmtMoney(l.amount)}
                      </TableCell>
                      {editing && (
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => recalcDraft((draft?.line_items ?? []).filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {editing && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => recalcDraft([...(draft?.line_items ?? []), { name: "", amount: 0 }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                </Button>
              )}
            </div>

            {/* Totals */}
            <div className="ml-auto w-60 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(current.subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmtMoney(current.tax)}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmtMoney(current.total)}</span></div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Notes</p>
              {editing ? (
                <Textarea value={draft?.notes ?? ""} onChange={(e) => setDraft((d) => d ? { ...d, notes: e.target.value } : d)} placeholder="Payment instructions, thank you note, etc." rows={3} />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{current.notes || "—"}</p>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* ── Send slide-over ── */}
      <SlideOver
        open={sendSlideOpen}
        onClose={() => setSendSlideOpen(false)}
        title={`Send ${sendTarget?.number ?? "Invoice"}`}
        layer="nested"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendSlideOpen(false)}>Cancel</Button>
            <Button onClick={doSend} disabled={isSending}>
              <Mail className="h-4 w-4 mr-1.5" />
              {isSending ? "Sending…" : "Send Invoice"}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <Label className="font-medium">Send to</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="sendTarget" checked={!useOverride} onChange={() => setUseOverride(false)} className="accent-primary" />
                Customer email
                {sendTarget?.customer_email && <span className="text-muted-foreground">({sendTarget.customer_email})</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="sendTarget" checked={useOverride} onChange={() => setUseOverride(true)} className="accent-primary" />
                Different email
              </label>
            </div>
            {useOverride && (
              <Input type="email" placeholder="Enter email address" value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} autoFocus />
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="font-medium">Include in email</Label>
            {(
              [
                { key: "logo" as const, label: "Company logo & branding" },
                { key: "jobDetails" as const, label: "Job details (name & location)" },
                { key: "dueDate" as const, label: "Due date" },
                { key: "prices" as const, label: "Prices & totals" },
                { key: "paymentInstructions" as const, label: "Notes / payment instructions" },
              ] as const
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={includeOptions[key]} onCheckedChange={(v) => setIncludeOptions((o) => ({ ...o, [key]: !!v }))} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </SlideOver>
    </>
  );
}
