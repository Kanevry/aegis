'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface RejectionInfo {
  blockedLayers: string[];
  reason: string;
  safetyScore: number;
}

interface RejectionBannerProps {
  info: RejectionInfo;
  className?: string;
}

export function RejectionBanner({ info, className }: RejectionBannerProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-red-300">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Request blocked by Ægis hardening pipeline</span>
      </div>

      <p className="text-sm leading-relaxed text-red-200/80">{info.reason}</p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-red-400">Blocked layers:</span>
        {info.blockedLayers.length > 0 ? (
          info.blockedLayers.map((layer) => (
            <Badge key={layer} variant="destructive">
              {layer}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-red-400/60">none reported</span>
        )}
      </div>

      <div className="text-xs text-red-400">
        Safety score:{' '}
        <span className="font-semibold text-red-300">{info.safetyScore.toFixed(2)}</span>
      </div>
    </div>
  );
}
