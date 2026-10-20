'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { pageTitle } from '@/lib/i18n';
import { useLiveRefresh } from '@/lib/live-refresh';

type Dash = {
  kpis: {
    mattersTotal: number;
    mattersOpen: number;
    mattersClosed: number;
    directionsOpen: number;
    evidenceSubmitted: number;
    overdueAttention: number;
    highPriority: number;
    meetingsConfirmed: number;
    meetingsPending: number;
    workRecords: number;
    workAwaiting: number;
  };
  byClassification: { key: string; label: string; count: number; pct: number }[];
  byDirectionStatus: { key: string; label: string; count: number; pct: number }[];
  bySubjectArea: { label: string; count: number; pct: number }[];
  upcoming: {
    meetings: number;
    schedule: number;
    overdueDirections: number;
    directionRemindersDue: number;
    meetingsPending: number;
    workAwaiting: number;
    unreadInbox: number;
  };
  openFiles: {
    id: string;
    diaryNo: string;
    subject: string;
    sender: string;
    status: string;
    classification: string;
    priority?: string;
    holder: string | null;
    createdBy: string;
    updatedAt: string;
    vaultUnlocked: boolean;
  }[];
  directions: {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    owner: string;
    matter: { diaryNo: string; subject: string } | null;
  }[];
};

const CLASS_COLORS = ['#3b82f6', '#215b50', '#a84e40'];
const DIR_COLORS = ['#215b50', '#3b82f6', '#7c6bc4', '#bd9a57', '#a84e40'];

