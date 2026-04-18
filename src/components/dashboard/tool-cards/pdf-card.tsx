'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

export function PdfCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const filename =
    typeof args.filename === 'string'
      ? args.filename
      : typeof args.file === 'string'
        ? args.file
        : typeof args.path === 'string'
          ? args.path
          : null;
  const pageRange =
    typeof args.pages === 'string'
      ? args.pages
      : typeof args.page_range === 'string'
        ? args.page_range
        : typeof args.page === 'number'
          ? String(args.page)
          : null;
  const purpose =
    typeof args.purpose === 'string'
      ? args.purpose
      : typeof args.query === 'string'
        ? args.query
        : null;

  const statusVariant = statusToVariant(status);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="PDF tool call"
      >
        <IconBadge icon={FileText} />
        <span className="font-mono text-xs text-indigo-300">pdf_read</span>
        {filename && (
          <code className="truncate max-w-[200px] font-mono text-xs text-neutral-300">
            {filename}
          </code>
        )}
        {pageRange && <span className="text-xs text-neutral-500">pp. {pageRange}</span>}
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label="PDF tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={FileText} />
        <span className="font-mono text-xs text-indigo-300">pdf_read</span>
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {filename && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">File</span>
          <code className="font-mono text-xs text-neutral-300 break-all">{filename}</code>
        </div>
      )}

      {pageRange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Pages</span>
          <code className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
            {pageRange}
          </code>
        </div>
      )}

      {purpose && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Purpose</p>
          <p className="text-xs text-neutral-400 leading-relaxed">{purpose}</p>
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
