import * as React from 'react';
import { ChatShell } from '@/components/dashboard/chat/chat-shell';

/**
 * /dashboard/chat — Server component wrapper.
 * ChatShell is wrapped in Suspense because it uses useSearchParams() internally.
 */
export default function ChatPage() {
  return (
    <div className="h-full">
      <React.Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-neutral-500">Loading chat…</span>
          </div>
        }
      >
        <ChatShell />
      </React.Suspense>
    </div>
  );
}
