'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';

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

function formatWhen(iso: string | null) {
  if (!iso) return 'Time TBA';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function InboxPage() {
  const { user } = useAuth();
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
      toast.success('All notices marked read');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="panel error">{error}</div>;
  if (!desk) return <p className="muted">Loading appointment inbox…</p>;

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · LIVE WORKSPACE
          </div>
          <h1>Appointment inbox</h1>
          <p className="muted">
            Meeting requests, Speaker decisions and diary booking changes for this role.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => load().catch(() => undefined)}>
            Refresh
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || desk.kpis.unreadNotices === 0}
            onClick={markAll}
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="dash-kpis inbox-kpis">
        <div className="dash-kpi accent-blue">
          <div className="label">Unread notices</div>
          <div className="value">{desk.kpis.unreadNotices}</div>
          <div className="hint">In this workspace</div>
        </div>
        <div className="dash-kpi accent-gold">
          <div className="label">Staff requests to decide</div>
          <div className="value">{desk.kpis.staffRequests}</div>
          <div className="hint">Pending your decision</div>
        </div>
        <div className="dash-kpi accent-sky">
          <div className="label">Confirmed meetings</div>
          <div className="value">{desk.kpis.confirmedMeetings}</div>
          <div className="hint">Visible to this role</div>
        </div>
      </div>

      <div className="pipeline-bar panel">
        {desk.pipeline.map((step, i) => (
          <div key={step.key} className={`pipeline-step ${step.done ? 'done' : ''}`}>
            <span className="pipeline-index">{i + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      <div className="inbox-section">
        <div className="eyebrow">Speaker action</div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Meeting requests to decide</h3>
            <Link href="/meetings" className="btn tiny-link">
              Open meetings →
            </Link>
          </div>
          <ul className="action-list">
            {desk.meetingRequests.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.title}</strong>
                  <div className="muted">
                    {formatWhen(m.startAt)}
                    {m.location ? ` · ${m.location}` : ''}
                    {` · Requested by ${m.requestedBy}`}
                  </div>
                  {m.brief && <p className="action-brief">{m.brief}</p>}
                </div>
                <Link className="btn primary" href="/meetings">
                  Review request
                </Link>
              </li>
            ))}
            {!desk.meetingRequests.length && (
              <li className="muted" style={{ padding: 16 }}>
                No meeting requests waiting for your decision.
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="inbox-section">
        <div className="eyebrow">
          Remote review queue · {desk.remotePending} pending
        </div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Documents and directions awaiting approval</h3>
            <Link href="/remote" className="btn tiny-link">
              Remote studio →
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
                Remote review queue is clear.
              </li>
            )}
          </ul>
          <div className="inbox-footnote">
            Approve from the browser here, or continue in the Remote E-sign studio for certificate signing.
          </div>
        </div>
      </div>

      <div className="inbox-section">
        <div className="eyebrow">Notifications</div>
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Recent activity</h3>
          </div>
          <ul className="activity-list">
            {desk.activity.map((a) => (
              <li key={a.id} className={a.read ? 'read' : 'unread'}>
                <span className={`activity-dot ${a.read ? '' : 'live'}`} />
                <div className="activity-body">
                  <strong>{a.title}</strong>
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
                  Open →
                </Link>
              </li>
            ))}
            {!desk.activity.length && (
              <li className="muted" style={{ padding: 16 }}>
                No notifications yet.
              </li>
            )}
          </ul>
        </div>
      </div>

      <p className="inbox-footer-note muted">
        Notifications appear in this inbox. End-to-end desk messaging with attachments is under{' '}
        <Link href="/messages">Encrypted messages</Link>.
      </p>
    </>
  );
}
