import { cn } from "@/lib/utils";

// Presentational shell for the mobile (card) representation of a table row.
// Tables render as cards below `md` and as real tables on `md+`.
export function MobileCard({
  onClick, className, children,
}: {
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-3 text-sm shadow-sm transition-all",
        onClick && "cursor-pointer hover:border-primary/40 active:scale-[0.99] active:bg-accent/50",
        className
      )}
    >
      {children}
    </div>
  );
}

// A labelled key/value used inside a MobileCard.
export function MobileField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
