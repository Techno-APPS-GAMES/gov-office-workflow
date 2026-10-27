'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { enumLabel, roleTitle, tf } from '@/lib/i18n';

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

function isUrgent(priority?: string) {
  return priority === 'URGENT' || priority === 'VIP' || priority === 'PRIORITY';
}

function displayRef(row: EsignRow) {
  return row.matter?.diaryNo || `ES-${row.id.replace(/\D/g, '').slice(0, 4) || '0000'}`;
}

function SignerCell({ person }: { person?: Person | null }) {
  const { lang } = useAuth();
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
        <div className="muted tiny">{roleTitle(lang, person.role)}</div>
      </div>
    </div>
  );
}

export default function RemotePage() {
  const { user, lang, label } = useAuth();
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
  const [wetInkScan, setWetInkScan] = useState<File | null>(null);
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
      toast.success(label('rm_toastRequested'));
      setShowRequest(false);
      setMatterId('');
      setPurpose('');
      setMethod('LOCAL_PKI');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_requestFailed'));
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
      setWetInkScan(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_previewFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSign() {
    if (!preview) return;
    setBusy(true);
    try {
      if (preview.method === 'WET_INK' && wetInkScan) {
        const fd = new FormData();
        fd.append('confirmHash', preview.documentHash);
        if (wetInkNote.trim()) fd.append('wetInkNote', wetInkNote.trim());
        fd.append('scan', wetInkScan);
        const t = localStorage.getItem('gow_access');
        const res = await fetch(`/api/esign/${preview.id}/sign`, {
          method: 'POST',
          headers: t ? { Authorization: `Bearer ${t}` } : {},
          body: fd,
          credentials: 'include',
        });
        if (!res.ok) throw new Error((await res.text()) || label('rm_signFailed'));
      } else {
        await api(`/esign/${preview.id}/sign`, {
          method: 'POST',
          json: {
            confirmHash: preview.documentHash,
            wetInkNote: preview.method === 'WET_INK' ? wetInkNote : undefined,
          },
        });
      }
      toast.success(
        preview.method === 'WET_INK' ? label('rm_toastWetInk') : label('rm_toastSealed'),
      );
      setPreview(null);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_signFailed'));
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
      toast.success(label('rm_toastDeclined'));
      setDeclineId(null);
      setDeclineReason('');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_declineFailed'));
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
      toast.success(label('rm_toastRevoked'));
      setRevokeId(null);
      setRevokeReason('');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_revokeFailed'));
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
      if (res.valid) toast.success(label('rm_toastVerified'));
      else toast.error(res.reason || label('rm_sealVerifyFailed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('rm_verifyFailed'));
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
    toast.success(label('rm_toastCopied'));
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('rm_eyebrow')}
          </div>
          <h1>{label('rm_title')}</h1>
          <p className="muted">{label('rm_heroSub')}</p>
        </div>
        {canRequest ? (
          <button type="button" className="btn primary" onClick={() => setShowRequest((v) => !v)}>
            {showRequest ? label('rm_closeRequest') : label('remote_request')}
          </button>
        ) : null}
      </div>

      {showRequest && canRequest ? (
        <div className="panel">
          <h2>{label('files_remoteSeal')}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {label('rm_requestHelp')}
          </p>
          <form className="grid-form" onSubmit={requestSeal}>
            <label>
              {label('rm_matter')}
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)} required>
                <option value="">{label('rm_selectMatter')}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('remote_signer')}
              <select value={signerId} onChange={(e) => setSignerId(e.target.value)} required>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                    {p.role ? ` (${roleTitle(lang, p.role)})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('rm_purposeLabel')}
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={label('rm_purposePlaceholder')}
              />
            </label>
            <label>
              {label('rm_sealMethod')}
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as 'LOCAL_PKI' | 'WET_INK')}
              >
                <option value="LOCAL_PKI">{label('rm_methodPkiLong')}</option>
                <option value="WET_INK">{label('rm_methodWetLong')}</option>
              </select>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {label('rm_queueBtn')}
            </button>
          </form>
        </div>
      ) : null}

      {preview ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">{label('remote_preview')}</div>
          <h2>
            {preview.matter.diaryNo}: {preview.matter.subject}
          </h2>
          <p className="muted">
            {label('rm_thCert')}: <code>{preview.certId}</code> · {preview.algorithm} ·{' '}
            {enumLabel(lang, preview.matter.classification)}
            {preview.purpose ? ` · ${preview.purpose}` : ''}
          </p>
          {preview.matter.decisionText ? (
            <div className="remote-decision-box">
              <strong>{label('rm_decisionOnFile')}</strong>
              <p>{preview.matter.decisionText}</p>
            </div>
          ) : null}
          <p className="tiny muted">
            {label('rm_docHash')} <code>{preview.documentHash}</code>
          </p>
          {preview.method === 'WET_INK' ? (
            <>
              <label className="field">
                {label('rm_wetScanUpload')}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setWetInkScan(e.target.files?.[0] || null)}
                />
              </label>
              <label className="field">
                {label('rm_wetNote')}
                <textarea
                  rows={3}
                  value={wetInkNote}
                  onChange={(e) => setWetInkNote(e.target.value)}
                  placeholder={label('rm_wetNotePlaceholder')}
                  required={!wetInkScan}
                  minLength={wetInkScan ? 0 : 40}
                />
              </label>
            </>
          ) : null}
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={busy} onClick={confirmSign}>
              {preview.method === 'WET_INK' ? label('remote_wetInk') : label('remote_sealBtn')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPreview(null)}>
              {label('cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {declineId ? (
        <div className="panel">
          <h2>{label('rm_declineTitle')}</h2>
          <form className="grid-form" onSubmit={submitDecline}>
            <label>
              {label('reason')}
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                minLength={5}
                required
                placeholder={label('rm_declinePlaceholder')}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn" disabled={busy}>
                {label('remote_decline')}
              </button>
              <button type="button" className="btn" onClick={() => setDeclineId(null)}>
                {label('cancel')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {revokeId ? (
        <div className="panel">
          <h2>{label('rm_revokeTitle')}</h2>
          <form className="grid-form" onSubmit={submitRevoke}>
            <label>
              {label('reason')}
              <textarea
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                minLength={5}
                required
                placeholder={label('rm_revokePlaceholder')}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn" disabled={busy}>
                {label('remote_revoke')}
              </button>
              <button type="button" className="btn" onClick={() => setRevokeId(null)}>
                {label('cancel')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel remote-queue-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">{label('rm_queueEyebrow')}</div>
            <h2>{label('rm_queueTitle')}</h2>
            <p className="muted remote-lead">{label('rm_queueLead')}</p>
          </div>
          <span className="remote-pending-badge">
            {tf(lang, 'rm_pendingBadge', { count: pending.length })}
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            {label('rm_emptyQueue')}
          </p>
        ) : (
          <div className="remote-queue">
            {pending.map((r) => {
              const subject = r.matter?.subject || label('rm_untitled');
              const ref = displayRef(r);
              const urgent = isUrgent(r.matter?.priority);
              const isSigner = user?.id === r.signer?.id;
              return (
                <article key={r.id} className="remote-card">
                  <div className="remote-card-top">
                    <span className="remote-ref">{ref}</span>
                    <span className={`remote-urgency ${urgent ? 'urgent' : 'routine'}`}>
                      {urgent ? label('rm_urgent') : label('rm_routine')}
                    </span>
                  </div>
                  <h3>
                    {ref}: {subject}
                  </h3>
                  <div className="remote-meta">
                    <div>
                      <span>{label('remote_method')}</span>
                      <strong>
                        {r.method === 'WET_INK' ? label('rm_methodWet') : label('rm_methodPki')}
                      </strong>
                    </div>
                    <div>
                      <span>{label('rm_signer')}</span>
                      <strong>{r.signer?.displayName || '—'}</strong>
                    </div>
                  </div>
                  {r.purpose ? <p className="muted tiny">{r.purpose}</p> : null}
                  {r.matter?.id ? (
                    <p className="tiny">
                      <Link href={`/files/${r.matter.id}`}>{label('rm_openMatter')}</Link>
                    </p>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn remote-sign-btn"
                      disabled={busy || !isSigner}
                      onClick={() => openPreview(r.id)}
                      title={!isSigner ? label('rm_onlySigner') : undefined}
                    >
                      {label('remote_review')}
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
                        {label('remote_decline')}
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
                        {label('rm_revokeRequest')}
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
            <div className="eyebrow">{label('rm_ledgerEyebrow')}</div>
            <h2>{label('rm_ledgerTitle')}</h2>
          </div>
          <span className="remote-signed-badge">
            {tf(lang, 'rm_signedBadge', { count: signed.length })}
          </span>
        </div>

        <div className="table-wrap">
          <table className="table remote-table">
            <thead>
              <tr>
                <th>{label('rm_thCert')}</th>
                <th>{label('rm_thDoc')}</th>
                <th>{label('rm_signer')}</th>
                <th>{label('rm_thSigned')}</th>
                <th>{label('rm_thSeal')}</th>
                <th>{label('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {signed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {label('rm_noSigned')}
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
                          title={label('rm_copyCert')}
                        >
                          {r.certId}
                        </button>
                        <div className="muted tiny">
                          {r.method === 'WET_INK' ? label('rm_methodWet') : r.algorithm || 'RSA-SHA256'}
                        </div>
                      </td>
                      <td>
                        <div className="remote-doc">
                          <div>
                            <strong>{r.matter?.diaryNo || '—'}</strong>
                            <div className="muted tiny">{r.matter?.subject}</div>
                            {r.matter?.id ? (
                              <Link className="tiny" href={`/files/${r.matter.id}`}>
                                {label('rm_openFile')}
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
                            {verifyingId === r.certId ? label('rm_checking') : label('remote_verify')}
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
                              {label('remote_revoke')}
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
          <div className="eyebrow">{label('rm_closedEyebrow')}</div>
          <h2>{label('rm_closedTitle')}</h2>
          <ul className="action-list">
            {closed.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    {r.certId} · {enumLabel(lang, r.status)}
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
        <div className="eyebrow">{label('rm_lookupEyebrow')}</div>
        <h2>{label('rm_lookupTitle')}</h2>
        <form className="remote-lookup-form" onSubmit={lookup}>
          <label className="remote-lookup-field">
            {label('rm_enterCert')}
            <input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder={label('rm_certPlaceholder')}
              required
            />
          </label>
          <button type="submit" className="btn remote-verify-btn" disabled={!!verifyingId}>
            {label('rm_verifyCert')}
          </button>
        </form>
        {lookupResult ? (
          <div className={`remote-lookup-result ${lookupResult.valid ? 'ok' : 'bad'}`}>
            <strong>{lookupResult.valid ? label('rm_sealValid') : label('rm_sealInvalid')}</strong>
            <p>
              {lookupResult.certId}
              {lookupResult.matter ? ` · ${lookupResult.matter.diaryNo}` : ''}
              {lookupResult.signer ? ` · ${lookupResult.signer.displayName}` : ''}
              {lookupResult.method ? ` · ${enumLabel(lang, lookupResult.method)}` : ''}
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
