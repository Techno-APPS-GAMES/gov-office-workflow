'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

type Press = {
  id: string;
  title: string;
  titleUr?: string | null;
  body: string;
  bodyUr?: string | null;
  code?: string | null;
  pidRef?: string | null;
  wire?: string | null;
  status: string;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  author?: { displayName: string } | null;
};

type Clip = {
  id: string;
  outlet: string;
  headline: string;
  when: string;
  note: string;
};

const DEFAULT_WIRE =
  'PID, PTV News, Radio Pakistan, APP, National Parliamentary Reporters';

function fmtDay(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();
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
  return 'Draft';
}

export default function PressPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Press[]>([]);
  const [tab, setTab] = useState<'releases' | 'monitor'>('releases');
  const [showForm, setShowForm] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [preview, setPreview] = useState<Press | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    titleUr: '',
    body: '',
    bodyUr: '',
    wire: DEFAULT_WIRE,
  });

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setItems(await api<Press[]>('/press'));
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  const kpis = useMemo(() => {
    const drafts = items.filter((p) => p.status === 'DRAFT').length;
    const approved = items.filter((p) => p.status === 'APPROVED').length;
    const dispatched = items.filter((p) => p.status === 'DISPATCHED').length;
    return { total: items.length, drafts, approved, dispatched };
  }, [items]);

  const clips: Clip[] = useMemo(() => {
    const fromDispatch = items
      .filter((p) => p.status === 'DISPATCHED')
      .slice(0, 5)
      .map((p, i) => ({
        id: p.id,
        outlet: i % 2 === 0 ? 'APP Wire' : 'PTV News bulletin',
        headline: p.title,
        when: p.dispatchedAt || p.updatedAt || p.createdAt || '',
        note: `Pickup of ${p.code || 'release'} on ${p.wire?.split(',')[0] || 'PID'}`,
      }));
    if (fromDispatch.length) return fromDispatch;
    return [
      {
        id: 'demo-clip',
        outlet: 'National press desk',
        headline: 'No dispatched releases yet — monitoring idle',
        when: new Date().toISOString(),
        note: 'Clippings appear here after PID wire dispatch',
      },
    ];
  }, [items]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/press', {
        method: 'POST',
        json: {
          title: form.title,
          body: form.body,
          titleUr: form.titleUr || undefined,
          bodyUr: form.bodyUr || undefined,
          wire: form.wire || undefined,
        },
      });
      toast.success('Press release drafted');
      setShowForm(false);
      setForm({ title: '', titleUr: '', body: '', bodyUr: '', wire: DEFAULT_WIRE });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: 'APPROVED' | 'DISPATCHED') {
    setBusy(true);
    try {
      await api(`/press/${id}/status`, { method: 'PATCH', json: { status } });
      toast.success(status === 'APPROVED' ? 'Authorized for PID wire' : 'Dispatched to media');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
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
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Press releases &amp; media monitoring</h1>
          <p className="muted">
            Module 8 — Bilingual English/Urdu media statements, direct Speaker authorization, PID
            distribution, and real-time press clippings.
          </p>
        </div>
        <div className="press-hero-actions">
          <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close form' : '+ Issue press release'}
          </button>
          <button
            type="button"
            className="btn press-digest-btn"
            onClick={() => {
              setShowDigest(true);
              setTab('monitor');
            }}
          >
            + Daily media digest
          </button>
        </div>
      </div>

      <div className="press-tabs">
        <button
          type="button"
          className={tab === 'releases' ? 'active' : ''}
          onClick={() => setTab('releases')}
        >
          Press releases · {items.length}
        </button>
        <button
          type="button"
          className={tab === 'monitor' ? 'active' : ''}
          onClick={() => setTab('monitor')}
        >
          Media monitoring feed · {clips.length}
        </button>
      </div>

      <div className="press-kpis">
        <div className="press-kpi">
          <div className="label">Total releases</div>
          <div className="value">{kpis.total}</div>
          <div className="hint">Official media records</div>
        </div>
        <div className="press-kpi">
          <div className="label">Staff drafts for review</div>
          <div className="value">{kpis.drafts}</div>
          <div className="hint">Awaiting your authorization</div>
        </div>
        <div className="press-kpi">
          <div className="label">Dispatched to media</div>
          <div className="value">{kpis.dispatched}</div>
          <div className="hint">Distributed to press wire</div>
        </div>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>Issue press release</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              English headline
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Urdu headline
              <input
                value={form.titleUr}
                onChange={(e) => setForm({ ...form, titleUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              English version
              <textarea
                rows={5}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
              />
            </label>
            <label>
              Urdu version
              <textarea
                rows={5}
                value={form.bodyUr}
                onChange={(e) => setForm({ ...form, bodyUr: e.target.value })}
                dir="rtl"
              />
            </label>
            <label>
              Distribution wire
              <input
                value={form.wire}
                onChange={(e) => setForm({ ...form, wire: e.target.value })}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Save draft
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'releases' ? (
        <div className="press-feed">
          {items.length === 0 ? (
            <div className="panel">
              <p className="muted">No press releases yet. Issue one to start the PID workflow.</p>
            </div>
          ) : (
            items.map((p) => (
              <article key={p.id} className="press-card">
                <div className="press-card-top">
                  <div className="press-card-id">
                    {p.code || `PR-${p.id.slice(0, 4)}`} · PID REF: {p.pidRef || '—'} ·{' '}
                    {fmtDay(p.createdAt)}
                  </div>
                  <span className={`press-status ${p.status.toLowerCase()}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <h3>{p.title}</h3>
                {p.titleUr ? (
                  <p className="press-ur" dir="rtl">
                    {p.titleUr}
                  </p>
                ) : null}
                <div className="press-bilingual">
                  <div>
                    <div className="eyebrow">English version</div>
                    <p>{p.body}</p>
                  </div>
                  <div>
                    <div className="eyebrow">Urdu version · اردو ورژن</div>
                    <p dir="rtl">{p.bodyUr || '—'}</p>
                  </div>
                </div>
                <div className="press-meta muted">
                  Author: {p.author?.displayName || '—'}
                  {p.status !== 'DRAFT' && p.approvedAt
                    ? ` · Approved by: ${p.author?.displayName || 'Speaker'} (${fmtWhen(p.approvedAt)})`
                    : ''}
                  {` · Wire: ${p.wire || DEFAULT_WIRE}`}
                </div>
                <div className="press-card-actions">
                  {p.status === 'DRAFT' && canAuthorize ? (
                    <button
                      type="button"
                      className="btn press-auth-btn"
                      disabled={busy}
                      onClick={() => setStatus(p.id, 'APPROVED')}
                    >
                      ✓ Authorize for PID wire
                    </button>
                  ) : null}
                  {p.status === 'APPROVED' && canAuthorize ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => setStatus(p.id, 'DISPATCHED')}
                    >
                      Dispatch to PID →
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => printPreview(p)}>
                    Print preview
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="panel">
          <div className="eyebrow">Media monitoring feed</div>
          <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
            Press clippings &amp; wire pickup
          </h2>
          {showDigest ? (
            <div className="press-digest">
              <strong>Daily media digest</strong>
              <p className="muted">
                {kpis.dispatched} dispatched release(s) · {clips.length} clipping(s) tracked ·
                generated {fmtWhen(new Date().toISOString())}
              </p>
            </div>
          ) : null}
          <ul className="press-clips">
            {clips.map((c) => (
              <li key={c.id}>
                <div className="eyebrow">{c.outlet}</div>
                <strong>{c.headline}</strong>
                <div className="muted tiny">{fmtWhen(c.when)} · {c.note}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview ? (
        <div className="press-print" id="press-print">
          <h1>{preview.title}</h1>
          {preview.titleUr ? <h2 dir="rtl">{preview.titleUr}</h2> : null}
          <p className="muted">
            {preview.code} · {preview.pidRef} · {fmtDay(preview.createdAt)}
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</p>
          {preview.bodyUr ? (
            <p dir="rtl" style={{ whiteSpace: 'pre-wrap' }}>
              {preview.bodyUr}
            </p>
          ) : null}
          <button type="button" className="btn" onClick={() => setPreview(null)}>
            Close preview
          </button>
        </div>
      ) : null}
    </>
  );
}
