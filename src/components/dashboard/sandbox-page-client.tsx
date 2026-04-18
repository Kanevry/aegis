'use client';

import * as React from 'react';
import { AlertTriangle, ExternalLink, Server, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Scenario = 'attack-5-secret-exfil' | 'benign-github-fetch';

type EgressBlock = {
  host: string;
  method: string;
  timestamp: string;
  reason: string;
};

type SandboxDemoResponse = {
  available: boolean;
  mocked: boolean;
  scenario: string;
  result: { exitCode: number; stdout: string; stderr: string };
  egressBlocks: EgressBlock[];
  span: { traceId: string | null; attributes: Record<string, string | number | boolean> };
  sentryIssueUrl: string | null;
  fallbackReason: string | null;
};

const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  {
    id: 'benign-github-fetch',
    label: 'Benign GitHub fetch',
    description: 'Allowed egress to api.github.com — baseline behavior.',
  },
  {
    id: 'attack-5-secret-exfil',
    label: 'Attack #5 — Secret Exfil',
    description: 'Attempts to POST env secrets to an external host. B6 blocks the egress.',
  },
];

function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export default function SandboxPageClient() {
  const [selectedScenario, setSelectedScenario] = React.useState<Scenario>('benign-github-fetch');
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<SandboxDemoResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runScenario = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/sandbox/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario: selectedScenario }),
      });

      const text = await response.text();
      let data: SandboxDemoResponse;

      try {
        data = JSON.parse(text) as SandboxDemoResponse;
      } catch {
        throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected failure');
    } finally {
      setRunning(false);
    }
  }, [selectedScenario]);

  const availabilityBadge = result ? (
    !result.mocked && result.available ? (
      <Badge variant="success">Real VM</Badge>
    ) : (
      <Badge className="border-amber-500/30 bg-amber-500/20 text-amber-300">Mocked</Badge>
    )
  ) : null;

  return (
    <section className="space-y-6 pb-20">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
            <ShieldCheck size={16} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-neutral-100">B6 Sandbox Execution Layer</h1>
            <p className="text-sm text-neutral-500">
              microVM runtime isolation — Phase 3 preview
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      {/* Scenario selector + CTA */}
      <Card className="border-neutral-800 bg-neutral-900/80">
        <CardHeader>
          <CardTitle>Scenario</CardTitle>
          <CardDescription>
            Select a runtime scenario, then execute it inside the microVM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCENARIOS.map((scenario) => {
              const isSelected = scenario.id === selectedScenario;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedScenario(scenario.id)}
                  className={[
                    'rounded-xl border p-4 text-left transition-all outline-none',
                    isSelected
                      ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
                      : 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-700 hover:bg-neutral-900',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold text-neutral-100">{scenario.label}</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{scenario.description}</p>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            disabled={running}
            onClick={() => void runScenario()}
            className="w-full sm:w-auto"
          >
            <Server size={14} />
            {running ? 'Running…' : 'Run in microVM'}
          </Button>
        </CardContent>
      </Card>

      {/* Result panel */}
      {result ? (
        <div className="space-y-4">
          {/* Availability + fallback */}
          <div className="flex flex-wrap items-center gap-3">
            {availabilityBadge}
            {result.fallbackReason ? (
              <span className="text-xs text-neutral-500">{result.fallbackReason}</span>
            ) : null}
            {result.sentryIssueUrl ? (
              <a
                href={result.sentryIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
              >
                <ExternalLink size={12} />
                View in Sentry
              </a>
            ) : null}
          </div>

          {/* stdout / egress columns */}
          <div className="grid gap-4 xl:grid-cols-2">
            {/* stdout / stderr */}
            <Card className="border-neutral-800 bg-neutral-900/80">
              <CardHeader>
                <CardTitle className="text-sm">Runtime output</CardTitle>
                <CardDescription>
                  exit code {result.result.exitCode}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-widest text-neutral-500">stdout</p>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-300 whitespace-pre-wrap">
                    {result.result.stdout || '(empty)'}
                  </pre>
                </div>
                {result.result.stderr ? (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-widest text-neutral-500">stderr</p>
                    <pre className="max-h-32 overflow-auto rounded-lg border border-red-900/40 bg-red-950/20 p-3 font-mono text-xs leading-5 text-red-300 whitespace-pre-wrap">
                      {result.result.stderr}
                    </pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Egress blocks */}
            <Card className="border-neutral-800 bg-neutral-900/80">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldOff size={16} className="text-red-400" />
                  <CardTitle className="text-sm">
                    Egress blocks
                    {result.egressBlocks.length > 0 ? (
                      <Badge variant="destructive" className="ml-2">
                        {result.egressBlocks.length}
                      </Badge>
                    ) : null}
                  </CardTitle>
                </div>
                <CardDescription>Outbound requests blocked by B6.</CardDescription>
              </CardHeader>
              <CardContent>
                {result.egressBlocks.length > 0 ? (
                  <ul className="space-y-2">
                    {result.egressBlocks.map((block, index) => (
                      <li
                        key={index}
                        className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 space-y-1"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive">{block.method}</Badge>
                          <span className="font-mono text-xs text-red-300">{block.host}</span>
                          <span className="ml-auto text-xs text-neutral-500">
                            {formatTimestamp(block.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400">{block.reason}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No egress blocked.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Span attributes */}
          <Card className="border-neutral-800 bg-neutral-900/80">
            <CardHeader>
              <CardTitle className="text-sm">Span attributes</CardTitle>
              <CardDescription>
                {result.span.traceId ? (
                  <>
                    Trace:{' '}
                    <span className="font-mono text-xs text-neutral-300">{result.span.traceId}</span>
                  </>
                ) : (
                  'No active trace'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(result.span.attributes).length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="pb-2 text-left text-xs uppercase tracking-widest text-neutral-500">
                        Key
                      </th>
                      <th className="pb-2 text-left text-xs uppercase tracking-widest text-neutral-500">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {Object.entries(result.span.attributes).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-2 pr-4 font-mono text-xs text-neutral-400">{key}</td>
                        <td className="py-2 font-mono text-xs text-neutral-200">
                          {String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-neutral-500">No span attributes recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Footer */}
      <p className="text-xs text-neutral-600">
        Phase 3 preview — microVM sandbox powered by{' '}
        <a
          href="https://github.com/earendil-works/gondolin"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 underline-offset-2 hover:text-neutral-400 hover:underline"
        >
          Gondolin (earendil-works)
        </a>
        {' '}— tracked in{' '}
        <a
          href="https://github.com/Kanevry/aegis/issues/90"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 underline-offset-2 hover:text-neutral-400 hover:underline"
        >
          Epic #90
        </a>
        .
      </p>
    </section>
  );
}
