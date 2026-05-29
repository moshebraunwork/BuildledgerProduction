"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveCompany } from "@/app/(app)/settings/actions";
import { Upload, X } from "lucide-react";

interface Company {
  id: string; name: string; invoice_from: string | null; default_rate: number;
  tax_rate: number; logo_url: string | null; contact_email: string | null;
}

export function CompanySettingsForm({ company }: { company: Company | null }) {
  const { toast } = useToast();
  const [co, setCo] = React.useState<Company | null>(company);
  const [saved, setSaved] = React.useState<Company | null>(company);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  if (!co) return <p className="text-sm text-muted-foreground">No company record found.</p>;

  const isDirty = JSON.stringify(co) !== JSON.stringify(saved);

  async function onSave() {
    if (!co) return;
    const res = await saveCompany({
      name: co.name, invoice_from: co.invoice_from, default_rate: co.default_rate,
      tax_rate: co.tax_rate, logo_url: co.logo_url, contact_email: co.contact_email,
    });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setSaved({ ...co });
    toast({ title: "Saved" });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file); form.append("prefix", "logos");
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) return toast({ title: "Upload failed", description: json.error, variant: "destructive" });
    setCo(c => c ? { ...c, logo_url: json.url } : c);
    toast({ title: "Logo uploaded" });
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
            <Input value={co.invoice_from ?? ""} onChange={(e) => setCo({ ...co, invoice_from: e.target.value || null })} />
          </div>
          <div className="space-y-2">
            <Label>Contact / support email</Label>
            <Input type="email" value={co.contact_email ?? ""} placeholder="hello@yourcompany.com" onChange={(e) => setCo({ ...co, contact_email: e.target.value || null })} />
            <p className="text-xs text-muted-foreground">Shown to users whose accounts are pending approval.</p>
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
          <div className="space-y-2">
            <Label>Company logo (appears on invoices &amp; PDFs)</Label>
            {co.logo_url ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={co.logo_url} alt="Logo" className="max-h-14 max-w-[200px] object-contain rounded border p-1" />
                <Button type="button" size="sm" variant="outline" onClick={() => setCo(c => c ? { ...c, logo_url: null } : c)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {uploading ? "Uploading..." : "Upload logo"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — max 10 MB</p>
              </div>
            )}
          </div>
          <Button onClick={onSave} disabled={!isDirty}>Save{isDirty ? " (unsaved changes)" : ""}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
