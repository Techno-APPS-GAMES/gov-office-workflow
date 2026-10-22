'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

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

const OCCASIONS: Occasion[] = [
  {
    key: 'eid-fitr-1447',
    tag: 'Religious Occasion',
    title: 'Eid-ul-Fitr 1447 AH',
    titleUr: 'عید الفطر مبارک',
    date: '2026-04-10',
    audience: 'All Dignitaries & Parliamentarians',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 470,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On the blessed occasion of Eid-ul-Fitr, the Speaker conveys heartfelt felicitations to the nation and the Muslim Ummah. May this day renew our commitment to compassion, unity and parliamentary harmony.',
    sampleUr:
      'عید الفطر کے بابرکت موقع پر اسپیکر قوم اور مسلم امہ کو دلی مبارکباد پیش کرتے ہیں۔ یہ دن رحمدلی، اتحاد اور پارلیمانی ہم آہنگی کے عزم کو تازہ کرے۔',
  },
  {
    key: 'pakistan-day-2026',
    tag: 'National Day',
    title: 'Pakistan Day (23rd March)',
    titleUr: 'یوم پاکستان',
    date: '2026-03-23',
    audience: 'Foreign Ambassadors & Governors',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 342,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'Warm felicitations on the historic occasion of Pakistan Day. Parliament renews its pledge to democratic values, federal harmony and the ideals of the Lahore Resolution.',
    sampleUr:
      'یوم پاکستان کے تاریخی موقع پر دلی مبارکباد۔ پارلیمان جمہوری اقدار، وفاقی ہم آہنگی اور قرارداد لاہور کے نظریات پر اپنے عہد کو تازہ کرتی ہے۔',
  },
  {
    key: 'independence-2026',
    tag: 'National Day',
    title: 'Independence Day (14th August)',
    titleUr: 'جشن آزادی پاکستان',
    date: '2026-08-14',
    audience: 'All National & Diplomatic Leadership',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 420,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On our auspicious Independence Day, Parliament honours the sacrifices of our founding forebears under Quaid-e-Azam Muhammad Ali Jinnah. May our democratic institutions grow ever resilient.',
    sampleUr:
      'یوم آزادی پر پارلیمان قائداعظم محمد علی جناح کی قیادت میں قربانیوں کو خراج تحسین پیش کرتی ہے۔ ہمارے جمہوری ادارے مزید مضبوط ہوں۔',
  },
  {
    key: 'constitution-2026',
    tag: 'Constitutional Day',
    title: 'Constitution Day (10th April)',
    titleUr: 'یوم دستور پاکستان',
    date: '2026-04-10',
    audience: 'Judiciary & Constitutional Dignitaries',
    defaultRecipient: 'Judiciary & Constitutional Dignitaries',
    defaultCount: 95,
    defaultStyle: 'DIPLOMATIC',
    sampleEn:
      'Commemorating Constitution Day, the custodian of the House honours the consensus-based 1973 Constitution as the sacred covenant upholding the rule of law and federal parliamentary democracy.',
    sampleUr:
      'یوم دستور پر ایوان کا محافظ دستورِ پاکستان ۱۹۷۳ کو قانون کی حکمرانی اور وفاقی پارلیمانی جمہوریت کے مقدس عہد کے طور پر خراجِ عقیدت پیش کرتا ہے۔',
  },
  {
    key: 'eid-azha-1447',
    tag: 'Religious Occasion',
    title: 'Eid-ul-Azha 1447 AH',
    titleUr: 'عید الاضحیٰ مبارک',
    date: '2026-06-17',
    audience: 'Parliamentarians & Muslim World Envoys',
    defaultRecipient: 'Federal Cabinet & Provincial Leadership',
    defaultCount: 175,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On Eid-ul-Azha, the Speaker conveys heartfelt felicitations on the spirit of sacrifice and brotherhood to the nation and the Islamic world.',
    sampleUr:
      'عید الاضحیٰ پر اسپیکر قربانی اور بھائی چارے کے جذبے پر قوم اور اسلامی دنیا کو دلی مبارکباد پیش کرتے ہیں۔',
  },
  {
    key: 'quaid-christmas-2026',
    tag: 'National & Religious Observance',
    title: 'Quaid-e-Azam Day & Christmas (25th December)',
    titleUr: 'یوم ولادت قائد اعظم اور کرسمس',
    date: '2026-12-25',
    audience: 'Parliamentarians, Christian Community & Diplomatic Corps',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps, Federal Cabinet & Provincial Leadership',
    defaultCount: 427,
    defaultStyle: 'CONSTITUTIONAL',
    sampleEn:
      'Heartfelt greetings to our Christian brethren celebrating Christmas and warmest tributes to our Father of the Nation on his birth anniversary.',
    sampleUr:
      'کرسمس منانے والے مسیحی بھائیوں کو دلی مبارکباد اور قائداعظم یومِ ولادت پر خراجِ عقیدت۔',
  },
  {
    key: 'diplomatic-ny-2027',
    tag: 'Diplomatic Protocol',
    title: 'Diplomatic New Year 2027',
    titleUr: 'نئے سال کی سفارتی مبارکباد',
    date: '2027-01-01',
    audience: 'International Parliamentary Speakers & Envoys',
    defaultRecipient: 'Foreign Heads of Mission & Ambassadors',
    defaultCount: 128,
    defaultStyle: 'DIPLOMATIC',
    sampleEn:
      'The National Assembly of Pakistan conveys warm regards and best wishes for peace and parliamentary cooperation in the New Year.',
    sampleUr:
      'قومی اسمبلی پاکستان نئے سال پر امن اور پارلیمانی تعاون کی نیک تمنائیں پیش کرتی ہے۔',
  },
];

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

