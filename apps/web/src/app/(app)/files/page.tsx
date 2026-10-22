'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { enumLabel, roleTitle } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh } from '@/lib/live-refresh';

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

function HolderCell({ m }: { m: Matter }) {
  const { lang, label } = useAuth();
  const name = m.holder?.displayName || label('unassigned');
  const title = roleTitle(lang, m.holder?.role);
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
  const { user, lang, label } = useAuth();
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

  const load = useCallback(async () => {
    const [m, l] = await Promise.all([
      api<Matter[]>('/files'),
      api<Letter[]>('/files/letters/dispatched').catch(() => [] as Letter[]),
    ]);
    setMatters(m);
    setLetters(l);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
  }, [load]);

  useLiveRefresh(load, [load]);

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
      toast.success(label('files_registered'));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : label('cm_failed');
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
      toast.success(label('files_unlocked'));
      setUnlockId(null);
      setFilePassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_unlockFailed'));
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_conceptDemo')}
          </div>
          <h1>{label('files')}</h1>
          <p className="muted">{label('fl_heroSub')}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('fl_closeForm') : label('files_registerNew')}
        </button>
      </div>

      {showForm && (
        <div className="panel">
          <h2>{label('fl_registerTitle')}</h2>
          <form className="grid-form" onSubmit={register}>
            <div className="field">
              <label>{label('subject')}</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
            </div>
            <div className="field">
              <label>{label('files_sender')}</label>
              <input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} required />
            </div>
            <div className="field">
              <label>{label('fl_body')}</label>
              <textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>{label('classification')}</label>
                <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
                  <option value="PUBLIC">{enumLabel(lang, 'PUBLIC')}</option>
                  <option value="INTERNAL">{enumLabel(lang, 'INTERNAL')}</option>
                  <option value="CONFIDENTIAL">{enumLabel(lang, 'CONFIDENTIAL')}</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{label('files_area')}</label>
                <select value={form.subjectArea} onChange={(e) => setForm({ ...form, subjectArea: e.target.value })}>
                  <option value="Parliamentary business">{label('fl_areaParliamentary')}</option>
                  <option value="Administration">{label('fl_areaAdministration')}</option>
                  <option value="Protocol">{label('fl_areaProtocol')}</option>
                  <option value="Intergovernmental">{label('fl_areaIntergovernmental')}</option>
                  <option value="Public engagement">{label('fl_areaPublic')}</option>
                  <option value="Other">{label('fl_areaOther')}</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{label('priority')}</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="NORMAL">{enumLabel(lang, 'NORMAL')}</option>
                  <option value="URGENT">{enumLabel(lang, 'URGENT')}</option>
                </select>
              </div>
            </div>
            {form.classification === 'CONFIDENTIAL' && (
              <div className="field">
                <label>{label('fl_passwordMin')}</label>
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
              {label('fl_registerBtn')}
            </button>
          </form>
        </div>
      )}

      <div className="files-stat-row">
        <div className="files-stat">
          <span className="files-stat-icon gold">📁</span>
          <div>
            <div className="files-stat-value">{counts.open}</div>
            <div className="files-stat-label">{label('fl_openMatters')}</div>
            <div className="muted">{label('fl_inWorkflow')}</div>
          </div>
        </div>
        <div className="files-stat">
          <span className="files-stat-icon sand">⏳</span>
          <div>
            <div className="files-stat-value">{counts.awaiting}</div>
            <div className="files-stat-label">{label('files_kpiAwaiting')}</div>
            <div className="muted">{label('fl_pendingHandoff')}</div>
          </div>
        </div>
        <div className="files-stat">
          <span className="files-stat-icon plum">📄</span>
          <div>
            <div className="files-stat-value">{counts.closed}</div>
            <div className="files-stat-label">{label('overview_mattersClosed')}</div>
            <div className="muted">{label('files_sealed')}</div>
          </div>
        </div>
      </div>

      <div className="files-pill-tabs">
        <button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          {label('fl_tabActive')} · {counts.open}
        </button>
        <button type="button" className={tab === 'archive' ? 'active' : ''} onClick={() => setTab('archive')}>
          {label('fl_tabArchive')} · {counts.closed}
        </button>
        <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          {label('fl_tabAll')} · {counts.all}
        </button>
        <input
          className="files-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={label('fl_searchPh')}
        />
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table files-table">
            <thead>
              <tr>
                <th>{label('fl_thDiaryMatter')}</th>
                <th>{label('files_sender')}</th>
                <th>{label('classification')}</th>
                <th>{label('status')}</th>
                <th>{label('fl_thHolder')}</th>
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
                            {enumLabel(lang, 'CONFIDENTIAL')}
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
                            placeholder={label('cm_filePassword')}
                            value={filePassword}
                            onChange={(e) => setFilePassword(e.target.value)}
                            minLength={12}
                            required
                            autoFocus
                          />
                          <button className="btn primary" type="submit">
                            {label('files_unlock')}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setUnlockId(null);
                              setFilePassword('');
                            }}
                          >
                            {label('cancel')}
                          </button>
                        </form>
                      )}
                    </td>
                    <td>{m.sender}</td>
                    <td>
                      <span className={`badge ${m.classification}`}>{enumLabel(lang, m.classification)}</span>
                    </td>
                    <td>
                      <span className={`badge ${m.status}`}>{enumLabel(lang, m.status)}</span>
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
                            {label('cm_enterPassword')}
                          </button>
                        ) : (
                          <>
                            <Link className="btn" href={`/files/${m.id}`}>
                              {label('open')}
                            </Link>
                            <Link className="btn" href={`/files/${m.id}?tab=journey`}>
                              {label('fl_journey')}
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
                    {label('fl_emptyView')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="eyebrow">{label('fl_officialRegister')}</div>
        <h2 style={{ marginTop: 4 }}>{label('fl_dispatchedTitle')}</h2>
        {letters.length === 0 ? (
          <p className="muted">{label('fl_noDispatched')}</p>
        ) : (
          <ul className="timeline">
            {letters.map((l) => (
              <li key={l.id}>
                <strong>{l.recipient}</strong>
                <div className="muted">
                  {l.matter?.diaryNo || label('fl_letter')}
                  {l.reference ? ` · ${l.reference}` : ''} · {new Date(l.updatedAt).toLocaleString()}
                </div>
                <div>
                  {l.text.slice(0, 180)}
                  {l.text.length > 180 ? '…' : ''}
                </div>
                {l.matter && (
                  <Link className="tiny-link" href={`/files/${l.matter.id}`}>
                    {label('fl_openMatterArrow')}
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

function FilesFallback() {
  const { label } = useAuth();
  return <p className="muted">{label('fl_loading')}</p>;
}

export default function FilesPage() {
  return (
    <Suspense fallback={<FilesFallback />}>
      <FilesPageInner />
    </Suspense>
  );
}
