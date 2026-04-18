import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Ægis</h1>
      <p className="max-w-xl text-center text-lg text-neutral-400">
        Observable agentic hardening. Every LLM call is a traced span. Every safety violation is a
        Sentry exception — Seer analyses it per attack-pattern like a production bug.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          Open testbed
        </Link>
        <a
          href="https://github.com/Kanevry/aegis"
          className="rounded-md border border-neutral-700 px-5 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-500"
        >
          GitHub
        </a>
      </div>
      <footer className="mt-16 text-xs text-neutral-500">
        Codex Vienna · 2026-04-18 · MIT
      </footer>
    </main>
  );
}
