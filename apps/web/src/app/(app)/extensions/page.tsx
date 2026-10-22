'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

type Category =
  | 'parliamentary'
  | 'briefs'
  | 'correspondence'
  | 'media'
  | 'legislative';

type MatterOpt = { id: string; diaryNo: string; subject: string; status?: string };

type WorkItem = {
  id: string;
  code?: string | null;
  title: string;
  kind: string;
  language?: string;
  status: string;
  priority?: string;
  text?: string;
  classification?: string;
  rejectReason?: string | null;
  decisionNote?: string | null;
  dueAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  owner?: { id?: string; displayName: string } | null;
  matter?: { id: string; diaryNo: string; subject: string } | null;
  matterId?: string | null;
};

type WorkRow = {
  id: string;
  source: 'work' | 'speech' | 'press' | 'greeting' | 'call' | 'scaffold';
  category: Category;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href?: string;
  matterHref?: string;
  rejectReason?: string | null;
  raw?: WorkItem;
};

const FILTERS: { key: 'all' | Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'parliamentary', label: 'Parliamentary business' },
  { key: 'briefs', label: 'Briefs & speeches' },
  { key: 'correspondence', label: 'Correspondence & calls' },
  { key: 'media', label: 'Media review' },
  { key: 'legislative', label: 'Legislative record' },
];

const SECTIONS: { key: Category; label: string; hint?: string }[] = [
  { key: 'parliamentary', label: 'Parliamentary business' },
  { key: 'briefs', label: 'Briefs & speeches' },
  { key: 'correspondence', label: 'Correspondence & calls' },
  { key: 'media', label: 'Media review' },
  {
    key: 'legislative',
    label: 'Legislative record',
    hint: 'Questions / Hansard production remain Tier C — pilot holds research notes and deep links only.',
  },
];

const KIND_OPTIONS = [
  { value: 'PARLIAMENTARY', label: 'Parliamentary business' },
  { value: 'BRIEF', label: 'Brief / note' },
  { value: 'SPEECH', label: 'Speech draft (register)' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'MEDIA', label: 'Media review' },
  { value: 'LEGISLATIVE', label: 'Legislative research' },
  { value: 'QUESTION', label: 'Question note (scaffold)' },
  { value: 'HANSARD', label: 'Hansard note (scaffold)' },
];

const emptyForm = {
  title: '',
  kind: 'BRIEF',
  text: '',
  language: 'en',
  classification: 'INTERNAL',
  priority: 'NORMAL',
  matterId: '',
  dueAt: '',
};

function mapKind(kind: string): Category {
  const k = (kind || '').toUpperCase();
  if (/PARLIAMENT|AGENDA|QUESTION|COMMITTEE|HOUSE/.test(k)) return 'parliamentary';
  if (/SPEECH|BRIEF|NOTE|TALKING/.test(k)) return 'briefs';
  if (/CORRESP|LETTER|CALL|GREET/.test(k)) return 'correspondence';
  if (/MEDIA|PRESS|RELEASE/.test(k)) return 'media';
  if (/LEGIS|RESEARCH|TRANSLAT|BILL|HANSARD/.test(k)) return 'legislative';
  return 'briefs';
}

