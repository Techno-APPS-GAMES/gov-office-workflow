'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { tf } from '@/lib/i18n';

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

const FLOW = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];

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

function langLabel(l: string, label: (k: string) => string) {
  return (l === 'ur' ? label('files_urdu') : label('files_english')).toUpperCase();
}

function statusLabel(s: string, label: (k: string) => string) {
  if (s === 'APPROVED') return label('approved');
  if (s === 'SUBMITTED') return label('spc_awaitingApproval');
  if (s === 'REJECTED') return label('rejected');
  if (s === 'ARCHIVED') return label('archived');
  return label('draft');
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
  const { user, label, lang } = useAuth();
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
      toast.success(label('spc_toastPrepared'));
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
      toast.success(
        extra?.markHumanReviewed ? label('spc_toastReviewed') : label('spc_toastSaved'),
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('saveFailed'));
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
          ? label('spc_toastAuthorized')
          : status === 'SUBMITTED'
            ? label('spc_toastSubmitted')
            : status === 'REJECTED'
              ? label('spc_toastReturned')
              : label('spc_toastStatus'),
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('spc_statusFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function aiDraft() {
    if (!selected) return;
    setAiBusy(true);
    try {
      const draftLang = edit.language === 'ur' ? 'Urdu' : 'English';
      const res = await api<{ answer: string }>('/ai/ask', {
        method: 'POST',
        json: {
          matterId: edit.matterId || undefined,
          question: `Draft polished Speaker remarks in ${draftLang} for formal parliamentary delivery. Human review is mandatory before official use. Title: ${edit.title}. Event venue: ${edit.eventVenue || 'n/a'}. Existing notes:\n${edit.body}\n\nAlso suggest 4–8 short talking points as a separate bullet list after a line that says TALKING POINTS:`,
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
      toast.success(label('spc_toastAiInserted'));
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('spc_aiUnavailable'));
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
      return pts.trim() || label('spc_noPoints');
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
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('spc_eyebrowRemarks')}
          </div>
          <h1>{label('spc_title')}</h1>
          <p className="muted">
            {label('spc_heroSub')}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('mtg_closeForm') : label('spc_prepare')}
        </button>
      </div>

      <div className="speech-flow">
        {FLOW.map((s) => (
          <div key={s.n} className="speech-flow-step">
            <span>{s.n}</span>
            <strong>{label(`spc_flow${s.n}`)}</strong>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('spc_prepareRemarks')}</h2>
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
              {label('spc_primaryLang')}
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">{label('files_english')}</option>
                <option value="ur">{label('files_urdu')}</option>
              </select>
            </label>
            <label>
              {label('spc_eventDate')}
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </label>
            <label>
              {label('spc_venueOccasion')}
              <input
                value={form.eventVenue}
                onChange={(e) => setForm({ ...form, eventVenue: e.target.value })}
                placeholder={label('spc_venuePh')}
              />
            </label>
            <label>
              {label('spc_sourceMatterOpt')}
              <select
                value={form.matterId}
                onChange={(e) => setForm({ ...form, matterId: e.target.value })}
              >
                <option value="">{label('spc_noLinkedMatter')}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('spc_sourceCitations')}
              <input
                value={form.sourcesNote}
                onChange={(e) => setForm({ ...form, sourcesNote: e.target.value })}
                placeholder={label('spc_citationsPh')}
              />
            </label>
            <label>
              {label('spc_remarksPrimary')}
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
              {label('spc_remarksSecond')}
              <textarea
                rows={4}
                value={form.bodyUr}
                onChange={(e) => setForm({ ...form, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              {label('spc_talkingPoints')}
              <textarea
                rows={3}
                value={form.talkingPoints}
                onChange={(e) => setForm({ ...form, talkingPoints: e.target.value })}
                placeholder={label('spc_pointsPh')}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {label('spc_saveDraft')}
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
            {f === 'ALL' ? label('active') : statusLabel(f, label)}
          </button>
        ))}
      </div>

      <div className="speech-grid">
        {visible.length === 0 ? (
          <div className="panel">
            <p className="muted">{label('spc_noneInFilter')}</p>
          </div>
        ) : (
          visible.map((s) => {
            const approved = s.status === 'APPROVED';
            return (
              <article key={s.id} className="speech-card">
                <div className="speech-meta">
                  {speechCode(s.id)} · {langLabel(s.language, label)}
                  {s.matter ? ` · ${s.matter.diaryNo}` : ''}
                </div>
                <h3>{s.title}</h3>
                <div className="speech-card-mid">
                  <span className={`speech-status ${statusClass(s.status)}`}>
                    {statusLabel(s.status, label)}
                  </span>
                  <span className="muted tiny">
                    {tf(lang, 'spc_versions', { n: versionCount(s.body) })}
                    {s.aiAssisted ? ` · ${label('spc_aiAssisted')}` : ''}
                  </span>
                </div>
                {s.eventVenue ? <p className="muted tiny">{s.eventVenue}</p> : null}
                <div className="speech-card-actions">
                  <button type="button" className="btn" onClick={() => setOpenId(s.id)}>
                    {label('spc_openRecord')}
                  </button>
                  {approved ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => setPrompterId(s.id)}
                    >
                      {label('spc_openPrompter')}
                    </button>
                  ) : null}
                </div>
                {!approved ? (
                  <div className="speech-note">
                    {label('spc_authorizeFirst')}
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
                  {speechCode(selected.id)} · {langLabel(selected.language, label)} ·{' '}
                  {statusLabel(selected.status, label)}
                </div>
                <h2>{label('spc_record')}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                {label('close')}
              </button>
            </div>

            {selected.aiAssisted ? (
              <div className={`speech-ai-banner ${selected.humanReviewedAt ? 'ok' : 'warn'}`}>
                {selected.humanReviewedAt
                  ? label('spc_aiReviewed')
                  : label('spc_aiReviewRequired')}
              </div>
            ) : null}

            {selected.matter ? (
              <p className="muted tiny">
                {label('spc_sourceMatter')}:{' '}
                <Link href={`/files/${selected.matter.id}`}>
                  {selected.matter.diaryNo} — {selected.matter.subject}
                </Link>
              </p>
            ) : null}

            <label className="speech-field">
              {label('title')}
              <input
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('files_language')}
              <select
                value={edit.language}
                onChange={(e) => setEdit({ ...edit, language: e.target.value })}
              >
                <option value="en">{label('files_english')}</option>
                <option value="ur">{label('files_urdu')}</option>
              </select>
            </label>
            <label className="speech-field">
              {label('spc_eventDate')}
              <input
                type="date"
                value={edit.eventDate}
                onChange={(e) => setEdit({ ...edit, eventDate: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('spc_venue')}
              <input
                value={edit.eventVenue}
                onChange={(e) => setEdit({ ...edit, eventVenue: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('spc_sourceMatter')}
              <select
                value={edit.matterId}
                onChange={(e) => setEdit({ ...edit, matterId: e.target.value })}
              >
                <option value="">{label('none')}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="speech-field">
              {label('spc_sourceCitations')}
              <textarea
                rows={2}
                value={edit.sourcesNote}
                onChange={(e) => setEdit({ ...edit, sourcesNote: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('spc_remarksPrimary')}
              <textarea
                rows={8}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                dir={edit.language === 'ur' ? 'rtl' : 'ltr'}
              />
            </label>
            <label className="speech-field">
              {label('spc_remarksUrdu')}
              <textarea
                rows={5}
                value={edit.bodyUr}
                onChange={(e) => setEdit({ ...edit, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label className="speech-field">
              {label('spc_talkingPoints')}
              <textarea
                rows={4}
                value={edit.talkingPoints}
                onChange={(e) => setEdit({ ...edit, talkingPoints: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('spc_pointsUrdu')}
              <textarea
                rows={3}
                value={edit.talkingPointsUr}
                onChange={(e) => setEdit({ ...edit, talkingPointsUr: e.target.value })}
                dir="rtl"
              />
            </label>

            <div className="speech-drawer-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => saveEdit()}>
                {label('spc_saveVersion')}
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? label('spc_drafting') : label('spc_aiAssist')}
              </button>
              {selected.aiAssisted && !selected.humanReviewedAt ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => saveEdit({ markHumanReviewed: true })}
                >
                  {label('spc_markReviewed')}
                </button>
              ) : null}
              <Link href="/ai" className="btn">
                {label('spc_openAi')}
              </Link>
              {(selected.status === 'DRAFT' || selected.status === 'REJECTED') ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'SUBMITTED')}
                >
                  {label('spc_submitAuth')}
                </button>
              ) : null}
              {canAuthorize && selected.status !== 'APPROVED' && selected.status !== 'ARCHIVED' ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'APPROVED')}
                >
                  {label('spc_authorize')}
                </button>
              ) : null}
              {canAuthorize && selected.status === 'SUBMITTED' ? (
                <>
                  <input
                    className="speech-reject-input"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={label('spc_rejectReason')}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || rejectReason.trim().length < 5}
                    onClick={() => setStatus(selected.id, 'REJECTED', rejectReason)}
                  >
                    {label('spc_rejectReturn')}
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
                  {label('spc_openPrompterShort')}
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
              <div className="eyebrow">{label('spc_prompterLive')}</div>
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
                {label('spc_remarks')}
              </button>
              <button
                type="button"
                className={`btn ${prompterMode === 'points' ? 'primary' : ''}`}
                onClick={() => setPrompterMode('points')}
              >
                {label('spc_talkingPoints')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setPrompterLang((l) => (l === 'en' ? 'ur' : 'en'))}
              >
                {prompterLang === 'en' ? label('spc_enToUr') : label('spc_urToEn')}
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
                {scrollSpeed === 0
                  ? label('spc_scroll')
                  : scrollSpeed === 1
                    ? label('spc_faster')
                    : label('spc_pause')}
              </button>
              <button type="button" className="btn" onClick={() => setMirror((v) => !v)}>
                {label('spc_mirror')}
              </button>
              <button type="button" className="btn" onClick={() => setPrompterId(null)}>
                {label('spc_exit')}
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
