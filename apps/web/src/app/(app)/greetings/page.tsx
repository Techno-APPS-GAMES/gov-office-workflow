'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { tf } from '@/lib/i18n';

type MatterOpt = { id: string; diaryNo: string; subject: string };

type Greeting = {
  id: string;
  occasion: string;
  occasionKey?: string | null;
  occasionDate?: string | null;
  titleUr?: string | null;
  recipient: string;
  recipientCount?: number;
  message: string;
  messageUr?: string | null;
  style?: string;
  channel?: string;
  cardCode?: string | null;
  dispatchRef?: string | null;
  matterId?: string | null;
  sourcesNote?: string | null;
  deliveryNote?: string | null;
  aiAssisted?: boolean;
  humanReviewedAt?: string | null;
  rejectReason?: string | null;
  status: string;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  author?: { displayName: string; role?: string } | null;
  matter?: { id: string; diaryNo: string; subject: string } | null;
};

type Occasion = {
  key: string;
  tag: string;
  title: string;
  titleUr: string;
  date: string;
  audience: string;
  defaultRecipient: string;
  defaultCount: number;
  defaultStyle: string;
  sampleEn: string;
  sampleUr: string;
};

const RECIPIENT_CATS = [
  { title: 'Parliamentarians & Senate', detail: '342 MNAs & 100 Senators', icon: '🏛' },
  { title: 'Diplomatic Corps', detail: '128 Foreign Ambassadors & High Commissioners', icon: '🌐' },
  {
    title: 'Federal & Provincial Leadership',
    detail: 'President, PM, Governors, Chief Ministers, Speakers',
    icon: 'PK',
  },
  {
    title: 'Judiciary & Constitutional Dignitaries',
    detail: 'Chief Justice, CEC, Auditor General',
    icon: '⚖',
  },
];

const STYLES: Record<string, string> = {
  STATE_GOLD: 'STATE GOLD LETTERPRESS & NATIONAL EMBLEM',
  DIPLOMATIC: 'DIPLOMATIC CREST & CALLIGRAPHY',
  CONSTITUTIONAL: 'CONSTITUTIONAL GREEN & SILVER FOIL',
};

const emptyForm = {
  occasion: '',
  occasionKey: '',
  occasionDate: '',
  titleUr: '',
  recipient: '',
  recipientCount: 100,
  message: '',
  messageUr: '',
  style: 'STATE_GOLD',
  channel: 'PROTOCOL_ECARD',
  matterId: '',
  sourcesNote: '',
  deliveryNote: '',
};

function styleLabel(s: string | null | undefined, label: (k: string) => string) {
  const k = s || 'STATE_GOLD';
  return STYLES[k] ? label(`grt_style_${k}`) : s || label('grt_style_STATE_GOLD');
}

const TAG_KEYS: Record<string, string> = {
  'Religious Occasion': 'grt_tag_religious',
  'National Day': 'grt_tag_national',
  'Constitutional Day': 'grt_tag_constitutional',
  'National & Religious Observance': 'grt_tag_natrel',
  'Diplomatic Protocol': 'grt_tag_diplomatic',
};

function tagLabel(tag: string, label: (k: string) => string) {
  const k = TAG_KEYS[tag];
  return k ? label(k) : tag;
}

function occKey(key: string) {
  return key.replace(/-/g, '_');
}

function channelLabel(c: string, label: (k: string) => string) {
  return ['PROTOCOL_ECARD', 'PRINT', 'BOTH'].includes(c) ? label(`grt_ch_${c}`) : c.replace(/_/g, ' ');
}

