/**
 * End-to-end smoke: health → login → register matter → route → ack → decide.
 * Usage: API_URL=http://localhost:4000/api npx tsx scripts/smoke.ts
 */
const API = process.env.API_URL || 'http://localhost:4000/api';

async function req(path: string, opts: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers, body });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
  return data;
}

async function main() {
  const health = await req('/health');
  if (!health.ok) throw new Error('Health check failed');

  // Dev seed accounts may skip MFA when MFA_REQUIRED=false
  process.env.MFA_REQUIRED = process.env.MFA_REQUIRED || 'false';

  const login = await req('/auth/login', {
    method: 'POST',
    json: {
      username: 'speaker',
      password: process.env.SMOKE_PASSWORD || 'ChangeMe!Office1',
    },
  });
  const token = login.accessToken as string;
  if (!token) throw new Error('No access token');

  const matter = await req('/files', {
    method: 'POST',
    token,
    json: {
      subject: `Smoke ${Date.now()}`,
      sender: 'Smoke Test',
      body: 'Automated smoke correspondence',
      classification: 'INTERNAL',
      subjectArea: 'Administration',
      priority: 'NORMAL',
    },
  });

  const users = await req('/users', { token });
  const target = (users as any[]).find((u) => u.username === 'secgen') || users[1];
  if (!target) throw new Error('No route target user');

  await req(`/files/${matter.id}/route`, {
    method: 'POST',
    token,
    json: { toUserId: target.id, procedure: 'Smoke route' },
  });

  const sg = await req('/auth/login', {
    method: 'POST',
    json: {
      username: 'secgen',
      password: process.env.SMOKE_PASSWORD_SG || 'ChangeMe!Office1',
    },
  });
  await req(`/files/${matter.id}/acknowledge`, { method: 'POST', token: sg.accessToken });

  await req(`/files/${matter.id}/decide`, {
    method: 'POST',
    token,
    json: { text: 'Smoke approved', decisionType: 'APPROVE' },
  });

  console.log('SMOKE_OK', { diaryNo: matter.diaryNo, id: matter.id, health });
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e.message || e);
  process.exit(1);
});
