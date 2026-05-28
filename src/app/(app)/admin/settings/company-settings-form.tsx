"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveCompany } from "@/app/(app)/settings/actions";

interface Company {
  id: string; name: string; invoice_from: string | null; default_rate: number; tax_rate: number;
}

export function CompanySettingsForm({ company }: { company: Company | null }) {
  const { toast } = useToast();
  const [co, setCo] = React.useState<Company | null>(company);
  if (!co) return <p className="text-sm text-muted-foreground">No company record found.</p>;

  async function onSave() {
    if (!co) return;
    const res = await saveCompany({
      name: co.name,
      invoice_from: co.invoice_from,
      default_rate: co.default_rate,
      tax_rate: co.tax_rate,
    });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Saved" });
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Company &amp; invoice defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Invoice &quot;from&quot; name</Label>
            <Input value={co.invoice_from ?? ""} onChange={(e) => setCo({ ...co, invoice_from: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default rate ($/hr)</Label>
              <Input type="number" value={co.default_rate} onChange={(e) => setCo({ ...co, default_rate: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Tax rate (e.g. 0.0875)</Label>
              <Input type="number" step="0.0001" value={co.tax_rate} onChange={(e) => setCo({ ...co, tax_rate: Number(e.target.value) })} />
            </div>
          </div>
          <Button onClick={onSave}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
