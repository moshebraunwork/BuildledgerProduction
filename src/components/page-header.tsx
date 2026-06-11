export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 hidden h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary to-violet-500 shadow-[0_0_10px_hsl(var(--primary)/0.4)] md:block" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
