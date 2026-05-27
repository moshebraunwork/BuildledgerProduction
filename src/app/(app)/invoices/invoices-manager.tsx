"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Download, Send, Eye } from "lucide-react";

interface LineItem { name: string; qty?: number; amount: number; }
interface Invoice {
  id: string; number: string; customer_name: string | null; customer_email: string | null;
  subtotal: number; tax: number; total: number; line_items: LineItem[];
  status: string; sent_at: string | null; created_at: string;
}
interface Company { id: string; name: string; invoice_from: string | null; }

export function InvoicesManager({
  initialInvoices,
  company,
  canSend,
}: {
  initialInvoices: Invoice[];
  company: Company | null;
  canSend: boolean;
}) {
  const { toast } = useToast();
  const [invoices, setInvoices] = React.useState<Invoice[]>(initialInvoices);
  const [viewing, setViewing] = React.useState<Invoice | null>(null);
  const [sending, setSending] = React.useState<string | null>(null);

  async function sendInvoice(inv: Invoice) {
    if (!inv.customer_email) return toast({ title: "No customer email", variant: "destructive" });
    setSending(inv.id);
    const res = await fetch("/api/invoices/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: inv.id }),
    });
    const json = await res.json();
    setSending(null);
    if (!res.ok) return toast({ title: "Send failed", description: json.error, variant: "destructive" });
    setInvoices((all) => all.map((i) => (i.id === inv.id ? { ...i, status: "sent" } : i)));
    toast({ title: "Invoice sent" });
  }

  async function downloadPdf(inv: Invoice) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Invoice ${inv.number}`, 14, 20);
    doc.setFontSize(11);
    doc.text(company?.invoice_from ?? company?.name ?? "", 14, 30);
    doc.text(`Bill to: ${inv.customer_name ?? ""}`, 14, 37);
    let y = 50;
    (inv.line_items ?? []).forEach((l) => {
      doc.text(`${l.name}${l.qty ? ` x${l.qty}` : ""}`, 14, y);
      doc.text(fmtMoney(l.amount), 180, y, { align: "right" });
      y += 8;
    });
    y += 4;
    doc.text("Subtotal", 140, y); doc.text(fmtMoney(inv.subtotal), 180, y, { align: "right" }); y += 7;
    doc.text("Tax", 140, y); doc.text(fmtMoney(inv.tax), 180, y, { align: "right" }); y += 7;
    doc.setFontSize(13);
    doc.text("Total", 140, y); doc.text(fmtMoney(inv.total), 180, y, { align: "right" });
    doc.save(`${inv.number}.pdf`);
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell className="text-sm">{inv.customer_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(inv.created_at)}</TableCell>
                  <TableCell>{fmtMoney(inv.total)}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "sent" ? "success" : "secondary"} className="capitalize">{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(inv)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv)}><Download className="h-3.5 w-3.5" /></Button>
                    {canSend && inv.status !== "sent" && (
                      <Button size="sm" variant="ghost" disabled={sending === inv.id} onClick={() => sendInvoice(inv)}>
                        <Send className="h-3.5 w-3.5" /> Send
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No invoices yet. Generate one from a job&apos;s billing tab.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice {viewing?.number}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Billed to {viewing.customer_name ?? "—"}{viewing.customer_email ? ` · ${viewing.customer_email}` : ""}
              </div>
              <Table>
                <TableBody>
                  {(viewing.line_items ?? []).map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.name}{l.qty ? ` × ${l.qty}` : ""}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="ml-auto w-56 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(viewing.subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmtMoney(viewing.tax)}</span></div>
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{fmtMoney(viewing.total)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
