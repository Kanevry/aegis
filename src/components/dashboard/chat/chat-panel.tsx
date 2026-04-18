'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatUIMessage, ChatBlockedResponse } from '@aegis/types';
import { Button } from '@/components/ui/button';
import { ChatMessages, type ChatMessage } from '@/components/dashboard/chat/chat-messages';
import { ChatInput } from '@/components/dashboard/chat/chat-input';
import { RejectionBanner, type RejectionInfo } from '@/components/dashboard/chat/rejection-banner';

type Provider = 'openai' | 'anthropic' | 'openclaw';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openclaw', label: 'OpenClaw' },
];

interface ChatPanelProps {
  sessionId: string | null;
}

function generateId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
  const [provider, setProvider] = React.useState<Provider>('openai');
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [rejection, setRejection] = React.useState<RejectionInfo | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Reset conversation when session changes
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on sessionId change
    setMessages([]);
    setStreamingContent('');
    setRejection(null);
  }, [sessionId]);

  async function sendMessage(content: string) {
    if (isLoading) return;

    // Clear any previous rejection on new send
    setRejection(null);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsLoading(true);
    setStreamingContent('');

    // Build the messages payload for the API
    const apiMessages: ChatUIMessage[] = nextMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          ...(sessionId ? { sessionId } : {}),
          provider,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Try to parse block response
        const errBody = (await res.json()) as ChatBlockedResponse | { error: string; message?: string };
        if ('error' in errBody && errBody.error === 'aegis_blocked') {
          const blocked = errBody as ChatBlockedResponse;
          setRejection({
            blockedLayers: blocked.blockedLayers,
            reason: blocked.reason,
            safetyScore: blocked.safetyScore,
          });
        } else {
          const msg = 'message' in errBody ? errBody.message : errBody.error;
          toast.error(msg ?? 'Request failed');
        }
        return;
      }

      if (!res.body) {
        toast.error('No response body from server');
        return;
      }

      // Stream SSE frames from AI SDK v6 UIMessageStreamResponse
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // AI SDK v6 UIMessageStream format: lines like `0:"text chunk"\n`
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // AI SDK v6 data stream protocol: `<prefix>:<json-value>`
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx === -1) continue;

          const prefix = trimmed.slice(0, colonIdx);
          const rest = trimmed.slice(colonIdx + 1);

          if (prefix === '0') {
            // Text delta: `0:"<escaped-text>"`
            try {
              const parsed = JSON.parse(rest) as string;
              accumulated += parsed;
              setStreamingContent(accumulated);
            } catch {
              // ignore malformed
            }
          }
          // prefix 'd' is final message delta, 'e' is error, 'f' is finish — skip for now
        }
      }

      if (accumulated) {
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: accumulated,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      setStreamingContent('');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Unexpected error';
      toast.error(message);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header: title + provider selector */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-100">Chat</p>
            <p className="text-xs text-neutral-500">
              {sessionId ? `Session ${sessionId.slice(0, 8)}…` : 'No session selected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">Provider</p>
          <div className="flex gap-1">
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={provider === p.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setProvider(p.id)}
                aria-pressed={provider === p.id}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Messages area */}
      {!sessionId ? (
        <div className="flex flex-1 items-center justify-center" aria-label="No session selected">
          <div className="max-w-sm text-center">
            <Sparkles className="mx-auto h-10 w-10 text-indigo-300" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-neutral-100">Start a new chat</h3>
            <p className="mt-2 text-sm text-neutral-400">
              Select a session from the sidebar or click &ldquo;New Chat&rdquo; to begin.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-1 flex-col overflow-hidden"
          aria-live="polite"
          aria-label="Chat messages"
        >
          <ChatMessages messages={messages} streamingContent={streamingContent || undefined} />
        </div>
      )}

      {/* Rejection banner */}
      {rejection ? (
        <div className="px-4 pb-2">
          <RejectionBanner info={rejection} />
        </div>
      ) : null}

      {/* Input */}
      <div className="border-t border-neutral-800 px-4 py-3">
        {!sessionId ? (
          <p className="text-center text-xs text-neutral-500">
            Select or create a session to start chatting.
          </p>
        ) : (
          <ChatInput onSubmit={(content) => void sendMessage(content)} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
