'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { pageTitle } from '@/lib/i18n';

type Status = {
  enabled: boolean;
  mode: string;
  remoteConfigured: boolean;
  model: string | null;
  groundedOnly: boolean;
  note: string;
};

type Turn = { q: string; a: string; mode?: string; at: string };

const PROMPTS = [
  'Summarize this matter for the Speaker desk',
  'What is the current status and who holds the file?',
  'List routing history and outstanding actions',
  'Draft talking points from notes and correspondence',
];

export default function AiPage() {
  const { label, lang, user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState('');
  const [matterId, setMatterId] = useState('');
  const [matters, setMatters] = useState<{ id: string; diaryNo: string; subject: string; classification: string }[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Status>('/ai/status').then(setStatus).catch(() => setStatus(null));
    api<typeof matters>('/files').then(setMatters).catch(() => undefined);
  }, []);

  async function ask(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const q = (preset || question).trim();
    if (!q) return;
    setBusy(true);
    try {
      const res = await api<{ answer: string; mode?: string }>('/ai/ask', {
        method: 'POST',
        json: { question: q, matterId: matterId || undefined },
      });
      setTurns((prev) => [
        ...prev,
        { q, a: res.answer, mode: res.mode, at: new Date().toISOString() },
      ]);
      setQuestion('');
      toast.success('Briefing ready');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI unavailable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={pageTitle(lang, 'ai', user?.role) || label('ai')}
        subtitle="Grounded assistant for Speaker desk — answers only from authorized office records."
      />

      <div className="ai-status-row">
        <div className="dash-kpi">
          <div className="label">Mode</div>
          <div className="value" style={{ fontSize: 18 }}>
            {status?.mode === 'remote' ? 'Remote model' : 'Local briefing'}
          </div>
          <div className="hint">{status?.note}</div>
        </div>
        <div className="dash-kpi">
          <div className="label">Grounding</div>
          <div className="value" style={{ fontSize: 18 }}>Record-only</div>
          <div className="hint">No invention of diary numbers or decisions</div>
        </div>
        <div className="dash-kpi">
          <div className="label">Model</div>
          <div className="value" style={{ fontSize: 18 }}>{status?.model || '—'}</div>
          <div className="hint">
            {status?.remoteConfigured ? 'AI_ENDPOINT configured' : 'Works without external AI'}
          </div>
        </div>
      </div>

      <div className="ai-layout">
        <div className="panel">
          <h2>Ask</h2>
          <form className="grid-form" onSubmit={(e) => ask(e)}>
            <div className="field">
              <label>Matter context</label>
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                <option value="">Workspace overview (no file)</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject.slice(0, 60)}
                    {m.classification === 'CONFIDENTIAL' ? ' 🔒' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Question</label>
              <textarea
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Summarize status and recommended next step"
                required
              />
            </div>
            <div className="prompt-chips">
              {PROMPTS.map((p) => (
                <button key={p} type="button" className="chip" onClick={() => ask(undefined, p)} disabled={busy}>
                  {p}
                </button>
              ))}
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Preparing…' : 'Ask helper'}
            </button>
          </form>
        </div>

        <div className="panel ai-thread">
          <h2>Briefings</h2>
          {!turns.length && (
            <p className="muted">
              Select a matter and ask for a summary, status, or talking points. Local mode always works from live records.
            </p>
          )}
          <div className="ai-turns">
            {turns.map((t, i) => (
              <article key={`${t.at}-${i}`} className="ai-turn">
                <div className="ai-q">
                  <span className="eyebrow">You</span>
                  <p>{t.q}</p>
                </div>
                <div className="ai-a">
                  <span className="eyebrow">
                    Helper {t.mode ? `· ${t.mode.replace(/_/g, ' ')}` : ''}
                  </span>
                  <pre>{t.a}</pre>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
