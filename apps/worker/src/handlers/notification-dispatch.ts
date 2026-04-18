// apps/worker/src/handlers/notification-dispatch.ts — full implementation

import type { Job } from 'pg-boss';
import * as Sentry from '@sentry/node';

export type NotificationDispatchJob = {
  channel: 'discord';
  template: 'approval_requested' | 'approval_resolved' | 'expired';
  payload: { approval_id: string; tool?: string; decision?: string; [k: string]: unknown };
};

export async function handleNotificationDispatch(
  jobs: Job<NotificationDispatchJob>[],
): Promise<void> {
  const webhookUrl = process.env['DISCORD_WEBHOOK_URL'];
  for (const job of jobs) {
    const { channel, template, payload } = job.data;
    await Sentry.startSpan(
      {
        op: 'aegis.job',
        name: 'notification.dispatch',
        attributes: {
          'aegis.job.queue': 'notification.dispatch',
          'aegis.job.channel': channel,
          'aegis.job.template': template,
        },
      },
      async () => {
        console.warn('[job] notification.dispatch start', { channel, template, ...payload });
        try {
          if (!webhookUrl) {
            console.warn(
              '[job] notification.dispatch skipped (no DISCORD_WEBHOOK_URL)',
              { template },
            );
            return;
          }
          const content = renderDiscordMessage(template, payload);
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content }),
          });
          if (!res.ok) {
            throw new Error(`Discord webhook ${res.status} ${res.statusText}`);
          }
          console.warn('[job] notification.dispatch done', { template });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { 'aegis.job.queue': 'notification.dispatch', template },
          });
          throw err;
        }
      },
    );
  }
}

function renderDiscordMessage(
  template: NotificationDispatchJob['template'],
  payload: NotificationDispatchJob['payload'],
): string {
  const { approval_id, tool, decision } = payload;
  switch (template) {
    case 'approval_requested':
      return `:warning: Aegis approval requested — tool \`${tool ?? 'unknown'}\` (id: \`${approval_id}\`)`;
    case 'approval_resolved':
      return `:white_check_mark: Approval \`${approval_id}\` resolved: \`${decision ?? 'unknown'}\``;
    case 'expired':
      return `:hourglass: Approval \`${approval_id}\` expired (15 min TTL)`;
  }
}
