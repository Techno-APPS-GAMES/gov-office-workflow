'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { enumLabel, tf } from '@/lib/i18n';

type MatterOpt = { id: string; diaryNo: string; subject: string };

type Press = {
  id: string;
  title: string;
  titleUr?: string | null;
  body: string;
  bodyUr?: string | null;
  code?: string | null;
  pidRef?: string | null;
  wire?: string | null;
  socialTargets?: string | null;
  socialApproved?: boolean;
  matterId?: string | null;
  sourcesNote?: string | null;
  embargoUntil?: string | null;
  aiAssisted?: boolean;
  humanReviewedAt?: string | null;
  rejectReason?: string | null;
  status: string;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  author?: { displayName: string } | null;
  matter?: { id: string; diaryNo: string; subject: string } | null;
  clips?: Clip[];
};

type Clip = {
  id: string;
  outlet: string;
  headline: string;
  url?: string | null;
  note?: string | null;
  platform?: string | null;
  observedAt?: string;
  pressReleaseId?: string | null;
  pressRelease?: { id: string; code?: string | null; title: string } | null;
  createdBy?: { displayName: string } | null;
};

const DEFAULT_WIRE =
  'PID, PTV News, Radio Pakistan, APP, National Parliamentary Reporters';
const DEFAULT_SOCIAL =
  'X / Twitter, Facebook, Instagram (official NA accounts only)';

const emptyForm = {
  title: '',
  titleUr: '',
  body: '',
  bodyUr: '',
  wire: DEFAULT_WIRE,
  socialTargets: DEFAULT_SOCIAL,
  matterId: '',
  sourcesNote: '',
  embargoUntil: '',
};

