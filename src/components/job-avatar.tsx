import { cn } from "@/lib/utils";

// Messenger-style identity circle for a job: a deterministic color from the
// title plus its initials. Shared by the mobile jobs list and the job screen
// app bar so a job keeps the same "face" everywhere.
const PALETTE = [
  "bg-sky-500", "bg-orange-500", "bg-rose-500", "bg-amber-500",
  "bg-emerald-500", "bg-violet-500", "bg-pink-500", "bg-teal-500",
];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initialsFor(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function JobAvatar({ title, className }: { title: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full text-base font-semibold text-white",
        colorFor(title),
        className
      )}
    >
      {initialsFor(title)}
    </span>
  );
}
