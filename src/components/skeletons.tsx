import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Reusable, layout-matching loading states used by route-level loading.tsx
// files so every page shows a meaningful skeleton instead of a blank flash.

function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        {/* header row */}
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 flex-1" style={{ maxWidth: i === 0 ? "40%" : undefined }} />
          ))}
        </div>
        {/* body rows */}
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3.5">
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className="h-4 flex-1" style={{ maxWidth: c === 0 ? "40%" : undefined }} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Standard list page: header + a toolbar + a table.
export function ListPageSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <TableSkeleton cols={cols} />
    </>
  );
}

// Dashboard: stat cards + two chart cards + two list cards.
export function DashboardSkeleton() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-28" />
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-[240px] w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
          <CardContent><Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" /></CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, r) => (
                <div key={r} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

// Job detail: header + overview card + the side-by-side section columns.
export function JobDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Card>
        <CardHeader className="border-b px-4 py-3"><Skeleton className="h-4 w-24" /></CardHeader>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="border-b px-4 py-3"><Skeleton className="h-4 w-28" /></CardHeader>
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, r) => <Skeleton key={r} className="h-4 w-full" />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
