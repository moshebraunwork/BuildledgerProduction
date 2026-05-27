"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { saveProfile, saveCompany } from "./actions";

interface Company {
  id: string; name: string; invoice_from: string | null; default_rate: number; tax_rate: number;
}

export function SettingsForm({
  theme, fullName, canEditCompany, company,
}: {
  theme: string; fullName: string | null; canEditCompany: boolean; company: Company | null;
}) {
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const [name, setName] = React.useState(fullName ?? "");
  const [themePref, setThemePref] = React.useState(theme);
  const [co, setCo] = React.useState<Company | null>(company);

  async function onSaveProfile() {
    const res = await saveProfile(name, themePref);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setTheme(themePref);
    toast({ title: "Saved" });
  }

  async function onSaveCompany() {
    if (!co) return;
    const res = await saveCompany({ name: co.name, invoice_from: co.invoice_from, default_rate: co.default_rate, tax_rate: co.tax_rate });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Company settings saved" });
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={themePref} onValueChange={setThemePref}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSaveProfile}>Save preferences</Button>
        </CardContent>
      </Card>

      {canEditCompany && co && (
        <Card>
          <CardHeader><CardTitle className="text-base">Company & invoice defaults</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Company name</Label><Input value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Invoice &quot;from&quot; name</Label><Input value={co.invoice_from ?? ""} onChange={(e) => setCo({ ...co, invoice_from: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Default rate ($/hr)</Label><Input type="number" value={co.default_rate} onChange={(e) => setCo({ ...co, default_rate: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Tax rate (e.g. 0.0875)</Label><Input type="number" step="0.0001" value={co.tax_rate} onChange={(e) => setCo({ ...co, tax_rate: Number(e.target.value) })} /></div>
            </div>
            <Button onClick={onSaveCompany}>Save company settings</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