function prettyStatus(s: string) {
  if (s === 'SUBMITTED') return 'Submitted';
  if (s === 'APPROVED' || s === 'DISPATCHED' || s === 'CLOSED' || s === 'COMPLETED') return 'Approved';
  if (s === 'REJECTED' || s === 'DECLINED') return 'Rejected';
  if (s === 'FOLLOW_UP') return 'Follow-up';
  if (s === 'LOGGED') return 'Logged';
  if (s === 'DRAFT' || s === 'REQUESTED' || s === 'PLANNED') return 'Draft';
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(s: string) {
  const p = prettyStatus(s);
  if (p === 'Approved') return 'ok';
  if (p === 'Rejected') return 'bad';
  if (p === 'Submitted' || p === 'Follow-up') return 'warn';
  return 'draft';
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iconFor(cat: Category) {
  if (cat === 'parliamentary') return '🏛';
  if (cat === 'briefs') return '📝';
  if (cat === 'correspondence') return '📞';
  if (cat === 'media') return '📰';
  return '📘';
}

export default function ExtensionsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [focusId, setFocusId] = useState<string | null>(null);

  const [rows, setRows] = useState<WorkRow[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openWork, setOpenWork] = useState<WorkItem | null>(null);
  const [editText, setEditText] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [decisionNote, setDecisionNote] = useState('');

  const canDecide =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [work, speeches, press, greetings, calls, mats] = await Promise.all([
      api<WorkItem[]>('/work-items').catch(() => [] as WorkItem[]),
      api<any[]>('/speeches').catch(() => []),
      api<any[]>('/press').catch(() => []),
      api<any[]>('/greetings').catch(() => []),
      api<any[]>('/calls').catch(() => []),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
    ]);

    setMatters(mats.filter((m) => m.status !== 'CLOSED'));

    const next: WorkRow[] = [];

    for (const w of work) {
      next.push({
        id: w.id,
        source: 'work',
        category: mapKind(w.kind),
        title: w.title,
        subtitle: `${w.code || 'WR'} · ${w.kind} · ${w.owner?.displayName || 'Office'} · ${
          w.language || 'en'
        }${w.matter?.diaryNo ? ` · ${w.matter.diaryNo}` : ''}`,
        status: w.status,
        createdAt: w.createdAt || w.updatedAt || new Date().toISOString(),
        matterHref: w.matter?.id ? `/files/${w.matter.id}` : undefined,
        rejectReason: w.rejectReason,
        raw: w,
      });
    }
    for (const s of speeches) {
      next.push({
        id: s.id,
        source: 'speech',
        category: 'briefs',
        title: s.title,
        subtitle: `Speech · ${s.language || 'en'}${s.matter?.diaryNo ? ` · ${s.matter.diaryNo}` : ''}`,
        status: s.status || 'DRAFT',
        createdAt: s.createdAt || s.updatedAt,
        href: `/speeches?focus=${s.id}`,
        matterHref: s.matter?.id ? `/files/${s.matter.id}` : undefined,
      });
    }
    for (const p of press) {
      next.push({
        id: p.id,
        source: 'press',
        category: 'media',
        title: p.title,
        subtitle: `Press · ${p.author?.displayName || 'Office'}`,
        status: p.status || 'DRAFT',
        createdAt: p.createdAt || p.updatedAt,
        href: `/press?focus=${p.id}`,
        matterHref: p.matter?.id ? `/files/${p.matter.id}` : undefined,
      });
    }
    for (const g of greetings) {
      next.push({
        id: g.id,
        source: 'greeting',
        category: 'correspondence',
        title: g.occasion || g.recipient || 'Greeting',
        subtitle: `Greeting · ${g.cardCode || g.recipient || ''}`,
        status: g.status || 'DRAFT',
        createdAt: g.createdAt || g.updatedAt,
        href: `/greetings?focus=${g.id}`,
        matterHref: g.matter?.id ? `/files/${g.matter.id}` : undefined,
      });
    }
    for (const c of calls) {
      next.push({
        id: c.id,
        source: 'call',
        category: 'correspondence',
        title: c.summary || c.partyName || 'Call log',
        subtitle: `Call · ${c.partyName || ''}${c.organisation ? ` · ${c.organisation}` : ''}`,
        status: c.status || 'LOGGED',
        createdAt: c.createdAt,
        href: `/calls?focus=${c.id}`,
        matterHref: c.matterId ? `/files/${c.matterId}` : undefined,
      });
    }

    // Tier C scaffold cards so Legislative filter is never empty of guidance
    if (!next.some((r) => r.category === 'legislative')) {
      next.push({
        id: 'scaffold-questions',
        source: 'scaffold',
        category: 'legislative',
        title: 'Questions database (Tier C)',
        subtitle: 'Pilot: file a LEGISLATIVE / QUESTION work note linked to a matter',
        status: 'PLANNED',
        createdAt: new Date(0).toISOString(),
      });
      next.push({
        id: 'scaffold-hansard',
        source: 'scaffold',
        category: 'legislative',
        title: 'Hansard / bill track (Tier C)',
        subtitle: 'Out of scope for this pilot — use LEGISLATIVE research notes meanwhile',
        status: 'PLANNED',
        createdAt: new Date(0).toISOString(),
      });
    }

    next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setRows(next);
  }, []);

  useLiveRefresh(load, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  useEffect(() => {
    try {
      setFocusId(new URLSearchParams(window.location.search).get('focus'));
    } catch {
      setFocusId(null);
    }
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const hit = rows.find((r) => r.id === focusId && r.source === 'work');
    if (hit?.raw) {
      setOpenWork(hit.raw);
      setEditText(hit.raw.text || '');
      setRejectReason('');
      setDecisionNote('');
    }
  }, [focusId, rows]);

  useEffect(() => {
    function close() {
      setMenuFor(null);
    }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return rows.filter((r) => r.source !== 'scaffold');
    return rows.filter((r) => r.category === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      items: visible.filter((r) => r.category === s.key),
    })).filter((s) => s.items.length > 0 || filter === s.key);
  }, [visible, filter]);

  const kpis = useMemo(() => {
    const work = rows.filter((r) => r.source === 'work');
    return {
      total: rows.filter((r) => r.source !== 'scaffold').length,
      awaiting: work.filter((r) => r.status === 'SUBMITTED').length,
      drafts: work.filter((r) => r.status === 'DRAFT').length,
      modules: rows.filter((r) => r.source !== 'work' && r.source !== 'scaffold').length,
    };
  }, [rows]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/work-items', {
        method: 'POST',
        json: {
          title: form.title.trim(),
          kind: form.kind,
          text: form.text.trim(),
          language: form.language,
          classification: form.classification,
          priority: form.priority,
          matterId: form.matterId || undefined,
          dueAt: form.dueAt || undefined,
        },
      });
      toast.success('Work record drafted');
      setForm(emptyForm);
      setShowForm(false);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveOpen() {
    if (!openWork) return;
    setBusy(true);
    try {
      const updated = await api<WorkItem>(`/work-items/${openWork.id}`, {
        method: 'PATCH',
        json: { text: editText, title: openWork.title },
      });
      setOpenWork(updated);
      toast.success('Draft saved');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function act(row: WorkRow, action: 'submit' | 'approve' | 'reject') {
    if (row.source !== 'work') return;
    setBusy(true);
    setMenuFor(null);
    try {
      if (action === 'submit') {
        await api(`/work-items/${row.id}/submit`, { method: 'POST' });
        toast.success('Submitted for approval');
      } else if (action === 'approve') {
        await api(`/work-items/${row.id}/decide`, {
          method: 'POST',
          json: { approve: true, note: decisionNote.trim() || undefined },
        });
        toast.success('Approved');
        setDecisionNote('');
      } else {
        const reason = rejectReason.trim() || 'Returned for revision';
        if (reason.length < 5) {
          toast.error('Reject reason required (min 5 characters)');
          setBusy(false);
          return;
        }
        await api(`/work-items/${row.id}/decide`, {
          method: 'POST',
          json: { approve: false, reason },
        });
        toast.success('Rejected');
        setRejectReason('');
      }
      notifyDataChanged();
      await load();
      if (openWork?.id === row.id) setOpenWork(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function openDetail(row: WorkRow) {
    if (row.source !== 'work' || !row.raw) return;
    setOpenWork(row.raw);
    setEditText(row.raw.text || '');
    setRejectReason('');
    setDecisionNote('');
    setMenuFor(null);
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · WORK REGISTER
          </div>
          <h1>Work records</h1>
          <p className="muted">
            Hub for office work items plus deep links into speeches, press, greetings and call logs.
            Questions / Hansard remain Tier C scaffolds under Legislative record.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ New work record'}
        </button>
      </div>

      <div className="work-kpi-row">
        <div className="work-kpi">
          <strong>{kpis.total}</strong>
          <span className="muted">In register</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.awaiting}</strong>
          <span className="muted">Awaiting approval</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.drafts}</strong>
          <span className="muted">Work drafts</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.modules}</strong>
          <span className="muted">Sibling modules</span>
        </div>
      </div>

      <div className="work-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'active' : ''}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showForm ? (
        <div className="panel">
          <h2>Draft a work record</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                minLength={3}
              />
            </label>
            <label>
              Category
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="NORMAL">Normal</option>
                <option value="PRIORITY">Priority</option>
                <option value="URGENT">Urgent</option>
                <option value="VIP">VIP</option>
              </select>
            </label>
            <label>
              Classification
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                <option value="PUBLIC">Public</option>
                <option value="INTERNAL">Internal</option>
                <option value="CONFIDENTIAL">Confidential</option>
              </select>
            </label>
            <label>
              Linked matter (optional)
              <select
                value={form.matterId}
                onChange={(e) => setForm({ ...form, matterId: e.target.value })}
              >
                <option value="">None</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date (optional)
              <input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </label>
            <label>
              Text
              <textarea
                rows={4}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                required
                minLength={10}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Save draft
            </button>
          </form>
        </div>
      ) : null}

      {openWork ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">Work record detail</div>
          <h2>
            {openWork.code || 'WR'} · {openWork.title}
          </h2>
          <p className="muted">
            {openWork.kind} · {prettyStatus(openWork.status)} · {openWork.priority || 'NORMAL'}
            {openWork.matter ? (
              <>
                {' '}
                · <Link href={`/files/${openWork.matter.id}`}>{openWork.matter.diaryNo}</Link>
              </>
            ) : null}
          </p>
          {openWork.rejectReason ? (
            <p className="tiny" style={{ color: 'var(--danger, #a33)' }}>
              Rejected: {openWork.rejectReason}
            </p>
          ) : null}
          {openWork.status === 'DRAFT' || openWork.status === 'REJECTED' ? (
            <label className="field">
              Body
              <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} />
            </label>
          ) : (
            <div className="remote-decision-box">
              <strong>Body</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{openWork.text}</p>
            </div>
          )}
          {canDecide && openWork.status === 'SUBMITTED' ? (
            <div className="grid-form" style={{ marginTop: 8 }}>
              <label>
                Decision note (optional)
                <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
              </label>
              <label>
                Reject reason
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Required when rejecting"
                />
              </label>
            </div>
          ) : null}
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {(openWork.status === 'DRAFT' || openWork.status === 'REJECTED') &&
            (user?.id === openWork.owner?.id || canDecide) ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={saveOpen}>
                  Save
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      {
                        id: openWork.id,
                        source: 'work',
                        category: mapKind(openWork.kind),
                        title: openWork.title,
                        subtitle: '',
                        status: openWork.status,
                        createdAt: openWork.createdAt,
                        raw: openWork,
                      },
                      'submit',
                    )
                  }
                >
                  Submit for approval
                </button>
              </>
            ) : null}
            {canDecide && (openWork.status === 'SUBMITTED' || openWork.status === 'DRAFT') ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      {
                        id: openWork.id,
                        source: 'work',
                        category: mapKind(openWork.kind),
                        title: openWork.title,
                        subtitle: '',
                        status: openWork.status,
                        createdAt: openWork.createdAt,
                        raw: openWork,
                      },
                      'approve',
                    )
                  }
                >
                  Approve
                </button>
                {openWork.status === 'SUBMITTED' ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      act(
                        {
                          id: openWork.id,
                          source: 'work',
                          category: mapKind(openWork.kind),
                          title: openWork.title,
                          subtitle: '',
                          status: openWork.status,
                          createdAt: openWork.createdAt,
                          raw: openWork,
                        },
                        'reject',
                      )
                    }
                  >
                    Reject
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="btn" onClick={() => setOpenWork(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <div className="panel">
          <p className="muted">No work records in this view yet. Draft one to populate the register.</p>
        </div>
      ) : (
        grouped.map((section) => (
          <section key={section.key} className="work-section">
            <div className="work-section-head">
              <div>
                <h2>{section.label}</h2>
                {section.hint ? <p className="muted tiny">{section.hint}</p> : null}
              </div>
              <span className="muted">{section.items.length}</span>
            </div>
            <ul className="work-list">
              {section.items.map((row) => (
                <li
                  key={`${row.source}-${row.id}`}
                  className={`work-row${focusId === row.id ? ' focus' : ''}`}
                  id={`work-${row.id}`}
                >
                  <span className="work-icon" aria-hidden>
                    {iconFor(row.category)}
                  </span>
                  <div className="work-main">
                    <strong>{row.title}</strong>
                    <div className="muted">
                      {row.createdAt && +new Date(row.createdAt) > 0
                        ? `${fmtDate(row.createdAt)} · `
                        : ''}
                      {row.subtitle}
                    </div>
                  </div>
                  <span className={`work-status ${statusClass(row.status)}`}>
                    {prettyStatus(row.status)}
                  </span>
                  <div className="work-actions" onClick={(e) => e.stopPropagation()}>
                    {row.source === 'scaffold' ? (
                      <span className="muted tiny">Tier C</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn work-actions-btn"
                          disabled={busy}
                          onClick={() =>
                            setMenuFor((cur) =>
                              cur === `${row.source}-${row.id}` ? null : `${row.source}-${row.id}`,
                            )
                          }
                        >
                          Actions ▾
                        </button>
                        {menuFor === `${row.source}-${row.id}` ? (
                          <div className="work-menu">
                            {row.source === 'work' ? (
                              <button type="button" onClick={() => openDetail(row)}>
                                Open detail
                              </button>
                            ) : null}
                            {row.source === 'work' &&
                            (row.status === 'DRAFT' || row.status === 'REJECTED') ? (
                              <button type="button" onClick={() => act(row, 'submit')}>
                                Submit for approval
                              </button>
                            ) : null}
                            {row.source === 'work' &&
                            canDecide &&
                            (row.status === 'DRAFT' || row.status === 'SUBMITTED') ? (
                              <>
                                <button type="button" onClick={() => act(row, 'approve')}>
                                  Approve
                                </button>
                                {row.status === 'SUBMITTED' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenWork(row.raw || null);
                                      setEditText(row.raw?.text || '');
                                      setMenuFor(null);
                                    }}
                                  >
                                    Reject…
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {row.href ? (
                              <Link href={row.href} onClick={() => setMenuFor(null)}>
                                Open module
                              </Link>
                            ) : null}
                            {row.matterHref ? (
                              <Link href={row.matterHref} onClick={() => setMenuFor(null)}>
                                Open matter
                              </Link>
                            ) : null}
                            {row.source === 'work' &&
                            row.status !== 'DRAFT' &&
                            row.status !== 'REJECTED' &&
                            !(canDecide && row.status === 'SUBMITTED') &&
                            !row.matterHref ? (
                              <span className="muted tiny">No pending actions</span>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
