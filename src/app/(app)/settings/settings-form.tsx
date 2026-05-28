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

export function UserSettingsForm({ theme, fullName }: { theme: string; fullName: string | null }) {
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const [name, setName] = React.useState(fullName ?? "");
  const [themePref, setThemePref] = React.useState(theme);

  async function onSave() {
    const res = await saveProfile(name, themePref);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setTheme(themePref);
    toast({ title: "Saved" });
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
            <Select value={themePref} onValueChange={setThemePref}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSave}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
