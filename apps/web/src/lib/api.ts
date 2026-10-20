'use client';

import { notifyDataChanged } from '@/lib/workspace-events';

const API = '/api';

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  email: string;
  mfaEnabled: boolean;
};

function token(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gow_access');
}

function refreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gow_refresh');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('gow_access', access);
  localStorage.setItem('gow_refresh', refresh);
}

export function clearTokens() {
  localStorage.removeItem('gow_access');
  localStorage.removeItem('gow_refresh');
  localStorage.removeItem('gow_user');
}

export function saveUser(user: SessionUser) {
  localStorage.setItem('gow_user', JSON.stringify(user));
}

export function loadUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem('gow_user');
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = refreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken || !data.refreshToken) return false;
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { json?: unknown; _retried?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
    body,
    credentials: 'include',
  });

  // Soft session: on 401 try refresh once instead of forcing sign-out.
  if (res.status === 401 && !opts._retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const ok = await tryRefreshAccessToken();
    if (ok) {
      return api<T>(path, { ...opts, _retried: true });
    }
  }

  if (!res.ok) {
    let msg = res.statusText;
    let code: string | undefined;
    let payload: Record<string, unknown> | undefined;
    try {
      const j = await res.json();
      payload = typeof j === 'object' && j ? (j as Record<string, unknown>) : undefined;
      code = j.code || j.error?.code;
      msg = j.message || j.error || JSON.stringify(j);
      if (Array.isArray(msg)) msg = msg.join(', ');
      if (typeof msg === 'object' && msg && 'message' in msg) {
        const nested = msg as Record<string, unknown>;
        payload = { ...payload, ...nested };
        msg = String(nested.message || 'Request failed');
      }
    } catch {
      /* ignore */
    }
    const err = new Error(String(msg)) as Error & {
      code?: string;
      status?: number;
      payload?: Record<string, unknown>;
    };
    err.code = code;
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  const method = (opts.method || 'GET').toUpperCase();
  const isMutating =
    method !== 'GET' &&
    method !== 'HEAD' &&
    !path.startsWith('/auth/') &&
    !path.startsWith('/sync/');
  if (isMutating) {
    notifyDataChanged();
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text() as unknown as T;
}
