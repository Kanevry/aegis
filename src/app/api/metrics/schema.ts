// src/app/api/metrics/schema.ts — MetricsResponseSchema for /api/metrics
// Co-located with the route but in a separate file: Next.js 16 app-router
// route files may only export allowed names (GET/POST/runtime/dynamic/...),
// so the schema cannot live alongside the handler.

import { z } from 'zod';

const HardeningLayerSchema = z.enum(['B1', 'B2', 'B3', 'B4', 'B5']);

export const MetricsResponseSchema = z.object({
  firedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  avgSafetyScore: z.number().min(0).max(1).nullable(),
  mostBlockedLayer: HardeningLayerSchema.nullable(),
  layerBreakdown: z.object({
    B1: z.number().int().nonnegative(),
    B2: z.number().int().nonnegative(),
    B3: z.number().int().nonnegative(),
    B4: z.number().int().nonnegative(),
    B5: z.number().int().nonnegative(),
  }),
  lastUpdatedAt: z.string().datetime({ offset: true }),
  source: z.enum(['db', 'unavailable']),
});

export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