function Donut({
  slices,
  colors,
}: {
  slices: { label: string; pct: number; count: number }[];
  colors: string[];
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const total = slices.reduce((s, x) => s + x.count, 0);
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut-svg" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e8eee9" strokeWidth="14" />
        {slices.map((s, i) => {
          const len = total ? (s.count / total) * c : 0;
          const el = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" className="donut-center-value">
          {total}
        </text>
        <text x="60" y="72" textAnchor="middle" className="donut-center-label">
          total
        </text>
      </svg>
      <ul className="donut-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span className="swatch" style={{ background: colors[i % colors.length] }} />
            <span>{s.label}</span>
            <strong>
              {s.count} · {s.pct}%
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

function initial(name: string) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function OverviewPage() {
  const { user, lang } = useAuth();
  const toast = useToast();
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);

  const load = useCallback(async () => {
    setDash(await api<Dash>('/health/dashboard'));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
  }, [load]);

  useLiveRefresh(load, [load]);

  const upcomingLine = useMemo(() => {
    if (!dash) return '';
    const u = dash.upcoming;
    const parts = [
      u.schedule ? `${u.schedule} engagement${u.schedule === 1 ? '' : 's'} ahead` : null,
      u.directionRemindersDue
        ? `${u.directionRemindersDue} direction reminder${u.directionRemindersDue === 1 ? '' : 's'} due`
        : null,
      u.meetingsPending
        ? `${u.meetingsPending} meeting request${u.meetingsPending === 1 ? '' : 's'}`
        : null,
      u.workAwaiting
        ? `${u.workAwaiting} work record${u.workAwaiting === 1 ? '' : 's'} awaiting approval`
        : null,
      u.overdueDirections
        ? `${u.overdueDirections} overdue direction${u.overdueDirections === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'No urgent reminders right now.';
  }, [dash]);

  async function unlock(e: FormEvent, matterId: string) {
    e.preventDefault();
    setUnlockBusy(true);
    try {
      await api(`/vault/${matterId}/unlock`, {
        method: 'POST',
        json: { password: filePassword },
      });
      toast.success('Vault unlocked');
      setUnlockId(null);
      setFilePassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setUnlockBusy(false);
    }
  }

  if (error) return <div className="panel error">{error}</div>;
  if (!dash) return <p className="muted">Loading office overview…</p>;

  const k = dash.kpis;

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · LIVE WORKSPACE
          </div>
          <h1>{pageTitle(lang, 'overview', user?.role) || 'Office overview'}</h1>
          <p className="muted">Files, directions and engagements that need attention.</p>
        </div>
        <Link className="btn primary" href="/files?register=1">
          + Register a matter
        </Link>
      </div>

      <div className="callout-banner movement-callout">
        <div>
          <strong>Start with file movement</strong>
          <p>See the current holder, next action and full journey for each matter.</p>
        </div>
        <Link className="btn" href="/movement">
          Open movement →
        </Link>
      </div>

      <div className="dash-kpis accent-kpis">
        <div className="dash-kpi accent-blue">
          <div className="label">Total official matters</div>
          <div className="value">{k.mattersTotal}</div>
          <div className="hint">
            {k.mattersOpen} active · {k.mattersClosed} closed
          </div>
        </div>
        <div className="dash-kpi accent-gold">
          <div className="label">Directions tracker</div>
          <div className="value">{k.directionsOpen}</div>
          <div className="hint">
            {k.evidenceSubmitted} evidence submitted
          </div>
        </div>
        <div className="dash-kpi accent-red">
          <div className="label">Overdue & attention</div>
          <div className="value">{k.overdueAttention}</div>
          <div className="hint">{k.highPriority} high priority</div>
        </div>
        <div className="dash-kpi accent-sky">
          <div className="label">Confirmed meetings</div>
          <div className="value">{k.meetingsConfirmed}</div>
          <div className="hint">{k.meetingsPending} requests pending</div>
        </div>
        <div className="dash-kpi accent-amber">
          <div className="label">Work records & briefs</div>
          <div className="value">{k.workRecords}</div>
          <div className="hint">{k.workAwaiting} awaiting approval</div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="panel">
          <h3>Matters by classification</h3>
          <Donut slices={dash.byClassification} colors={CLASS_COLORS} />
        </div>
        <div className="panel">
          <h3>Directions compliance</h3>
          {dash.byDirectionStatus.some((s) => s.count > 0) ? (
            <Donut slices={dash.byDirectionStatus} colors={DIR_COLORS} />
          ) : (
            <p className="muted">No directions yet</p>
          )}
        </div>
        <div className="panel">
          <h3>Subject area breakdown</h3>
          <ul className="bar-list">
            {dash.bySubjectArea.length === 0 && <li className="muted">No subject data yet</li>}
            {dash.bySubjectArea.map((s) => (
              <li key={s.label}>
                <div className="bar-meta">
                  <span>{s.label}</span>
                  <strong>
                    {s.count} · {s.pct}%
                  </strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, s.pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="callout-banner upcoming-banner">
        <div>
          <strong>Upcoming</strong>
          <p>{upcomingLine}</p>
        </div>
        <Link className="btn" href="/schedule">
          Open schedule →
        </Link>
      </div>

      <div className="dash-split">
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Open files</h3>
            <Link href="/files" className="btn tiny-link">
              View all →
            </Link>
          </div>
          <ul className="open-file-list">
            {dash.openFiles.map((f) => {
              const confidential = f.classification === 'CONFIDENTIAL';
              const locked = confidential && !f.vaultUnlocked;
              return (
                <li key={f.id} className={locked ? 'file-locked' : undefined}>
                  <div className="open-file-main">
                    <div className="open-file-avatar">{initial(f.holder || f.createdBy)}</div>
                    <div>
                      {locked ? (
                        <>
                          <strong>{f.diaryNo}</strong>
                          <div className="muted">Holder: {f.holder || f.createdBy}</div>
                        </>
                      ) : (
                        <>
                          <strong>{f.subject}</strong>
                          <div className="muted">
                            {f.diaryNo} · {f.sender}
                            {f.holder ? ` · ${f.holder}` : ''}
                          </div>
                        </>
                      )}
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        {!locked && (
                          <span className={`badge ${f.status}`}>{statusLabel(f.status)}</span>
                        )}
                        {confidential && <span className="badge CONFIDENTIAL">Confidential</span>}
                        {f.priority === 'URGENT' && <span className="badge URGENT">Urgent</span>}
                      </div>
                      {unlockId === f.id && (
                        <form className="unlock-inline" onSubmit={(e) => unlock(e, f.id)}>
                          <input
                            type="password"
                            placeholder="File password"
                            value={filePassword}
                            onChange={(e) => setFilePassword(e.target.value)}
                            minLength={12}
                            required
                            autoFocus
                          />
                          <button className="btn primary" type="submit" disabled={unlockBusy}>
                            Unlock
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setUnlockId(null);
                              setFilePassword('');
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="open-file-actions">
                    {locked ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setUnlockId(f.id);
                          setFilePassword('');
                        }}
                      >
                        🔑 Enter password
                      </button>
                    ) : (
                      <Link className="btn primary" href={`/files/${f.id}`}>
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
            {!dash.openFiles.length && (
              <li className="muted" style={{ padding: 16 }}>
                No open files — register the first matter.
              </li>
            )}
          </ul>
        </div>

        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Directions to follow up</h3>
            <Link href="/directions" className="btn tiny-link">
              Open tracker →
            </Link>
          </div>
          <ul className="open-file-list">
            {dash.directions.map((d) => (
              <li key={d.id}>
                <div className="open-file-main">
                  <div className="open-file-avatar">{initial(d.owner)}</div>
                  <div>
                    <strong>{d.title}</strong>
                    <div className="muted">
                      {d.matter?.diaryNo || 'Direction'}
                      {d.dueDate ? ` · Due ${new Date(d.dueDate).toLocaleDateString()}` : ''}
                      {` · ${d.owner}`}
                    </div>
                  </div>
                </div>
                <div className="open-file-actions">
                  <span className={`badge ${d.status}`}>{statusLabel(d.status)}</span>
                </div>
              </li>
            ))}
            {!dash.directions.length && (
              <li className="muted" style={{ padding: 16 }}>
                No open directions.
              </li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
