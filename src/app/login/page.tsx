"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { HardHat, Loader2 } from "lucide-react";

type Step = "email" | "code" | "totp";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [totp, setTotp] = React.useState("");
  const [factorId, setFactorId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Step 1 — send email OTP
  async function sendEmailOtp() {
    if (!email) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) return toast({ title: "Couldn't send code", description: error.message, variant: "destructive" });
    setStep("code");
    toast({ title: "Code sent", description: `Check ${email} for a Login code.` });
  }

  // Step 2 — verify email OTP. Then decide: enroll TOTP or challenge existing.
  async function verifyEmailOtp() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      setLoading(false);
      return toast({ title: "Invalid code", description: error.message, variant: "destructive" });
    }

    // Ensure a profile row exists / superadmin promotion
    await fetch("/api/auth/verify-otp", { method: "POST" });

    // Check enrolled TOTP factors
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    setLoading(false);

    if (!verified) {
      // No authenticator enrolled yet → go set one up
      router.push("/setup-2fa");
      return;
    }

    // Has an authenticator → require a TOTP challenge to complete 2FA
    setFactorId(verified.id);
    setStep("totp");
  }

  // Step 3 — verify the authenticator app code (2FA)
  async function verifyTotp() {
    if (!factorId) return;
    setLoading(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setLoading(false);
      return toast({ title: "2FA error", description: cErr?.message, variant: "destructive" });
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: totp,
    });
    setLoading(false);
    if (error) return toast({ title: "Invalid 2FA code", description: error.message, variant: "destructive" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">BuildLedger</CardTitle>
          <CardDescription>
            {step === "email" && "Sign in with your email"}
            {step === "code" && "Enter the code we emailed you"}
            {step === "totp" && "Enter your authenticator code"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendEmailOtp()}
                />
              </div>
              <Button className="w-full" onClick={sendEmailOtp} disabled={loading || !email}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send code
              </Button>
            </>
          )}

          {step === "code" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyEmailOtp()}
                />
              </div>
              <Button className="w-full" onClick={verifyEmailOtp} disabled={loading || code.length < 6}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep("email")} disabled={loading}>
                Use a different email
              </Button>
            </>
          )}

          {step === "totp" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="totp">Authenticator code</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyTotp()}
                />
              </div>
              <Button className="w-full" onClick={verifyTotp} disabled={loading || totp.length < 6}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