function styleLabel(s?: string | null) {
  return STYLES[s || 'STATE_GOLD'] || s || STYLES.STATE_GOLD;
}

function fmtDay(iso: string) {
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusLabel(s: string) {
  if (s === 'APPROVED') return 'Approved';
  if (s === 'DISPATCHED') return 'Dispatched';
  if (s === 'SUBMITTED') return 'Awaiting approval';
  if (s === 'REJECTED') return 'Rejected';
  return 'Draft';
}

export default function GreetingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Greeting[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<Greeting | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState(emptyForm);

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [rows, mats] = await Promise.all([
      api<Greeting[]>('/greetings'),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
    ]);
    setItems(rows);
    setMatters(mats);
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
    for (const o of OCCASIONS) map.set(o.key, { draft: 0, approved: 0, dispatched: 0, submitted: 0 });
    for (const g of items) {
      const key =
        g.occasionKey ||
        OCCASIONS.find((o) =>
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
  }, [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (filterKey !== 'all') {
      rows = rows.filter(
        (g) =>
          g.occasionKey === filterKey ||
          g.occasion
            .toLowerCase()
            .includes(
              OCCASIONS.find((o) => o.key === filterKey)?.title.split('(')[0].trim().toLowerCase() ||
                '',
            ),
      );
    }
    if (statusFilter !== 'ALL') rows = rows.filter((g) => g.status === statusFilter);
    return rows;
  }, [items, filterKey, statusFilter]);

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
      toast.success('Greeting card drafted');
      setShowForm(false);
      setForm(emptyForm);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
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
      toast.success(extra?.markHumanReviewed ? 'Human review recorded' : 'Card saved');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
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
          ? 'Card authorized'
          : status === 'DISPATCHED'
            ? 'Card dispatched'
            : status === 'SUBMITTED'
              ? 'Submitted for authorization'
              : status === 'REJECTED'
                ? 'Returned for revision'
                : 'Status updated',
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
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
      const grab = (label: string) => {
        const m = text.match(
          new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:EN_|UR_)[A-Z]+:|$)`, 'i'),
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
      toast.success('AI draft inserted — mark human review before submit');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI draft unavailable');
    } finally {
      setAiBusy(false);
    }
  }

  function occasionBadge(key: string) {
    const s = occasionStats.get(key) || { draft: 0, approved: 0, dispatched: 0, submitted: 0 };
    if (s.dispatched && !s.draft && !s.approved && !s.submitted) return `✓ Dispatched`;
    if (s.submitted) return `⏳ In review (${s.submitted})`;
    if (s.approved) return `★ Authorized (${s.approved})`;
    if (s.draft) return `✎ Draft (${s.draft})`;
    if (s.dispatched) return `✓ Dispatched (${s.dispatched})`;
    return 'No card yet';
  }

  const formFields = (
    <>
      <label>
        Occasion / title
        <input
          value={form.occasion}
          onChange={(e) => setForm({ ...form, occasion: e.target.value })}
          required
          minLength={3}
        />
      </label>
      <label>
        Title (Urdu)
        <input
          value={form.titleUr}
          onChange={(e) => setForm({ ...form, titleUr: e.target.value })}
          dir="rtl"
        />
      </label>
      <label>
        Recipient group
        <input
          value={form.recipient}
          onChange={(e) => setForm({ ...form, recipient: e.target.value })}
          required
        />
      </label>
      <label>
        Dignitary count
        <input
          type="number"
          min={0}
          value={form.recipientCount}
          onChange={(e) => setForm({ ...form, recipientCount: Number(e.target.value) })}
        />
      </label>
      <label>
        Template style
        <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
          <option value="STATE_GOLD">State gold letterpress</option>
          <option value="DIPLOMATIC">Diplomatic crest</option>
          <option value="CONSTITUTIONAL">Constitutional green &amp; silver</option>
        </select>
      </label>
      <label>
        Dispatch channel
        <select
          value={form.channel}
          onChange={(e) => setForm({ ...form, channel: e.target.value })}
        >
          <option value="PROTOCOL_ECARD">Digital protocol e-card</option>
          <option value="PRINT">Print / letterpress</option>
          <option value="BOTH">Both digital + print</option>
        </select>
      </label>
      <label>
        Occasion date
        <input
          type="date"
          value={form.occasionDate}
          onChange={(e) => setForm({ ...form, occasionDate: e.target.value })}
        />
      </label>
      <label>
        Linked protocol matter
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
        English felicitations
        <textarea
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
          minLength={20}
        />
      </label>
      <label>
        Urdu felicitations
        <textarea
          rows={4}
          value={form.messageUr}
          onChange={(e) => setForm({ ...form, messageUr: e.target.value })}
          dir="rtl"
        />
      </label>
      <label>
        Source / protocol note
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
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · PROTOCOL
          </div>
          <h1>Parliamentary greeting cards &amp; felicitations</h1>
          <p className="muted">
            Consultation §3.5 — official correspondence and protocol communications: bilingual
            felicitations, Speaker authorization, and dignitary dispatch (digital / print).
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Issue greeting card'}
        </button>
      </div>

      <div className="greet-kpis">
        <div className="greet-kpi">
          <div className="label">Total greeting cards</div>
          <div className="value">{kpis.total}</div>
          <div className="hint">State felicitations</div>
        </div>
        <div className="greet-kpi">
          <div className="label">In review</div>
          <div className="value">{kpis.submitted}</div>
          <div className="hint">Awaiting authorization</div>
        </div>
        <div className="greet-kpi">
          <div className="label">Staff drafts</div>
          <div className="value">{kpis.drafts}</div>
          <div className="hint">Draft / rejected</div>
        </div>
        <div className="greet-kpi">
          <div className="label">Dispatched</div>
          <div className="value">{kpis.dispatched}</div>
          <div className="hint">{kpis.recipients} total recipients</div>
        </div>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>Issue greeting card</h2>
          <form className="grid-form" onSubmit={create}>
            {formFields}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={busy}>
                Save draft
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? 'Drafting…' : 'AI assist'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel greet-calendar-panel">
        <div className="remote-section-head">
          <div>
            <div className="eyebrow">Protocol calendar</div>
            <h2>Upcoming State &amp; Religious Occasions</h2>
          </div>
          <span className="greet-track-badge">Active occasions tracked</span>
        </div>
        <div className="greet-occasions">
          {OCCASIONS.map((o) => (
            <article key={o.key} className="greet-occasion">
              <div className="greet-occ-tag">{o.tag}</div>
              <div className="greet-occ-date">{fmtDay(o.date)}</div>
              <h3>{o.title}</h3>
              <p className="greet-ur" dir="rtl">
                {o.titleUr}
              </p>
              <p className="muted tiny">{o.audience}</p>
              <div className="greet-occ-status">{occasionBadge(o.key)}</div>
              <div className="greet-occ-actions">
                <button type="button" className="btn" onClick={() => setFilterKey(o.key)}>
                  View
                </button>
                <button
                  type="button"
                  className="btn greet-issue-btn"
                  onClick={() => fillFromOccasion(o)}
                >
                  + Issue
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">Dignitaries database</div>
        <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
          Protocol recipient categories
        </h2>
        <div className="greet-recipients">
          {RECIPIENT_CATS.map((r) => (
            <div key={r.title} className="greet-recipient">
              <span className="greet-rec-icon">{r.icon}</span>
              <div>
                <strong>{r.title}</strong>
                <div className="muted tiny">{r.detail}</div>
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
          All occasions
        </button>
        {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'DISPATCHED', 'REJECTED'].map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${statusFilter === f ? 'primary' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'ALL' ? 'All status' : statusLabel(f)}
          </button>
        ))}
      </div>

      <div className="greet-cards">
        {filtered.length === 0 ? (
          <div className="panel">
            <p className="muted">No greeting cards in this view. Issue one from the protocol calendar.</p>
          </div>
        ) : (
          filtered.map((g) => (
            <article key={g.id} className="greet-card">
              <div className="greet-card-top">
                <div className="greet-card-id">
                  {g.cardCode || `GC-${g.id.slice(0, 4)}`} · {styleLabel(g.style)}
                  {g.channel ? ` · ${g.channel.replace(/_/g, ' ')}` : ''}
                </div>
                <span className={`greet-status ${g.status.toLowerCase()}`}>
                  {statusLabel(g.status)}
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
                  Protocol file:{' '}
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
                    ? 'AI-assisted — human review recorded'
                    : 'AI-assisted — human review required before submit'}
                </div>
              ) : null}
              <div className="greet-bilingual">
                <div>
                  <div className="eyebrow">English felicitations</div>
                  <p>{g.message}</p>
                </div>
                <div>
                  <div className="eyebrow">Urdu felicitations</div>
                  <p dir="rtl">{g.messageUr || '—'}</p>
                </div>
              </div>
              <div className="greet-card-meta muted">
                Recipient group: {g.recipient}
                {g.recipientCount ? ` (${g.recipientCount} dignitaries)` : ''}
                {g.approvedAt ? ` · Approved ${fmtWhen(g.approvedAt)}` : ''}
                {g.status === 'DISPATCHED' && g.dispatchRef
                  ? ` · Dispatch Ref: ${g.dispatchRef}`
                  : ''}
              </div>
              {g.rejectReason ? (
                <p className="muted tiny">Reject reason: {g.rejectReason}</p>
              ) : null}
              <div className="greet-card-actions">
                <button type="button" className="btn" onClick={() => setPreview(g)}>
                  Preview card
                </button>
                {g.status !== 'DISPATCHED' ? (
                  <button type="button" className="btn" onClick={() => setEditId(g.id)}>
                    Edit / review
                  </button>
                ) : null}
                {(g.status === 'DRAFT' || g.status === 'REJECTED') ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setStatus(g.id, 'SUBMITTED')}
                  >
                    Submit for authorization
                  </button>
                ) : null}
                {canAuthorize && (g.status === 'DRAFT' || g.status === 'SUBMITTED') ? (
                  <button
                    type="button"
                    className="btn greet-auth-btn"
                    disabled={busy}
                    onClick={() => setStatus(g.id, 'APPROVED')}
                  >
                    Authorize card
                  </button>
                ) : null}
                {canAuthorize && g.status === 'SUBMITTED' ? (
                  <>
                    <input
                      className="speech-reject-input"
                      style={{ maxWidth: 200 }}
                      value={editId === g.id ? rejectReason : ''}
                      onChange={(e) => {
                        setEditId(g.id);
                        setRejectReason(e.target.value);
                      }}
                      placeholder="Reject reason"
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || rejectReason.trim().length < 5 || editId !== g.id}
                      onClick={() => setStatus(g.id, 'REJECTED', { reason: rejectReason })}
                    >
                      Reject
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
                    Dispatch card →
                  </button>
                ) : null}
                {g.status === 'DISPATCHED' ? (
                  <span className="btn greet-done-btn">
                    ✓ Dispatched {g.dispatchedAt ? fmtDay(g.dispatchedAt.slice(0, 10)) : ''}
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
                  {editing.cardCode} · {statusLabel(editing.status)}
                </div>
                <h2>Edit greeting card</h2>
              </div>
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                Close
              </button>
            </div>
            {editing.aiAssisted ? (
              <div className={`speech-ai-banner ${editing.humanReviewedAt ? 'ok' : 'warn'}`}>
                {editing.humanReviewedAt
                  ? 'AI-assisted — human review recorded'
                  : 'AI-assisted — mark human review before submit'}
              </div>
            ) : null}
            <div className="grid-form">{formFields}</div>
            <div className="speech-drawer-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => saveEdit()}>
                Save
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? 'Drafting…' : 'AI assist'}
              </button>
              {editing.aiAssisted && !editing.humanReviewedAt ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => saveEdit({ markHumanReviewed: true })}
                >
                  Mark human review
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
              {preview.cardCode} · {styleLabel(preview.style)}
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
              To: {preview.recipient}
              {preview.recipientCount ? ` · ${preview.recipientCount} dignitaries` : ''}
              {preview.dispatchRef ? ` · ${preview.dispatchRef}` : ''}
            </p>
            <button type="button" className="btn primary" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
