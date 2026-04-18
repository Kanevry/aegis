'use client';

import * as React from 'react';
import { Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-blue-300';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-indigo-300';
          } else {
            cls = 'text-emerald-300';
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-amber-300';
        } else if (/null/.test(match)) {
          cls = 'text-red-300';
        }
        return `<span class="${cls}">${match}</span>`;
      },
    );
}

export function FallbackCard({ tool, args, status, compact }: ToolCallCardProps) {
  const statusVariant = statusToVariant(status);

  const formatted = React.useMemo(() => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }, [args]);

  const highlighted = React.useMemo(() => syntaxHighlight(formatted), [formatted]);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label={`Tool call: ${tool}`}
      >
        <IconBadge icon={Box} />
        <span className="font-mono text-xs text-indigo-300">{tool}</span>
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label={`Tool call: ${tool}`}
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Box} />
        <span className="font-mono text-xs text-indigo-300">{tool}</span>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      <pre
        aria-label="Tool arguments (JSON)"
        className={cn(
          'overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4',
          'font-mono text-xs leading-6 text-neutral-300',
        )}
        // Safe: all input is JSON.stringify output HTML-escaped before inserting spans
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
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
