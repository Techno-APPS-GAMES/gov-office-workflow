'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

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
  const { user, label } = useAuth();
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

  if (!matter) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <>
      <PageHeader
        title={matter.diaryNo}
        subtitle={matter.subject}
        actions={
          <div className="row">
            <span className={`badge ${matter.status}`}>{String(matter.status).replace(/_/g, ' ')}</span>
            <span className={`badge ${matter.classification}`}>{matter.classification}</span>
          </div>
        }
      />
      {error && <div className="error panel">{error}</div>}

      <div className="tabs">
        {(
          ['overview', 'journey', 'notes', 'attachments', 'letters', 'related', 'versions'] as Tab[]
        ).map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="panel">
            <h2>Correspondence</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{matter.body}</p>
            {matter.decisionText && (
              <p><strong>Decision:</strong> {matter.decisionType} — {matter.decisionText}</p>
            )}
          </div>

          {putUp && (
            <div className="panel">
              <h2>Speaker put-up checklist</h2>
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
            <p className="muted">
              EN/UR summary for the demo scenario. Not official until Accept (human review).
            </p>
            {matter.aiSummaryAcceptedAt && (
              <p className="muted">
                Accepted {new Date(matter.aiSummaryAcceptedAt).toLocaleString()}
              </p>
            )}
            <textarea
              rows={6}
              data-live-keep="summary"
              value={summaryEdit}
              onChange={(e) => setSummaryEdit(e.target.value)}
              placeholder="No summary yet"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select value={summaryLang} onChange={(e) => setSummaryLang(e.target.value as 'en' | 'ur')}>
                <option value="en">English</option>
                <option value="ur">اردو</option>
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
                    'Summary generated — review then Accept',
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
                    'Summary accepted',
                  )
                }
              >
                {label('acceptSummary')}
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Route / procedure</h2>
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
                    'Template applied',
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
                'Routed',
              );
            }}>
              <div className="field">
                <label>To</label>
                <select value={routeTo} onChange={(e) => setRouteTo(e.target.value)} required>
                  <option value="">Select officer</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Procedure</label>
                <input value={procedure} onChange={(e) => setProcedure(e.target.value)} required />
              </div>
              <div className="field">
                <label>Due date (optional)</label>
                <input
                  type="date"
                  value={routeDue}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRouteDue(e.target.value)}
                />
              </div>
              <button className="btn primary" type="submit">Route</button>
            </form>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => run(() => api(`/files/${id}/acknowledge`, { method: 'POST' }), 'Acknowledged')}>
                Acknowledge receipt
              </button>
              <button type="button" className="btn" onClick={() => run(() => api(`/files/${id}/complete-procedure`, { method: 'POST', json: { outcome: 'Procedure complete' } }), 'Procedure complete')}>
                Complete procedure
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
                  }, 'Returned with remarks');
                }}
              >
                <h3 style={{ margin: 0 }}>Return with remarks</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Send the file back to the previous officer (or choose one). They must acknowledge receipt.
                </p>
                <div className="field">
                  <label>Remarks (min 10 characters)</label>
                  <textarea
                    rows={3}
                    value={returnRemarks}
                    onChange={(e) => setReturnRemarks(e.target.value)}
                    minLength={10}
                    required
                    placeholder="Reason for return, e.g. incomplete briefing / clarification needed"
                  />
                </div>
                <div className="field">
                  <label>Return to (optional — defaults to previous holder)</label>
                  <select value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
                    <option value="">Previous officer</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.displayName}</option>
                    ))}
                  </select>
                </div>
                <button className="btn" type="submit">Return file</button>
              </form>
            )}
          </div>
          {(user?.role === 'SPEAKER' || user?.role === 'ADMIN') && (
            <div className="panel">
              <h2>Speaker decision</h2>
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
                run(() => api(`/files/${id}/decide`, { method: 'POST', json: payload }), 'Decision recorded');
              }}>
                <div className="field">
                  <label>Decision text</label>
                  <textarea value={decision.text} onChange={(e) => setDecision({ ...decision, text: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select value={decision.decisionType} onChange={(e) => setDecision({ ...decision, decisionType: e.target.value })}>
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                    <option value="DIRECTION">Direction</option>
                    <option value="NO_FURTHER_ACTION">No further action</option>
                  </select>
                </div>
                {decision.decisionType === 'DIRECTION' && (
                  <>
                    <div className="field">
                      <label>Direction title</label>
                      <input
                        value={decision.directionTitle}
                        onChange={(e) => setDecision({ ...decision, directionTitle: e.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Owner</label>
                      <select
                        value={decision.ownerUserId}
                        onChange={(e) => setDecision({ ...decision, ownerUserId: e.target.value })}
                        required
                      >
                        <option value="">Select</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Due date</label>
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
                <button className="btn primary" type="submit">Record decision</button>
              </form>
            </div>
          )}
          {(user?.role === 'SPEAKER' || user?.role === 'ADMIN') && matter.status !== 'CLOSED' && (
            <div className="panel">
              <h2>Close matter</h2>
              <p className="muted">
                Close only after linked directions are verified. Open directions will block closure.
              </p>
              <form
                className="grid-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!window.confirm(`Close ${matter.diaryNo}? This archives the file.`)) return;
                  run(
                    () =>
                      api(`/files/${id}/close`, {
                        method: 'POST',
                        json: { outcome: closeOutcome || 'Matter closed' },
                      }),
                    'Matter closed',
                  );
                }}
              >
                <div className="field">
                  <label>Outcome (optional)</label>
                  <input
                    value={closeOutcome}
                    onChange={(e) => setCloseOutcome(e.target.value)}
                    placeholder="Final outcome note"
                  />
                </div>
                <button className="btn" type="submit">
                  Close matter
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {tab === 'journey' && (
        <div className="panel">
          <h2>Journey</h2>
          <ul className="timeline">
            {(matter.journeyEvents || []).map((j: any) => (
              <li key={j.id}>
                <strong>{j.kind}</strong> — {j.summary}
                <div className="muted">{new Date(j.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          {(matter.routeSteps || []).length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Route steps</h3>
              <ul className="timeline">
                {matter.routeSteps.map((s: any) => (
                  <li key={s.id}>
                    {s.fromUser?.displayName || '—'} → {s.toUser?.displayName || '—'}
                    <div className="muted">{s.procedure} · {s.status} · {new Date(s.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="panel">
          <h2>Noting sheet</h2>
          <p className="muted">
            Numbered paragraphs are append-only. Once saved, a note cannot be edited or deleted.
          </p>
          <ul className="timeline">
            {(matter.notes || []).map((n: any) => (
              <li key={n.id}>
                <strong>
                  #{n.number}
                  {n.kind && n.kind !== 'NOTE' ? ` · ${String(n.kind).replace(/_/g, ' ')}` : ''}
                </strong>{' '}
                — {n.author?.displayName || 'Officer'}
                {n.author?.role ? (
                  <span className="muted"> · {String(n.author.role).replace(/_/g, ' ')}</span>
                ) : null}
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.text}</div>
                <div className="muted">{new Date(n.createdAt).toLocaleString()}</div>
              </li>
            ))}
            {!matter.notes?.length && <li className="muted">No noting paras yet.</li>}
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
              }, 'Para added');
            }}
          >
            <div className="field">
              <label>Kind</label>
              <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)}>
                <option value="NOTE">Note</option>
                <option value="PUT_UP">Put up</option>
                <option value="OBSERVATION">Observation</option>
              </select>
            </div>
            <div className="field">
              <label>Paragraph text</label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add noting paragraph"
                minLength={3}
                required
              />
            </div>
            <button className="btn primary" type="submit">
              Add para
            </button>
          </form>
        </div>
      )}

      {tab === 'attachments' && (
        <div className="panel">
          <h2>Attachments</h2>
          <ul className="timeline">
            {(matter.attachments || []).map((a: any) => (
              <li key={a.id}>
                <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <strong style={{ color: 'var(--pine)' }}>{a.fileName}</strong>
                  <span className="muted">({a.sizeBytes.toLocaleString()} bytes)</span>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      try {
                        let reason = '';
                        if (matter.classification === 'CONFIDENTIAL') {
                          reason =
                            window.prompt(
                              'Confidential download — enter reason (min 5 characters):',
                              'Official review',
                            ) || '';
                          if (reason.trim().length < 5) {
                            toast.error('Reason required for confidential download');
                            return;
                          }
                        }
                        const t = localStorage.getItem('gow_access');
                        const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
                        const res = await fetch(`/api/files/attachments/${a.id}/download${q}`, {
                          headers: t ? { Authorization: `Bearer ${t}` } : {},
                          credentials: 'include',
                        });
                        if (!res.ok) throw new Error(await res.text() || 'Download failed');
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = a.fileName || 'attachment';
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success('Download started');
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Download failed');
                      }
                    }}
                  >
                    Download
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
                              `OCR complete (${r.method || 'ok'}) · ${r.chars || 0} characters`,
                            );
                          } else {
                            toast.error(r.reason || 'OCR found no text');
                          }
                        })
                        .catch((err) => {
                          toast.error(err instanceof Error ? err.message : 'OCR failed');
                        })
                        .finally(() => setOcrBusy(null));
                    }}
                  >
                    {ocrBusy === a.id ? 'Running OCR…' : a.extractedText ? 'Re-run OCR' : 'Run OCR'}
                  </button>
                </div>
                {a.extractedText ? (
                  <div className="ocr-extract-card">
                    <div className="doc-version-title" style={{ fontSize: '0.95rem' }}>
                      OCR text layer
                    </div>
                    <div className="doc-version-reason muted" style={{ marginBottom: 8 }}>
                      Also saved under Documents &amp; versions · use Re-run OCR after layout fix
                    </div>
                    <div className="doc-version-body">
                      {String(a.extractedText).slice(0, 12000)}
                      {String(a.extractedText).length > 12000 ? '\n…' : ''}
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 8 }}>
                    No extracted text yet — use Run OCR for PDFs and images.
                  </p>
                )}
              </li>
            ))}
            {!matter.attachments?.length && <li className="muted">No attachments</li>}
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
              toast.success('Uploaded');
              notifyDataChanged();
              await load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Upload failed');
            }
          }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn primary" type="submit">Upload</button>
          </form>
        </div>
      )}

      {tab === 'letters' && (
        <div className="panel">
          <h2>Letters</h2>
          <ul className="timeline">
            {(matter.letters || []).map((l: any) => (
              <li key={l.id}>
                <strong>{l.recipient}</strong> — <span className={`badge ${l.status}`}>{l.status}</span>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{l.text}</div>
                {l.status !== 'DISPATCHED' && (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => run(() => api(`/files/letters/${l.id}/dispatch`, { method: 'POST' }), 'Letter dispatched')}
                  >
                    Dispatch
                  </button>
                )}
              </li>
            ))}
            {!matter.letters?.length && <li className="muted">No letters yet</li>}
          </ul>
          <form className="grid-form" style={{ marginTop: 16 }} onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`/files/${id}/letters`, { method: 'POST', json: letter });
              setLetter({ recipient: '', text: '' });
            }, 'Letter drafted');
          }}>
            <div className="field">
              <label>Recipient</label>
              <input value={letter.recipient} onChange={(e) => setLetter({ ...letter, recipient: e.target.value })} required />
            </div>
            <div className="field">
              <label>Text</label>
              <textarea rows={4} value={letter.text} onChange={(e) => setLetter({ ...letter, text: e.target.value })} required />
            </div>
            <button className="btn primary" type="submit">Create letter</button>
          </form>
        </div>
      )}

      {tab === 'related' && (
        <div className="panel">
          <h2>Related matters</h2>
          <ul className="timeline">
            {(matter.relatedFrom || []).map((r: any) => (
              <li key={r.id}>
                <strong>{r.toMatter?.diaryNo}</strong> — {r.toMatter?.subject}
                {r.toMatter?.id ? (
                  <div>
                    <a className="tiny-link" href={`/files/${r.toMatter.id}`}>
                      Open →
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
            {!matter.relatedFrom?.length && <li className="muted">No related links</li>}
          </ul>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Search diary number or subject</label>
            <input
              value={relatedQuery}
              onChange={(e) => setRelatedQuery(e.target.value)}
              placeholder="Type at least 2 characters…"
            />
            {relatedBusy && <p className="muted">Searching…</p>}
          </div>
          {relatedHits.length > 0 && (
            <ul className="timeline" style={{ marginTop: 8 }}>
              {relatedHits.map((hit) => (
                <li key={hit.id}>
                  <strong>{hit.diaryNo}</strong> — {hit.subject}
                  <div className="muted">
                    {hit.classification || ''}
                    {hit.status ? ` · ${String(hit.status).replace(/_/g, ' ')}` : ''}
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
                      }, 'Linked')
                    }
                  >
                    Link this matter
                  </button>
                </li>
              ))}
            </ul>
          )}
          {relatedQuery.trim().length >= 2 && !relatedBusy && relatedHits.length === 0 && (
            <p className="muted">No matching matters you can see.</p>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <div className="panel doc-versions">
          <div className="doc-versions-head">
            <div>
              <h2 style={{ margin: 0 }}>Documents &amp; versions</h2>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                The original text is preserved. Each working version has a reason, author, time and
                fingerprint. Decisions cite the version used.
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
              + Add working version
            </button>
          </div>

          {(matter.versions || []).length === 0 && (
            <p className="muted">No document versions yet. Register text or run OCR on an attachment.</p>
          )}

          {[...(matter.versions || [])]
            .slice()
            .sort(
              (a: any, b: any) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            )
            .map((v: any, idx: number) => {
              const label =
                v.kind === 'ORIGINAL'
                  ? `V${idx + 1} · Original`
                  : v.kind === 'OCR'
                    ? `V${idx + 1} · OCR layer`
                    : `V${idx + 1} · Working`;
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
                    <div className="doc-version-title">{label}</div>
                    <div className="doc-version-sub">
                      <span>{v.author?.displayName || 'Officer'}</span>
                      <span aria-hidden>·</span>
                      <span>{when}</span>
                    </div>
                    {v.reason ? <div className="doc-version-reason">{v.reason}</div> : null}
                    {v.hash ? (
                      <div className="doc-version-hash" title="SHA-256 fingerprint">
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
              }, 'Version saved');
            }}
          >
            <h3 style={{ margin: '0 0 8px' }}>Add working version</h3>
            <div className="field">
              <label>Reason</label>
              <input
                id="version-reason-input"
                value={versionReason}
                onChange={(e) => setVersionReason(e.target.value)}
                placeholder="e.g. Revised after Sec Gen note"
                required
              />
            </div>
            <div className="field">
              <label>Body text</label>
              <textarea
                rows={8}
                value={versionText}
                onChange={(e) => setVersionText(e.target.value)}
                placeholder="Updated correspondence / OCR-corrected text"
                required
              />
            </div>
            <button className="btn primary" type="submit">
              Save working version
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function MatterDetailPage() {
  return (
    <Suspense fallback={<p className="muted">Loading matter…</p>}>
      <MatterDetailInner />
    </Suspense>
  );
}
