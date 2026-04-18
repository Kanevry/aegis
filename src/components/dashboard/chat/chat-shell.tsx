'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { SessionSidebar } from '@/components/dashboard/chat/session-sidebar';
import { ChatPanel } from '@/components/dashboard/chat/chat-panel';

export function ChatShell() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('session');

  function handleSelectSession(id: string) {
    router.push(`/dashboard/chat?session=${id}` as Route);
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80">
      <SessionSidebar
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
      />
      <ChatPanel sessionId={sessionId} />
    </div>
  );
}