function fmtDay(iso: string, locale?: string) {
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtWhen(iso?: string | null, locale?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusLabel(s: string, label: (k: string) => string) {
  if (s === 'APPROVED') return label('approved');
  if (s === 'DISPATCHED') return label('enum_DISPATCHED');
  if (s === 'SUBMITTED') return label('spc_awaitingApproval');
  if (s === 'REJECTED') return label('rejected');
  return label('draft');
}

export default function GreetingsPage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
  const toast = useToast();
  const [items, setItems] = useState<Greeting[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<Greeting | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectForId, setRejectForId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [rows, mats, occ] = await Promise.all([
      api<Greeting[]>('/greetings'),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
      api<Occasion[]>('/greetings/occasions').catch(() => [] as Occasion[]),
    ]);
    setItems(rows);
    setMatters(mats);
    setOccasions(occ);
  }, []);

  useLiveRefresh(load, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    try {
      const focus = new URLSearchParams(window.location.search).get('focus');
      if (focus) setEditId(focus);
    } catch {
      /* ignore */
    }
  }, []);

  const editing = useMemo(
    () => items.find((g) => g.id === editId) || null,
    [items, editId],
  );

  useEffect(() => {
    if (!editing) return;
    setForm({
      occasion: editing.occasion,
      occasionKey: editing.occasionKey || '',
      occasionDate: editing.occasionDate ? editing.occasionDate.slice(0, 10) : '',
      titleUr: editing.titleUr || '',
      recipient: editing.recipient,
      recipientCount: editing.recipientCount || 0,
      message: editing.message,
      messageUr: editing.messageUr || '',
      style: editing.style || 'STATE_GOLD',
      channel: editing.channel || 'PROTOCOL_ECARD',
      matterId: editing.matterId || '',
      sourcesNote: editing.sourcesNote || '',
      deliveryNote: editing.deliveryNote || '',
    });
    setRejectReason('');
  }, [editing]);

  const kpis = useMemo(() => {
    const drafts = items.filter((g) => g.status === 'DRAFT' || g.status === 'REJECTED').length;
    const submitted = items.filter((g) => g.status === 'SUBMITTED').length;
    const approved = items.filter((g) => g.status === 'APPROVED').length;
    const dispatched = items.filter((g) => g.status === 'DISPATCHED').length;
    const recipients = items
      .filter((g) => g.status === 'DISPATCHED')
      .reduce((n, g) => n + (g.recipientCount || 0), 0);
    return { total: items.length, drafts, submitted, approved, dispatched, recipients };
  }, [items]);

  const occasionStats = useMemo(() => {
    const map = new Map<string, { draft: number; approved: number; dispatched: number; submitted: number }>();
    for (const o of occasions) map.set(o.key, { draft: 0, approved: 0, dispatched: 0, submitted: 0 });
    for (const g of items) {
      const key =
        g.occasionKey ||
        occasions.find((o) =>
          g.occasion.toLowerCase().includes(o.title.split('(')[0].trim().toLowerCase()),
        )?.key;
      if (!key || !map.has(key)) continue;
      const slot = map.get(key)!;
      if (g.status === 'DRAFT' || g.status === 'REJECTED') slot.draft += 1;
      else if (g.status === 'SUBMITTED') slot.submitted += 1;
      else if (g.status === 'APPROVED') slot.approved += 1;
      else if (g.status === 'DISPATCHED') slot.dispatched += 1;
    }
    return map;
  }, [items, occasions]);

  const filtered = useMemo(() => {
    let rows = items;
    if (filterKey !== 'all') {
      rows = rows.filter(
        (g) =>
          g.occasionKey === filterKey ||
          g.occasion
            .toLowerCase()
            .includes(
              occasions.find((o) => o.key === filterKey)?.title.split('(')[0].trim().toLowerCase() ||
                '',
            ),
      );
    }
    if (statusFilter !== 'ALL') rows = rows.filter((g) => g.status === statusFilter);
    return rows;
  }, [items, filterKey, statusFilter, occasions]);

  function fillFromOccasion(o: Occasion) {
    setForm({
      ...emptyForm,
      occasion: `${o.title.replace(/\s*\(.*\)/, '')} Felicitations`,
      occasionKey: o.key,
      occasionDate: o.date,
      titleUr: o.titleUr,
      recipient: o.defaultRecipient,
      recipientCount: o.defaultCount,
      message: o.sampleEn,
      messageUr: o.sampleUr,
      style: o.defaultStyle,
    });
    setShowForm(true);
    setEditId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/greetings', {
        method: 'POST',
        json: {
          ...form,
          recipientCount: Number(form.recipientCount) || 0,
          occasionKey: form.occasionKey || undefined,
          occasionDate: form.occasionDate || undefined,
          matterId: form.matterId || undefined,
          sourcesNote: form.sourcesNote || undefined,
          deliveryNote: form.deliveryNote || undefined,
        },
      });
      toast.success(label('grt_toastDrafted'));
      setShowForm(false);
      setForm(emptyForm);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('createFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(extra?: { markHumanReviewed?: boolean; aiAssisted?: boolean }) {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/greetings/${editing.id}`, {
        method: 'PATCH',
        json: {
          ...form,
          recipientCount: Number(form.recipientCount) || 0,
          matterId: form.matterId || null,
          occasionDate: form.occasionDate || null,
          ...extra,
        },
      });
      toast.success(
        extra?.markHumanReviewed ? label('spc_toastReviewed') : label('grt_toastSaved'),
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string, opts?: { reason?: string; deliveryNote?: string }) {
    setBusy(true);
    try {
      await api(`/greetings/${id}/status`, {
        method: 'PATCH',
        json: { status, ...opts },
      });
      toast.success(
        status === 'APPROVED'
          ? label('grt_toastAuthorized')
          : status === 'DISPATCHED'
            ? label('grt_toastDispatched')
            : status === 'SUBMITTED'
              ? label('spc_toastSubmitted')
              : status === 'REJECTED'
                ? label('prs_toastReturned')
                : label('spc_toastStatus'),
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('prs_updateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function aiDraft() {
    setAiBusy(true);
    try {
      const res = await api<{ answer: string }>('/ai/ask', {
        method: 'POST',
        json: {
          matterId: form.matterId || undefined,
          question: `Draft formal Speaker of the National Assembly felicitation text. Output:
EN_MESSAGE: (2-3 short formal paragraphs)
UR_MESSAGE: (Urdu felicitation)
Occasion: ${form.occasion}. Recipients: ${form.recipient}. Notes:\n${form.message}
Human review is mandatory before official dispatch.`,
        },
      });
      const text = res.answer || '';
      const grab = (tag: string) => {
        const m = text.match(
          new RegExp(`${tag}:\\s*([\\s\\S]*?)(?=\\n(?:EN_|UR_)[A-Z]+:|$)`, 'i'),
        );
        return (m?.[1] || '').trim();
      };
      const en = grab('EN_MESSAGE') || form.message;
      const ur = grab('UR_MESSAGE') || form.messageUr;
      setForm((prev) => ({ ...prev, message: en, messageUr: ur }));
      if (editing) {
        await api(`/greetings/${editing.id}`, {
          method: 'PATCH',
          json: { message: en, messageUr: ur, aiAssisted: true },
        });
        notifyDataChanged();
        await load();
      }
      toast.success(label('spc_toastAiInserted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('spc_aiUnavailable'));
    } finally {
      setAiBusy(false);
    }
  }

  function occasionBadge(key: string) {
    const s = occasionStats.get(key) || { draft: 0, approved: 0, dispatched: 0, submitted: 0 };
    if (s.dispatched && !s.draft && !s.approved && !s.submitted) return `✓ ${label('enum_DISPATCHED')}`;
    if (s.submitted) return `⏳ ${label('prs_kpiReview')} (${s.submitted})`;
    if (s.approved) return `★ ${label('grt_authorized')} (${s.approved})`;
    if (s.draft) return `✎ ${label('draft')} (${s.draft})`;
    if (s.dispatched) return `✓ ${label('enum_DISPATCHED')} (${s.dispatched})`;
    return label('grt_noCardYet');
  }

  const formFields = (
    <>
      <label>
        {label('grt_occasionTitle')}
        <input
          value={form.occasion}
          onChange={(e) => setForm({ ...form, occasion: e.target.value })}
          required
          minLength={3}
        />
      </label>
      <label>
        {label('grt_titleUr')}
        <input
          value={form.titleUr}
          onChange={(e) => setForm({ ...form, titleUr: e.target.value })}
          dir="rtl"
        />
      </label>
      <label>
        {label('grt_recipientGroup')}
        <input
          value={form.recipient}
          onChange={(e) => setForm({ ...form, recipient: e.target.value })}
          required
        />
      </label>
      <label>
        {label('grt_dignCount')}
        <input
          type="number"
          min={0}
          value={form.recipientCount}
          onChange={(e) => setForm({ ...form, recipientCount: Number(e.target.value) })}
        />
      </label>
      <label>
        {label('grt_templateStyle')}
        <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
          <option value="STATE_GOLD">{label('grt_styleOpt_STATE_GOLD')}</option>
          <option value="DIPLOMATIC">{label('grt_styleOpt_DIPLOMATIC')}</option>
          <option value="CONSTITUTIONAL">{label('grt_styleOpt_CONSTITUTIONAL')}</option>
        </select>
      </label>
      <label>
        {label('grt_dispatchChannel')}
        <select
          value={form.channel}
          onChange={(e) => setForm({ ...form, channel: e.target.value })}
        >
          <option value="PROTOCOL_ECARD">{label('grt_ch_PROTOCOL_ECARD')}</option>
          <option value="PRINT">{label('grt_ch_PRINT')}</option>
          <option value="BOTH">{label('grt_ch_BOTH')}</option>
        </select>
      </label>
      <label>
        {label('grt_occasionDate')}
        <input
          type="date"
          value={form.occasionDate}
          onChange={(e) => setForm({ ...form, occasionDate: e.target.value })}
        />
      </label>
      <label>
        {label('grt_linkedMatter')}
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
        {label('grt_enFelic')}
        <textarea
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
          minLength={20}
        />
      </label>
      <label>
        {label('grt_urFelic')}
        <textarea
          rows={4}
          value={form.messageUr}
          onChange={(e) => setForm({ ...form, messageUr: e.target.value })}
          dir="rtl"
        />
      </label>
      <label>
        {label('grt_sourceNote')}
        <input
          value={form.sourcesNote}
          onChange={(e) => setForm({ ...form, sourcesNote: e.target.value })}
        />
      </label>
    </>
  );

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('grt_eyebrowProtocol')}
          </div>
          <h1>{label('grt_title')}</h1>
          <p className="muted">
            {label('grt_heroSub')}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('mtg_closeForm') : label('grt_issue')}
        </button>
      </div>

      <div className="greet-kpis">
        <div className="greet-kpi">
          <div className="label">{label('grt_kpiTotal')}</div>
          <div className="value">{kpis.total}</div>
          <div className="hint">{label('grt_kpiTotalHint')}</div>
        </div>
        <div className="greet-kpi">
          <div className="label">{label('prs_kpiReview')}</div>
          <div className="value">{kpis.submitted}</div>
          <div className="hint">{label('grt_kpiReviewHint')}</div>
        </div>
        <div className="greet-kpi">
          <div className="label">{label('prs_kpiDrafts')}</div>
          <div className="value">{kpis.drafts}</div>
          <div className="hint">{label('prs_kpiDraftsHint')}</div>
        </div>
        <div className="greet-kpi">
          <div className="label">{label('enum_DISPATCHED')}</div>
          <div className="value">{kpis.dispatched}</div>
          <div className="hint">{tf(lang, 'grt_kpiRecipients', { n: kpis.recipients })}</div>
        </div>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('grt_issueTitle')}</h2>
          <form className="grid-form" onSubmit={create}>
            {formFields}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={busy}>
                {label('prs_saveDraft')}
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? label('spc_drafting') : label('prs_aiAssist')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel greet-calendar-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">{label('grt_calEyebrow')}</div>
            <h2>{label('grt_upcoming')}</h2>
          </div>
          <span className="greet-track-badge">{label('grt_tracked')}</span>
        </div>
        <div className="greet-occasions">
          {occasions.map((o) => (
            <article key={o.key} className="greet-occasion">
              <div className="greet-occ-tag">{tagLabel(o.tag, label)}</div>
              <div className="greet-occ-date">{fmtDay(o.date, locale)}</div>
              <h3>{lang === 'ur' ? o.titleUr : label(`grt_occ_${occKey(o.key)}_title`)}</h3>
              {lang === 'ur' ? null : (
                <p className="greet-ur" dir="rtl">
                  {o.titleUr}
                </p>
              )}
              <p className="muted tiny">{label(`grt_occ_${occKey(o.key)}_audience`)}</p>
              <div className="greet-occ-status">{occasionBadge(o.key)}</div>
              <div className="greet-occ-actions">
                <button type="button" className="btn" onClick={() => setFilterKey(o.key)}>
                  {label('view')}
                </button>
                <button
                  type="button"
                  className="btn greet-issue-btn"
                  onClick={() => fillFromOccasion(o)}
                >
                  {label('grt_issueShort')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">{label('grt_dignDb')}</div>
        <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
          {label('grt_recipCats')}
        </h2>
        <div className="greet-recipients">
          {RECIPIENT_CATS.map((r, i) => (
            <div key={r.title} className="greet-recipient">
              <span className="greet-rec-icon">{r.icon}</span>
              <div>
                <strong>{label(`grt_cat${i + 1}_title`)}</strong>
                <div className="muted tiny">{label(`grt_cat${i + 1}_detail`)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="speech-toolbar">
        <button
          type="button"
          className={`btn ${filterKey === 'all' ? 'primary' : ''}`}
          onClick={() => setFilterKey('all')}
        >
          {label('grt_allOccasions')}
        </button>
        {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'DISPATCHED', 'REJECTED'].map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${statusFilter === f ? 'primary' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'ALL' ? label('grt_allStatus') : statusLabel(f, label)}
          </button>
        ))}
      </div>

      <div className="greet-cards">
        {filtered.length === 0 ? (
          <div className="panel">
            <p className="muted">{label('grt_noneInView')}</p>
          </div>
        ) : (
          filtered.map((g) => (
            <article key={g.id} className="greet-card">
              <div className="greet-card-top">
                <div className="greet-card-id">
                  {g.cardCode || `GC-${g.id.slice(0, 4)}`} · {styleLabel(g.style, label)}
                  {g.channel ? ` · ${channelLabel(g.channel, label)}` : ''}
                </div>
                <span className={`greet-status ${g.status.toLowerCase()}`}>
                  {statusLabel(g.status, label)}
                </span>
              </div>
              <h3>{g.occasion}</h3>
              {g.titleUr ? (
                <p className="greet-ur" dir="rtl">
                  {g.titleUr}
                </p>
              ) : null}
              {g.matter ? (
                <p className="muted tiny">
                  {label('grt_protocolFile')}:{' '}
                  <Link href={`/files/${g.matter.id}`}>
                    {g.matter.diaryNo} — {g.matter.subject}
                  </Link>
                </p>
              ) : null}
              {g.aiAssisted ? (
                <div
                  className={`speech-ai-banner ${g.humanReviewedAt ? 'ok' : 'warn'}`}
                  style={{ marginTop: 8 }}
                >
                  {g.humanReviewedAt
                    ? label('prs_aiReviewed')
                    : label('prs_aiReviewRequired')}
                </div>
              ) : null}
              <div className="greet-bilingual">
                <div>
                  <div className="eyebrow">{label('grt_enFelic')}</div>
                  <p>{g.message}</p>
                </div>
                <div>
                  <div className="eyebrow">{label('grt_urFelic')}</div>
                  <p dir="rtl">{g.messageUr || '—'}</p>
                </div>
              </div>
              <div className="greet-card-meta muted">
                {label('grt_recipientGroup')}: {g.recipient}
                {g.recipientCount ? ` (${tf(lang, 'grt_nDignitaries', { n: g.recipientCount })})` : ''}
                {g.approvedAt ? ` · ${label('approved')} ${fmtWhen(g.approvedAt, locale)}` : ''}
                {g.status === 'DISPATCHED' && g.dispatchRef
                  ? ` · ${label('grt_dispatchRef')}: ${g.dispatchRef}`
                  : ''}
              </div>
              {g.rejectReason ? (
                <p className="muted tiny">{label('spc_rejectReason')}: {g.rejectReason}</p>
              ) : null}
              <div className="greet-card-actions">
                <button type="button" className="btn" onClick={() => setPreview(g)}>
                  {label('grt_preview')}
                </button>
                {g.status !== 'DISPATCHED' ? (
                  <button type="button" className="btn" onClick={() => setEditId(g.id)}>
                    {label('prs_editReview')}
                  </button>
                ) : null}
                {(g.status === 'DRAFT' || g.status === 'REJECTED') ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setStatus(g.id, 'SUBMITTED')}
                  >
                    {label('spc_submitAuth')}
                  </button>
                ) : null}
                {canAuthorize && (g.status === 'DRAFT' || g.status === 'SUBMITTED') ? (
                  <button
                    type="button"
                    className="btn greet-auth-btn"
                    disabled={busy}
                    onClick={() => setStatus(g.id, 'APPROVED')}
                  >
                    {label('grt_authorizeCard')}
                  </button>
                ) : null}
                {canAuthorize && g.status === 'SUBMITTED' ? (
                  <>
                    <input
                      className="speech-reject-input"
                      style={{ maxWidth: 200 }}
                      value={rejectForId === g.id ? rejectReason : ''}
                      onChange={(e) => {
                        setRejectForId(g.id);
                        setRejectReason(e.target.value);
                      }}
                      placeholder={label('spc_rejectReason')}
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        busy || rejectReason.trim().length < 5 || rejectForId !== g.id
                      }
                      onClick={() => setStatus(g.id, 'REJECTED', { reason: rejectReason })}
                    >
                      {label('prs_reject')}
                    </button>
                  </>
                ) : null}
                {g.status === 'APPROVED' && canAuthorize ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => setStatus(g.id, 'DISPATCHED')}
                  >
                    {label('grt_dispatchCard')}
                  </button>
                ) : null}
                {g.status === 'DISPATCHED' ? (
                  <span className="btn greet-done-btn">
                    ✓ {label('enum_DISPATCHED')} {g.dispatchedAt ? fmtDay(g.dispatchedAt.slice(0, 10), locale) : ''}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      {editing ? (
        <div className="meet-drawer-backdrop" onClick={() => setEditId(null)}>
          <aside className="meet-drawer speech-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="meet-section-head">
              <div>
                <div className="eyebrow">
                  {editing.cardCode} · {statusLabel(editing.status, label)}
                </div>
                <h2>{label('grt_editTitle')}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                {label('close')}
              </button>
            </div>
            {editing.aiAssisted ? (
              <div className={`speech-ai-banner ${editing.humanReviewedAt ? 'ok' : 'warn'}`}>
                {editing.humanReviewedAt
                  ? label('prs_aiReviewed')
                  : label('prs_aiMarkReview')}
              </div>
            ) : null}
            <div className="grid-form">{formFields}</div>
            <div className="speech-drawer-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => saveEdit()}>
                {label('save')}
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? label('spc_drafting') : label('prs_aiAssist')}
              </button>
              {editing.aiAssisted && !editing.humanReviewedAt ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => saveEdit({ markHumanReviewed: true })}
                >
                  {label('prs_markReview')}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {preview ? (
        <div className="greet-modal" role="dialog" onClick={() => setPreview(null)}>
          <div className="greet-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">
              {preview.cardCode} · {styleLabel(preview.style, label)}
            </div>
            <h2>{preview.occasion}</h2>
            {preview.titleUr ? (
              <p className="greet-ur" dir="rtl">
                {preview.titleUr}
              </p>
            ) : null}
            <div className="greet-bilingual">
              <p>{preview.message}</p>
              <p dir="rtl">{preview.messageUr || '—'}</p>
            </div>
            <p className="muted tiny">
              {label('grt_to')}: {preview.recipient}
              {preview.recipientCount ? ` · ${tf(lang, 'grt_nDignitaries', { n: preview.recipientCount })}` : ''}
              {preview.dispatchRef ? ` · ${preview.dispatchRef}` : ''}
            </p>
            <button type="button" className="btn primary" onClick={() => setPreview(null)}>
              {label('prs_closePreview')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