function fmtDay(iso?: string | null, locale?: string) {
  if (!iso) return '—';
  return new Date(iso)
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
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

export default function PressPage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
  const toast = useToast();
  const [items, setItems] = useState<Press[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [tab, setTab] = useState<'releases' | 'monitor'>('releases');
  const [filter, setFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [showClipForm, setShowClipForm] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Press | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [clipForm, setClipForm] = useState({
    outlet: '',
    headline: '',
    url: '',
    note: '',
    platform: 'WIRE',
    pressReleaseId: '',
  });

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [rows, clipRows, mats] = await Promise.all([
      api<Press[]>('/press'),
      api<Clip[]>('/press/clips').catch(() => [] as Clip[]),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
    ]);
    setItems(rows);
    setClips(clipRows);
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
    () => items.find((p) => p.id === editId) || null,
    [items, editId],
  );

  useEffect(() => {
    if (!editing) return;
    setForm({
      title: editing.title,
      titleUr: editing.titleUr || '',
      body: editing.body,
      bodyUr: editing.bodyUr || '',
      wire: editing.wire || DEFAULT_WIRE,
      socialTargets: editing.socialTargets || DEFAULT_SOCIAL,
      matterId: editing.matterId || '',
      sourcesNote: editing.sourcesNote || '',
      embargoUntil: editing.embargoUntil
        ? editing.embargoUntil.slice(0, 16)
        : '',
    });
    setRejectReason('');
  }, [editing]);

  const kpis = useMemo(() => {
    const drafts = items.filter((p) => p.status === 'DRAFT' || p.status === 'REJECTED').length;
    const submitted = items.filter((p) => p.status === 'SUBMITTED').length;
    const approved = items.filter((p) => p.status === 'APPROVED').length;
    const dispatched = items.filter((p) => p.status === 'DISPATCHED').length;
    return { total: items.length, drafts, submitted, approved, dispatched };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === 'ALL') return items;
    return items.filter((p) => p.status === filter);
  }, [items, filter]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/press', {
        method: 'POST',
        json: {
          ...form,
          matterId: form.matterId || undefined,
          embargoUntil: form.embargoUntil || undefined,
        },
      });
      toast.success(label('prs_toastDrafted'));
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

  async function saveEdit(extra?: {
    markHumanReviewed?: boolean;
    aiAssisted?: boolean;
    socialApproved?: boolean;
  }) {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/press/${editing.id}`, {
        method: 'PATCH',
        json: {
          ...form,
          matterId: form.matterId || null,
          embargoUntil: form.embargoUntil || null,
          ...extra,
        },
      });
      toast.success(
        extra?.markHumanReviewed
          ? label('spc_toastReviewed')
          : extra?.socialApproved
            ? label('prs_toastSocial')
            : label('prs_toastSaved'),
      );
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(
    id: string,
    status: string,
    opts?: { reason?: string; socialApproved?: boolean },
  ) {
    setBusy(true);
    try {
      await api(`/press/${id}/status`, {
        method: 'PATCH',
        json: { status, ...opts },
      });
      toast.success(
        status === 'APPROVED'
          ? label('prs_toastAuthorized')
          : status === 'DISPATCHED'
            ? label('prs_toastDispatched')
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
    if (!editing && !showForm) return;
    setAiBusy(true);
    try {
      const title = form.title || 'Speaker press statement';
      const res = await api<{ answer: string }>('/ai/ask', {
        method: 'POST',
        json: {
          matterId: form.matterId || undefined,
          question: `Draft a formal bilingual National Assembly / Speaker press release. Output:
EN_HEADLINE: ...
UR_HEADLINE: ...
EN_BODY: (2-4 short paragraphs)
UR_BODY: (Urdu version)
Human review is mandatory before official use. Working title: ${title}. Notes:\n${form.body}`,
        },
      });
      const text = res.answer || '';
      const grab = (tag: string) => {
        const m = text.match(
          new RegExp(`${tag}:\\s*([\\s\\S]*?)(?=\\n(?:EN_|UR_)[A-Z]+:|$)`, 'i'),
        );
        return (m?.[1] || '').trim();
      };
      setForm((prev) => ({
        ...prev,
        title: grab('EN_HEADLINE') || prev.title,
        titleUr: grab('UR_HEADLINE') || prev.titleUr,
        body: grab('EN_BODY') || prev.body,
        bodyUr: grab('UR_BODY') || prev.bodyUr,
      }));
      if (editing) {
        await api(`/press/${editing.id}`, {
          method: 'PATCH',
          json: {
            title: grab('EN_HEADLINE') || form.title,
            titleUr: grab('UR_HEADLINE') || form.titleUr,
            body: grab('EN_BODY') || form.body,
            bodyUr: grab('UR_BODY') || form.bodyUr,
            aiAssisted: true,
          },
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

  async function addClip(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/press/clips', {
        method: 'POST',
        json: {
          ...clipForm,
          pressReleaseId: clipForm.pressReleaseId || undefined,
          url: clipForm.url || undefined,
          note: clipForm.note || undefined,
        },
      });
      toast.success(label('prs_toastClip'));
      setShowClipForm(false);
      setClipForm({
        outlet: '',
        headline: '',
        url: '',
        note: '',
        platform: 'WIRE',
        pressReleaseId: '',
      });
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('prs_clipFailed'));
    } finally {
      setBusy(false);
    }
  }

  function printPreview(p: Press) {
    setPreview(p);
    setTimeout(() => window.print(), 200);
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('prs_eyebrowMedia')}
          </div>
          <h1>{label('prs_title')}</h1>
          <p className="muted">
            {label('prs_heroSub')}
          </p>
        </div>
        <div className="press-hero-actions">
          <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? label('mtg_closeForm') : label('prs_issue')}
          </button>
          <button
            type="button"
            className="btn press-digest-btn"
            onClick={() => {
              setShowDigest(true);
              setTab('monitor');
            }}
          >
            {label('prs_digest')}
          </button>
        </div>
      </div>

      <div className="press-tabs">
        <button
          type="button"
          className={tab === 'releases' ? 'active' : ''}
          onClick={() => setTab('releases')}
        >
          {label('prs_tabReleases')} · {items.length}
        </button>
        <button
          type="button"
          className={tab === 'monitor' ? 'active' : ''}
          onClick={() => setTab('monitor')}
        >
          {label('prs_tabMonitor')} · {clips.length}
        </button>
      </div>

      <div className="press-kpis">
        <div className="press-kpi">
          <div className="label">{label('prs_kpiTotal')}</div>
          <div className="value">{kpis.total}</div>
          <div className="hint">{label('prs_kpiTotalHint')}</div>
        </div>
        <div className="press-kpi">
          <div className="label">{label('prs_kpiReview')}</div>
          <div className="value">{kpis.submitted}</div>
          <div className="hint">{label('prs_kpiReviewHint')}</div>
        </div>
        <div className="press-kpi">
          <div className="label">{label('prs_kpiDrafts')}</div>
          <div className="value">{kpis.drafts}</div>
          <div className="hint">{label('prs_kpiDraftsHint')}</div>
        </div>
        <div className="press-kpi">
          <div className="label">{label('enum_DISPATCHED')}</div>
          <div className="value">{kpis.dispatched}</div>
          <div className="hint">{label('prs_kpiDispHint')}</div>
        </div>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('prs_issueTitle')}</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              {label('prs_enHeadline')}
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <label>
              {label('prs_urHeadline')}
              <input
                value={form.titleUr}
                onChange={(e) => setForm({ ...form, titleUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              {label('spc_sourceMatter')}
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
              {label('prs_embargoOpt')}
              <input
                type="datetime-local"
                value={form.embargoUntil}
                onChange={(e) => setForm({ ...form, embargoUntil: e.target.value })}
              />
            </label>
            <label>
              {label('prs_enVersion')}
              <textarea
                rows={5}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
                minLength={20}
              />
            </label>
            <label>
              {label('prs_urVersion')}
              <textarea
                rows={5}
                value={form.bodyUr}
                onChange={(e) => setForm({ ...form, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              {label('prs_distWire')}
              <input
                value={form.wire}
                onChange={(e) => setForm({ ...form, wire: e.target.value })}
              />
            </label>
            <label>
              {label('prs_socialChannels')}
              <input
                value={form.socialTargets}
                onChange={(e) => setForm({ ...form, socialTargets: e.target.value })}
              />
            </label>
            <label>
              {label('spc_sourceCitations')}
              <input
                value={form.sourcesNote}
                onChange={(e) => setForm({ ...form, sourcesNote: e.target.value })}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={busy}>
                {label('prs_saveDraft')}
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? label('spc_drafting') : label('prs_aiAssistDraft')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {tab === 'releases' ? (
        <>
          <div className="speech-toolbar">
            {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'DISPATCHED', 'REJECTED'].map((f) => (
              <button
                key={f}
                type="button"
                className={`btn ${filter === f ? 'primary' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? label('all') : statusLabel(f, label)}
              </button>
            ))}
          </div>
          <div className="press-feed">
            {visible.length === 0 ? (
              <div className="panel">
                <p className="muted">{label('prs_noneInFilter')}</p>
              </div>
            ) : (
              visible.map((p) => (
                <article key={p.id} className="press-card">
                  <div className="press-card-top">
                    <div className="press-card-id">
                      {p.code || `PR-${p.id.slice(0, 4)}`} · {label('prs_pidRef')}: {p.pidRef || '—'} ·{' '}
                      {fmtDay(p.createdAt, locale)}
                    </div>
                    <span className={`press-status ${p.status.toLowerCase()}`}>
                      {statusLabel(p.status, label)}
                    </span>
                  </div>
                  <h3>{p.title}</h3>
                  {p.titleUr ? (
                    <p className="press-ur" dir="rtl">
                      {p.titleUr}
                    </p>
                  ) : null}
                  {p.matter ? (
                    <p className="muted tiny">
                      {label('prs_source')}:{' '}
                      <Link href={`/files/${p.matter.id}`}>
                        {p.matter.diaryNo} — {p.matter.subject}
                      </Link>
                    </p>
                  ) : null}
                  {p.aiAssisted ? (
                    <div
                      className={`speech-ai-banner ${p.humanReviewedAt ? 'ok' : 'warn'}`}
                      style={{ marginTop: 8 }}
                    >
                      {p.humanReviewedAt
                        ? label('prs_aiReviewed')
                        : label('prs_aiReviewRequired')}
                    </div>
                  ) : null}
                  <div className="press-bilingual">
                    <div>
                      <div className="eyebrow">{label('prs_enVersion')}</div>
                      <p>{p.body}</p>
                    </div>
                    <div>
                      <div className="eyebrow">{label('prs_urVersion')}</div>
                      <p dir="rtl">{p.bodyUr || '—'}</p>
                    </div>
                  </div>
                  <div className="press-meta muted">
                    {label('prs_author')}: {p.author?.displayName || '—'}
                    {p.approvedAt ? ` · ${label('approved')} ${fmtWhen(p.approvedAt, locale)}` : ''}
                    {p.dispatchedAt ? ` · ${label('enum_DISPATCHED')} ${fmtWhen(p.dispatchedAt, locale)}` : ''}
                    {` · ${label('prs_wire')}: ${p.wire || DEFAULT_WIRE}`}
                    {p.socialApproved ? ` · ${label('prs_socialApproved')}` : ''}
                    {p.embargoUntil ? ` · ${label('prs_embargo')}: ${fmtWhen(p.embargoUntil, locale)}` : ''}
                  </div>
                  {p.rejectReason ? (
                    <p className="muted tiny">{label('spc_rejectReason')}: {p.rejectReason}</p>
                  ) : null}
                  <div className="press-card-actions">
                    {p.status !== 'DISPATCHED' ? (
                      <button type="button" className="btn" onClick={() => setEditId(p.id)}>
                        {label('prs_editReview')}
                      </button>
                    ) : null}
                    {(p.status === 'DRAFT' || p.status === 'REJECTED') ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => setStatus(p.id, 'SUBMITTED')}
                      >
                        {label('spc_submitAuth')}
                      </button>
                    ) : null}
                    {canAuthorize &&
                    (p.status === 'DRAFT' || p.status === 'SUBMITTED') ? (
                      <button
                        type="button"
                        className="btn press-auth-btn"
                        disabled={busy}
                        onClick={() =>
                          setStatus(p.id, 'APPROVED', { socialApproved: true })
                        }
                      >
                        ✓ {label('prs_authorizePid')}
                      </button>
                    ) : null}
                    {canAuthorize && p.status === 'SUBMITTED' ? (
                      <>
                        <input
                          className="speech-reject-input"
                          style={{ maxWidth: 220 }}
                          value={editId === p.id ? rejectReason : ''}
                          onChange={(e) => {
                            setEditId(p.id);
                            setRejectReason(e.target.value);
                          }}
                          placeholder={label('spc_rejectReason')}
                        />
                        <button
                          type="button"
                          className="btn"
                          disabled={busy || rejectReason.trim().length < 5 || editId !== p.id}
                          onClick={() => setStatus(p.id, 'REJECTED', { reason: rejectReason })}
                        >
                          {label('prs_reject')}
                        </button>
                      </>
                    ) : null}
                    {p.status === 'APPROVED' && canAuthorize ? (
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => setStatus(p.id, 'DISPATCHED')}
                      >
                        {label('prs_dispatch')}
                      </button>
                    ) : null}
                    <button type="button" className="btn" onClick={() => printPreview(p)}>
                      {label('prs_printPreview')}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="panel">
          <div className="remote-section-head">
            <div>
              <div className="eyebrow">{label('prs_feed')}</div>
              <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
                {label('prs_clippings')}
              </h2>
            </div>
            <button type="button" className="btn primary" onClick={() => setShowClipForm((v) => !v)}>
              {showClipForm ? label('close') : label('prs_logClip')}
            </button>
          </div>

          {showDigest ? (
            <div className="press-digest">
              <strong>{label('prs_digest')}</strong>
              <p className="muted">
                {tf(lang, 'prs_digestLine', { d: kpis.dispatched, c: clips.length })}{' '}
                {fmtWhen(new Date().toISOString(), locale)}
              </p>
              <ul className="press-clips">
                {items
                  .filter((p) => p.status === 'DISPATCHED')
                  .slice(0, 10)
                  .map((p) => (
                    <li key={`d-${p.id}`}>
                      <strong>
                        {p.code} · {p.title}
                      </strong>
                      <div className="muted tiny">
                        {p.pidRef} · {fmtWhen(p.dispatchedAt, locale)} ·{' '}
                        {p.socialApproved ? label('prs_socialCleared') : label('prs_wireOnly')}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {showClipForm ? (
            <form className="grid-form" onSubmit={addClip} style={{ marginTop: 16 }}>
              <label>
                {label('prs_outlet')}
                <input
                  value={clipForm.outlet}
                  onChange={(e) => setClipForm({ ...clipForm, outlet: e.target.value })}
                  required
                  placeholder={label('prs_outletPh')}
                />
              </label>
              <label>
                {label('prs_platform')}
                <select
                  value={clipForm.platform}
                  onChange={(e) => setClipForm({ ...clipForm, platform: e.target.value })}
                >
                  <option value="WIRE">{label('enum_WIRE')}</option>
                  <option value="TV">{label('enum_TV')}</option>
                  <option value="PRINT">{label('enum_PRINT')}</option>
                  <option value="SOCIAL">{label('enum_SOCIAL')}</option>
                  <option value="WEB">{label('enum_WEB')}</option>
                </select>
              </label>
              <label>
                {label('prs_linkedRelease')}
                <select
                  value={clipForm.pressReleaseId}
                  onChange={(e) =>
                    setClipForm({ ...clipForm, pressReleaseId: e.target.value })
                  }
                >
                  <option value="">{label('prs_unlinked')}</option>
                  {items
                    .filter((p) => p.status === 'DISPATCHED' || p.status === 'APPROVED')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {label('prs_headlinePost')}
                <input
                  value={clipForm.headline}
                  onChange={(e) => setClipForm({ ...clipForm, headline: e.target.value })}
                  required
                  minLength={5}
                />
              </label>
              <label>
                {label('prs_urlOpt')}
                <input
                  value={clipForm.url}
                  onChange={(e) => setClipForm({ ...clipForm, url: e.target.value })}
                />
              </label>
              <label>
                {label('prs_note')}
                <input
                  value={clipForm.note}
                  onChange={(e) => setClipForm({ ...clipForm, note: e.target.value })}
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                {label('prs_saveClip')}
              </button>
            </form>
          ) : null}

          <ul className="press-clips" style={{ marginTop: 16 }}>
            {clips.length === 0 ? (
              <li className="muted">{label('prs_noClips')}</li>
            ) : (
              clips.map((c) => (
                <li key={c.id}>
                  <div className="eyebrow">
                    {c.outlet} · {enumLabel(lang, c.platform || 'WIRE')}
                    {c.pressRelease?.code ? ` · ${c.pressRelease.code}` : ''}
                  </div>
                  <strong>{c.headline}</strong>
                  <div className="muted tiny">
                    {fmtWhen(c.observedAt, locale)} · {c.note || '—'}
                    {c.url ? (
                      <>
                        {' · '}
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {label('open')}
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {editing ? (
        <div className="meet-drawer-backdrop" onClick={() => setEditId(null)}>
          <aside className="meet-drawer speech-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="meet-section-head">
              <div>
                <div className="eyebrow">
                  {editing.code} · {statusLabel(editing.status, label)}
                </div>
                <h2>{label('prs_editTitle')}</h2>
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
            <label className="speech-field">
              {label('prs_enHeadline')}
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('prs_urHeadline')}
              <input
                value={form.titleUr}
                onChange={(e) => setForm({ ...form, titleUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label className="speech-field">
              {label('prs_enBody')}
              <textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('prs_urBody')}
              <textarea
                rows={5}
                value={form.bodyUr}
                onChange={(e) => setForm({ ...form, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label className="speech-field">
              {label('prs_wire')}
              <input
                value={form.wire}
                onChange={(e) => setForm({ ...form, wire: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('prs_socialTargets')}
              <input
                value={form.socialTargets}
                onChange={(e) => setForm({ ...form, socialTargets: e.target.value })}
              />
            </label>
            <label className="speech-field">
              {label('spc_sourceMatter')}
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
            <label className="speech-field">
              {label('prs_embargo')}
              <input
                type="datetime-local"
                value={form.embargoUntil}
                onChange={(e) => setForm({ ...form, embargoUntil: e.target.value })}
              />
            </label>
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
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => saveEdit({ socialApproved: true })}
              >
                {label('prs_approveSocial')}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {preview ? (
        <div className="press-print" id="press-print">
          <h1>{preview.title}</h1>
          {preview.titleUr ? <h2 dir="rtl">{preview.titleUr}</h2> : null}
          <p className="muted">
            {preview.code} · {preview.pidRef} · {fmtDay(preview.createdAt, locale)}
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</p>
          {preview.bodyUr ? (
            <p dir="rtl" style={{ whiteSpace: 'pre-wrap' }}>
              {preview.bodyUr}
            </p>
          ) : null}
          <button type="button" className="btn" onClick={() => setPreview(null)}>
            {label('prs_closePreview')}
          </button>
        </div>
      ) : null}
    </>
  );
}
