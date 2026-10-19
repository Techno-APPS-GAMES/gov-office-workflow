'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

type Speech = {
  id: string;
  title: string;
  body: string;
  language: string;
  status: string;
  eventDate?: string | null;
  updatedAt?: string;
  author?: { displayName: string } | null;
};

const FLOW = [
  { n: 1, t: 'Prepare remarks' },
  { n: 2, t: 'AI assistant draft' },
  { n: 3, t: 'Direct authorization' },
  { n: 4, t: 'Teleprompter live' },
];

function speechCode(id: string) {
  return `W-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function langLabel(l: string) {
  if (l === 'ur') return 'URDU';
  return 'ENGLISH';
}

function statusLabel(s: string) {
  if (s === 'APPROVED') return 'Approved';
  if (s === 'SUBMITTED') return 'Awaiting approval';
  return 'Draft';
}

function statusClass(s: string) {
  if (s === 'APPROVED') return 'ok';
  if (s === 'SUBMITTED') return 'wait';
  return 'draft';
}

function stripMarker(body: string) {
  return body.replace(/\n?<!--gow-ver:\d+-->/g, '').trim();
}

function versionCount(body: string) {
  const m = body.match(/<!--gow-ver:(\d+)-->/);
  return m ? Number(m[1]) : 1;
}

function displayBody(body: string) {
  return stripMarker(body);
}

export default function SpeechesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Speech[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prompterId, setPrompterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', language: 'en' });
  const [edit, setEdit] = useState({ title: '', body: '', language: 'en' });

  const canAuthorize =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setItems(await api<Speech[]>('/speeches'));
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  const selected = useMemo(
    () => items.find((s) => s.id === openId) || null,
    [items, openId],
  );

  const prompter = useMemo(
    () => items.find((s) => s.id === prompterId) || null,
    [items, prompterId],
  );

  useEffect(() => {
    if (!selected) return;
    setEdit({
      title: selected.title,
      body: displayBody(selected.body),
      language: selected.language || 'en',
    });
  }, [selected]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/speeches', { method: 'POST', json: form });
      toast.success('Speech prepared');
      setShowForm(false);
      setForm({ title: '', body: '', language: 'en' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/speeches/${selected.id}`, {
        method: 'PATCH',
        json: edit,
      });
      toast.success('Speech record saved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api(`/speeches/${id}/status`, { method: 'PATCH', json: { status } });
      toast.success(
        status === 'APPROVED'
          ? 'Speech authorized'
          : status === 'SUBMITTED'
            ? 'Submitted for authorization'
            : 'Status updated',
      );
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
      const res = await api<{ answer: string }>('/ai/ask', {
        method: 'POST',
        json: {
          question: `Draft polished Speaker remarks for this working title and notes. Keep formal parliamentary tone. Title: ${edit.title}. Notes:\n${edit.body}`,
        },
      });
      setEdit((prev) => ({
        ...prev,
        body: res.answer || prev.body,
      }));
      toast.success('AI draft inserted — review before saving');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI draft unavailable');
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Speeches &amp; prompter</h1>
          <p className="muted">
            Prepare source-linked remarks, directly authorize them, then present from the official
            prompter.
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
              />
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
              Source notes / draft body
              <textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Save draft speech
            </button>
          </form>
        </div>
      ) : null}

      <div className="speech-grid">
        {items.length === 0 ? (
          <div className="panel">
            <p className="muted">No speeches yet. Prepare remarks to begin the workflow.</p>
          </div>
        ) : (
          items.map((s) => {
            const approved = s.status === 'APPROVED';
            return (
              <article key={s.id} className="speech-card">
                <div className="speech-meta">
                  {speechCode(s.id)} · {langLabel(s.language)}
                </div>
                <h3>{s.title}</h3>
                <div className="speech-card-mid">
                  <span className={`speech-status ${statusClass(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                  <span className="muted tiny">{versionCount(s.body)} version(s)</span>
                </div>
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
                  {speechCode(selected.id)} · {langLabel(selected.language)}
                </div>
                <h2>Speech record</h2>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>

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
              Remarks
              <textarea
                rows={12}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                dir={edit.language === 'ur' ? 'rtl' : 'ltr'}
              />
            </label>

            <div className="speech-drawer-actions">
              <button type="button" className="btn" disabled={busy} onClick={saveEdit}>
                Save version
              </button>
              <button type="button" className="btn" disabled={aiBusy} onClick={aiDraft}>
                {aiBusy ? 'Drafting…' : '2 · AI assistant draft'}
              </button>
              <Link href="/ai" className="btn">
                Open AI Helper
              </Link>
              {selected.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'SUBMITTED')}
                >
                  Submit for authorization
                </button>
              ) : null}
              {canAuthorize && selected.status !== 'APPROVED' ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => setStatus(selected.id, 'APPROVED')}
                >
                  3 · Authorize speech
                </button>
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
                  4 · Open prompter
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {prompter ? (
        <div className="speech-prompter">
          <div className="speech-prompter-bar">
            <div>
              <div className="eyebrow">Speaker prompter · live</div>
              <strong>{prompter.title}</strong>
            </div>
            <button type="button" className="btn" onClick={() => setPrompterId(null)}>
              Exit prompter
            </button>
          </div>
          <div
            className="speech-prompter-body"
            dir={prompter.language === 'ur' ? 'rtl' : 'ltr'}
          >
            {displayBody(prompter.body)}
          </div>
        </div>
      ) : null}
    </>
  );
}
