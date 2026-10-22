'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { enumLabel, roleTitle, tf } from '@/lib/i18n';

type Tab = 'overview' | 'journey' | 'notes' | 'attachments' | 'letters' | 'related' | 'versions';

const VALID_TABS: Tab[] = [
  'overview',
  'journey',
  'notes',
  'attachments',
  'letters',
  'related',
  'versions',
];

type MatterHit = {
  id: string;
  diaryNo: string;
  subject: string;
  status?: string;
  classification?: string;
};

function MatterDetailInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user, lang, label } = useAuth();
  const toast = useToast();
  const [matter, setMatter] = useState<any>(null);
  const [people, setPeople] = useState<{ id: string; displayName: string }[]>([]);
  const initialTab = (search.get('tab') as Tab) || 'overview';
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab) ? initialTab : 'overview');
  const [routeTo, setRouteTo] = useState('');
  const [procedure, setProcedure] = useState('Examine and advise');
  const [routeDue, setRouteDue] = useState('');
  const [decision, setDecision] = useState({
    text: '',
    decisionType: 'APPROVE',
    directionTitle: '',
    ownerUserId: '',
    dueDate: '',
  });
  const [note, setNote] = useState('');
  const [noteKind, setNoteKind] = useState('NOTE');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnTo, setReturnTo] = useState('');
  const [closeOutcome, setCloseOutcome] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [letter, setLetter] = useState({ recipient: '', text: '' });
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedHits, setRelatedHits] = useState<MatterHit[]>([]);
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [versionText, setVersionText] = useState('');
  const [versionReason, setVersionReason] = useState('');
  const [ocrBusy, setOcrBusy] = useState<string | null>(null);
  const [putUp, setPutUp] = useState<{
    ready: boolean;
    checks: { id: string; label: string; ok: boolean }[];
  } | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string }[]>(
    [],
  );
  const [templateId, setTemplateId] = useState('');
  const [summaryLang, setSummaryLang] = useState<'en' | 'ur'>('en');
  const [summaryEdit, setSummaryEdit] = useState('');
  const [esignSigner, setEsignSigner] = useState('');
  const [esignPurpose, setEsignPurpose] = useState('');
  const [esignMethod, setEsignMethod] = useState<'LOCAL_PKI' | 'WET_INK'>('LOCAL_PKI');
  const [esignBusy, setEsignBusy] = useState(false);

  const load = useCallback(async () => {
    const m = await api<any>(`/files/${id}`);
    setMatter(m);
    setSummaryEdit((prev) => {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active instanceof HTMLTextAreaElement && active.dataset.liveKeep === 'summary') {
        return prev;
      }
      return m.aiSummary || '';
    });
    api<{ ready: boolean; checks: { id: string; label: string; ok: boolean }[] }>(
      `/files/${id}/put-up-check`,
    )
      .then(setPutUp)
      .catch(() => setPutUp(null));
  }, [id]);

  useEffect(() => {
    const t = search.get('tab') as Tab | null;
    if (t && VALID_TABS.includes(t)) setTab(t);
  }, [search]);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
    api<any[]>('/users').then(setPeople).catch(() => undefined);
    api<{ id: string; name: string; description?: string }[]>('/files/route-templates')
      .then((rows) => {
        setTemplates(rows);
        if (rows[0]) setTemplateId(rows[0].id);
      })
      .catch(() => setTemplates([]));
  }, [id, load]);

  useLiveRefresh(load, [load]);

  useEffect(() => {
    const q = relatedQuery.trim();
    if (q.length < 2) {
      setRelatedHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setRelatedBusy(true);
      api<{ matters?: MatterHit[] }>(`/search?q=${encodeURIComponent(q)}`)
        .then((res) => {
          const hits = (res.matters || []).filter((m) => m.id !== id);
          setRelatedHits(hits);
        })
        .catch(() => setRelatedHits([]))
        .finally(() => setRelatedBusy(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [relatedQuery, id]);

  function run(action: () => Promise<unknown>, okMsg: string) {
    return action()
      .then(async () => {
        toast.success(okMsg);
        await load();
      })
      .catch((err) => {
        const msg = String(err.message || err);
        setError(msg);
        toast.error(msg);
      });
  }

  if (!matter) return <p className="muted">{error || label('fd_loadingMatter')}</p>;

  return (
    <>
      <PageHeader
        title={matter.diaryNo}
        subtitle={matter.subject}
        actions={
          <div className="row">
            <span className={`badge ${matter.status}`}>{enumLabel(lang, String(matter.status))}</span>
            <span className={`badge ${matter.classification}`}>
              {enumLabel(lang, matter.classification)}
            </span>
          </div>
        }
      />
      {error && <div className="error panel">{error}</div>}

      <div className="tabs">
        {(
          ['overview', 'journey', 'notes', 'attachments', 'letters', 'related', 'versions'] as Tab[]
        ).map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {label(`fd_tab_${t}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="panel">
            <h2>{label('fd_correspondence')}</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{matter.body}</p>
            {matter.decisionText && (
              <p>
                <strong>{label('files_decision')}:</strong> {enumLabel(lang, matter.decisionType)} —{' '}
                {matter.decisionText}
              </p>
            )}
          </div>

          {putUp && (
            <div className="panel">
              <h2>{label('fd_putUpTitle')}</h2>
              <p className={putUp.ready ? '' : 'error'}>
                {putUp.ready ? label('putUpReady') : label('putUpNotReady')}
              </p>
              <ul className="timeline">
                {putUp.checks.map((c) => (
                  <li key={c.id}>
                    {c.ok ? '✓' : '○'} {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <h2>{label('generateSummary')} / {label('acceptSummary')}</h2>
            <p className="muted">{label('fd_summaryHelp')}</p>
            {matter.aiSummaryAcceptedAt && (
              <p className="muted">
                {tf(lang, 'fd_acceptedAt', {
                  date: new Date(matter.aiSummaryAcceptedAt).toLocaleString(),
                })}
              </p>
            )}
            <textarea
              rows={6}
              data-live-keep="summary"
              value={summaryEdit}
              onChange={(e) => setSummaryEdit(e.target.value)}
              placeholder={label('fd_noSummary')}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select value={summaryLang} onChange={(e) => setSummaryLang(e.target.value as 'en' | 'ur')}>
                <option value="en">{label('files_english')}</option>
                <option value="ur">{label('files_urdu')}</option>
              </select>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  run(
                    () =>
                      api(`/files/${id}/summary`, {
                        method: 'POST',
                        json: { lang: summaryLang },
                      }).then((m: any) => {
                        setSummaryEdit(m.aiSummary || '');
                      }),
                    label('fd_toastSummaryGen'),
                  )
                }
              >
                {label('generateSummary')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  run(
                    () =>
                      api(`/files/${id}/summary/accept`, {
                        method: 'POST',
                        json: { text: summaryEdit },
                      }),
                    label('fd_toastSummaryAccepted'),
                  )
                }
              >
                {label('acceptSummary')}
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>{label('fd_routeTitle')}</h2>
            {templates.length > 0 && (
              <form
                className="row"
                style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () =>
                      api(`/files/${id}/route-template`, {
                        method: 'POST',
                        json: { templateId },
                      }),
                    label('fd_toastTemplate'),
                  );
                }}
              >
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit">
                  {label('routeTemplate')}
                </button>
              </form>
            )}
            <form className="grid-form" onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  api(`/files/${id}/route`, {
                    method: 'POST',
                    json: {
                      toUserId: routeTo,
                      procedure,
                      ...(routeDue ? { dueDate: routeDue } : {}),
                    },
                  }),
                label('fd_toastRouted'),
              );
            }}>
              <div className="field">
                <label>{label('to')}</label>
                <select value={routeTo} onChange={(e) => setRouteTo(e.target.value)} required>
                  <option value="">{label('fd_selectOfficer')}</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{label('fd_procedure')}</label>
                <input value={procedure} onChange={(e) => setProcedure(e.target.value)} required />
              </div>
              <div className="field">
                <label>{label('fd_dueOptional')}</label>
                <input
                  type="date"
                  value={routeDue}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRouteDue(e.target.value)}
                />
              </div>
              <button className="btn primary" type="submit">{label('fd_routeBtn')}</button>
            </form>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => run(() => api(`/files/${id}/acknowledge`, { method: 'POST' }), label('fd_toastAck'))}>
                {label('files_acknowledge')}
              </button>
              <button type="button" className="btn" onClick={() => run(() => api(`/files/${id}/complete-procedure`, { method: 'POST', json: { outcome: 'Procedure complete' } }), label('fd_toastProcComplete'))}>
                {label('files_completeProcedure')}
              </button>
            </div>
            {matter.status !== 'CLOSED' &&
              matter.status !== 'AWAITING_RECEIPT' &&
              (user?.id === matter.holderId || user?.role === 'ADMIN') && (
              <form
                className="grid-form"
                style={{ marginTop: 16, borderTop: '1px solid var(--line, #ddd)', paddingTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api(`/files/${id}/return`, {
                      method: 'POST',
                      json: {
                        remarks: returnRemarks,
                        ...(returnTo ? { toUserId: returnTo } : {}),
                      },
                    });
                    setReturnRemarks('');
                    setReturnTo('');
                  }, label('fd_toastReturned'));
                }}
              >
                <h3 style={{ margin: 0 }}>{label('files_returnFile')}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {label('fd_returnHelp')}
                </p>
                <div className="field">
                  <label>{label('fd_remarksMin')}</label>
                  <textarea
                    rows={3}
                    value={returnRemarks}
                    onChange={(e) => setReturnRemarks(e.target.value)}
                    minLength={10}
                    required
                    placeholder={label('fd_returnPlaceholder')}
                  />
                </div>
                <div className="field">
                  <label>{label('fd_returnToOpt')}</label>
                  <select value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
                    <option value="">{label('fd_prevOfficer')}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.displayName}</option>
                    ))}
                  </select>
                </div>
                <button className="btn" type="submit">{label('fd_returnBtn')}</button>
              </form>
            )}
          </div>
          {(user?.role === 'SPEAKER' || user?.role === 'ADMIN') && (
            <div className="panel">
              <h2>{label('fd_speakerDecision')}</h2>
              <form className="grid-form" onSubmit={(e) => {
                e.preventDefault();
                const payload = {
                  text: decision.text,
                  decisionType: decision.decisionType,
                  ...(decision.decisionType === 'DIRECTION'
                    ? {
                        directionTitle: decision.directionTitle || undefined,
                        ownerUserId: decision.ownerUserId || undefined,
                        dueDate: decision.dueDate || undefined,
                      }
                    : {}),
                };
                run(() => api(`/files/${id}/decide`, { method: 'POST', json: payload }), label('fd_toastDecision'));
              }}>
                <div className="field">
                  <label>{label('files_decisionText')}</label>
                  <textarea value={decision.text} onChange={(e) => setDecision({ ...decision, text: e.target.value })} required />
                </div>
                <div className="field">
                  <label>{label('type')}</label>
                  <select value={decision.decisionType} onChange={(e) => setDecision({ ...decision, decisionType: e.target.value })}>
                    <option value="APPROVE">{enumLabel(lang, 'APPROVE')}</option>
                    <option value="REJECT">{enumLabel(lang, 'REJECT')}</option>
                    <option value="DIRECTION">{enumLabel(lang, 'DIRECTION')}</option>
                    <option value="NO_FURTHER_ACTION">{enumLabel(lang, 'NO_FURTHER_ACTION')}</option>
                  </select>
                </div>
                {decision.decisionType === 'DIRECTION' && (
                  <>
                    <div className="field">
                      <label>{label('fd_directionTitle')}</label>
                      <input
                        value={decision.directionTitle}
                        onChange={(e) => setDecision({ ...decision, directionTitle: e.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>{label('owner')}</label>
                      <select
                        value={decision.ownerUserId}
                        onChange={(e) => setDecision({ ...decision, ownerUserId: e.target.value })}
                        required
                      >
                        <option value="">{label('fd_select')}</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>{label('fd_dueDate')}</label>
                      <input
                        type="date"
                        value={decision.dueDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setDecision({ ...decision, dueDate: e.target.value })}
                        required
                      />
                    </div>
                  </>
                )}
                <button className="btn primary" type="submit">{label('files_recordDecision')}</button>
              </form>
            </div>
          )}
          {(user?.role === 'SPEAKER' ||
            user?.role === 'SECRETARY_GENERAL' ||
            user?.role === 'SPECIAL_SECRETARY' ||
            user?.role === 'ADMIN') &&
            matter.status !== 'CLOSED' && (
            <div className="panel">
              <h2>{label('fd_remoteTitle')}</h2>
              <p className="muted">
                {label('fd_remoteHelp')} {label('fd_continuesIn')}{' '}
                <a href="/remote">{label('fd_remoteStudio')}</a>.
              </p>
              <form
                className="grid-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!esignSigner) return;
                  setEsignBusy(true);
                  try {
                    await api('/esign/request', {
                      method: 'POST',
                      json: {
                        matterId: id,
                        signerId: esignSigner,
                        purpose: esignPurpose.trim() || undefined,
                        method: esignMethod,
                      },
                    });
                    toast.success(label('fd_toastSealRequested'));
                    notifyDataChanged();
                    setEsignPurpose('');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : label('fd_esignFailed'));
                  } finally {
                    setEsignBusy(false);
                  }
                }}
              >
                <div className="field">
                  <label>{label('remote_signer')}</label>
                  <select
                    value={esignSigner}
                    onChange={(e) => setEsignSigner(e.target.value)}
                    required
                  >
                    <option value="">{label('fd_select')}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{label('remote_purpose')}</label>
                  <input
                    value={esignPurpose}
                    onChange={(e) => setEsignPurpose(e.target.value)}
                    placeholder={label('fd_purposePlaceholder')}
                  />
                </div>
                <div className="field">
                  <label>{label('remote_method')}</label>
                  <select
                    value={esignMethod}
                    onChange={(e) => setEsignMethod(e.target.value as 'LOCAL_PKI' | 'WET_INK')}
                  >
                    <option value="LOCAL_PKI">{enumLabel(lang, 'LOCAL_PKI')}</option>
                    <option value="WET_INK">{label('fd_methodWet')}</option>
                  </select>
                </div>
                <button className="btn primary" type="submit" disabled={esignBusy}>
                  {label('files_remoteSeal')}
                </button>
              </form>
            </div>
          )}
          {(user?.role === 'SPEAKER' || user?.role === 'ADMIN') && matter.status !== 'CLOSED' && (
            <div className="panel">
              <h2>{label('files_closeMatter')}</h2>
              <p className="muted">{label('fd_closeHelp')}</p>
              <form
                className="grid-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!window.confirm(tf(lang, 'fd_closeConfirm', { diaryNo: matter.diaryNo }))) return;
                  run(
                    () =>
                      api(`/files/${id}/close`, {
                        method: 'POST',
                        json: { outcome: closeOutcome || 'Matter closed' },
                      }),
                    label('fd_toastClosed'),
                  );
                }}
              >
                <div className="field">
                  <label>{label('fd_outcomeOpt')}</label>
                  <input
                    value={closeOutcome}
                    onChange={(e) => setCloseOutcome(e.target.value)}
                    placeholder={label('fd_outcomePlaceholder')}
                  />
                </div>
                <button className="btn" type="submit">
                  {label('files_closeMatter')}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {tab === 'journey' && (
        <div className="panel">
          <h2>{label('fd_journey')}</h2>
          <ul className="timeline">
            {(matter.journeyEvents || []).map((j: any) => (
              <li key={j.id}>
                <strong>{enumLabel(lang, j.kind)}</strong> — {j.summary}
                <div className="muted">{new Date(j.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          {(matter.routeSteps || []).length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>{label('fd_routeSteps')}</h3>
              <ul className="timeline">
                {matter.routeSteps.map((s: any) => (
                  <li key={s.id}>
                    {s.fromUser?.displayName || '—'} → {s.toUser?.displayName || '—'}
                    <div className="muted">{s.procedure} · {enumLabel(lang, s.status)} · {new Date(s.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="panel">
          <h2>{label('fd_notingSheet')}</h2>
          <p className="muted">{label('fd_notesHelp')}</p>
          <ul className="timeline">
            {(matter.notes || []).map((n: any) => (
              <li key={n.id}>
                <strong>
                  #{n.number}
                  {n.kind && n.kind !== 'NOTE' ? ` · ${enumLabel(lang, String(n.kind))}` : ''}
                </strong>{' '}
                — {n.author?.displayName || label('officer')}
                {n.author?.role ? (
                  <span className="muted"> · {roleTitle(lang, String(n.author.role))}</span>
                ) : null}
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.text}</div>
                <div className="muted">{new Date(n.createdAt).toLocaleString()}</div>
              </li>
            ))}
            {!matter.notes?.length && <li className="muted">{label('fd_noParas')}</li>}
          </ul>
          <form
            className="grid-form"
            style={{ marginTop: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`/files/${id}/notes`, {
                  method: 'POST',
                  json: { text: note, kind: noteKind },
                });
                setNote('');
              }, label('fd_toastPara'));
            }}
          >
            <div className="field">
              <label>{label('fd_kind')}</label>
              <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)}>
                <option value="NOTE">{enumLabel(lang, 'NOTE')}</option>
                <option value="PUT_UP">{enumLabel(lang, 'PUT_UP')}</option>
                <option value="OBSERVATION">{enumLabel(lang, 'OBSERVATION')}</option>
              </select>
            </div>
            <div className="field">
              <label>{label('fd_paraText')}</label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={label('fd_paraPlaceholder')}
                minLength={3}
                required
              />
            </div>
            <button className="btn primary" type="submit">
              {label('fd_addPara')}
            </button>
          </form>
        </div>
      )}

      {tab === 'attachments' && (
        <div className="panel">
          <h2>{label('files_attachments')}</h2>
          <ul className="timeline">
            {(matter.attachments || []).map((a: any) => (
              <li key={a.id}>
                <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <strong style={{ color: 'var(--pine)' }}>{a.fileName}</strong>
                  <span className="muted">
                    {tf(lang, 'fd_bytes', { size: a.sizeBytes.toLocaleString() })}
                  </span>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      try {
                        let reason = '';
                        if (matter.classification === 'CONFIDENTIAL') {
                          reason =
                            window.prompt(
                              label('fd_confPrompt'),
                              'Official review',
                            ) || '';
                          if (reason.trim().length < 5) {
                            toast.error(label('fd_reasonRequired'));
                            return;
                          }
                        }
                        const t = localStorage.getItem('gow_access');
                        const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
                        const res = await fetch(`/api/files/attachments/${a.id}/download${q}`, {
                          headers: t ? { Authorization: `Bearer ${t}` } : {},
                          credentials: 'include',
                        });
                        if (!res.ok) throw new Error(await res.text() || label('fd_downloadFailed'));
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = a.fileName || 'attachment';
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success(label('fd_toastDownload'));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : label('fd_downloadFailed'));
                      }
                    }}
                  >
                    {label('download')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={ocrBusy === a.id}
                    onClick={() => {
                      setOcrBusy(a.id);
                      api<{ ok: boolean; chars?: number; reason?: string; method?: string; preview?: string }>(
                        `/ocr/attachments/${a.id}`,
                        { method: 'POST' },
                      )
                        .then(async (r) => {
                          await load();
                          if (r.ok) {
                            toast.success(
                              tf(lang, 'fd_ocrDone', {
                                method: r.method || 'ok',
                                chars: r.chars || 0,
                              }),
                            );
                          } else {
                            toast.error(r.reason || label('fd_ocrNoText'));
                          }
                        })
                        .catch((err) => {
                          toast.error(err instanceof Error ? err.message : label('fd_ocrFailed'));
                        })
                        .finally(() => setOcrBusy(null));
                    }}
                  >
                    {ocrBusy === a.id
                      ? label('fd_runningOcr')
                      : a.extractedText
                        ? label('fd_rerunOcr')
                        : label('fd_runOcr')}
                  </button>
                </div>
                {a.extractedText ? (
                  <div className="ocr-extract-card">
                    <div className="doc-version-title" style={{ fontSize: '0.95rem' }}>
                      {label('fd_ocrLayer')}
                    </div>
                    <div className="doc-version-reason muted" style={{ marginBottom: 8 }}>
                      {label('fd_ocrSavedNote')}
                    </div>
                    <div className="doc-version-body">
                      {String(a.extractedText).slice(0, 12000)}
                      {String(a.extractedText).length > 12000 ? '\n…' : ''}
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 8 }}>
                    {label('fd_noExtracted')}
                  </p>
                )}
              </li>
            ))}
            {!matter.attachments?.length && <li className="muted">{label('fd_noAttachments')}</li>}
          </ul>
          <form className="row" onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              const t = localStorage.getItem('gow_access');
              const res = await fetch(`/api/files/${id}/attachments`, {
                method: 'POST',
                headers: t ? { Authorization: `Bearer ${t}` } : {},
                body: fd,
                credentials: 'include',
              });
              if (!res.ok) throw new Error(await res.text());
              setFile(null);
              toast.success(label('fd_uploaded'));
              notifyDataChanged();
              await load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : label('fd_uploadFailed'));
            }
          }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn primary" type="submit">{label('upload')}</button>
          </form>
        </div>
      )}

      {tab === 'letters' && (
        <div className="panel">
          <h2>{label('fd_lettersTitle')}</h2>
          <ul className="timeline">
            {(matter.letters || []).map((l: any) => (
              <li key={l.id}>
                <strong>{l.recipient}</strong> — <span className={`badge ${l.status}`}>{enumLabel(lang, l.status)}</span>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{l.text}</div>
                {l.status !== 'DISPATCHED' && (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => run(() => api(`/files/letters/${l.id}/dispatch`, { method: 'POST' }), label('fd_toastDispatched'))}
                  >
                    {label('fd_dispatch')}
                  </button>
                )}
              </li>
            ))}
            {!matter.letters?.length && <li className="muted">{label('fd_noLetters')}</li>}
          </ul>
          <form className="grid-form" style={{ marginTop: 16 }} onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`/files/${id}/letters`, { method: 'POST', json: letter });
              setLetter({ recipient: '', text: '' });
            }, label('fd_toastDrafted'));
          }}>
            <div className="field">
              <label>{label('fd_recipient')}</label>
              <input value={letter.recipient} onChange={(e) => setLetter({ ...letter, recipient: e.target.value })} required />
            </div>
            <div className="field">
              <label>{label('fd_text')}</label>
              <textarea rows={4} value={letter.text} onChange={(e) => setLetter({ ...letter, text: e.target.value })} required />
            </div>
            <button className="btn primary" type="submit">{label('fd_createLetter')}</button>
          </form>
        </div>
      )}

      {tab === 'related' && (
        <div className="panel">
          <h2>{label('files_related')}</h2>
          <ul className="timeline">
            {(matter.relatedFrom || []).map((r: any) => (
              <li key={r.id}>
                <strong>{r.toMatter?.diaryNo}</strong> — {r.toMatter?.subject}
                {r.toMatter?.id ? (
                  <div>
                    <a className="tiny-link" href={`/files/${r.toMatter.id}`}>
                      {label('fd_openArrow')}
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
            {!matter.relatedFrom?.length && <li className="muted">{label('fd_noRelated')}</li>}
          </ul>
          <div className="field" style={{ marginTop: 16 }}>
            <label>{label('fd_searchRelated')}</label>
            <input
              value={relatedQuery}
              onChange={(e) => setRelatedQuery(e.target.value)}
              placeholder={label('fd_typeMin2')}
            />
            {relatedBusy && <p className="muted">{label('fd_searching')}</p>}
          </div>
          {relatedHits.length > 0 && (
            <ul className="timeline" style={{ marginTop: 8 }}>
              {relatedHits.map((hit) => (
                <li key={hit.id}>
                  <strong>{hit.diaryNo}</strong> — {hit.subject}
                  <div className="muted">
                    {hit.classification ? enumLabel(lang, hit.classification) : ''}
                    {hit.status ? ` · ${enumLabel(lang, String(hit.status))}` : ''}
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ marginTop: 6 }}
                    onClick={() =>
                      run(async () => {
                        await api(`/files/${id}/related`, {
                          method: 'POST',
                          json: { relatedId: hit.id },
                        });
                        setRelatedQuery('');
                        setRelatedHits([]);
                      }, label('fd_toastLinked'))
                    }
                  >
                    {label('fd_linkThis')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {relatedQuery.trim().length >= 2 && !relatedBusy && relatedHits.length === 0 && (
            <p className="muted">{label('fd_noMatching')}</p>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <div className="panel doc-versions">
          <div className="doc-versions-head">
            <div>
              <h2 style={{ margin: 0 }}>{label('fd_docsVersions')}</h2>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {label('fd_versionsHelp')}
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const el = document.getElementById('add-working-version');
                el?.scrollIntoView({ behavior: 'smooth' });
                (document.getElementById('version-reason-input') as HTMLInputElement | null)?.focus();
              }}
            >
              {label('fd_addWorkingPlus')}
            </button>
          </div>

          {(matter.versions || []).length === 0 && (
            <p className="muted">{label('fd_noVersions')}</p>
          )}

          {[...(matter.versions || [])]
            .slice()
            .sort(
              (a: any, b: any) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            )
            .map((v: any, idx: number) => {
              const versionLabel =
                v.kind === 'ORIGINAL'
                  ? tf(lang, 'fd_vOriginal', { n: idx + 1 })
                  : v.kind === 'OCR'
                    ? tf(lang, 'fd_vOcr', { n: idx + 1 })
                    : tf(lang, 'fd_vWorking', { n: idx + 1 });
              const when = new Date(v.createdAt).toLocaleString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
              return (
                <article key={v.id} className="doc-version-card">
                  <header className="doc-version-meta">
                    <div className="doc-version-title">{versionLabel}</div>
                    <div className="doc-version-sub">
                      <span>{v.author?.displayName || label('officer')}</span>
                      <span aria-hidden>·</span>
                      <span>{when}</span>
                    </div>
                    {v.reason ? <div className="doc-version-reason">{v.reason}</div> : null}
                    {v.hash ? (
                      <div className="doc-version-hash" title={label('fd_hashTitle')}>
                        {v.hash}
                      </div>
                    ) : null}
                  </header>
                  <div className="doc-version-body">{v.text}</div>
                </article>
              );
            })}

          <form
            id="add-working-version"
            className="grid-form doc-version-add"
            style={{ marginTop: 20 }}
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`/files/${id}/versions`, {
                  method: 'POST',
                  json: { text: versionText, reason: versionReason },
                });
                setVersionText('');
                setVersionReason('');
              }, label('fd_toastVersion'));
            }}
          >
            <h3 style={{ margin: '0 0 8px' }}>{label('fd_addWorking')}</h3>
            <div className="field">
              <label>{label('reason')}</label>
              <input
                id="version-reason-input"
                value={versionReason}
                onChange={(e) => setVersionReason(e.target.value)}
                placeholder={label('fd_reasonPlaceholder')}
                required
              />
            </div>
            <div className="field">
              <label>{label('fd_bodyText')}</label>
              <textarea
                rows={8}
                value={versionText}
                onChange={(e) => setVersionText(e.target.value)}
                placeholder={label('fd_bodyPlaceholder')}
                required
              />
            </div>
            <button className="btn primary" type="submit">
              {label('fd_saveWorking')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function MatterDetailPage() {
  const { label } = useAuth();
  return (
    <Suspense fallback={<p className="muted">{label('fd_loadingMatter')}</p>}>
      <MatterDetailInner />
    </Suspense>
  );
}
