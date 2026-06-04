"use client";

import * as React from "react";
import { reportLocation } from "@/app/(app)/map/actions";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Periodic device-location reporting for users whose role requires it. Renders
// nothing unless `required` is true. While required and location is unavailable,
// it blocks the app with a full-screen overlay until the user allows access —
// matching the "must share location to use the site" rule. Superadmins are
// exempt upstream so an admin can never lock themselves out.
const INTERVAL_MS = 3 * 60 * 1000; // refresh every 3 minutes while open

export function LocationTracker({ required }: { required: boolean }) {
  const [granted, setGranted] = React.useState<boolean | null>(null); // null = not yet determined
  const [requesting, setRequesting] = React.useState(false);

  const report = React.useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGranted(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGranted(true);
        reportLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }).catch(() => {});
      },
      () => setGranted(false),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  React.useEffect(() => {
    if (!required) return;
    report();
    const id = setInterval(report, INTERVAL_MS);
    return () => clearInterval(id);
  }, [required, report]);

  if (!required) return null;

  async function enable() {
    setRequesting(true);
    report();
    setTimeout(() => setRequesting(false), 1200);
  }

  // Block access until location is granted.
  if (granted === false) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MapPin className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Location required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role requires sharing your location to use BuildLedger. Please allow location access
            in your browser, then continue.
          </p>
          <Button className="mt-5" onClick={enable} disabled={requesting}>
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable location"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            If you previously blocked location, turn it back on for this site in your browser's
            settings, then tap Enable.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
