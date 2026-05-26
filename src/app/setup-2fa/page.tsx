"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Setup2FAPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const [qr, setQr] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [factorId, setFactorId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Enroll a new TOTP factor on mount
  React.useEffect(() => {
    (async () => {
      // Clean up any unverified leftover factors first
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        // Already has 2FA — nothing to set up
        router.push("/dashboard");
        return;
      }
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) {
        toast({ title: "Enrollment error", description: error.message, variant: "destructive" });
        return;
      }
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (!factorId) return;
    setLoading(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setLoading(false);
      return toast({ title: "Error", description: cErr?.message, variant: "destructive" });
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    setLoading(false);
    if (error) return toast({ title: "Invalid code", description: error.message, variant: "destructive" });
    toast({ title: "2FA enabled", description: "Your authenticator is now set up." });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Set up two-factor</CardTitle>
          <CardDescription>
            Scan this with Google Authenticator (or any TOTP app), then enter the code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qr ? (
            <div className="flex flex-col items-center gap-3">
              {/* Supabase returns an SVG data URI */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="2FA QR code" className="h-44 w-44 rounded-md border bg-white p-2" />
              {secret && (
                <p className="text-center text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this key manually:
                  <br />
                  <span className="font-mono text-foreground">{secret}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="code">Code from your app</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
            />
          </div>
          <Button className="w-full" onClick={verify} disabled={loading || code.length < 6 || !factorId}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify & enable
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
