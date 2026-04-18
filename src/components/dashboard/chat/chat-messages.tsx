'use client';

import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt?: Date;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

export function ChatMessages({ messages, streamingContent }: ChatMessagesProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        <p>Start the conversation by sending a message below.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {streamingContent ? (
          <AssistantBubble content={streamingContent} isStreaming />
        ) : null}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </ScrollArea>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            'max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5',
            'bg-indigo-500/20 text-sm leading-relaxed text-indigo-100',
            'border border-indigo-500/20',
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return <AssistantBubble content={message.content} />;
  }

  return null;
}

function AssistantBubble({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-2.5',
          'bg-neutral-800/60 text-sm leading-relaxed text-neutral-200',
          'border border-neutral-700/50',
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {isStreaming ? (
          <span
            className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-indigo-400"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
