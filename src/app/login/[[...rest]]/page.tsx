import { SignIn } from "@clerk/nextjs";
import { HardHat } from "lucide-react";

// Clerk's prebuilt sign-in handles the entire email-OTP flow (and TOTP 2FA
// once enabled on a paid plan). The catch-all [[...rest]] segment lets Clerk
// manage its own sub-routes (verification, factor steps, etc).
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HardHat className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold">BuildLedger</span>
      </div>
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/login"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
