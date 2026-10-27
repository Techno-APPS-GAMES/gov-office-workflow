'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { enumLabel, pageTitle } from '@/lib/i18n';

type Status = {
  enabled: boolean;
  mode: string;
  remoteConfigured: boolean;
  model: string | null;
  groundedOnly: boolean;
  note: string;
};

type Turn = { q: string; a: string; mode?: string; at: string };

const PROMPT_KEYS = ['aix_prompt1', 'aix_prompt2', 'aix_prompt3', 'aix_prompt4'];

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
      toast.success(label('aix_briefingReady'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('aix_unavailable'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={pageTitle(lang, 'ai', user?.role) || label('ai')}
        subtitle={label('aix_headerSub')}
      />

      <div className="ai-status-row">
        <div className="dash-kpi">
          <div className="label">{label('aix_mode')}</div>
          <div className="value" style={{ fontSize: 18 }}>
            {status?.mode === 'remote' ? label('aix_remoteModel') : label('aix_localBriefing')}
          </div>
          <div className="hint">{status?.note}</div>
        </div>
        <div className="dash-kpi">
          <div className="label">{label('aix_grounding')}</div>
          <div className="value" style={{ fontSize: 18 }}>{label('aix_recordOnly')}</div>
          <div className="hint">{label('aix_groundingHint')}</div>
        </div>
        <div className="dash-kpi">
          <div className="label">{label('aix_model')}</div>
          <div className="value" style={{ fontSize: 18 }}>{status?.model || '—'}</div>
          <div className="hint">
            {status?.remoteConfigured ? label('aix_endpointOk') : label('aix_noExternal')}
          </div>
        </div>
      </div>

      <div className="ai-layout">
        <div className="panel">
          <h2>{label('ai_ask')}</h2>
          <form className="grid-form" onSubmit={(e) => ask(e)}>
            <div className="field">
              <label>{label('aix_matterCtx')}</label>
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                <option value="">{label('aix_overviewNoFile')}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.diaryNo} — {m.subject.slice(0, 60)}
                    {m.classification === 'CONFIDENTIAL' ? ' 🔒' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{label('aix_question')}</label>
              <textarea
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={label('aix_questionPh')}
                required
              />
            </div>
            <div className="prompt-chips">
              {PROMPT_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  onClick={() => ask(undefined, label(k))}
                  disabled={busy}
                >
                  {label(k)}
                </button>
              ))}
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? label('aix_preparing') : label('aix_askHelper')}
            </button>
          </form>
        </div>

        <div className="panel ai-thread">
          <h2>{label('aix_briefings')}</h2>
          {!turns.length && <p className="muted">{label('aix_briefingsEmpty')}</p>}
          <div className="ai-turns">
            {turns.map((t, i) => (
              <article key={`${t.at}-${i}`} className="ai-turn">
                <div className="ai-q">
                  <span className="eyebrow">{label('aix_you')}</span>
                  <p>{t.q}</p>
                </div>
                <div className="ai-a">
                  <span className="eyebrow">
                    {label('aix_helper')} {t.mode ? `· ${enumLabel(lang, t.mode)}` : ''}
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
