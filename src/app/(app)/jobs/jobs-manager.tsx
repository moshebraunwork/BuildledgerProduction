"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Plus } from "lucide-react";

interface Job {
  id: string;
  title: string;
  place: string | null;
  scheduled_date: string | null;
  customer_name: string | null;
  status: string;
  estimate: number;
  billing_mode: string;
}

const statusVariant: Record<string, "secondary" | "default" | "success"> = {
  scheduled: "secondary",
  active: "default",
  complete: "success",
};

export function JobsManager({
  initialJobs,
  canEdit,
  companyId,
}: {
  initialJobs: Job[];
  canEdit: boolean;
  companyId: string;
}) {
  const supabase = createClient();
  const { toast } = useToast();
  const [jobs, setJobs] = React.useState<Job[]>(initialJobs);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    place: "",
    scheduled_date: "",
    customer_name: "",
    customer_email: "",
    estimate: 0,
    billing_mode: "itemized",
  });

  async function create() {
    if (!form.title.trim()) return toast({ title: "Title required", variant: "destructive" });
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        company_id: companyId,
        title: form.title.trim(),
        place: form.place || null,
        scheduled_date: form.scheduled_date || null,
        customer_name: form.customer_name || null,
        customer_email: form.customer_email || null,
        estimate: Number(form.estimate),
        billing_mode: form.billing_mode,
        status: "scheduled",
      })
      .select()
      .single();
    if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    setJobs((j) => [data as Job, ...j]);
    setOpen(false);
    setForm({ title: "", place: "", scheduled_date: "", customer_name: "", customer_email: "", estimate: 0, billing_mode: "itemized" });
    toast({ title: "Job created" });
  }

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New job
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                      {j.title}
                    </Link>
                    {j.place && <div className="text-xs text-muted-foreground">{j.place}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{j.customer_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(j.scheduled_date)}</TableCell>
                  <TableCell>{fmtMoney(j.estimate)}</TableCell>
                  <TableCell className="text-sm capitalize">{j.billing_mode}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[j.status] ?? "secondary"} className="capitalize">
                      {j.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No jobs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Place / address</Label>
              <Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer name</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Customer email</Label>
                <Input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled date</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Estimate ($)</Label>
                <Input type="number" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: +e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Billing mode</Label>
              <Select value={form.billing_mode} onValueChange={(v) => setForm({ ...form, billing_mode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="itemized">Itemized</SelectItem>
                  <SelectItem value="hourly">Per hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Create job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
