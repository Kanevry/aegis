'use client';

import * as React from 'react';
import { Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

export function BrowserCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const url = typeof args.url === 'string' ? args.url : null;
  const selector = typeof args.selector === 'string' ? args.selector : null;
  const action = typeof args.action === 'string' ? args.action : null;

  const statusVariant = statusToVariant(status);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="Browser tool call"
      >
        <IconBadge icon={Globe} />
        <span className="font-mono text-xs text-indigo-300">browser</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate max-w-[200px] font-mono text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            {url}
          </a>
        )}
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label="Browser tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Globe} />
        <span className="font-mono text-xs text-indigo-300">browser</span>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {url && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">URL</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
            title={url}
          >
            {url}
          </a>
        </div>
      )}

      {action && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Action</span>
          <code className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
            {action}
          </code>
        </div>
      )}

      {selector && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Selector</p>
          <code className="block font-mono text-xs text-amber-300 break-all">{selector}</code>
        </div>
      )}
    </div>
  );
}

function IconBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function statusToVariant(
  status: ToolCallCardProps['status'],
): 'default' | 'secondary' | 'destructive' | 'success' {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'denied':
    case 'failed':
      return 'destructive';
    case 'approved':
    case 'completed':
      return 'success';
    case 'running':
    default:
      return 'default';
  }
}

export { cn };
