'use client';

import * as React from 'react';
import { Loader2, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@aegis/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { throwIfError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SessionSidebarProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function SessionSidebar({ activeSessionId, onSelectSession }: SessionSidebarProps) {
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions');
      const data = await throwIfError<Session[]>(res);
      setSessions(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load sessions';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount; setLoading inside loadSessions is intentional
    void loadSessions();
  }, []);

  async function createSession() {
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const created = await throwIfError<{ id: string; title: string; createdAt: string }>(res);
      // Re-fetch to get the normalized Session shape
      const refreshRes = await fetch('/api/sessions');
      const data = await throwIfError<Session[]>(refreshRes);
      setSessions(data);
      onSelectSession(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950"
      aria-label="Chat sessions"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Sessions
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void createSession()}
          disabled={creating}
          aria-label="New chat session"
        >
          {creating ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-neutral-500" aria-label="Loading sessions" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquare size={20} className="mx-auto mb-2 text-neutral-600" aria-hidden="true" />
            <p className="text-xs text-neutral-500">No sessions yet.</p>
            <p className="mt-1 text-xs text-neutral-600">Click + to start a new chat.</p>
          </div>
        ) : (
          <ul className="space-y-0.5 p-2" role="list">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100',
                    )}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="truncate font-medium">{session.title ?? 'Untitled'}</span>
                    <span className="text-xs text-neutral-500">{formatDate(session.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
