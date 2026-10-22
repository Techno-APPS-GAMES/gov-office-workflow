'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { Lang, enumLabel } from '@/lib/i18n';

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

function statusText(s: string, label: (k: string) => string, lang: Lang) {
  if (s === 'SUBMITTED') return label('enum_SUBMITTED');
  if (s === 'APPROVED' || s === 'DISPATCHED' || s === 'CLOSED' || s === 'COMPLETED') return label('approved');
  if (s === 'REJECTED' || s === 'DECLINED') return label('rejected');
  if (s === 'FOLLOW_UP') return label('ext_followUp');
  if (s === 'LOGGED') return label('ext_logged');
  if (s === 'DRAFT' || s === 'REQUESTED' || s === 'PLANNED') return label('draft');
  return enumLabel(lang, s);
}

function kindText(kind: string, label: (k: string) => string) {
  const k = `ext_kind_${(kind || '').toUpperCase()}`;
  const v = label(k);
  return v === k ? kind : v;
}

function fmtDate(iso: string, locale?: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iconFor(cat: Category) {
  if (cat === 'parliamentary') return '🏛';
  if (cat === 'briefs') return '📝';
  if (cat === 'correspondence') return '📞';
  if (cat === 'media') return '📰';
  return '📘';
}

export default function ExtensionsPage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
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
        subtitle: `${w.code || 'WR'} · ${kindText(w.kind, label)} · ${w.owner?.displayName || label('ext_office')} · ${
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
        subtitle: `${label('ext_src_speech')} · ${s.language || 'en'}${s.matter?.diaryNo ? ` · ${s.matter.diaryNo}` : ''}`,
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
        subtitle: `${label('ext_src_press')} · ${p.author?.displayName || label('ext_office')}`,
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
        title: g.occasion || g.recipient || label('ext_src_greeting'),
        subtitle: `${label('ext_src_greeting')} · ${g.cardCode || g.recipient || ''}`,
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
        title: c.summary || c.partyName || label('ext_callLog'),
        subtitle: `${label('ext_src_call')} · ${c.partyName || ''}${c.organisation ? ` · ${c.organisation}` : ''}`,
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
        title: label('ext_scaffoldQ'),
        subtitle: label('ext_scaffoldQSub'),
        status: 'PLANNED',
        createdAt: new Date(0).toISOString(),
      });
      next.push({
        id: 'scaffold-hansard',
        source: 'scaffold',
        category: 'legislative',
        title: label('ext_scaffoldH'),
        subtitle: label('ext_scaffoldHSub'),
        status: 'PLANNED',
        createdAt: new Date(0).toISOString(),
      });
    }

    next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setRows(next);
  }, [label]);

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
      toast.success(label('ext_toastDrafted'));
      setForm(emptyForm);
      setShowForm(false);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('createFailed'));
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
      toast.success(label('ext_toastDraftSaved'));
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('saveFailed'));
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
        toast.success(label('ext_toastSubmitted'));
      } else if (action === 'approve') {
        await api(`/work-items/${row.id}/decide`, {
          method: 'POST',
          json: { approve: true, note: decisionNote.trim() || undefined },
        });
        toast.success(label('toast_approved'));
        setDecisionNote('');
      } else {
        const reason = rejectReason.trim() || 'Returned for revision';
        if (reason.length < 5) {
          toast.error(label('ext_toastReasonReq'));
          setBusy(false);
          return;
        }
        await api(`/work-items/${row.id}/decide`, {
          method: 'POST',
          json: { approve: false, reason },
        });
        toast.success(label('toast_rejected'));
        setRejectReason('');
      }
      notifyDataChanged();
      await load();
      if (openWork?.id === row.id) setOpenWork(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mtg_actionFailed'));
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
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('ext_eyebrowRegister')}
          </div>
          <h1>{label('extensions')}</h1>
          <p className="muted">
            {label('ext_heroSub')}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('mtg_closeForm') : label('extensions_new')}
        </button>
      </div>

      <div className="work-kpi-row">
        <div className="work-kpi">
          <strong>{kpis.total}</strong>
          <span className="muted">{label('ext_kpiRegister')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.awaiting}</strong>
          <span className="muted">{label('spc_awaitingApproval')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.drafts}</strong>
          <span className="muted">{label('ext_kpiDrafts')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.modules}</strong>
          <span className="muted">{label('ext_kpiModules')}</span>
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
            {f.key === 'all' ? label('all') : label(`ext_cat_${f.key}`)}
          </button>
        ))}
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('ext_draftTitle')}</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              {label('title')}
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                minLength={3}
              />
            </label>
            <label>
              {label('ext_category')}
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {label(`ext_kind_${k.value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('files_language')}
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">{label('files_english')}</option>
                <option value="ur">{label('files_urdu')}</option>
              </select>
            </label>
            <label>
              {label('priority')}
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="NORMAL">{label('enum_NORMAL')}</option>
                <option value="PRIORITY">{label('enum_PRIORITY')}</option>
                <option value="URGENT">{label('enum_URGENT')}</option>
                <option value="VIP">{label('enum_VIP')}</option>
              </select>
            </label>
            <label>
              {label('classification')}
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                <option value="PUBLIC">{label('enum_PUBLIC')}</option>
                <option value="INTERNAL">{label('enum_INTERNAL')}</option>
                <option value="CONFIDENTIAL">{label('enum_CONFIDENTIAL')}</option>
              </select>
            </label>
            <label>
              {label('ext_linkedMatterOpt')}
              <select
                value={form.matterId}
                onChange={(e) => setForm({ ...form, matterId: e.target.value })}
              >
                <option value="">{label('none')}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('ext_dueOpt')}
              <input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </label>
            <label>
              {label('ext_text')}
              <textarea
                rows={4}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                required
                minLength={10}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {label('prs_saveDraft')}
            </button>
          </form>
        </div>
      ) : null}

      {openWork ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">{label('ext_detail')}</div>
          <h2>
            {openWork.code || 'WR'} · {openWork.title}
          </h2>
          <p className="muted">
            {kindText(openWork.kind, label)} · {statusText(openWork.status, label, lang)} ·{' '}
            {enumLabel(lang, openWork.priority || 'NORMAL')}
            {openWork.matter ? (
              <>
                {' '}
                · <Link href={`/files/${openWork.matter.id}`}>{openWork.matter.diaryNo}</Link>
              </>
            ) : null}
          </p>
          {openWork.rejectReason ? (
            <p className="tiny" style={{ color: 'var(--danger, #a33)' }}>
              {label('rejected')}: {openWork.rejectReason}
            </p>
          ) : null}
          {openWork.status === 'DRAFT' || openWork.status === 'REJECTED' ? (
            <label className="field">
              {label('ext_body')}
              <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} />
            </label>
          ) : (
            <div className="remote-decision-box">
              <strong>{label('ext_body')}</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{openWork.text}</p>
            </div>
          )}
          {canDecide && openWork.status === 'SUBMITTED' ? (
            <div className="grid-form" style={{ marginTop: 8 }}>
              <label>
                {label('ext_decisionNote')}
                <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
              </label>
              <label>
                {label('spc_rejectReason')}
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={label('ext_reasonPh')}
                />
              </label>
            </div>
          ) : null}
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {(openWork.status === 'DRAFT' || openWork.status === 'REJECTED') &&
            (user?.id === openWork.owner?.id || canDecide) ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={saveOpen}>
                  {label('save')}
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
                  {label('ext_submitApproval')}
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
                  {label('ext_approve')}
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
                    {label('prs_reject')}
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="btn" onClick={() => setOpenWork(null)}>
              {label('close')}
            </button>
          </div>
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <div className="panel">
          <p className="muted">{label('ext_empty')}</p>
        </div>
      ) : (
        grouped.map((section) => (
          <section key={section.key} className="work-section">
            <div className="work-section-head">
              <div>
                <h2>{label(`ext_cat_${section.key}`)}</h2>
                {section.hint ? <p className="muted tiny">{label('ext_legislativeHint')}</p> : null}
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
                        ? `${fmtDate(row.createdAt, locale)} · `
                        : ''}
                      {row.subtitle}
                    </div>
                  </div>
                  <span className={`work-status ${statusClass(row.status)}`}>
                    {statusText(row.status, label, lang)}
                  </span>
                  <div className="work-actions" onClick={(e) => e.stopPropagation()}>
                    {row.source === 'scaffold' ? (
                      <span className="muted tiny">{label('ext_tierC')}</span>
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
                          {label('actions')} ▾
                        </button>
                        {menuFor === `${row.source}-${row.id}` ? (
                          <div className="work-menu">
                            {row.source === 'work' ? (
                              <button type="button" onClick={() => openDetail(row)}>
                                {label('ext_openDetail')}
                              </button>
                            ) : null}
                            {row.source === 'work' &&
                            (row.status === 'DRAFT' || row.status === 'REJECTED') ? (
                              <button type="button" onClick={() => act(row, 'submit')}>
                                {label('ext_submitApproval')}
                </button>
                            ) : null}
                            {row.source === 'work' &&
                            canDecide &&
                            (row.status === 'DRAFT' || row.status === 'SUBMITTED') ? (
                              <>
                                <button type="button" onClick={() => act(row, 'approve')}>
                                  {label('ext_approve')}
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
                                    {label('ext_rejectEllipsis')}
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {row.href ? (
                              <Link href={row.href} onClick={() => setMenuFor(null)}>
                                {label('ext_openModule')}
                              </Link>
                            ) : null}
                            {row.matterHref ? (
                              <Link href={row.matterHref} onClick={() => setMenuFor(null)}>
                                {label('ext_openMatter')}
                              </Link>
                            ) : null}
                            {row.source === 'work' &&
                            row.status !== 'DRAFT' &&
                            row.status !== 'REJECTED' &&
                            !(canDecide && row.status === 'SUBMITTED') &&
                            !row.matterHref ? (
                              <span className="muted tiny">{label('ext_noPending')}</span>
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
