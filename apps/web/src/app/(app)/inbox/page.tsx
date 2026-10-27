'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';
import { enumLabel, t, tf } from '@/lib/i18n';

type Desk = {
  kpis: {
    unreadNotices: number;
    staffRequests: number;
    confirmedMeetings: number;
  };
  pipeline: { key: string; label: string; done: boolean }[];
  meetingRequests: {
    id: string;
    title: string;
    startAt: string | null;
    location: string | null;
    brief: string | null;
    requestedBy: string;
    status: string;
  }[];
  remoteQueue: {
    id: string;
    kind: string;
    title: string;
    detail: string;
    href: string;
    action: string;
    primary: boolean;
  }[];
  remotePending: number;
  activity: {
    id: string;
    type: string;
    title: string;
    body: string;
    recordId?: string | null;
    read: boolean;
    createdAt: string;
    href: string;
  }[];
};

function formatWhen(iso: string | null, tba: string) {
  if (!iso) return tba;
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function InboxPage() {
  const { user, lang, label } = useAuth();
  const toast = useToast();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setDesk(await api<Desk>('/inbox/desk'));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
  }, [load]);

  useLiveRefresh(load, [load]);

  async function markRead(id: string) {
    await api(`/inbox/${id}/read`, { method: 'POST' });
    setDesk((prev) =>
      prev
        ? {
            ...prev,
            activity: prev.activity.map((a) => (a.id === id ? { ...a, read: true } : a)),
            kpis: {
              ...prev.kpis,
              unreadNotices: Math.max(0, prev.kpis.unreadNotices - (prev.activity.find((x) => x.id === id && !x.read) ? 1 : 0)),
            },
          }
        : prev,
    );
  }

  async function markAll() {
    setBusy(true);
    try {
      await api('/inbox/read-all', { method: 'POST' });
      toast.success(label('ib_allRead'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : label('cm_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="panel error">{error}</div>;
  if (!desk) return <p className="muted">{label('ib_loading')}</p>;

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_liveWorkspace')}
          </div>
          <h1>{label('inbox')}</h1>
          <p className="muted">{label('ib_heroSub')}</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => load().catch(() => undefined)}>
            {label('refresh')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || desk.kpis.unreadNotices === 0}
            onClick={markAll}
          >
            {label('inbox_markAll')}
          </button>
        </div>
      </div>

      <div className="dash-kpis inbox-kpis">
        <div className="dash-kpi accent-blue">
          <div className="label">{label('ib_unread')}</div>
          <div className="value">{desk.kpis.unreadNotices}</div>
          <div className="hint">{label('ib_inWorkspace')}</div>
        </div>
        <div className="dash-kpi accent-gold">
          <div className="label">{label('ib_staffRequests')}</div>
          <div className="value">{desk.kpis.staffRequests}</div>
          <div className="hint">{label('ib_pendingDecision')}</div>
        </div>
        <div className="dash-kpi accent-sky">
          <div className="label">{label('ov_kpiMeetings')}</div>
          <div className="value">{desk.kpis.confirmedMeetings}</div>
          <div className="hint">{label('ib_visibleRole')}</div>
        </div>
      </div>

      <div className="pipeline-bar panel">
        {desk.pipeline.map((step, i) => (
          <div key={step.key} className={`pipeline-step ${step.done ? 'done' : ''}`}>
            <span className="pipeline-index">{i + 1}</span>
            <span>
              {t(lang, `ib_pipe_${step.key}`) === `ib_pipe_${step.key}`
                ? step.label
                : label(`ib_pipe_${step.key}`)}
            </span>
          </div>
        ))}
      </div>

      <div className="inbox-section">
        <div className="eyebrow">{label('ib_speakerAction')}</div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>{label('ib_meetingReqTitle')}</h3>
            <Link href="/meetings" className="btn tiny-link">
              {label('ib_openMeetings')}
            </Link>
          </div>
          <ul className="action-list">
            {desk.meetingRequests.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.title}</strong>
                  <div className="muted">
                    {formatWhen(m.startAt, label('ib_timeTba'))}
                    {m.location ? ` · ${m.location}` : ''}
                    {` · ${tf(lang, 'ib_requestedBy', { name: m.requestedBy })}`}
                  </div>
                  {m.brief && <p className="action-brief">{m.brief}</p>}
                </div>
                <Link className="btn primary" href="/meetings">
                  {label('ib_reviewRequest')}
                </Link>
              </li>
            ))}
            {!desk.meetingRequests.length && (
              <li className="muted" style={{ padding: 16 }}>
                {label('ib_noMeetingReq')}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="inbox-section">
        <div className="eyebrow">
          {tf(lang, 'ib_remoteQueue', { n: desk.remotePending })}
        </div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>{label('ib_docsAwaiting')}</h3>
            <Link href="/remote" className="btn tiny-link">
              {label('ib_remoteStudio')}
            </Link>
          </div>
          <ul className="action-list">
            {desk.remoteQueue.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <div>
                  <strong>{r.title}</strong>
                  <div className="muted">{r.detail}</div>
                </div>
                <Link className={r.primary ? 'btn primary' : 'btn'} href={r.href}>
                  {r.action}
                </Link>
              </li>
            ))}
            {!desk.remoteQueue.length && (
              <li className="muted" style={{ padding: 16 }}>
                {label('ib_remoteClear')}
              </li>
            )}
          </ul>
          <div className="inbox-footnote">{label('ib_footnote')}</div>
        </div>
      </div>

      <div className="inbox-section">
        <div className="eyebrow">{label('ib_notifications')}</div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>{label('ib_recent')}</h3>
          </div>
          <ul className="activity-list">
            {desk.activity.map((a) => (
              <li key={a.id} className={a.read ? 'read' : 'unread'}>
                <span className={`activity-dot ${a.read ? '' : 'live'}`} />
                <div className="activity-body">
                  <strong>
                    <span className="muted" style={{ fontWeight: 600, marginRight: 6 }}>
                      {enumLabel(lang, a.type.toUpperCase())}
                    </span>
                    {a.title}
                  </strong>
                  <div className="muted">{a.body}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
                <Link
                  className="tiny-link"
                  href={a.href}
                  onClick={() => {
                    if (!a.read) void markRead(a.id);
                  }}
                >
                  {label('cm_openArrow')}
                </Link>
              </li>
            ))}
            {!desk.activity.length && (
              <li className="muted" style={{ padding: 16 }}>
                {label('ib_noNotifications')}
              </li>
            )}
          </ul>
        </div>
      </div>

      <p className="inbox-footer-note muted">
        {label('ib_footerNote')} <Link href="/messages">{label('ib_encryptedMessages')}</Link>.
      </p>
    </>
  );
}
