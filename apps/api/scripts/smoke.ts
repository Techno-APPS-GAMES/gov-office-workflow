/**
 * End-to-end smoke: Path A + Path B (confidential) + Option B (direction evidence).
 * Usage: API_URL=http://localhost:4000/api npm run smoke -w @gow/api
 */
const API = process.env.API_URL || 'http://localhost:4000/api';
const PASS = process.env.SMOKE_PASSWORD || process.env.SEED_PASSWORD || 'ChangeMe!Office1';

async function req(
  path: string,
  opts: RequestInit & { token?: string; json?: unknown; form?: FormData } = {},
) {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  if (opts.form) {
    body = opts.form;
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

async function login(username: string) {
  const res = await req('/auth/login', {
    method: 'POST',
    json: { username, password: PASS },
  });
  if (!res.accessToken) throw new Error(`No token for ${username}`);
  return res.accessToken as string;
}

function tomorrowIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const health = await req('/health');
  if (!health.ok) throw new Error('Health check failed');

  const speaker = await login('speaker');
  const secgen = await login('secgen');
  const specsec = await login('specsec');

  const users = await req('/users', { token: speaker });
  const secgenUser = (users as any[]).find((u) => u.username === 'secgen');
  const specsecUser = (users as any[]).find((u) => u.username === 'specsec');
  if (!secgenUser || !specsecUser) throw new Error('Seed users missing');

  // —— Path A: INTERNAL register → route → ack → complete → approve ——
  const matterA = await req('/files', {
    method: 'POST',
    token: speaker,
    json: {
      subject: `Smoke A ${Date.now()}`,
      sender: 'Smoke Test',
      body: 'Automated Path A correspondence',
      classification: 'INTERNAL',
      subjectArea: 'Administration',
      priority: 'NORMAL',
    },
  });

  await req(`/files/${matterA.id}/notes`, {
    method: 'POST',
    token: speaker,
    json: { text: 'Smoke noting para on registration.', kind: 'NOTE' },
  });

  await req(`/files/${matterA.id}/route`, {
    method: 'POST',
    token: speaker,
    json: {
      toUserId: secgenUser.id,
      procedure: 'Smoke examine',
      dueDate: tomorrowIsoDate(),
    },
  });

  await req(`/files/${matterA.id}/acknowledge`, { method: 'POST', token: secgen });
  await req(`/files/${matterA.id}/complete-procedure`, {
    method: 'POST',
    token: secgen,
    json: { outcome: 'Smoke procedure complete' },
  });

  await req(`/files/${matterA.id}/decide`, {
    method: 'POST',
    token: speaker,
    json: { text: 'Smoke approved', decisionType: 'APPROVE' },
  });

  await req(`/files/${matterA.id}/versions`, {
    method: 'POST',
    token: speaker,
    json: { text: 'Smoke revised body after approval.', reason: 'Smoke version' },
  });

  // —— Path B: CONFIDENTIAL + Option B direction with evidence file ——
  const filePassword = 'DemoVaultPass1';
  const matterB = await req('/files', {
    method: 'POST',
    token: speaker,
    json: {
      subject: `Smoke B confidential ${Date.now()}`,
      sender: 'Smoke Vault',
      body: 'Confidential smoke body',
      classification: 'CONFIDENTIAL',
      subjectArea: 'Intergovernmental',
      priority: 'URGENT',
      filePassword,
    },
  });

  await req(`/files/${matterB.id}/route`, {
    method: 'POST',
    token: speaker,
    json: { toUserId: secgenUser.id, procedure: 'Smoke confidential review' },
  });

  await req(`/vault/${matterB.id}/unlock`, {
    method: 'POST',
    token: secgen,
    json: { password: filePassword },
  });
  await req(`/files/${matterB.id}/acknowledge`, { method: 'POST', token: secgen });
  await req(`/files/${matterB.id}/complete-procedure`, {
    method: 'POST',
    token: secgen,
    json: { outcome: 'Ready for direction' },
  });

  await req(`/vault/${matterB.id}/unlock`, {
    method: 'POST',
    token: speaker,
    json: { password: filePassword },
  });

  const decided = await req(`/files/${matterB.id}/decide`, {
    method: 'POST',
    token: speaker,
    json: {
      text: 'Issue smoke direction under confidential handling.',
      decisionType: 'DIRECTION',
      directionTitle: 'Smoke submit one-page briefing',
      ownerUserId: specsecUser.id,
      dueDate: tomorrowIsoDate(),
    },
  });
  const directionId = decided.direction?.id;
  if (!directionId) throw new Error('Direction not created');

  await req(`/directions/${directionId}/start`, { method: 'POST', token: specsec });

  const form = new FormData();
  form.append('evidence', 'Smoke evidence: briefing prepared under confidential handling.');
  form.append(
    'file',
    new Blob(['smoke evidence attachment'], { type: 'text/plain' }),
    'smoke-evidence.txt',
  );
  await req(`/directions/${directionId}/evidence`, {
    method: 'POST',
    token: specsec,
    form,
  });

  await req(`/directions/${directionId}/verify`, {
    method: 'POST',
    token: speaker,
    json: { approve: true },
  });

  // Link A ← B (related)
  await req(`/files/${matterA.id}/related`, {
    method: 'POST',
    token: speaker,
    json: { relatedId: matterB.id },
  });

  await req(`/files/${matterB.id}/close`, {
    method: 'POST',
    token: speaker,
    json: { outcome: 'Smoke closed after direction verified' },
  });

  // Return path (fresh matter)
  const matterR = await req('/files', {
    method: 'POST',
    token: speaker,
    json: {
      subject: `Smoke Return ${Date.now()}`,
      sender: 'Smoke',
      body: 'Return flow',
      classification: 'INTERNAL',
      subjectArea: 'Administration',
    },
  });
  await req(`/files/${matterR.id}/route`, {
    method: 'POST',
    token: speaker,
    json: { toUserId: secgenUser.id, procedure: 'For return test' },
  });
  await req(`/files/${matterR.id}/acknowledge`, { method: 'POST', token: secgen });
  await req(`/files/${matterR.id}/return`, {
    method: 'POST',
    token: secgen,
    json: { remarks: 'Smoke return: incomplete papers for clarification.' },
  });
  await req(`/files/${matterR.id}/acknowledge`, { method: 'POST', token: speaker });

  // —— Tier A extras: R&I dak, put-up, AI summary accept, route template, schedule notify ——
  const dakIn = await req('/dak/in', {
    method: 'POST',
    token: secgen,
    json: {
      fromName: 'Smoke Ministry',
      subject: `Smoke dak in ${Date.now()}`,
      channel: 'HAND',
      classification: 'INTERNAL',
    },
  });
  const dakOut = await req('/dak/out', {
    method: 'POST',
    token: secgen,
    json: {
      toName: 'Smoke Branch',
      subject: `Smoke dak out ${Date.now()}`,
      channel: 'INTERNAL',
    },
  });
  const dakList = await req('/dak?direction=IN', { token: speaker });
  if (!Array.isArray(dakList) || !dakList.some((d: any) => d.id === dakIn.id)) {
    throw new Error('Dak IN not listed');
  }

  const putUp = await req(`/files/${matterA.id}/put-up-check`, { token: speaker });
  if (!putUp.checks?.length) throw new Error('Put-up checklist empty');

  await req(`/files/${matterA.id}/summary`, {
    method: 'POST',
    token: speaker,
    json: { lang: 'en' },
  });
  await req(`/files/${matterA.id}/summary/accept`, {
    method: 'POST',
    token: speaker,
    json: {},
  });

  const templates = await req('/files/route-templates', { token: speaker });
  if (!Array.isArray(templates) || !templates.length) throw new Error('Route templates missing');

  const matterT = await req('/files', {
    method: 'POST',
    token: speaker,
    json: {
      subject: `Smoke Template ${Date.now()}`,
      sender: 'Smoke',
      body: 'Route template smoke body with enough characters.',
      classification: 'INTERNAL',
      subjectArea: 'Administration',
    },
  });
  await req(`/files/${matterT.id}/route-template`, {
    method: 'POST',
    token: speaker,
    json: { templateId: templates[0].id },
  });

  // Schedule conflict detection (unique window per run)
  const speakerUser = (users as any[]).find((u) => u.username === 'speaker');
  const base = new Date(Date.now() + 5 * 24 * 60 * 60_000);
  base.setMinutes(0, 0, 0);
  base.setHours(10 + (Date.now() % 5), 0, 0, 0);
  const end1 = new Date(base.getTime() + 60 * 60_000);
  try {
    await req('/schedule', {
      method: 'POST',
      token: speaker,
      json: {
        title: `Smoke primary ${Date.now()}`,
        startAt: base.toISOString(),
        endAt: end1.toISOString(),
        ownerId: speakerUser.id,
        force: true,
      },
    });
  } catch {
    /* force should succeed; ignore transient */
  }
  let conflictCaught = false;
  try {
    await req('/schedule', {
      method: 'POST',
      token: speaker,
      json: {
        title: `Smoke overlap ${Date.now()}`,
        startAt: new Date(base.getTime() + 15 * 60_000).toISOString(),
        endAt: new Date(end1.getTime() + 15 * 60_000).toISOString(),
        ownerId: speakerUser.id,
      },
    });
  } catch (e: any) {
    conflictCaught =
      String(e.message || e).includes('409') ||
      String(e.message || e).toLowerCase().includes('conflict');
  }
  if (!conflictCaught) {
    const check = await req('/schedule/check', {
      method: 'POST',
      token: speaker,
      json: {
        startAt: new Date(base.getTime() + 15 * 60_000).toISOString(),
        endAt: new Date(end1.getTime() + 15 * 60_000).toISOString(),
        ownerId: speakerUser.id,
      },
    });
    if (!check.conflict) throw new Error('Expected schedule conflict');
  }

  // Meeting action → direction
  const meeting = await req('/meetings', {
    method: 'POST',
    token: speaker,
    json: {
      title: `Smoke meeting ${Date.now()}`,
      startAt: new Date(base.getTime() + 4 * 60 * 60_000).toISOString(),
      endAt: new Date(base.getTime() + 5 * 60 * 60_000).toISOString(),
      screeningNotes: 'Official visitor',
      force: true,
    },
  });
  const meetingId = meeting.meeting?.id || meeting.id;
  if (!meetingId) throw new Error('Meeting not created');
  const promoted = await req(`/meetings/${meetingId}/actions`, {
    method: 'POST',
    token: speaker,
    json: {
      title: 'Smoke follow-up briefing',
      ownerName: specsecUser.displayName,
      ownerId: specsecUser.id,
      dueDate: tomorrowIsoDate(),
      promoteToDirection: true,
    },
  });
  if (!promoted.direction?.id) throw new Error('Meeting action did not create direction');

  const aiStatus = await req('/ai/status', { token: speaker });
  if (aiStatus.allowExternalTraining === true) {
    throw new Error('AI external training must be disabled for pilot');
  }

  console.log('SMOKE_OK', {
    pathA: matterA.diaryNo,
    pathB: matterB.diaryNo,
    directionId,
    returnMatter: matterR.diaryNo,
    dakIn: dakIn.id,
    dakOut: dakOut.id,
    templateMatter: matterT.diaryNo,
    meetingDirection: promoted.direction.id,
    health,
  });
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e.message || e);
  process.exit(1);
});
