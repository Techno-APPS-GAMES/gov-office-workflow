'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

type MatterOpt = { id: string; diaryNo: string; subject: string };

type Speech = {
  id: string;
  title: string;
  body: string;
  bodyUr?: string | null;
  talkingPoints?: string | null;
  talkingPointsUr?: string | null;
  language: string;
  status: string;
  eventDate?: string | null;
  eventVenue?: string | null;
  matterId?: string | null;
  sourcesNote?: string | null;
  aiAssisted?: boolean;
  humanReviewedAt?: string | null;
  approvedAt?: string | null;
  updatedAt?: string;
  author?: { displayName: string } | null;
  matter?: { id: string; diaryNo: string; subject: string } | null;
};

const FLOW = [
  { n: 1, t: 'Prepare remarks' },
  { n: 2, t: 'Source / AI assist' },
  { n: 3, t: 'Human review & authorize' },
  { n: 4, t: 'Teleprompter live' },
];

const emptyForm = {
  title: '',
  body: '',
  bodyUr: '',
  talkingPoints: '',
  talkingPointsUr: '',
  language: 'en',
  eventDate: '',
  eventVenue: '',
  matterId: '',
  sourcesNote: '',
};

function speechCode(id: string) {
  return `W-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function langLabel(l: string) {
  return l === 'ur' ? 'URDU' : 'ENGLISH';
}

function statusLabel(s: string) {
  if (s === 'APPROVED') return 'Approved';
  if (s === 'SUBMITTED') return 'Awaiting approval';
  if (s === 'REJECTED') return 'Rejected';
  if (s === 'ARCHIVED') return 'Archived';
  return 'Draft';
}

function statusClass(s: string) {
  if (s === 'APPROVED') return 'ok';
  if (s === 'SUBMITTED') return 'wait';
  if (s === 'REJECTED') return 'bad';
  if (s === 'ARCHIVED') return 'draft';
  return 'draft';
}

function stripMarker(body: string) {
  return body.replace(/\n?<!--gow-ver:\d+-->/g, '').trim();
}

function versionCount(body: string) {
  const m = body.match(/<!--gow-ver:(\d+)-->/);
  return m ? Number(m[1]) : 1;
}

export default function SpeechesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Speech[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prompterId, setPrompterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [edit, setEdit] = useState(emptyForm);
  const [rejectReason, setRejectReason] = useState('');
  const [prompterMode, setPrompterMode] = useState<'remarks' | 'points'>('remarks');
  const [prompterLang, setPrompterLang] = useState<'en' | 'ur'>('en');
  const [fontScale, setFontScale] = useState(1);
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const [mirror, setMirror] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [rows, mats] = await Promise.all([
      api<Speech[]>('/speeches'),
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
      if (focus) setOpenId(focus);
    } catch {
      /* ignore */
    }
  }, []);

  const selected = useMemo(
    () => items.find((s) => s.id === openId) || null,
    [items, openId],
  );

  const prompter = useMemo(
    () => items.find((s) => s.id === prompterId) || null,
    [items, prompterId],
  );

  const visible = useMemo(() => {
    if (filter === 'ALL') return items.filter((s) => s.status !== 'ARCHIVED');
    return items.filter((s) => s.status === filter);
  }, [items, filter]);

  useEffect(() => {
    if (!selected) return;
    setEdit({
      title: selected.title,
      body: stripMarker(selected.body),
      bodyUr: selected.bodyUr || '',
      talkingPoints: selected.talkingPoints || '',
      talkingPointsUr: selected.talkingPointsUr || '',
      language: selected.language || 'en',
      eventDate: selected.eventDate ? selected.eventDate.slice(0, 10) : '',
      eventVenue: selected.eventVenue || '',
      matterId: selected.matterId || '',
      sourcesNote: selected.sourcesNote || '',
    });
    setRejectReason('');
  }, [selected]);

  useEffect(() => {
    if (!prompter) return;
    setPrompterLang(prompter.language === 'ur' ? 'ur' : 'en');
    setPrompterMode('remarks');
  }, [prompter]);

  useEffect(() => {
    if (!prompter || scrollSpeed === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = window.setInterval(() => {
      el.scrollTop += scrollSpeed;
    }, 40);
    return () => window.clearInterval(id);
  }, [prompter, scrollSpeed]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/speeches', {
        method: 'POST',
        json: {
          ...form,
          matterId: form.matterId || undefined,
          eventDate: form.eventDate || undefined,
        },
      });
      toast.success('Speech prepared');
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
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/speeches/${selected.id}`, {
        method: 'PATCH',
        json: {
          ...edit,
          matterId: edit.matterId || null,
          eventDate: edit.eventDate || null,
          ...extra,
        },
      });
      toast.success(extra?.markHumanReviewed ? 'Human review recorded' : 'Speech saved');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string, reason?: string) {
    setBusy(true);
    try {
      await api(`/speeches/${id}/status`, {
        method: 'PATCH',
        json: { status, reason },
      });
      toast.success(
        status === 'APPROVED'
          ? 'Speech authorized for prompter'
          : status === 'SUBMITTED'
            ? 'Submitted for authorization'
            : status === 'REJECTED'
              ? 'Speech returned for revision'
              : 'Status updated',
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  }

  async function aiDraft() {
    if (!selected) return;
    setAiBusy(true);
    try {
      const lang = edit.language === 'ur' ? 'Urdu' : 'English';
      const res = await api<{ answer: string }>('/ai/ask', {
        method: 'POST',
        json: {
          matterId: edit.matterId || undefined,
          question: `Draft polished Speaker remarks in ${lang} for formal parliamentary delivery. Human review is mandatory before official use. Title: ${edit.title}. Event venue: ${edit.eventVenue || 'n/a'}. Existing notes:\n${edit.body}\n\nAlso suggest 4–8 short talking points as a separate bullet list after a line that says TALKING POINTS:`,
        },
      });
      const answer = res.answer || '';
      const split = answer.split(/TALKING POINTS:/i);
      const remarks = (split[0] || answer).trim();
      const points = (split[1] || '').trim();
      setEdit((prev) => ({
        ...prev,
        body: remarks || prev.body,
        talkingPoints: points || prev.talkingPoints,
      }));
      await api(`/speeches/${selected.id}`, {
        method: 'PATCH',
        json: {
          body: remarks || edit.body,
          talkingPoints: points || edit.talkingPoints,
          aiAssisted: true,
        },
      });
      toast.success('AI draft inserted — mark human review before submit');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI draft unavailable');
    } finally {
      setAiBusy(false);
    }
  }

  function prompterText(s: Speech) {
    if (prompterMode === 'points') {
      const pts =
        prompterLang === 'ur'
          ? s.talkingPointsUr || s.talkingPoints || ''
          : s.talkingPoints || s.talkingPointsUr || '';
      return pts.trim() || 'No talking points recorded.';
    }
    if (prompterLang === 'ur') {
      return stripMarker(s.bodyUr || s.body);
    }
    return stripMarker(s.body);
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · REMARKS
          </div>
          <h1>Speeches &amp; prompter</h1>
          <p className="muted">
            Prepare briefs and speeches from authorized source material (consultation §3.5), keep
            EN/UR text and talking points, require human review of AI drafts, authorize, then
            deliver from the Speaker prompter.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Prepare speech'}
        </button>
      </div>

      <div className="speech-flow">
        {FLOW.map((s) => (
          <div key={s.n} className="speech-flow-step">
            <span>{s.n}</span>
            <strong>{s.t}</strong>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="panel">
          <h2>Prepare remarks</h2>
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
              Primary language
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </label>
            <label>
              Event date
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </label>
            <label>
              Venue / occasion
              <input
                value={form.eventVenue}
                onChange={(e) => setForm({ ...form, eventVenue: e.target.value })}
                placeholder="e.g. National Assembly Chamber"
              />
            </label>
            <label>
              Source matter (optional)
              <select
                value={form.matterId}
                onChange={(e) => setForm({ ...form, matterId: e.target.value })}
              >
                <option value="">No linked matter</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source citations
              <input
                value={form.sourcesNote}
                onChange={(e) => setForm({ ...form, sourcesNote: e.target.value })}
                placeholder="Diary nos, brief titles, attachments reviewed"
              />
            </label>
            <label>
              Remarks (primary)
              <textarea
                rows={5}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
                minLength={10}
                dir={form.language === 'ur' ? 'rtl' : 'ltr'}
              />
            </label>
            <label>
              Remarks (Urdu / second language)
              <textarea
                rows={4}
                value={form.bodyUr}
                onChange={(e) => setForm({ ...form, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              Talking points
              <textarea
                rows={3}
                value={form.talkingPoints}
                onChange={(e) => setForm({ ...form, talkingPoints: e.target.value })}
                placeholder="Short bullets for briefing / prompter"
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Save draft speech
            </button>
          </form>
        </div>
      ) : null}

      <div className="speech-toolbar">
        {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${filter === f ? 'primary' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'Active' : statusLabel(f)}
          </button>
        ))}
      </div>

      <div className="speech-grid">
        {visible.length === 0 ? (
          <div className="panel">
            <p className="muted">No speeches in this filter. Prepare remarks to begin.</p>
          </div>
        ) : (
          visible.map((s) => {
            const approved = s.status === 'APPROVED';
            return (
              <article key={s.id} className="speech-card">
                <div className="speech-meta">
                  {speechCode(s.id)} · {langLabel(s.language)}
                  {s.matter ? ` · ${s.matter.diaryNo}` : ''}
                </div>
                <h3>{s.title}</h3>
                <div className="speech-card-mid">
                  <span className={`speech-status ${statusClass(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                  <span className="muted tiny">
                    {versionCount(s.body)} version(s)
                    {s.aiAssisted ? ' · AI-assisted' : ''}
                  </span>
                </div>
                {s.eventVenue ? <p className="muted tiny">{s.eventVenue}</p> : null}
                <div className="speech-card-actions">
                  <button type="button" className="btn" onClick={() => setOpenId(s.id)}>
                    Open speech record
                  </button>
                  {approved ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => setPrompterId(s.id)}
                    >
                      Open Speaker prompter
                    </button>
                  ) : null}
                </div>
                {!approved ? (
                  <div className="speech-note">
                    Authorize the reviewed speech before using the prompter.
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {selected ? (
        <div className="meet-drawer-backdrop" onClick={() => setOpenId(null)}>
          <aside className="meet-drawer speech-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="meet-section-head">
              <div>
                <div className="eyebrow">
                  {speechCode(selected.id)} · {langLabel(selected.language)} ·{' '}
                  {statusLabel(selected.status)}
                </div>
                <h2>Speech record</h2>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>

            {selected.aiAssisted ? (
              <div className={`speech-ai-banner ${selected.humanReviewedAt ? 'ok' : 'warn'}`}>
                {selected.humanReviewedAt
                  ? 'AI-assisted text — human review recorded'
                  : 'AI-assisted text — human review required before submit/approve'}
              </div>
            ) : null}

            {selected.matter ? (
              <p className="muted tiny">
                Source matter:{' '}
                <Link href={`/files/${selected.matter.id}`}>
                  {selected.matter.diaryNo} — {selected.matter.subject}
                </Link>
              </p>
            ) : null}

            <label className="speech-field">
              Title
              <input
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label className="speech-field">
              Language
              <select
                value={edit.language}
                onChange={(e) => setEdit({ ...edit, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </label>
            <label className="speech-field">
              Event date
              <input
                type="date"
                value={edit.eventDate}
                onChange={(e) => setEdit({ ...edit, eventDate: e.target.value })}
              />
            </label>
            <label className="speech-field">
              Venue
              <input
                value={edit.eventVenue}
                onChange={(e) => setEdit({ ...edit, eventVenue: e.target.value })}
              />
            </label>
            <label className="speech-field">
              Source matter
              <select
                value={edit.matterId}
                onChange={(e) => setEdit({ ...edit, matterId: e.target.value })}
              >
                <option value="">None</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="speech-field">
              Source citations
              <textarea
                rows={2}
                value={edit.sourcesNote}
                onChange={(e) => setEdit({ ...edit, sourcesNote: e.target.value })}
              />
            </label>
            <label className="speech-field">
              Remarks (primary)
              <textarea
                rows={8}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                dir={edit.language === 'ur' ? 'rtl' : 'ltr'}
              />
            </label>
            <label className="speech-field">
              Remarks (Urdu)
              <textarea
                rows={5}
                value={edit.bodyUr}
                onChange={(e) => setEdit({ ...edit, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label className="speech-field">
              Talking points
              <textarea
                rows={4}
                value={edit.talkingPoints}
                onChange={(e) => setEdit({ ...edit, talkingPoints: e.target.value })}
              />
            </label>
            <label className="speech-field">
              Talking points (Urdu)
              <textarea
                rows={3}
                value={edit.talkingPointsUr}
                onChange={(e) => setEdit({ ...edit, talkingPointsUr: e.target.value })}
                dir="rtl"
              />
            </label>

            <div className="speech-drawer-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => saveEdit()}>
                Save version
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? 'Drafting…' : 'AI assist (source-grounded)'}
              </button>
              {selected.aiAssisted && !selected.humanReviewedAt ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => saveEdit({ markHumanReviewed: true })}
                >
                  Mark human review complete
                </button>
              ) : null}
              <Link href="/ai" className="btn">
                Open AI Helper
              </Link>
              {(selected.status === 'DRAFT' || selected.status === 'REJECTED') ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'SUBMITTED')}
                >
                  Submit for authorization
                </button>
              ) : null}
              {canAuthorize && selected.status !== 'APPROVED' && selected.status !== 'ARCHIVED' ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'APPROVED')}
                >
                  Authorize speech
                </button>
              ) : null}
              {canAuthorize && selected.status === 'SUBMITTED' ? (
                <>
                  <input
                    className="speech-reject-input"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reject reason"
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || rejectReason.trim().length < 5}
                    onClick={() => setStatus(selected.id, 'REJECTED', rejectReason)}
                  >
                    Reject / return
                  </button>
                </>
              ) : null}
              {selected.status === 'APPROVED' ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setPrompterId(selected.id);
                    setOpenId(null);
                  }}
                >
                  Open prompter
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {prompter ? (
        <div className={`speech-prompter ${mirror ? 'mirror' : ''}`}>
          <div className="speech-prompter-bar">
            <div>
              <div className="eyebrow">Speaker prompter · live</div>
              <strong>{prompter.title}</strong>
              {prompter.eventVenue ? (
                <div className="muted tiny" style={{ color: '#9bb5a6' }}>
                  {prompter.eventVenue}
                </div>
              ) : null}
            </div>
            <div className="speech-prompter-controls">
              <button
                type="button"
                className={`btn ${prompterMode === 'remarks' ? 'primary' : ''}`}
                onClick={() => setPrompterMode('remarks')}
              >
                Remarks
              </button>
              <button
                type="button"
                className={`btn ${prompterMode === 'points' ? 'primary' : ''}`}
                onClick={() => setPrompterMode('points')}
              >
                Talking points
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setPrompterLang((l) => (l === 'en' ? 'ur' : 'en'))}
              >
                {prompterLang === 'en' ? 'EN → UR' : 'UR → EN'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setFontScale((v) => Math.min(1.8, v + 0.1))}
              >
                A+
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setFontScale((v) => Math.max(0.7, v - 0.1))}
              >
                A−
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setScrollSpeed((v) => (v === 0 ? 1 : v === 1 ? 2 : 0))}
              >
                {scrollSpeed === 0 ? 'Scroll' : scrollSpeed === 1 ? 'Faster' : 'Pause'}
              </button>
              <button type="button" className="btn" onClick={() => setMirror((v) => !v)}>
                Mirror
              </button>
              <button type="button" className="btn" onClick={() => setPrompterId(null)}>
                Exit
              </button>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="speech-prompter-body"
            dir={prompterLang === 'ur' ? 'rtl' : 'ltr'}
            style={{ fontSize: `calc(clamp(28px, 4.2vw, 48px) * ${fontScale})` }}
          >
            {prompterText(prompter)}
          </div>
        </div>
      ) : null}
    </>
  );
}
