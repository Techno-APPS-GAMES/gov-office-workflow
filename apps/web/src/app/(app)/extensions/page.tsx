'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

type Category =
  | 'parliamentary'
  | 'briefs'
  | 'correspondence'
  | 'media'
  | 'legislative';

type WorkRow = {
  id: string;
  source: 'work' | 'speech' | 'press' | 'greeting' | 'call';
  category: Category;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href?: string;
};

const FILTERS: { key: 'all' | Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'parliamentary', label: 'Parliamentary business' },
  { key: 'briefs', label: 'Briefs & speeches' },
  { key: 'correspondence', label: 'Correspondence & calls' },
  { key: 'media', label: 'Media review' },
  { key: 'legislative', label: 'Legislative record' },
];

const SECTIONS: { key: Category; label: string }[] = [
  { key: 'parliamentary', label: 'Parliamentary business' },
  { key: 'briefs', label: 'Briefs & speeches' },
  { key: 'correspondence', label: 'Correspondence & calls' },
  { key: 'media', label: 'Media review' },
  { key: 'legislative', label: 'Legislative record' },
];

const KIND_OPTIONS = [
  { value: 'PARLIAMENTARY', label: 'Parliamentary business', category: 'parliamentary' as Category },
  { value: 'BRIEF', label: 'Brief / note', category: 'briefs' as Category },
  { value: 'SPEECH', label: 'Speech draft', category: 'briefs' as Category },
  { value: 'CORRESPONDENCE', label: 'Correspondence', category: 'correspondence' as Category },
  { value: 'MEDIA', label: 'Media review', category: 'media' as Category },
  { value: 'LEGISLATIVE', label: 'Legislative research', category: 'legislative' as Category },
];

function mapKind(kind: string): Category {
  const k = (kind || '').toUpperCase();
  if (/PARLIAMENT|AGENDA|QUESTION|COMMITTEE|HOUSE/.test(k)) return 'parliamentary';
  if (/SPEECH|BRIEF|NOTE|TALKING/.test(k)) return 'briefs';
  if (/CORRESP|LETTER|CALL|GREET/.test(k)) return 'correspondence';
  if (/MEDIA|PRESS|RELEASE/.test(k)) return 'media';
  if (/LEGIS|RESEARCH|TRANSLAT|BILL/.test(k)) return 'legislative';
  return 'briefs';
}

function prettyStatus(s: string) {
  if (s === 'SUBMITTED') return 'Submitted';
  if (s === 'APPROVED' || s === 'DISPATCHED' || s === 'CLOSED' || s === 'COMPLETED') return 'Approved';
  if (s === 'REJECTED' || s === 'DECLINED') return 'Rejected';
  if (s === 'FOLLOW_UP') return 'Follow-up';
  if (s === 'LOGGED') return 'Logged';
  if (s === 'DRAFT' || s === 'REQUESTED') return 'Draft';
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
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    kind: 'BRIEF',
    text: '',
    language: 'en',
  });

  const canDecide =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [work, speeches, press, greetings, calls] = await Promise.all([
      api<any[]>('/work-items').catch(() => []),
      api<any[]>('/speeches').catch(() => []),
      api<any[]>('/press').catch(() => []),
      api<any[]>('/greetings').catch(() => []),
      api<any[]>('/calls').catch(() => []),
    ]);

    const next: WorkRow[] = [];

    for (const w of work) {
      next.push({
        id: w.id,
        source: 'work',
        category: mapKind(w.kind),
        title: w.title,
        subtitle: `${w.kind} · ${w.owner?.displayName || 'Office'} · ${w.language || 'en'}`,
        status: w.status,
        createdAt: w.createdAt || w.updatedAt,
      });
    }
    for (const s of speeches) {
      next.push({
        id: s.id,
        source: 'speech',
        category: 'briefs',
        title: s.title,
        subtitle: `Speech · ${s.language || 'en'}`,
        status: s.status || 'DRAFT',
        createdAt: s.createdAt || s.updatedAt,
        href: '/speeches',
      });
    }
    for (const p of press) {
      next.push({
        id: p.id,
        source: 'press',
        category: 'media',
        title: p.title,
        subtitle: `Press release · ${p.author?.displayName || 'Office'}`,
        status: p.status || 'DRAFT',
        createdAt: p.createdAt || p.updatedAt,
        href: '/press',
      });
    }
    for (const g of greetings) {
      next.push({
        id: g.id,
        source: 'greeting',
        category: 'correspondence',
        title: g.occasion || g.recipient || 'Greeting',
        subtitle: `Greeting · ${g.recipient || ''}`,
        status: g.status || 'DRAFT',
        createdAt: g.createdAt || g.updatedAt,
        href: '/greetings',
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
        href: '/calls',
      });
    }

    next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setRows(next);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  useEffect(() => {
    function close() {
      setMenuFor(null);
    }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.category === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      items: visible.filter((r) => r.category === s.key),
    })).filter((s) => s.items.length > 0 || filter === s.key);
  }, [visible, filter]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/work-items', { method: 'POST', json: form });
      toast.success('Work record drafted');
      setForm({ ...form, title: '', text: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
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
      } else {
        await api(`/work-items/${row.id}/decide`, {
          method: 'POST',
          json: { approve: action === 'approve' },
        });
        toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Work records</h1>
          <p className="muted">
            Briefs, speeches, parliamentary notes, correspondence and media drafts in one register.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ New work record'}
        </button>
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
              Text
              <textarea
                rows={4}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Save draft
            </button>
          </form>
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
              <h2>{section.label}</h2>
              <span className="muted">{section.items.length}</span>
            </div>
            <ul className="work-list">
              {section.items.map((row) => (
                <li key={`${row.source}-${row.id}`} className="work-row">
                  <span className="work-icon" aria-hidden>
                    {iconFor(row.category)}
                  </span>
                  <div className="work-main">
                    <strong>{row.title}</strong>
                    <div className="muted">
                      {fmtDate(row.createdAt)} · {row.subtitle}
                    </div>
                  </div>
                  <span className={`work-status ${statusClass(row.status)}`}>
                    {prettyStatus(row.status)}
                  </span>
                  <div className="work-actions" onClick={(e) => e.stopPropagation()}>
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
                        {row.source === 'work' && row.status === 'DRAFT' ? (
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
                            <button type="button" onClick={() => act(row, 'reject')}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        {row.href ? (
                          <Link href={row.href} onClick={() => setMenuFor(null)}>
                            Open module
                          </Link>
                        ) : null}
                        {!row.href && row.source !== 'work' ? (
                          <span className="muted tiny">No further actions</span>
                        ) : null}
                        {row.source === 'work' &&
                        row.status !== 'DRAFT' &&
                        !(canDecide && row.status === 'SUBMITTED') ? (
                          <span className="muted tiny">No pending actions</span>
                        ) : null}
                      </div>
                    ) : null}
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
