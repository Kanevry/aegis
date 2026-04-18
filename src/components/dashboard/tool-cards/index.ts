'use client';

import * as React from 'react';
import { ExecCard } from './exec-card';
import { BrowserCard } from './browser-card';
import { CodeExecCard } from './code-exec-card';
import { WebFetchCard } from './web-fetch-card';
import { PdfCard } from './pdf-card';
import { ImageGenCard } from './image-gen-card';
import { FallbackCard } from './fallback-card';

export interface ToolCallCardProps {
  tool: string;
  args: Record<string, unknown>;
  status?: 'pending' | 'approved' | 'denied' | 'running' | 'completed' | 'failed';
  compact?: boolean;
}

export function ToolCallCard(props: ToolCallCardProps): React.ReactElement {
  const { tool, args, status, compact } = props;
  const t = tool.toLowerCase();

  // Exec must be checked before code/sandbox to avoid false matches on "run_command"
  if (
    t.includes('exec') ||
    t.includes('bash') ||
    t.includes('shell') ||
    t.includes('run_command')
  ) {
    return React.createElement(ExecCard, { args, status, compact });
  }

  if (t.includes('browser') || t.includes('playwright')) {
    return React.createElement(BrowserCard, { args, status, compact });
  }

  if (
    t.includes('code') ||
    t.includes('python') ||
    t.includes('sandbox') ||
    t.includes('repl')
  ) {
    return React.createElement(CodeExecCard, { args, status, compact });
  }

  if (
    t.includes('fetch') ||
    t.includes('http') ||
    t.includes('curl') ||
    t.includes('request')
  ) {
    return React.createElement(WebFetchCard, { args, status, compact });
  }

  if (t.includes('pdf')) {
    return React.createElement(PdfCard, { args, status, compact });
  }

  if (t.includes('image') || t.includes('dalle')) {
    return React.createElement(ImageGenCard, { args, status, compact });
  }

  return React.createElement(FallbackCard, { tool, args, status, compact });
}

export { ExecCard } from './exec-card';
export { BrowserCard } from './browser-card';
export { CodeExecCard } from './code-exec-card';
export { WebFetchCard } from './web-fetch-card';
export { PdfCard } from './pdf-card';
export { ImageGenCard } from './image-gen-card';
export { FallbackCard } from './fallback-card';
