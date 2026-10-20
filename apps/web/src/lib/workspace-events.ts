'use client';

const CHANNEL = 'gow-workspace';
export const WORKSPACE_EVENT = 'gow-data-changed';

/** Broadcast that workspace data changed (same browser tabs + listeners). */
export function notifyDataChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(WORKSPACE_EVENT));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHANNEL);
      bc.postMessage({ t: Date.now() });
      bc.close();
    }
  } catch {
    /* ignore */
  }
}

export function subscribeDataChanged(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(WORKSPACE_EVENT, handler);
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = () => handler();
    }
  } catch {
    bc = null;
  }
  return () => {
    window.removeEventListener(WORKSPACE_EVENT, handler);
    bc?.close();
  };
}
