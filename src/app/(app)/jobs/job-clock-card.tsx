"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { uploadPunchPhoto } from "@/lib/punch-photo";
import { Play, Square, Store, Undo2, Loader2, Camera, X } from "lucide-react";
import { getMyShiftStatus, selfPunchIn, selfStoreOut, selfStoreReturn, selfPunchOut } from "@/app/(app)/clock/actions";

// "My shift" for THIS job — lets a worker clock in when they arrive and out
// when they leave without ever leaving the job screen. Reuses the self-service
// clock actions (no manager permission needed).

interface OpenPunch {
  id: string; job_id: string; kind: string; started_at: string;
  job_title: string; job_place: string | null; job_require_photo: boolean;
}
interface ShiftStatus {
  employee: { id: string; name: string; requirePhoto: boolean } | null;
  open: OpenPunch | null;
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function JobClockCard({
  jobId, jobRequiresPhoto, onPunchChange,
}: {
  jobId: string;
  jobRequiresPhoto: boolean;
  // Called after a successful clock in/out so the parent can refresh the punch list.
  onPunchChange?: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<ShiftStatus | null>(null);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!photoFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await getMyShiftStatus();
    if ("error" in res && res.error) return;
    setStatus((res as any).data ?? null);
  }, []);

  React.useEffect(() => {
    (async () => { setLoading(true); await refresh(); setLoading(false); })();
  }, [refresh]);

  const open = status?.open ?? null;
  const onThisJob = open?.job_id === jobId;
  const photoRequired = !!status?.employee?.requirePhoto || jobRequiresPhoto;

  function clearPhoto() {
    setPhotoFile(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function run(fn: () => Promise<{ error?: string } | { ok: boolean }>, successTitle: string) {
    setBusy(true);
    try {
      const res = await fn();
      if ((res as any).error) throw new Error((res as any).error);
      clearPhoto();
      await refresh();
      onPunchChange?.();
      router.refresh();
      toast({ title: successTitle, variant: "success" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function clockIn() {
    if (photoRequired && !photoFile) {
      return toast({ title: "Photo required", description: "Take a start photo before you clock in.", variant: "destructive" });
    }
    await run(async () => {
      const photoUrl = photoFile ? await uploadPunchPhoto(photoFile, jobId) : null;
      return selfPunchIn({ jobId, photoUrl, deviceLat: null, deviceLng: null });
    }, "Clocked in — have a good shift!");
  }

  async function clockOut() {
    if (photoRequired && !photoFile) {
      return toast({ title: "Photo required", description: "Take an end photo before you clock out.", variant: "destructive" });
    }
    await run(async () => {
      const photoUrl = photoFile ? await uploadPunchPhoto(photoFile, jobId) : null;
      return selfPunchOut({ photoUrl });
    }, "Clocked out — shift recorded");
  }

  // The camera input is rendered once (not remounted per state) so the captured
  // file isn't dropped. `capture` opens the rear camera directly on phones.
  const photoField = (
    <div className="space-y-2">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Photo preview" className="h-16 w-16 rounded-lg border object-cover" />
          <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
            <Camera className="mr-1.5 h-4 w-4" />Retake
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearPhoto} aria-label="Remove photo">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => photoInputRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />
          Take photo {photoRequired ? <span className="ml-1 text-destructive">(required)</span> : <span className="ml-1 text-muted-foreground">(optional)</span>}
        </Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {loading && (
          <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}

        {!loading && !status?.employee && (
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t linked to an employee record yet, so you can&apos;t clock in.
          </p>
        )}

        {/* Off shift → big clock-in button for this job */}
        {!loading && status?.employee && !open && (
          <>
            {photoField}
            <Button className="h-14 w-full text-base font-semibold" disabled={busy} onClick={clockIn}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              Clock in to this job
            </Button>
          </>
        )}

        {/* On shift on THIS job → elapsed time + store toggle + clock out */}
        {!loading && status?.employee && open && onThisJob && (
          <>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  open.kind === "store"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                )}
              >
                {open.kind === "store" ? <Store className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {open.kind === "store" ? "At the store" : "Working"}
              </span>
              <p className="text-2xl font-bold tabular-nums">{fmtElapsed(nowMs - new Date(open.started_at).getTime())}</p>
            </div>
            {open.kind === "site" ? (
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => run(selfStoreOut, "Marked: out to the store")}>
                <Store className="mr-2 h-4 w-4" /> I&apos;m going to the store
              </Button>
            ) : (
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => run(selfStoreReturn, "Welcome back — resumed work")}>
                <Undo2 className="mr-2 h-4 w-4" /> I&apos;m back from the store
              </Button>
            )}
            {photoField}
            <Button variant="destructive" className="h-14 w-full text-base font-semibold" disabled={busy} onClick={clockOut}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Square className="mr-2 h-5 w-5" />}
              Clock out
            </Button>
          </>
        )}

        {/* On shift, but on a different job */}
        {!loading && status?.employee && open && !onThisJob && (
          <div className="space-y-2 text-sm">
            <p>
              You&apos;re clocked in on <span className="font-semibold">{open.job_title}</span>{" "}
              ({fmtElapsed(nowMs - new Date(open.started_at).getTime())}). Clock out there before starting here.
            </p>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={`/jobs/${open.job_id}`}>Go to that job</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
