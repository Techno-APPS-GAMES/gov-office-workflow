'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

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
  method?: string;
  purpose?: string | null;
  documentHash?: string | null;
  algorithm?: string | null;
  provider?: string;
  signature?: string | null;
  signedAt?: string | null;
  createdAt: string;
  declineReason?: string | null;
  revokeReason?: string | null;
  wetInkNote?: string | null;
  matter?: MatterOpt | null;
  signer?: Person | null;
  requestedBy?: { displayName: string; role?: string } | null;
};

type VerifyResult = {
  valid: boolean;
  certId: string;
  status?: string;
  method?: string;
  algorithm?: string;
  digest?: string;
  signedAt?: string | null;
  reason?: string;
  purpose?: string | null;
  signer?: Person | null;
  matter?: { diaryNo: string; subject: string } | null;
};

type Preview = {
  id: string;
  certId: string;
  method: string;
  purpose?: string | null;
  documentHash: string;
  algorithm: string;
  matter: {
    diaryNo: string;
    subject: string;
    classification: string;
    decisionText?: string | null;
    status: string;
  };
};

function roleTitle(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function digestOf(row: EsignRow) {
  if (row.documentHash) return row.documentHash;
  if (!row.signature) return null;
  try {
    const parsed = JSON.parse(row.signature) as { digest?: string };
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

function urgencyOf(priority?: string) {
  if (priority === 'URGENT' || priority === 'VIP' || priority === 'PRIORITY') return 'Urgent';
  return 'Routine';
}

function displayRef(row: EsignRow) {
  return row.matter?.diaryNo || `ES-${row.id.replace(/\D/g, '').slice(0, 4) || '0000'}`;
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
  const [purpose, setPurpose] = useState('');
  const [method, setMethod] = useState<'LOCAL_PKI' | 'WET_INK'>('LOCAL_PKI');
  const [showRequest, setShowRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<VerifyResult | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [wetInkNote, setWetInkNote] = useState('');
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const load = useCallback(async () => {
    const [rows, mats, users] = await Promise.all([
      api<EsignRow[]>('/esign'),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
      api<Person[]>('/users').catch(() => [] as Person[]),
    ]);
    setItems(rows);
    setMatters(mats.filter((m) => m.status !== 'CLOSED'));
    setPeople(users);
  }, []);

  useLiveRefresh(load, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    if (user?.id && !signerId) setSignerId(user.id);
  }, [user, signerId]);

  const pending = useMemo(() => items.filter((r) => r.status === 'PENDING'), [items]);
  const signed = useMemo(() => items.filter((r) => r.status === 'SIGNED'), [items]);
  const closed = useMemo(
    () => items.filter((r) => r.status === 'REVOKED' || r.status === 'DECLINED'),
    [items],
  );

  const canRequest =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'SPECIAL_SECRETARY' ||
    user?.role === 'ADMIN';

  const canRevoke =
    user?.role === 'SPEAKER' || user?.role === 'ADMIN' || user?.role === 'DG_IT';

  async function requestSeal(e: FormEvent) {
    e.preventDefault();
    if (!matterId || !signerId) return;
    setBusy(true);
    try {
      await api('/esign/request', {
        method: 'POST',
        json: { matterId, signerId, purpose: purpose.trim() || undefined, method },
      });
      toast.success('Remote seal requested — signer notified');
      setShowRequest(false);
      setMatterId('');
      setPurpose('');
      setMethod('LOCAL_PKI');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(id: string) {
    setBusy(true);
    try {
      const p = await api<Preview>(`/esign/${id}/preview`);
      setPreview(p);
      setWetInkNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSign() {
    if (!preview) return;
    setBusy(true);
    try {
      await api(`/esign/${preview.id}/sign`, {
        method: 'POST',
        json: {
          confirmHash: preview.documentHash,
          wetInkNote: preview.method === 'WET_INK' ? wetInkNote : undefined,
        },
      });
      toast.success(
        preview.method === 'WET_INK' ? 'Wet-ink seal recorded' : 'Document sealed (RSA-SHA256)',
      );
      setPreview(null);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitDecline(e: FormEvent) {
    e.preventDefault();
    if (!declineId) return;
    setBusy(true);
    try {
      await api(`/esign/${declineId}/decline`, {
        method: 'POST',
        json: { reason: declineReason },
      });
      toast.success('Seal request declined');
      setDeclineId(null);
      setDeclineReason('');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decline failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitRevoke(e: FormEvent) {
    e.preventDefault();
    if (!revokeId) return;
    setBusy(true);
    try {
      await api(`/esign/${revokeId}/revoke`, {
        method: 'POST',
        json: { reason: revokeReason },
      });
      toast.success('Certificate revoked');
      setRevokeId(null);
      setRevokeReason('');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
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
      if (res.valid) toast.success('Seal verified');
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

  function copyCert(certId: string) {
    void navigator.clipboard?.writeText(certId);
    toast.success('Certificate ID copied');
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · REMOTE APPROVAL
          </div>
          <h1>Remote work &amp; digital E-sign</h1>
          <p className="muted">
            Secure remote review and approval (consultation §3.5): RSA-SHA256 local seal, wet-ink
            scan path, certificate verify, and full audit trail. Accredited ECAC PKI is a later
            production connector.
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
          <p className="muted" style={{ marginTop: 0 }}>
            Queues the matter for the designated officer. They receive an inbox notice and must
            review the sealed payload before signing.
          </p>
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
            <label>
              Purpose / what to approve
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Approve put-up for Speaker seal / despatch authority"
              />
            </label>
            <label>
              Seal method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as 'LOCAL_PKI' | 'WET_INK')}
              >
                <option value="LOCAL_PKI">Local PKI (RSA-SHA256 cryptographic seal)</option>
                <option value="WET_INK">Wet-ink scan (manual authenticity path)</option>
              </select>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Queue for off-site e-sign
            </button>
          </form>
        </div>
      ) : null}

      {preview ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">Review before seal</div>
          <h2>
            {preview.matter.diaryNo}: {preview.matter.subject}
          </h2>
          <p className="muted">
            Cert <code>{preview.certId}</code> · {preview.algorithm} ·{' '}
            {preview.matter.classification}
            {preview.purpose ? ` · ${preview.purpose}` : ''}
          </p>
          {preview.matter.decisionText ? (
            <div className="remote-decision-box">
              <strong>Decision text on file</strong>
              <p>{preview.matter.decisionText}</p>
            </div>
          ) : null}
          <p className="tiny muted">
            Document hash (confirm): <code>{preview.documentHash}</code>
          </p>
          {preview.method === 'WET_INK' ? (
            <label className="field">
              Wet-ink scan note (required)
              <textarea
                rows={3}
                value={wetInkNote}
                onChange={(e) => setWetInkNote(e.target.value)}
                placeholder="Describe physical signature page / scan reference"
                required
                minLength={8}
              />
            </label>
          ) : null}
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={busy} onClick={confirmSign}>
              {preview.method === 'WET_INK' ? 'Record wet-ink seal' : 'E-Sign & Seal Document'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {declineId ? (
        <div className="panel">
          <h2>Decline seal request</h2>
          <form className="grid-form" onSubmit={submitDecline}>
            <label>
              Reason
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                minLength={5}
                required
                placeholder="Why this cannot be sealed now"
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn" disabled={busy}>
                Decline
              </button>
              <button type="button" className="btn" onClick={() => setDeclineId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {revokeId ? (
        <div className="panel">
          <h2>Revoke certificate</h2>
          <form className="grid-form" onSubmit={submitRevoke}>
            <label>
              Reason
              <textarea
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                minLength={5}
                required
                placeholder="Superseded / issued in error / authority withdrawn"
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn" disabled={busy}>
                Revoke
              </button>
              <button type="button" className="btn" onClick={() => setRevokeId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel remote-queue-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">Urgent off-site approval queue</div>
            <h2>Matters awaiting remote signature</h2>
            <p className="muted remote-lead">
              Designated officers review official drafts from remote locations and apply a verified
              digital seal (or wet-ink confirmation) through official channels only.
            </p>
          </div>
          <span className="remote-pending-badge">{pending.length} pending off-site</span>
        </div>

        {pending.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            No matters awaiting remote signature. Request a seal above, or from a matter page.
          </p>
        ) : (
          <div className="remote-queue">
            {pending.map((r) => {
              const subject = r.matter?.subject || 'Untitled matter';
              const ref = displayRef(r);
              const urgent = urgencyOf(r.matter?.priority);
              const isSigner = user?.id === r.signer?.id;
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
                      <span>Method</span>
                      <strong>{r.method === 'WET_INK' ? 'Wet-ink' : 'Local PKI'}</strong>
                    </div>
                    <div>
                      <span>Signer</span>
                      <strong>{r.signer?.displayName || '—'}</strong>
                    </div>
                  </div>
                  {r.purpose ? <p className="muted tiny">{r.purpose}</p> : null}
                  {r.matter?.id ? (
                    <p className="tiny">
                      <Link href={`/files/${r.matter.id}`}>Open matter →</Link>
                    </p>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn remote-sign-btn"
                      disabled={busy || !isSigner}
                      onClick={() => openPreview(r.id)}
                      title={!isSigner ? 'Only the designated signer can seal' : undefined}
                    >
                      Review &amp; seal
                    </button>
                    {isSigner ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                          setDeclineId(r.id);
                          setDeclineReason('');
                        }}
                      >
                        Decline
                      </button>
                    ) : null}
                    {canRevoke ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                          setRevokeId(r.id);
                          setRevokeReason('');
                        }}
                      >
                        Revoke request
                      </button>
                    ) : null}
                  </div>
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
            <h2>Signed documents &amp; certificate archive</h2>
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
                <th>Signed</th>
                <th>Seal</th>
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
                  const digest = digestOf(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <button
                          type="button"
                          className="remote-cert linkish"
                          onClick={() => copyCert(r.certId)}
                          title="Copy certificate ID"
                        >
                          {r.certId}
                        </button>
                        <div className="muted tiny">
                          {r.method === 'WET_INK' ? 'Wet-ink' : r.algorithm || 'RSA-SHA256'}
                        </div>
                      </td>
                      <td>
                        <div className="remote-doc">
                          <div>
                            <strong>{r.matter?.diaryNo || '—'}</strong>
                            <div className="muted tiny">{r.matter?.subject}</div>
                            {r.matter?.id ? (
                              <Link className="tiny" href={`/files/${r.matter.id}`}>
                                Open file
                              </Link>
                            ) : null}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            className="btn remote-verify-btn"
                            disabled={verifyingId === r.certId}
                            onClick={() => verifySeal(r.certId)}
                          >
                            {verifyingId === r.certId ? 'Checking…' : 'Verify seal'}
                          </button>
                          {canRevoke ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                setRevokeId(r.id);
                                setRevokeReason('');
                              }}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {closed.length > 0 ? (
        <div className="panel">
          <div className="eyebrow">Closed requests</div>
          <h2>Declined / revoked</h2>
          <ul className="action-list">
            {closed.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    {r.certId} · {r.status}
                  </strong>
                  <div className="muted">
                    {r.matter?.diaryNo} — {r.declineReason || r.revokeReason || '—'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel remote-lookup-panel">
        <div className="eyebrow">Certificate lookup</div>
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
              {lookupResult.method ? ` · ${lookupResult.method}` : ''}
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
