"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Clock, MapPin, Store, Play, Square, Loader2, Camera, Undo2, X } from "lucide-react";
import { BackButton } from "@/components/back-button";
import {
  getMyShiftStatus, selfPunchIn, selfStoreOut, selfStoreReturn, selfPunchOut,
} from "./actions";

interface JobOpt {
  id: string; title: string; place: string | null;
  lat: number | null; lng: number | null; status: string;
  assigned: boolean; require_punch_photo: boolean;
}
interface OpenPunch {
  id: string; job_id: string; kind: string; started_at: string;
  job_title: string; job_place: string | null; job_require_photo: boolean;
}
interface StatusData {
  employee: { id: string; name: string; requirePhoto: boolean } | null;
  open: OpenPunch | null;
  jobs: JobOpt[];
}

// Great-circle distance in metres between two coordinates.
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A job's coordinates count as a match if within this radius of the device.
const MATCH_RADIUS_M = 500;

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// Downscale + re-encode an image in the browser before upload. Phone camera
// photos are often several MB / many megapixels, which can exceed the upload
// body limit; a ~1600px JPEG is plenty for a verification photo and uploads
// reliably. Falls back to the original file if anything goes wrong.
async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function uploadPhoto(file: File, jobId: string): Promise<string> {
  const compressed = await compressImage(file);
  const fd = new FormData();
  fd.append("file", compressed);
  fd.append("prefix", `punch-photos/${jobId}`);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  // The endpoint may return an HTML error page (e.g. a request-too-large proxy
  // error) rather than JSON — parse defensively so we surface a clear message.
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON response */ }
  if (!res.ok || !json?.url) {
    throw new Error(json?.error || `Photo upload failed (${res.status}). Please try again.`);
  }
  return json.url as string;
}

interface LockedJob { id: string; title: string; place: string | null; require_punch_photo: boolean; }

