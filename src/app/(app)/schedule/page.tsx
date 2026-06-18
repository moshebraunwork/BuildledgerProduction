import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { ScheduleView, type ScheduleDay, type Crew } from "./schedule-view";

// Avatar palette — stable per employee id so a person keeps one colour.
const PALETTE = ["#0066ff", "#7c3aed", "#16a34a", "#ea580c", "#0891b2", "#d97706", "#db2777", "#4f46e5"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requirePermission("jobs.view");
  const cid = user.companyId;

  const sp = await searchParams;
  const offset = Number.parseInt(sp.week ?? "0", 10) || 0;

  // Monday-anchored week, shifted by `offset` weeks.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dow + offset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const todayStr = ymd(today);

  const rows = (await sql`
    select j.id::text as job_id, j.title, j.status, j.customer_name,
           to_char(j.scheduled_date, 'YYYY-MM-DD') as day,
           e.id::text as emp_id, e.name as emp_name
    from public.jobs j
    left join public.job_employees je on je.job_id = j.id
    left join public.employees e on e.id = je.employee_id
    where j.company_id = ${cid}
      and j.scheduled_date >= ${ymd(weekStart)}
      and j.scheduled_date <= ${ymd(weekEnd)}
    order by j.scheduled_date, j.title
  `) as any[];

  // Collapse the join back into one entry per job (with a crew list).
  const jobMap = new Map<string, { id: string; title: string; status: string; customer: string | null; day: string; crew: { id: string; initials: string; color: string }[] }>();
  const crewMap = new Map<string, Crew>();
  for (const r of rows) {
    const jobId = r.job_id as string;
    if (!jobMap.has(jobId)) {
      jobMap.set(jobId, { id: jobId, title: r.title, status: r.status, customer: r.customer_name, day: r.day, crew: [] });
    }
    const job = jobMap.get(jobId)!;
    if (r.emp_id) {
      const color = colorFor(r.emp_id);
      const initials = initialsOf(r.emp_name || "");
      if (!job.crew.some((c) => c.id === r.emp_id)) job.crew.push({ id: r.emp_id, initials, color });
      if (!crewMap.has(r.emp_id)) crewMap.set(r.emp_id, { id: r.emp_id, name: r.emp_name, initials, color });
    }
  }

  const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const days: ScheduleDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = ymd(d);
    const jobs = [...jobMap.values()]
      .filter((j) => j.day === iso)
      .map((j) => ({ id: j.id, title: j.title, status: j.status, customer: j.customer, crew: j.crew }));
    days.push({ iso, dow: DOW[i], dayNum: d.getDate(), isToday: iso === todayStr, jobs });
  }

  const crews = [...crewMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekLabel = `${fmt(weekStart)} — ${fmt(weekEnd)}`;

  return <ScheduleView days={days} crews={crews} weekLabel={weekLabel} offset={offset} />;
}
