import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ægis — Observable Agentic Hardening',
  description:
    'Five-layer defense middleware for LLM agents, with Sentry-native observability. Built at the Codex Vienna Hackathon 2026-04-18.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 font-sans text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
