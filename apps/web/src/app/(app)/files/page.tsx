'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';

type Matter = {
  id: string;
  diaryNo: string;
  subject: string;
  sender: string;
  subjectArea?: string;
  status: string;
  classification: string;
  priority?: string;
  holder?: { displayName: string; role?: string } | null;
  createdBy?: { displayName: string };
  vaultUnlocked?: boolean;
  createdAt?: string;
};

type Letter = {
  id: string;
  recipient: string;
  text: string;
  status: string;
  reference?: string | null;
  updatedAt: string;
  matter?: { id: string; diaryNo: string; subject: string };
};

type Tab = 'active' | 'archive' | 'all';

function prettyLabel(s: string) {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleTitle(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function HolderCell({ m }: { m: Matter }) {
  const name = m.holder?.displayName || 'Unassigned';
  const title = roleTitle(m.holder?.role);
  const src = roleAvatar(m.holder?.role);
  return (
    <div className="holder-cell">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="holder-avatar" />
      ) : (
        <span className="holder-avatar fallback">{name.charAt(0)}</span>
      )}
      <div>
        <strong>{name}</strong>
        {title ? <div className="muted">{title}</div> : null}
      </div>
    </div>
  );
}

function FilesPageInner() {
  const { user } = useAuth();
  const toast = useToast();
  const search = useSearchParams();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [form, setForm] = useState({
    subject: '',
    sender: '',
    body: '',
    classification: 'INTERNAL',
    subjectArea: 'Administration',
    priority: 'NORMAL',
    filePassword: '',
  });

  useEffect(() => {
    if (search.get('register') === '1') setShowForm(true);
  }, [search]);

  async function load() {
    const [m, l] = await Promise.all([
      api<Matter[]>('/files'),
      api<Letter[]>('/files/letters/dispatched').catch(() => [] as Letter[]),
    ]);
    setMatters(m);
    setLetters(l);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
  }, []);

  const counts = useMemo(() => {
    const open = matters.filter((m) => m.status !== 'CLOSED').length;
    const awaiting = matters.filter((m) => m.status === 'AWAITING_RECEIPT').length;
    const closed = matters.filter((m) => m.status === 'CLOSED').length;
    return { open, awaiting, closed, all: matters.length };
  }, [matters]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return matters.filter((m) => {
      if (tab === 'active' && m.status === 'CLOSED') return false;
      if (tab === 'archive' && m.status !== 'CLOSED') return false;
      if (!term) return true;
      return (
        m.diaryNo.toLowerCase().includes(term) ||
        m.subject.toLowerCase().includes(term) ||
        m.sender.toLowerCase().includes(term) ||
        (m.subjectArea || '').toLowerCase().includes(term) ||
        (m.holder?.displayName || '').toLowerCase().includes(term)
      );
    });
  }, [matters, tab, q]);

  async function register(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload: Record<string, string> = { ...form };
      if (form.classification !== 'CONFIDENTIAL') delete payload.filePassword;
      await api('/files', { method: 'POST', json: payload });
      setForm({ ...form, subject: '', sender: '', body: '', filePassword: '' });
      setShowForm(false);
      toast.success('Matter registered');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setError(msg);
      toast.error(msg);
    }
  }

  async function unlock(e: FormEvent, matterId: string) {
    e.preventDefault();
    try {
      await api(`/vault/${matterId}/unlock`, {
        method: 'POST',
        json: { password: filePassword },
      });
      toast.success('Vault unlocked');
      setUnlockId(null);
      setFilePassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Files & documents</h1>
          <p className="muted">
            Receive, review and track every official matter from intake to closure.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Register new matter'}
        </button>
      </div>

      {showForm && (
        <div className="panel">
          <h2>Register new matter</h2>
          <form className="grid-form" onSubmit={register}>
            <div className="field">
              <label>Subject</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
            </div>
            <div className="field">
              <label>Sender</label>
              <input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} required />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Classification</label>
                <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
                  <option value="PUBLIC">Public</option>
                  <option value="INTERNAL">Internal</option>
                  <option value="CONFIDENTIAL">Confidential</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Subject area</label>
                <select value={form.subjectArea} onChange={(e) => setForm({ ...form, subjectArea: e.target.value })}>
                  <option>Parliamentary business</option>
                  <option>Administration</option>
                  <option>Protocol</option>
                  <option>Intergovernmental</option>
                  <option>Public engagement</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>
            {form.classification === 'CONFIDENTIAL' && (
              <div className="field">
                <label>File password (min 12)</label>
                <input
                  type="password"
                  value={form.filePassword}
                  onChange={(e) => setForm({ ...form, filePassword: e.target.value })}
                  minLength={12}
                  required
                />
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <button className="btn primary" type="submit">
              Register
            </button>
          </form>
        </div>
      )}

      <div className="files-stat-row">
        <div className="files-stat">
          <span className="files-stat-icon gold">📁</span>
          <div>
            <div className="files-stat-value">{counts.open}</div>
            <div className="files-stat-label">Open matters</div>
            <div className="muted">In active workflow</div>
          </div>
        </div>
        <div className="files-stat">
          <span className="files-stat-icon sand">⏳</span>
          <div>
            <div className="files-stat-value">{counts.awaiting}</div>
            <div className="files-stat-label">Awaiting receipt</div>
            <div className="muted">Pending handoff</div>
          </div>
        </div>
        <div className="files-stat">
          <span className="files-stat-icon plum">📄</span>
          <div>
            <div className="files-stat-value">{counts.closed}</div>
            <div className="files-stat-label">Closed matters</div>
            <div className="muted">Archived & sealed</div>
          </div>
        </div>
      </div>

      <div className="files-pill-tabs">
        <button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Active files · {counts.open}
        </button>
        <button type="button" className={tab === 'archive' ? 'active' : ''} onClick={() => setTab('archive')}>
          Archive · closed · {counts.closed}
        </button>
        <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          All files · {counts.all}
        </button>
        <input
          className="files-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search diary, matter, sender…"
        />
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table files-table">
            <thead>
              <tr>
                <th>Diary / matter</th>
                <th>Sender</th>
                <th>Classification</th>
                <th>Status</th>
                <th>Current holder</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const confidential = m.classification === 'CONFIDENTIAL';
                const locked = confidential && !m.vaultUnlocked;
                return (
                  <tr key={m.id} className={locked ? 'row-locked' : undefined}>
                    <td>
                      {locked ? (
                        <>
                          <strong>{m.diaryNo}</strong>
                          <div className="muted">
                            Confidential
                            {m.subjectArea ? ` · ${m.subjectArea}` : ''}
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>{m.subject}</strong>
                          <div className="muted">
                            {m.diaryNo}
                            {m.subjectArea ? ` · ${m.subjectArea}` : ''}
                          </div>
                        </>
                      )}
                      {unlockId === m.id && (
                        <form className="unlock-inline" onSubmit={(e) => unlock(e, m.id)}>
                          <input
                            type="password"
                            placeholder="File password"
                            value={filePassword}
                            onChange={(e) => setFilePassword(e.target.value)}
                            minLength={12}
                            required
                            autoFocus
                          />
                          <button className="btn primary" type="submit">
                            Unlock
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setUnlockId(null);
                              setFilePassword('');
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </td>
                    <td>{m.sender}</td>
                    <td>
                      <span className={`badge ${m.classification}`}>{prettyLabel(m.classification)}</span>
                    </td>
                    <td>
                      <span className={`badge ${m.status}`}>{prettyLabel(m.status)}</span>
                    </td>
                    <td>
                      <HolderCell m={m} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {locked ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setUnlockId(m.id);
                              setFilePassword('');
                            }}
                          >
                            🔑 Enter password
                          </button>
                        ) : (
                          <>
                            <Link className="btn" href={`/files/${m.id}`}>
                              Open
                            </Link>
                            <Link className="btn" href={`/files/${m.id}?tab=journey`}>
                              Journey
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No files in this view — register a matter to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="eyebrow">Official register</div>
        <h2 style={{ marginTop: 4 }}>Dispatched correspondence</h2>
        {letters.length === 0 ? (
          <p className="muted">No correspondence dispatched yet.</p>
        ) : (
          <ul className="timeline">
            {letters.map((l) => (
              <li key={l.id}>
                <strong>{l.recipient}</strong>
                <div className="muted">
                  {l.matter?.diaryNo || 'Letter'}
                  {l.reference ? ` · ${l.reference}` : ''} · {new Date(l.updatedAt).toLocaleString()}
                </div>
                <div>
                  {l.text.slice(0, 180)}
                  {l.text.length > 180 ? '…' : ''}
                </div>
                {l.matter && (
                  <Link className="tiny-link" href={`/files/${l.matter.id}`}>
                    Open matter →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function FilesPage() {
  return (
    <Suspense fallback={<p className="muted">Loading files…</p>}>
      <FilesPageInner />
    </Suspense>
  );
}
