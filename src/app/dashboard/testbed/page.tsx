'use client';

import * as React from 'react';
import { AlertTriangle, Clock3, Play, Shield, Sparkles } from 'lucide-react';
import { ATTACK_LIBRARY } from '@/lib/attacks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Provider = 'openai' | 'anthropic';

type Attack = (typeof ATTACK_LIBRARY)[number];

type FireResponse = {
  safetyScore?: number | string;
  blockedLayers?: string[];
  reason?: string;
  text?: string;
  output?: string;
  result?: string;
  message?: string;
  error?: string;
};

type EventEntry = {
  id: string;
  attackId: string;
  attackTitle: string;
  provider: Provider;
  status: 'blocked' | 'allowed' | 'error';
  safetyScore: number | string | null;
  blockedLayers: string[];
  reason: string;
  returnedText: string;
  createdAt: string;
};

const providers: { id: Provider; label: string; description: string }[] = [
  { id: 'openai', label: 'OpenAI', description: 'Default production path' },
  { id: 'anthropic', label: 'Anthropic', description: 'A/B comparison path' },
];

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
  return '';
}

function formatSafetyScore(value: number | string | null) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(2);
  }
  return String(value);
}

function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function statusVariant(status: EventEntry['status']) {
  switch (status) {
    case 'blocked':
      return 'destructive' as const;
    case 'allowed':
      return 'success' as const;
    default:
      return 'secondary' as const;
  }
}

async function readFireResponse(response: Response): Promise<FireResponse & { rawText: string }> {
  const rawText = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return { ...(JSON.parse(rawText) as FireResponse), rawText };
    } catch {
      return { rawText };
    }
  }

  try {
    return { ...(JSON.parse(rawText) as FireResponse), rawText };
  } catch {
    return { rawText };
  }
}

function pickReturnedText(payload: FireResponse & { rawText: string }) {
  const text =
    normalizeText(payload.text) ||
    normalizeText(payload.output) ||
    normalizeText(payload.result) ||
    normalizeText(payload.message);

  if (text) return text;
  return payload.rawText.trim();
}

