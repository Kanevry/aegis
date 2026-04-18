'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

export function WebFetchCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const method =
    typeof args.method === 'string'
      ? args.method.toUpperCase()
      : 'GET';
  const url =
    typeof args.url === 'string'
      ? args.url
      : typeof args.uri === 'string'
        ? args.uri
        : null;
  const headers =
    args.headers && typeof args.headers === 'object' && !Array.isArray(args.headers)
      ? (args.headers as Record<string, string>)
      : null;

  const statusVariant = statusToVariant(status);
  const methodVariant = methodToVariant(method);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="Web fetch tool call"
      >
        <IconBadge icon={Download} />
        <span className="font-mono text-xs text-indigo-300">web_fetch</span>
        <Badge variant={methodVariant}>{method}</Badge>
        {url && (
          <code className="truncate max-w-[200px] font-mono text-xs text-neutral-300">
            {url}
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
      aria-label="Web fetch tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Download} />
        <span className="font-mono text-xs text-indigo-300">web_fetch</span>
        <Badge variant={methodVariant}>{method}</Badge>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {url && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">URL</p>
          <code className="block break-all font-mono text-xs text-blue-400">{url}</code>
        </div>
      )}

      {headers && Object.keys(headers).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Headers ({Object.keys(headers).length})</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(headers).map((key) => (
              <code
                key={key}
                className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-400"
                title={`${key}: ${headers[key]}`}
              >
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

function methodToVariant(method: string): 'default' | 'secondary' | 'destructive' | 'success' {
  switch (method) {
    case 'GET':
      return 'success';
    case 'POST':
    case 'PUT':
    case 'PATCH':
      return 'default';
    case 'DELETE':
      return 'destructive';
    default:
      return 'secondary';
  }
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
