"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

export interface Crew { id: string; name: string; initials: string; color: string; }
interface JobBlock { id: string; title: string; status: string; customer: string | null; crew: { id: string; initials: string; color: string }[]; }
export interface ScheduleDay { iso: string; dow: string; dayNum: number; isToday: boolean; jobs: JobBlock[]; }

const statusAccent: Record<string, string> = {
  scheduled: "#0ea5e9", active: "#10b981", complete: "#a1a1aa",
};

export function ScheduleView({
  days, crews, weekLabel, offset,
}: {
  days: ScheduleDay[];
  crews: Crew[];
  weekLabel: string;
  offset: number;
}) {
  const router = useRouter();
  const go = (next: number) => router.push(next === 0 ? "/schedule" : `/schedule?week=${next}`);

  const totalJobs = days.reduce((n, d) => n + d.jobs.length, 0);

  // Jobs with no crew assigned, per day — shown in an "Unassigned" row.
  const unassignedByDay = days.map((d) => d.jobs.filter((j) => j.crew.length === 0));
  const hasUnassigned = unassignedByDay.some((list) => list.length > 0);

  function JobChip({ job }: { job: JobBlock }) {
    const accent = statusAccent[job.status] ?? "#a1a1aa";
    return (
      <button
        type="button"
        onClick={() => router.push(`/jobs/${job.id}`)}
        className="w-full rounded-md border-l-[3px] bg-muted/60 px-2 py-1.5 text-left transition-colors hover:bg-accent"
        style={{ borderLeftColor: accent }}
      >
        <p className="truncate text-[11.5px] font-medium leading-tight">{job.title}</p>
        {job.customer && <p className="truncate text-[10.5px] text-muted-foreground">{job.customer}</p>}
      </button>
    );
  }

  return (
    <div className="ws-fade">
      {/* Header + week nav */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 hidden h-12 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary to-violet-500 shadow-[0_0_14px_hsl(var(--primary)/0.5)] md:block" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Schedule</h1>
            <p className="text-sm text-muted-foreground">Week of {weekLabel} · {totalJobs} {totalJobs === 1 ? "job" : "jobs"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => go(offset - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-accent" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => go(0)} className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">Today</button>
          <button type="button" onClick={() => go(offset + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-accent" aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Desktop / tablet: crew × day grid */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <div className="min-w-[860px]">
          {/* Day header */}
          <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: "150px repeat(7, 1fr)" }}>
            <div />
            {days.map((d) => (
              <div key={d.iso} className="border-l px-2 py-2 text-center">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{d.dow}</div>
                <div className={cn("font-mono text-sm font-semibold", d.isToday && "text-primary")}>{d.dayNum}</div>
              </div>
            ))}
          </div>

          {crews.length === 0 && !hasUnassigned && (
            <div className="p-8">
              <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Jobs with a scheduled date and assigned crew show up here." />
            </div>
          )}

          {/* Crew rows */}
          {crews.map((crew) => (
            <div key={crew.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "150px repeat(7, 1fr)" }}>
              <div className="flex items-center gap-2 border-r px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold text-white" style={{ background: crew.color }}>{crew.initials}</span>
                <span className="truncate text-xs font-medium">{crew.name}</span>
              </div>
              {days.map((d) => {
                const cell = d.jobs.filter((j) => j.crew.some((c) => c.id === crew.id));
                return (
                  <div key={d.iso} className={cn("min-h-[64px] space-y-1 border-l p-1.5", d.isToday && "bg-primary/[0.03]")}>
                    {cell.map((job) => <JobChip key={job.id} job={job} />)}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Unassigned */}
          {hasUnassigned && (
            <div className="grid border-t" style={{ gridTemplateColumns: "150px repeat(7, 1fr)" }}>
              <div className="flex items-center border-r px-3 py-2 text-xs font-medium text-muted-foreground">Unassigned</div>
              {days.map((d, i) => (
                <div key={d.iso} className={cn("min-h-[64px] space-y-1 border-l p-1.5", d.isToday && "bg-primary/[0.03]")}>
                  {unassignedByDay[i].map((job) => <JobChip key={job.id} job={job} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: day-by-day agenda */}
      <div className="space-y-4 md:hidden">
        {totalJobs === 0 && (
          <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Jobs with a scheduled date show up here for the selected week." />
        )}
        {days.filter((d) => d.jobs.length > 0).map((d) => (
          <div key={d.iso}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className={cn("font-mono text-xs font-semibold uppercase", d.isToday ? "text-primary" : "text-muted-foreground")}>{d.dow} {d.dayNum}</span>
              {d.isToday && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">today</span>}
            </div>
            <div className="space-y-2">
              {d.jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors active:bg-accent"
                  style={{ borderLeftColor: statusAccent[job.status] ?? "#a1a1aa", borderLeftWidth: 3 }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    {job.customer && <p className="truncate text-xs text-muted-foreground">{job.customer}</p>}
                  </div>
                  <div className="flex -space-x-2">
                    {job.crew.map((c) => (
                      <span key={c.id} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card font-mono text-[9px] font-semibold text-white" style={{ background: c.color }}>{c.initials}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
