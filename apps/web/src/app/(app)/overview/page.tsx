'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { enumLabel, pageTitle, t, tf } from '@/lib/i18n';
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
  totalLabel,
}: {
  slices: { label: string; pct: number; count: number }[];
  colors: string[];
  totalLabel: string;
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
          {totalLabel}
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

function initial(name: string) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function OverviewPage() {
  const { user, lang, label } = useAuth();
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
    const plural = (base: string, n: number) =>
      tf(lang, `${base}_${n === 1 ? '1' : 'n'}`, { n });
    const parts = [
      u.schedule ? plural('ov_up_engagement', u.schedule) : null,
      u.directionRemindersDue ? plural('ov_up_reminder', u.directionRemindersDue) : null,
      u.meetingsPending ? plural('ov_up_meeting', u.meetingsPending) : null,
      u.workAwaiting ? plural('ov_up_work', u.workAwaiting) : null,
      u.overdueDirections ? plural('ov_up_overdue', u.overdueDirections) : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : label('ov_noReminders');
  }, [dash, lang, label]);

  async function unlock(e: FormEvent, matterId: string) {
    e.preventDefault();
    setUnlockBusy(true);
    try {
      await api(`/vault/${matterId}/unlock`, {
        method: 'POST',
        json: { password: filePassword },
      });
      toast.success(label('files_unlocked'));
      setUnlockId(null);
      setFilePassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_unlockFailed'));
    } finally {
      setUnlockBusy(false);
    }
  }

  if (error) return <div className="panel error">{error}</div>;
  if (!dash) return <p className="muted">{label('ov_loading')}</p>;

  const k = dash.kpis;
  const classSlices = dash.byClassification.map((s) => ({ ...s, label: enumLabel(lang, s.key) }));
  const dirSlices = dash.byDirectionStatus.map((s) => {
    const key = `ov_dir_${s.key}`;
    const tr = t(lang, key);
    return { ...s, label: tr === key ? s.label : tr };
  });

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_liveWorkspace')}
          </div>
          <h1>{pageTitle(lang, 'overview', user?.role) || label('overview')}</h1>
          <p className="muted">{label('ov_heroSub')}</p>
        </div>
        <Link className="btn primary" href="/files?register=1">
          {label('ov_registerMatter')}
        </Link>
      </div>

      <div className="callout-banner movement-callout">
        <div>
          <strong>{label('ov_startMovement')}</strong>
          <p>{label('ov_startMovementBody')}</p>
        </div>
        <Link className="btn" href="/movement">
          {label('ov_openMovement')}
        </Link>
      </div>

      <div className="dash-kpis accent-kpis">
        <div className="dash-kpi accent-blue">
          <div className="label">{label('ov_kpiTotalMatters')}</div>
          <div className="value">{k.mattersTotal}</div>
          <div className="hint">
            {tf(lang, 'ov_hintActiveClosed', { open: k.mattersOpen, closed: k.mattersClosed })}
          </div>
        </div>
        <div className="dash-kpi accent-gold">
          <div className="label">{label('ov_kpiDirections')}</div>
          <div className="value">{k.directionsOpen}</div>
          <div className="hint">{tf(lang, 'ov_hintEvidence', { n: k.evidenceSubmitted })}</div>
        </div>
        <div className="dash-kpi accent-red">
          <div className="label">{label('ov_kpiOverdue')}</div>
          <div className="value">{k.overdueAttention}</div>
          <div className="hint">{tf(lang, 'ov_hintHigh', { n: k.highPriority })}</div>
        </div>
        <div className="dash-kpi accent-sky">
          <div className="label">{label('ov_kpiMeetings')}</div>
          <div className="value">{k.meetingsConfirmed}</div>
          <div className="hint">{tf(lang, 'ov_hintRequestsPending', { n: k.meetingsPending })}</div>
        </div>
        <div className="dash-kpi accent-amber">
          <div className="label">{label('ov_kpiWork')}</div>
          <div className="value">{k.workRecords}</div>
          <div className="hint">{tf(lang, 'ov_hintAwaitingApproval', { n: k.workAwaiting })}</div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="panel">
          <h3>{label('ov_chartClass')}</h3>
          <Donut slices={classSlices} colors={CLASS_COLORS} totalLabel={label('ov_donutTotal')} />
        </div>
        <div className="panel">
          <h3>{label('ov_chartDirections')}</h3>
          {dash.byDirectionStatus.some((s) => s.count > 0) ? (
            <Donut slices={dirSlices} colors={DIR_COLORS} totalLabel={label('ov_donutTotal')} />
          ) : (
            <p className="muted">{label('ov_noDirectionsYet')}</p>
          )}
        </div>
        <div className="panel">
          <h3>{label('ov_chartSubject')}</h3>
          <ul className="bar-list">
            {dash.bySubjectArea.length === 0 && (
              <li className="muted">{label('ov_noSubjectData')}</li>
            )}
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
          <strong>{label('overview_upcoming')}</strong>
          <p>{upcomingLine}</p>
        </div>
        <Link className="btn" href="/schedule">
          {label('ov_openSchedule')}
        </Link>
      </div>

      <div className="dash-split">
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>{label('overview_openFiles')}</h3>
            <Link href="/files" className="btn tiny-link">
              {label('cm_viewAllArrow')}
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
                          <div className="muted">
                            {label('holder')}: {f.holder || f.createdBy}
                          </div>
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
                          <span className={`badge ${f.status}`}>{enumLabel(lang, f.status)}</span>
                        )}
                        {confidential && (
                          <span className="badge CONFIDENTIAL">{enumLabel(lang, 'CONFIDENTIAL')}</span>
                        )}
                        {f.priority === 'URGENT' && (
                          <span className="badge URGENT">{enumLabel(lang, 'URGENT')}</span>
                        )}
                      </div>
                      {unlockId === f.id && (
                        <form className="unlock-inline" onSubmit={(e) => unlock(e, f.id)}>
                          <input
                            type="password"
                            placeholder={label('cm_filePassword')}
                            value={filePassword}
                            onChange={(e) => setFilePassword(e.target.value)}
                            minLength={12}
                            required
                            autoFocus
                          />
                          <button className="btn primary" type="submit" disabled={unlockBusy}>
                            {label('files_unlock')}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setUnlockId(null);
                              setFilePassword('');
                            }}
                          >
                            {label('cancel')}
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
                        {label('cm_enterPassword')}
                      </button>
                    ) : (
                      <Link className="btn primary" href={`/files/${f.id}`}>
                        {label('open')}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
            {!dash.openFiles.length && (
              <li className="muted" style={{ padding: 16 }}>
                {label('ov_noOpenFilesRegister')}
              </li>
            )}
          </ul>
        </div>

        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head" style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>{label('ov_directionsFollow')}</h3>
            <Link href="/directions" className="btn tiny-link">
              {label('ov_openTracker')}
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
                      {d.matter?.diaryNo || label('registry_direction')}
                      {d.dueDate
                        ? ` · ${tf(lang, 'ov_dueOn', { date: new Date(d.dueDate).toLocaleDateString() })}`
                        : ''}
                      {` · ${d.owner}`}
                    </div>
                  </div>
                </div>
                <div className="open-file-actions">
                  <span className={`badge ${d.status}`}>{enumLabel(lang, d.status)}</span>
                </div>
              </li>
            ))}
            {!dash.directions.length && (
              <li className="muted" style={{ padding: 16 }}>
                {label('overview_noDirections')}
              </li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
