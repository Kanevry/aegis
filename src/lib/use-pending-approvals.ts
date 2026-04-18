'use client';

import { useEffect, useState } from 'react';

interface Approval {
  id: string;
  [key: string]: unknown;
}

interface ApiEnvelope {
  ok: boolean;
  data: Approval[];
  [key: string]: unknown;
}

export function usePendingApprovals(): { count: number; loading: boolean } {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/approvals?status=pending&limit=1');
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json: ApiEnvelope = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.data)) {
          setCount(json.data.length);
        }
      } catch {
        // fail silently — count stays at 0
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCount();

    const interval = setInterval(() => {
      fetchCount();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { count, loading };
}
