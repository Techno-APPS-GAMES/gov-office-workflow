'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { subscribeDataChanged } from '@/lib/workspace-events';

export { notifyDataChanged } from '@/lib/workspace-events';

type Options = {
  /** How often to check the server stamp while the tab is visible (ms). Default 3000. */
  intervalMs?: number;
  /** Set false to pause. Default true. */
  enabled?: boolean;
};

/**
 * Keeps page data fresh without a manual browser refresh:
 * - polls /sync/stamp and reloads when workspace changes (other users)
 * - refreshes on tab focus / visibility
 * - refreshes when this or another tab mutates data
 */
export function useLiveRefresh(
  reload: () => void | Promise<void>,
  deps: unknown[] = [],
  options: Options = {},
) {
  const { intervalMs = 3000, enabled = true } = options;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const stampRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        await reloadRef.current();
      } catch {
        /* keep prior UI */
      } finally {
        busyRef.current = false;
      }
    };

    const checkStamp = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await api<{ stamp: string }>('/sync/stamp');
        if (cancelled) return;
        if (stampRef.current === null) {
          stampRef.current = res.stamp;
          return;
        }
        if (res.stamp !== stampRef.current) {
          stampRef.current = res.stamp;
          await run();
        }
      } catch {
        /* ignore */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkStamp();
        void run();
      }
    };

    const unsub = subscribeDataChanged(() => {
      void run();
      void checkStamp();
    });

    window.addEventListener('focus', checkStamp);
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(() => {
      void checkStamp();
    }, intervalMs);

    void checkStamp();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', checkStamp);
      document.removeEventListener('visibilitychange', onVisible);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}
