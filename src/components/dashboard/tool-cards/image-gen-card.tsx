'use client';

import * as React from 'react';
import { Image } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCallCardProps } from './index';

const MAX_PROMPT_LENGTH = 200;

export function ImageGenCard({ args, status, compact }: Omit<ToolCallCardProps, 'tool'>) {
  const rawPrompt =
    typeof args.prompt === 'string'
      ? args.prompt
      : typeof args.description === 'string'
        ? args.description
        : null;
  const truncatedPrompt =
    rawPrompt && rawPrompt.length > MAX_PROMPT_LENGTH
      ? rawPrompt.slice(0, MAX_PROMPT_LENGTH) + '…'
      : rawPrompt;
  const isTruncated = rawPrompt ? rawPrompt.length > MAX_PROMPT_LENGTH : false;

  const size =
    typeof args.size === 'string'
      ? args.size
      : typeof args.resolution === 'string'
        ? args.resolution
        : null;
  const model =
    typeof args.model === 'string'
      ? args.model
      : typeof args.engine === 'string'
        ? args.engine
        : null;

  const statusVariant = statusToVariant(status);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
        role="region"
        aria-label="Image generation tool call"
      >
        <IconBadge icon={Image} />
        <span className="font-mono text-xs text-indigo-300">image_gen</span>
        {truncatedPrompt && (
          <span
            className="truncate max-w-[200px] text-xs text-neutral-300"
            title={rawPrompt ?? undefined}
          >
            {truncatedPrompt}
          </span>
        )}
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-3"
      role="region"
      aria-label="Image generation tool call"
    >
      <div className="flex items-center gap-2">
        <IconBadge icon={Image} />
        <span className="font-mono text-xs text-indigo-300">image_gen</span>
        {model && (
          <span className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-400">
            {model}
          </span>
        )}
        {status && <Badge variant={statusVariant} className="ml-auto">{status}</Badge>}
      </div>

      {truncatedPrompt && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">Prompt</p>
          <p
            className={cn('text-xs text-neutral-300 leading-relaxed', isTruncated && 'cursor-help')}
            title={isTruncated ? (rawPrompt ?? undefined) : undefined}
          >
            {truncatedPrompt}
          </p>
        </div>
      )}

      {size && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Size</span>
          <code className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
            {size}
          </code>
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
