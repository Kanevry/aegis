'use client';

import { ShieldCheck } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = 'No approvals pending',
  description = 'When an agent action requires operator sign-off, it will appear here.',
}: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900">
        <ShieldCheck size={24} className="text-neutral-500" />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-medium text-neutral-200">{title}</p>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
