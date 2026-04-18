'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ApprovalArgsDiffProps {
  args: Record<string, unknown>;
  className?: string;
}

function syntaxHighlight(json: string): string {
  // Escape HTML, then colorize keys/strings/numbers/booleans/null
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-blue-300'; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-indigo-300'; // key
          } else {
            cls = 'text-emerald-300'; // string value
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

export function ApprovalArgsDiff({ args, className }: ApprovalArgsDiffProps) {
  const formatted = React.useMemo(() => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }, [args]);

  const highlighted = React.useMemo(() => syntaxHighlight(formatted), [formatted]);

  return (
    <pre
      aria-label="Tool arguments (JSON)"
      className={cn(
        'overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4',
        'font-mono text-xs leading-6 text-neutral-300',
        className,
      )}
      // Safe: all input is JSON.stringify output that we HTML-escape before inserting spans
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}
