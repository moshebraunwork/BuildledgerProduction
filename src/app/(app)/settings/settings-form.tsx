"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { saveProfile } from "./actions";

const FONT_SIZES = [
  { v: "sm", l: "Small" },
  { v: "md", l: "Default" },
  { v: "lg", l: "Large" },
  { v: "xl", l: "Extra large" },
];

export function UserSettingsForm({
  theme, fullName, fontScaleDesktop, fontScaleMobile,
}: {
  theme: string;
  fullName: string | null;
  fontScaleDesktop: string;
  fontScaleMobile: string;
}) {
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const [name, setName] = React.useState(fullName ?? "");
  const [themePref, setThemePref] = React.useState(theme);
  const [fontDesktop, setFontDesktop] = React.useState(fontScaleDesktop ?? "md");
  const [fontMobile, setFontMobile] = React.useState(fontScaleMobile ?? "md");

  const isDirty =
    name !== (fullName ?? "") ||
    themePref !== theme ||
    fontDesktop !== (fontScaleDesktop ?? "md") ||
    fontMobile !== (fontScaleMobile ?? "md");

  // Apply font size live on the device being used so the preview is immediate.
  const SIZES: Record<string, string> = { sm: "15px", md: "16px", lg: "18px", xl: "20px" };
  function previewFont(scope: "desktop" | "mobile", value: string) {
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    if ((scope === "desktop") === isDesktop) {
      document.documentElement.style.fontSize = SIZES[value] ?? "16px";
    }
  }

  async function onSave() {
    const res = await saveProfile(name, themePref, fontDesktop, fontMobile);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Saved" });
  }

  function onThemeChange(value: string) {
    setThemePref(value);
    setTheme(value);
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={themePref} onValueChange={onThemeChange}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Display</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Desktop control — shown only on desktop. */}
          <div className="hidden space-y-2 md:block">
            <Label>Font size (this computer)</Label>
            <Select
              value={fontDesktop}
              onValueChange={(v) => { setFontDesktop(v); previewFont("desktop", v); }}
            >
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applies when using BuildLedger on a desktop / laptop.</p>
          </div>

          {/* Mobile control — shown only on mobile. */}
          <div className="space-y-2 md:hidden">
            <Label>Font size (this phone)</Label>
            <Select
              value={fontMobile}
              onValueChange={(v) => { setFontMobile(v); previewFont("mobile", v); }}
            >
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applies when using BuildLedger on a phone.</p>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={onSave} disabled={!isDirty}>Save{isDirty ? " (unsaved changes)" : ""}</Button>
      </div>
    </div>
  );
}
