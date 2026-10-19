'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';

type Tab = 'overview' | 'journey' | 'notes' | 'attachments' | 'letters' | 'related';

const VALID_TABS: Tab[] = ['overview', 'journey', 'notes', 'attachments', 'letters', 'related'];

function MatterDetailInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const [matter, setMatter] = useState<any>(null);
  const [people, setPeople] = useState<{ id: string; displayName: string }[]>([]);
  const initialTab = (search.get('tab') as Tab) || 'overview';
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab) ? initialTab : 'overview');
  const [routeTo, setRouteTo] = useState('');
  const [procedure, setProcedure] = useState('Examine and advise');
  const [decision, setDecision] = useState({ text: '', decisionType: 'APPROVE', directionTitle: '', ownerUserId: '' });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [letter, setLetter] = useState({ recipient: '', text: '' });
  const [relatedId, setRelatedId] = useState('');
  const [ocrBusy, setOcrBusy] = useState<string | null>(null);

  async function load() {
    setMatter(await api(`/files/${id}`));
  }

  useEffect(() => {
    const t = search.get('tab') as Tab | null;
    if (t && VALID_TABS.includes(t)) setTab(t);
  }, [search]);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
    api<any[]>('/users').then(setPeople).catch(() => undefined);
  }, [id]);

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
        {(['overview', 'journey', 'notes', 'attachments', 'letters', 'related'] as Tab[]).map((t) => (
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
          <div className="panel">
            <h2>Route / procedure</h2>
            <form className="grid-form" onSubmit={(e) => {
              e.preventDefault();
              run(
                () => api(`/files/${id}/route`, { method: 'POST', json: { toUserId: routeTo, procedure } }),
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
                      <input value={decision.directionTitle} onChange={(e) => setDecision({ ...decision, directionTitle: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Owner</label>
                      <select value={decision.ownerUserId} onChange={(e) => setDecision({ ...decision, ownerUserId: e.target.value })}>
                        <option value="">Select</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <button className="btn primary" type="submit">Record decision</button>
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
          <h2>Notes</h2>
          <ul className="timeline">
            {(matter.notes || []).map((n: any) => (
              <li key={n.id}>#{n.number} {n.author?.displayName}: {n.text}</li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`/files/${id}/notes`, { method: 'POST', json: { text: note } });
              setNote('');
            }, 'Note added');
          }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add note" />
            <button className="btn primary" type="submit">Add</button>
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
                        const t = localStorage.getItem('gow_access');
                        const res = await fetch(`/api/files/attachments/${a.id}/download`, {
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
                  <div
                    className="muted"
                    style={{
                      whiteSpace: 'pre-wrap',
                      marginTop: 10,
                      padding: 10,
                      background: 'var(--panel-2, #f4f7f5)',
                      borderRadius: 8,
                      maxHeight: 220,
                      overflow: 'auto',
                      fontSize: 13,
                    }}
                  >
                    <strong style={{ color: 'var(--pine)' }}>Extracted text</strong>
                    {'\n'}
                    {String(a.extractedText).slice(0, 1200)}
                    {String(a.extractedText).length > 1200 ? '…' : ''}
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
          <ul>
            {(matter.relatedFrom || []).map((r: any) => (
              <li key={r.id}>{r.toMatter?.diaryNo} — {r.toMatter?.subject}</li>
            ))}
            {!matter.relatedFrom?.length && <li className="muted">No related links</li>}
          </ul>
          <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`/files/${id}/related`, { method: 'POST', json: { relatedId } });
              setRelatedId('');
            }, 'Linked');
          }}>
            <input value={relatedId} onChange={(e) => setRelatedId(e.target.value)} placeholder="Related matter UUID" required />
            <button className="btn primary" type="submit">Link</button>
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
