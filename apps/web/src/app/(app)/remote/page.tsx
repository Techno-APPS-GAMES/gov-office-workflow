'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';

type MatterOpt = {
  id: string;
  diaryNo: string;
  subject: string;
  priority?: string;
  status?: string;
};

type Person = { id: string; displayName: string; role?: string };

type EsignRow = {
  id: string;
  certId: string;
  status: string;
  provider?: string;
  signature?: string | null;
  signedAt?: string | null;
  createdAt: string;
  matter?: MatterOpt | null;
  signer?: Person | null;
  requestedBy?: { displayName: string; role?: string } | null;
};

type VerifyResult = {
  valid: boolean;
  certId: string;
  status?: string;
  digest?: string;
  signedAt?: string | null;
  reason?: string;
  signer?: Person | null;
  matter?: { diaryNo: string; subject: string } | null;
};

function roleTitle(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function digestOf(signature?: string | null) {
  if (!signature) return null;
  try {
    const parsed = JSON.parse(signature) as { digest?: string };
    return parsed.digest || null;
  } catch {
    return null;
  }
}

function sealLabel(digest: string | null) {
  if (!digest) return '—';
  return `SHA256:${digest.slice(0, 13)}…`;
}

function fmtSigned(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function inferType(subject: string) {
  const s = subject.toLowerCase();
  if (s.includes('press') || s.includes('release')) return 'Press Release Authorization';
  if (s.includes('greeting') || s.includes('felicit') || s.includes('eid')) return 'Greeting Card Felicitations';
  if (s.includes('direction') || s.includes('verify') || s.includes('cost-benefit')) return 'Direction Verification';
  return 'Matter Authorization';
}

function inferStage(status: string, subject: string) {
  if (status !== 'PENDING') return status.replace(/_/g, ' ');
  const s = subject.toLowerCase();
  if (s.includes('evidence') || s.includes('verify') || s.includes('cost-benefit')) {
    return 'Evidence submitted for signoff';
  }
  return 'Ready for Speaker seal';
}

function urgencyOf(priority?: string) {
  if (priority === 'URGENT' || priority === 'VIP' || priority === 'PRIORITY') return 'Urgent';
  return 'Routine';
}

function displayRef(row: EsignRow) {
  const diary = row.matter?.diaryNo;
  if (diary) return diary;
  return `ES-${row.id.replace(/\D/g, '').slice(0, 4) || '0000'}`;
}

function SignerCell({ person }: { person?: Person | null }) {
  if (!person) return <span className="muted">—</span>;
  const src = roleAvatar(person.role);
  return (
    <div className="remote-signer">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="remote-avatar" />
      ) : (
        <span className="remote-avatar fallback">{person.displayName.slice(0, 1)}</span>
      )}
      <div>
        <strong>{person.displayName}</strong>
        <div className="muted tiny">{roleTitle(person.role)}</div>
      </div>
    </div>
  );
}

