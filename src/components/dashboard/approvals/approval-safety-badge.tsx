'use client';

import { Badge } from '@/components/ui/badge';

export interface ApprovalSafetyBadgeProps {
  safetyScore?: number;
  className?: string;
}

function scoreLabel(score: number): string {
  if (score <= 0.3) return 'High Risk';
  if (score <= 0.7) return 'Medium Risk';
  return 'Low Risk';
}

function scoreVariant(score: number): 'destructive' | 'default' | 'success' {
  if (score <= 0.3) return 'destructive';
  if (score <= 0.7) return 'default';
  return 'success';
}

export function ApprovalSafetyBadge({ safetyScore, className }: ApprovalSafetyBadgeProps) {
  if (safetyScore === undefined || safetyScore === null) {
    return (
      <Badge variant="secondary" className={className}>
        N/A
      </Badge>
    );
  }

  const clamped = Math.max(0, Math.min(1, safetyScore));
  const variant = scoreVariant(clamped);
  const label = scoreLabel(clamped);

  return (
    <Badge variant={variant} className={className} title={`Safety score: ${clamped.toFixed(2)}`}>
      {label} {clamped.toFixed(2)}
    </Badge>
  );
}
