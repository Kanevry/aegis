'use client';

import * as React from 'react';
import { Code2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

export function CodeExecCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const language =
    typeof args.language === 'string'
      ? args.language
      : typeof args.lang === 'string'
        ? args.lang
        : 'code';
  const code =
    typeof args.code === 'string'
      ? args.code
      : typeof args.source === 'string'
        ? args.source
        : typeof args.script === 'string'
          ? args.script
          : null;

  const statusVariant = statusToVariant(status);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="Code execution tool call"
      >
        <IconBadge icon={Code2} />
        <span className="font-mono text-xs text-indigo-300">code_exec</span>
        <span className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-amber-300">
          {language}
        </span>
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label="Code execution tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Code2} />
        <span className="font-mono text-xs text-indigo-300">code_exec</span>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-300">
          {language}
        </span>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {code && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Code</p>
          <pre
            className={cn(
              'overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2',
              'font-mono text-xs text-emerald-300 leading-5',
              'max-h-48',
            )}
          >
            {code}
          </pre>
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
