'use client';

import * as React from 'react';
import { Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

export function ExecCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const command = typeof args.command === 'string' ? args.command : typeof args.cmd === 'string' ? args.cmd : null;
  const cwd = typeof args.cwd === 'string' ? args.cwd : null;
  const env = args.env && typeof args.env === 'object' && !Array.isArray(args.env)
    ? (args.env as Record<string, string>)
    : null;

  const statusVariant = statusToVariant(status);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="Exec tool call"
      >
        <IconBadge icon={Terminal} />
        <span className="font-mono text-xs text-indigo-300">exec</span>
        {command && (
          <code className="truncate max-w-[200px] font-mono text-xs text-neutral-300">
            {command}
          </code>
        )}
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label="Exec tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Terminal} />
        <span className="font-mono text-xs text-indigo-300">exec</span>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {command && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Command</p>
          <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-emerald-300 whitespace-pre-wrap break-all">
            {command}
          </pre>
        </div>
      )}

      {cwd && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">cwd</span>
          <code className="font-mono text-xs text-neutral-400">{cwd}</code>
        </div>
      )}

      {env && Object.keys(env).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Environment</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(env).map((key) => (
              <code key={key} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-400">
                {key}
              </code>
            ))}
          </div>
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