export default function TestbedPage() {
  const [selectedProvider, setSelectedProvider] = React.useState<Provider>('openai');
  const [selectedAttackId, setSelectedAttackId] = React.useState<string>(
    ATTACK_LIBRARY[0]?.id ?? '',
  );
  const [eventLog, setEventLog] = React.useState<EventEntry[]>([]);
  const [loadingAttackId, setLoadingAttackId] = React.useState<string | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const selectedAttack = ATTACK_LIBRARY.find((attack) => attack.id === selectedAttackId) ?? null;

  const triggerFire = React.useCallback(
    async (attack: Attack, provider = selectedProvider) => {
      setPageError(null);
      setLoadingAttackId(attack.id);

      try {
        const response = await fetch('/api/testbed/fire', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ attackId: attack.id, provider }),
        });

        const payload = await readFireResponse(response);
        const blockedLayers = Array.isArray(payload.blockedLayers)
          ? payload.blockedLayers.map(String)
          : [];
        const returnedText = pickReturnedText(payload);
        const hardBlocked = !response.ok && blockedLayers.length > 0;
        const status: EventEntry['status'] = hardBlocked
          ? 'blocked'
          : response.ok
            ? 'allowed'
            : 'error';

        setEventLog((current) => [
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${attack.id}`,
            attackId: attack.id,
            attackTitle: attack.title,
            provider,
            status,
            safetyScore:
              typeof payload.safetyScore === 'number' || typeof payload.safetyScore === 'string'
                ? payload.safetyScore
                : null,
            blockedLayers,
            reason:
              normalizeText(payload.reason) ||
              normalizeText(payload.error) ||
              (response.ok ? 'Request completed' : `Request failed with HTTP ${response.status}`),
            returnedText,
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);

        if (!response.ok && !hardBlocked) {
          setPageError(normalizeText(payload.error) || payload.rawText.trim() || 'Request failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected request failure';
        setPageError(message);
        setEventLog((current) => [
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-error`,
            attackId: attack.id,
            attackTitle: attack.title,
            provider,
            status: 'error',
            safetyScore: null,
            blockedLayers: [],
            reason: message,
            returnedText: '',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
      } finally {
        setLoadingAttackId((current) => (current === attack.id ? null : current));
      }
    },
    [selectedProvider],
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <Sparkles size={16} />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-neutral-100">Testbed</h1>
              <p className="text-sm text-neutral-500">
                Fire attack prompts through the hardening pipeline and inspect the returned event.
              </p>
            </div>
          </div>

          {pageError ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertTriangle size={16} />
              <span>{pageError}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Provider</p>
            <p className="text-sm font-medium text-neutral-100">
              {providers.find((provider) => provider.id === selectedProvider)?.label}
            </p>
          </div>

          <div className="flex gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant={selectedProvider === provider.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedProvider(provider.id)}
              >
                {provider.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="border-neutral-800 bg-neutral-900/80">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Attack library</CardTitle>
              <CardDescription>
                Select a prompt, then fire it into `/api/testbed/fire`.
              </CardDescription>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (selectedAttack) {
                  void triggerFire(selectedAttack);
                }
              }}
              disabled={!selectedAttack || loadingAttackId !== null}
            >
              <Play size={14} />
              {loadingAttackId ? 'Firing…' : 'Fire selected'}
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ATTACK_LIBRARY.map((attack) => {
                const isSelected = attack.id === selectedAttackId;
                const isLoading = loadingAttackId === attack.id;

                return (
                  <div
                    key={attack.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAttackId(attack.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAttackId(attack.id);
                      }
                    }}
                    className={cn(
                      'group cursor-pointer rounded-xl border p-4 text-left transition-all outline-none',
                      isSelected
                        ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
                        : 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-700 hover:bg-neutral-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-neutral-100">{attack.title}</h2>
                          <Badge variant="secondary">{attack.category}</Badge>
                          <Badge
                            variant={
                              attack.severity === 'high'
                                ? 'destructive'
                                : attack.severity === 'medium'
                                  ? 'default'
                                  : 'outline'
                            }
                          >
                            {attack.severity}
                          </Badge>
                        </div>
                        <p className="text-sm leading-6 text-neutral-400">{attack.description}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {attack.expectedBlockedLayers.length > 0 ? (
                        attack.expectedBlockedLayers.map((layer) => (
                          <Badge key={layer} variant="outline">
                            {layer}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">No expected blocks</Badge>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-neutral-500">ID: {attack.id}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void triggerFire(attack);
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Running…' : 'Fire'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedAttack ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">Selected</Badge>
                  <p className="text-sm font-medium text-neutral-100">{selectedAttack.title}</p>
                  <span className="text-xs text-neutral-500">{selectedAttack.id}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{selectedAttack.prompt}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-neutral-800 bg-neutral-900/80">
          <CardHeader>
            <CardTitle>Live status</CardTitle>
            <CardDescription>Selected provider, request state, and latest outcome.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Provider</p>
                <p className="mt-1 text-sm font-medium text-neutral-100">{selectedProvider}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Requests</p>
                <p className="mt-1 text-sm font-medium text-neutral-100">{eventLog.length}</p>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-indigo-300" />
                <p className="text-sm font-medium text-neutral-100">Latest event</p>
              </div>
              {eventLog[0] ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(eventLog[0].status)}>{eventLog[0].status}</Badge>
                    <Badge variant="secondary">{eventLog[0].provider}</Badge>
                    <span className="text-xs text-neutral-500">{formatTimestamp(eventLog[0].createdAt)}</span>
                  </div>
                  <p className="text-neutral-300">
                    <span className="text-neutral-500">Attack:</span> {eventLog[0].attackTitle}
                  </p>
                  <p className="text-neutral-300">
                    <span className="text-neutral-500">Safety score:</span>{' '}
                    {formatSafetyScore(eventLog[0].safetyScore)}
                  </p>
                  <p className="text-neutral-300">
                    <span className="text-neutral-500">Blocked layers:</span>{' '}
                    {eventLog[0].blockedLayers.length > 0
                      ? eventLog[0].blockedLayers.join(', ')
                      : 'None'}
                  </p>
                  <p className="text-neutral-300">
                    <span className="text-neutral-500">Reason:</span> {eventLog[0].reason}
                  </p>
                  {eventLog[0].returnedText ? (
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs leading-6 text-neutral-300">
                      {eventLog[0].returnedText}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">
                  No requests yet. Fire an attack to populate the event log.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-indigo-300" />
                <p className="text-sm font-medium text-neutral-100">Expected blocks</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAttack && selectedAttack.expectedBlockedLayers.length > 0 ? (
                  selectedAttack.expectedBlockedLayers.map((layer) => (
                    <Badge key={layer} variant="outline">
                      {layer}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-neutral-500">No layer expectations on this prompt.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-neutral-800 bg-neutral-900/80">
        <CardHeader>
          <CardTitle>Live event log</CardTitle>
          <CardDescription>Chronological request history with hardening output.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventLog.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Attack</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Safety</TableHead>
                  <TableHead>Blocked layers</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Returned text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-neutral-500">
                      {formatTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-neutral-100">{entry.attackTitle}</p>
                        <p className="text-xs text-neutral-500">{entry.attackId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entry.provider}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                    </TableCell>
                    <TableCell>{formatSafetyScore(entry.safetyScore)}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {entry.blockedLayers.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {entry.blockedLayers.map((layer) => (
                            <Badge key={layer} variant="outline">
                              {layer}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-500">None</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-neutral-300">{entry.reason}</TableCell>
                    <TableCell className="max-w-[320px] text-neutral-300">
                      {entry.returnedText || <span className="text-neutral-500">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-sm text-neutral-500">
              Fire an attack to start the log. Each result will be appended here with the safety
              score, blocked layers, reason, and returned text.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