export default function RemotePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<EsignRow[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [matterId, setMatterId] = useState('');
  const [signerId, setSignerId] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<VerifyResult | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rows, mats, users] = await Promise.all([
      api<EsignRow[]>('/esign'),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
      api<Person[]>('/users').catch(() => [] as Person[]),
    ]);
    setItems(rows);
    setMatters(mats);
    setPeople(users);
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    if (user?.id && !signerId) setSignerId(user.id);
  }, [user, signerId]);

  const pending = useMemo(
    () => items.filter((r) => r.status === 'PENDING'),
    [items],
  );
  const signed = useMemo(
    () => items.filter((r) => r.status === 'SIGNED'),
    [items],
  );

  async function requestSeal(e: FormEvent) {
    e.preventDefault();
    if (!matterId || !signerId) return;
    setBusy(true);
    try {
      await api('/esign/request', { method: 'POST', json: { matterId, signerId } });
      toast.success('Remote seal requested');
      setShowRequest(false);
      setMatterId('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function signAndSeal(id: string) {
    setBusy(true);
    try {
      await api(`/esign/${id}/sign`, { method: 'POST' });
      toast.success('Document sealed with SHA-256');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign failed');
    } finally {
      setBusy(false);
    }
  }

  async function verifySeal(certId: string) {
    setVerifyingId(certId);
    try {
      const res = await api<VerifyResult>(`/esign/verify?certId=${encodeURIComponent(certId)}`);
      setLookupResult(res);
      setLookupId(certId);
      if (res.valid) toast.success('Seal verified — integrity OK');
      else toast.error(res.reason || 'Seal verification failed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifyingId(null);
    }
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const id = lookupId.trim();
    if (!id) return;
    await verifySeal(id);
  }

  const canRequest =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Remote work & digital E-sign</h1>
          <p className="muted">
            Module 7 — Cryptographic digital signature, urgent off-site approvals, and SHA-256 seal
            verification.
          </p>
        </div>
        {canRequest ? (
          <button type="button" className="btn primary" onClick={() => setShowRequest((v) => !v)}>
            {showRequest ? 'Close request' : '+ Request remote seal'}
          </button>
        ) : null}
      </div>

      {showRequest && canRequest ? (
        <div className="panel">
          <h2>Request remote seal</h2>
          <form className="grid-form" onSubmit={requestSeal}>
            <label>
              Matter
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)} required>
                <option value="">Select matter</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Designated signer
              <select value={signerId} onChange={(e) => setSignerId(e.target.value)} required>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                    {p.role ? ` (${roleTitle(p.role)})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Queue for off-site e-sign
            </button>
          </form>
        </div>
      ) : null}

      <div className="panel remote-queue-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">Urgent off-site approval queue</div>
            <h2>Matters awaiting remote signature & decision</h2>
            <p className="muted remote-lead">
              Remote-enabled officers can review official drafts, executive directives, and urgent
              press dispatches from remote locations with verified digital signing.
            </p>
          </div>
          <span className="remote-pending-badge">
            {pending.length} pending off-site
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            No matters awaiting remote signature. Request a seal above to queue one.
          </p>
        ) : (
          <div className="remote-queue">
            {pending.map((r) => {
              const subject = r.matter?.subject || 'Untitled matter';
              const ref = displayRef(r);
              const urgent = urgencyOf(r.matter?.priority);
              return (
                <article key={r.id} className="remote-card">
                  <div className="remote-card-top">
                    <span className="remote-ref">{ref}</span>
                    <span className={`remote-urgency ${urgent === 'Urgent' ? 'urgent' : 'routine'}`}>
                      {urgent}
                    </span>
                  </div>
                  <h3>
                    {ref}: {subject}
                  </h3>
                  <div className="remote-meta">
                    <div>
                      <span>Type</span>
                      <strong>{inferType(subject)}</strong>
                    </div>
                    <div>
                      <span>Stage</span>
                      <strong>{inferStage(r.status, subject)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn remote-sign-btn"
                    disabled={busy || user?.id !== r.signer?.id}
                    onClick={() => signAndSeal(r.id)}
                    title={
                      user?.id !== r.signer?.id ? 'Only the designated signer can seal' : undefined
                    }
                  >
                    ✎ E-Sign & Seal Document
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel remote-ledger-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">Cryptographic verification ledger</div>
            <h2>Signed documents & certificate archive</h2>
          </div>
          <span className="remote-signed-badge">{signed.length} signed certificates</span>
        </div>

        <div className="table-wrap">
          <table className="table remote-table">
            <thead>
              <tr>
                <th>Certificate ID</th>
                <th>Document / Matter</th>
                <th>Signer</th>
                <th>Signed timestamp</th>
                <th>SHA-256 digital seal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {signed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No signed certificates yet.
                  </td>
                </tr>
              ) : (
                signed.map((r) => {
                  const digest = digestOf(r.signature);
                  return (
                    <tr key={r.id}>
                      <td className="remote-cert">{r.certId}</td>
                      <td>
                        <div className="remote-doc">
                          <span className="remote-doc-icon" aria-hidden>
                            📄
                          </span>
                          <div>
                            <strong>{r.matter?.diaryNo || '—'}</strong>
                            <div className="muted tiny">{r.matter?.subject}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <SignerCell person={r.signer} />
                      </td>
                      <td>{fmtSigned(r.signedAt)}</td>
                      <td>
                        <code className="remote-seal">{sealLabel(digest)}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn remote-verify-btn"
                          disabled={verifyingId === r.certId}
                          onClick={() => verifySeal(r.certId)}
                        >
                          {verifyingId === r.certId ? 'Checking…' : 'Verify seal'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel remote-lookup-panel">
        <div className="eyebrow">Certificate lookup tool</div>
        <h2>Verify digital seal integrity</h2>
        <form className="remote-lookup-form" onSubmit={lookup}>
          <label className="remote-lookup-field">
            Enter Certificate ID
            <input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Paste a Certificate ID from the ledger"
              required
            />
          </label>
          <button type="submit" className="btn remote-verify-btn" disabled={!!verifyingId}>
            Verify certificate →
          </button>
        </form>
        {lookupResult ? (
          <div className={`remote-lookup-result ${lookupResult.valid ? 'ok' : 'bad'}`}>
            <strong>{lookupResult.valid ? 'Seal valid' : 'Seal invalid'}</strong>
            <p>
              {lookupResult.certId}
              {lookupResult.matter ? ` · ${lookupResult.matter.diaryNo}` : ''}
              {lookupResult.signer ? ` · ${lookupResult.signer.displayName}` : ''}
            </p>
            <p className="muted">{lookupResult.reason}</p>
            {lookupResult.digest ? (
              <code className="remote-seal">SHA256:{lookupResult.digest}</code>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