export function ClockClient({ lockedJob, userEmail }: { lockedJob: LockedJob | null; userEmail: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const lockedJobId = lockedJob?.id ?? null;

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<StatusData | null>(null);
  const [selectedJobId, setSelectedJobId] = React.useState<string>(lockedJobId ?? "");
  const [device, setDevice] = React.useState<{ lat: number; lng: number } | null>(null);
  const [autoMatched, setAutoMatched] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  // Build (and clean up) an object URL so the captured photo can be previewed
  // before it's uploaded.
  React.useEffect(() => {
    if (!photoFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // Live elapsed clock.
  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await getMyShiftStatus();
    if ("error" in res) {
      toast({ title: "Couldn't load", description: res.error, variant: "destructive" });
      return null;
    }
    const data = res.data as StatusData;
    setStatus(data);
    return data;
  }, [toast]);

  // Initial load.
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Request device location once, to auto-detect the nearest job.
  React.useEffect(() => {
    if (lockedJobId) return; // locked to a specific job — no detection needed
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDevice({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* permission denied / unavailable — fall back to manual pick */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [lockedJobId]);

  // Auto-prefill the nearest job once we have both location and the job list.
  React.useEffect(() => {
    if (lockedJobId || autoMatched || selectedJobId || !device || !status?.jobs?.length) return;
    let best: { id: string; d: number } | null = null;
    for (const j of status.jobs) {
      if (j.lat == null || j.lng == null) continue;
      const d = distanceMeters(device.lat, device.lng, Number(j.lat), Number(j.lng));
      if (d <= MATCH_RADIUS_M && (!best || d < best.d)) best = { id: j.id, d };
    }
    if (best) {
      setSelectedJobId(best.id);
      setAutoMatched(true);
    }
  }, [device, status, lockedJobId, autoMatched, selectedJobId]);

  const open = status?.open ?? null;
  const jobs = status?.jobs ?? [];
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  const startPhotoRequired =
    !!status?.employee?.requirePhoto || !!selectedJob?.require_punch_photo || !!lockedJob?.require_punch_photo;
  const endPhotoRequired =
    !!status?.employee?.requirePhoto || !!open?.job_require_photo;

  function clearPhoto() {
    setPhotoFile(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handlePunchIn() {
    const jobId = lockedJobId ?? selectedJobId;
    if (!jobId) return toast({ title: "Pick a job first", variant: "destructive" });
    if (startPhotoRequired && !photoFile) {
      return toast({ title: "Photo required", description: "A start photo is required before you can clock in.", variant: "destructive" });
    }
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) photoUrl = await uploadPhoto(photoFile, jobId);
      const res = await selfPunchIn({ jobId, photoUrl, deviceLat: device?.lat ?? null, deviceLng: device?.lng ?? null });
      if (res.error) throw new Error(res.error);
      clearPhoto();
      await refresh();
      router.refresh();
      toast({ title: "Clocked in — have a good shift!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Couldn't clock in", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleStoreOut() {
    setBusy(true);
    try {
      const res = await selfStoreOut();
      if (res.error) throw new Error(res.error);
      await refresh();
      router.refresh();
      toast({ title: "Marked: out to the store" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleStoreReturn() {
    setBusy(true);
    try {
      const res = await selfStoreReturn();
      if (res.error) throw new Error(res.error);
      await refresh();
      router.refresh();
      toast({ title: "Welcome back — resumed work" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handlePunchOut() {
    if (!open) return;
    if (endPhotoRequired && !photoFile) {
      return toast({ title: "Photo required", description: "An end photo is required before you can stop.", variant: "destructive" });
    }
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) photoUrl = await uploadPhoto(photoFile, open.job_id);
      const res = await selfPunchOut({ photoUrl });
      if (res.error) throw new Error(res.error);
      clearPhoto();
      await refresh();
      router.refresh();
      toast({ title: "Clocked out — shift recorded", variant: "success" });
    } catch (e: any) {
      toast({ title: "Couldn't clock out", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  // ---- Photo control (shared by clock-in and clock-out) ----
  // A plain render function (not a component) so the file input isn't remounted
  // on every render — that would drop the captured file. `capture="environment"`
  // makes mobile browsers open the rear camera directly.
  function photoField(required: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">
          Photo {required ? <span className="text-destructive">(required)</span> : <span className="text-muted-foreground">(optional)</span>}
        </Label>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Photo preview" className="h-48 w-full rounded-md border object-cover" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => photoInputRef.current?.click()}>
                <Camera className="mr-2 h-4 w-4" /> Retake
              </Button>
              <Button type="button" variant="ghost" onClick={clearPhoto}>
                <X className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={() => photoInputRef.current?.click()}>
            <Camera className="mr-2 h-4 w-4" /> Take photo
          </Button>
        )}
      </div>
    );
  }

  // ---- Render ----
  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!status?.employee) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        {lockedJob ? (
          <BackButton href={`/jobs/${lockedJob.id}`} label="Back to job" className="-ml-2 text-muted-foreground" />
        ) : (
          <BackButton label="Back" className="-ml-2 text-muted-foreground" />
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">My shift</h1>
        </div>
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <p className="font-medium">No employee profile linked</p>
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t linked to an employee record yet, so you can&apos;t clock in.
              On the Employees page, add or invite an employee using your login email{" "}
              <span className="font-medium text-foreground">{userEmail}</span> — it links automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      {lockedJob ? (
        <BackButton href={`/jobs/${lockedJob.id}`} label="Back to job" className="-ml-2 text-muted-foreground" />
      ) : (
        <BackButton label="Back" className="-ml-2 text-muted-foreground" />
      )}
      <div className="flex items-center gap-2">
        <Clock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold leading-none">My shift</h1>
          <p className="text-sm text-muted-foreground">{status.employee.name}</p>
        </div>
      </div>

      {/* ---- OFF SHIFT: start working ---- */}
      {!open && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <Label className="text-sm">Job</Label>
              {lockedJob ? (
                <div className="mt-1.5 rounded-md border bg-muted/40 px-3 py-2">
                  <p className="font-medium">{lockedJob.title}</p>
                  {lockedJob.place && <p className="text-xs text-muted-foreground">{lockedJob.place}</p>}
                </div>
              ) : (
                <>
                  <Select value={selectedJobId} onValueChange={(v) => { setSelectedJobId(v); setAutoMatched(false); }}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={jobs.length ? "Select the job you're working" : "No active jobs"} />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.title}{j.place ? ` — ${j.place}` : ""}{j.assigned ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {autoMatched && selectedJob && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                      <MapPin className="h-3.5 w-3.5" /> Auto-detected from your location — change it if it&apos;s wrong.
                    </p>
                  )}
                  {!autoMatched && device && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> No job matched your location — pick one above.
                    </p>
                  )}
                </>
              )}
            </div>

            {photoField(startPhotoRequired)}

            <Button className="h-12 w-full text-base" disabled={busy || (!lockedJobId && !selectedJobId)} onClick={handlePunchIn}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              Start working now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- ON SHIFT (working or at store) ---- */}
      {open && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4 text-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  open.kind === "store" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                )}
              >
                {open.kind === "store" ? <Store className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {open.kind === "store" ? "At the store" : "Working"}
              </span>
              <div>
                <p className="text-3xl font-bold tabular-nums">{fmtElapsed(nowMs - new Date(open.started_at).getTime())}</p>
                <p className="mt-1 font-medium">{open.job_title}</p>
                {open.job_place && <p className="text-xs text-muted-foreground">{open.job_place}</p>}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {open.kind === "site" ? (
              <Button variant="outline" className="h-12 w-full text-base" disabled={busy} onClick={handleStoreOut}>
                <Store className="mr-2 h-5 w-5" /> I&apos;m going to the store
              </Button>
            ) : (
              <Button variant="outline" className="h-12 w-full text-base" disabled={busy} onClick={handleStoreReturn}>
                <Undo2 className="mr-2 h-5 w-5" /> I&apos;m back from the store
              </Button>
            )}

            <Card>
              <CardContent className="space-y-3 p-4">
                {photoField(endPhotoRequired)}
                <Button variant="destructive" className="h-12 w-full text-base" disabled={busy} onClick={handlePunchOut}>
                  {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Square className="mr-2 h-5 w-5" />}
                  Stop working
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
