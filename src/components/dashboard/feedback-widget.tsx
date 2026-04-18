'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';
import { MessageSquareWarning } from 'lucide-react';

type FeedbackWidgetProps = {
  enabled: boolean;
};

export function FeedbackWidget({ enabled }: FeedbackWidgetProps) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!enabled || !buttonRef.current) {
      return;
    }

    const feedback = Sentry.getFeedback();
    if (!feedback) {
      return;
    }

    return feedback.attachTo(buttonRef.current, {
      tags: {
        source: 'aegis_dashboard',
      },
      colorScheme: 'dark',
      isEmailRequired: false,
      isNameRequired: false,
      showEmail: false,
      showName: false,
      formTitle: 'Report Attack Classification',
      messageLabel: 'Why does this classification look wrong?',
      messagePlaceholder:
        'Add the attack, expected block, and what happened instead.',
      submitButtonLabel: 'Send to Sentry',
      successMessageText: 'Feedback captured for this replay session.',
    });
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-neutral-950/95 px-3 py-2 text-sm font-medium text-neutral-100 shadow-[0_12px_40px_rgba(2,6,23,0.45)] transition hover:border-indigo-400 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:rounded-xl sm:px-4"
      aria-label="Report attack classification"
    >
      <MessageSquareWarning size={16} />
      <span className="hidden sm:inline">Report Attack Classification</span>
    </button>
  );
}
