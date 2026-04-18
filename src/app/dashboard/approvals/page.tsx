import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalsShell } from '@/components/dashboard/approvals/approvals-shell';

function ApprovalsLoadingFallback() {
  return (
    <div className="flex h-full flex-col gap-4" aria-busy="true" aria-label="Loading approvals">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid flex-1 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 md:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-2 p-3 border-r border-neutral-800">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-col gap-2 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center">
          <Skeleton className="h-40 w-64" />
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<ApprovalsLoadingFallback />}>
      <ApprovalsShell />
    </Suspense>
  );
}
