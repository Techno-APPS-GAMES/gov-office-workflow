'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { Lang, roleTitle as roleTitleL, tf } from '@/lib/i18n';

type Daily = { date: string; label: string; events: number; seals: number };
type PersonEvent = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  hash: string;
};
type Person = {
  id: string;
  displayName: string;
  role: string;
  username: string;
  actions: number;
  completions: number;
  lastAt: string | null;
  assignments: number;
  pending: number;
  pastDue: number;
  totalRecords: number;
  recent: PersonEvent[];
};
type Dash = {
  kpis: {
    activeWorkflows: number;
    totalActions: number;
    esignEvents: number;
    urgentQueue: number;
    rejectedFlagged: number;
  };
  daily: Daily[];
  dailySummary: { eventsPast5: number; sealDays: number };
  chain: {
    valid: boolean;
    count: number;
    failedAt?: number;
    lastCheckpoint: string | null;
    lastAt: string | null;
    prevHash: string;
  };
  people: Person[];
  workload: {
    id: string;
    displayName: string;
    role: string;
    actions: number;
    pending: number;
    pastDue: number;
  }[];
  bySubject: { label: string; count: number; avgDelayDays: number }[];
  events: {
    id: string;
    seq: number;
    action: string;
    summary: string;
    hash: string;
    createdAt: string;
    actor?: { displayName: string; role: string } | null;
  }[];
};



function relativeLast(
  iso: string | null,
  label: (k: string) => string,
  lang: Lang,
  locale?: string,
) {
  if (!iso) return label('aud_noRecent');
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return label('aud_lastNow');
  if (mins < 60) return tf(lang, 'aud_lastMin', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return tf(lang, hrs === 1 ? 'aud_lastHour' : 'aud_lastHours', { n: hrs });
  return `${label('aud_lastActivity')} ${new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
}

function fmtStamp(iso: string, locale?: string) {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortHash(h?: string | null) {
  if (!h) return '—';
  return `${h.slice(0, 18)}…`;
}

export default function AuditPage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
  const roleTitle = (r?: string) =>
    !r
      ? ''
      : lang === 'ur'
        ? roleTitleL(lang, r)
        : ROLE_META[r as Role]?.title || r.replace(/_/g, ' ');
  const toast = useToast();
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [filterRole, setFilterRole] = useState('all');

  const load = useCallback(async () => {
    const d = await api<Dash>('/audit/dashboard');
    setDash(d);
    setSelectedId((cur) => cur || d.people[0]?.id || null);
  }, []);

  useEffect(() => {
    load().catch(() => setDash(null));
  }, [load]);

  const people = useMemo(() => {
    if (!dash) return [];
    if (filterRole === 'all') return dash.people;
    return dash.people.filter((p) => p.role === filterRole);
  }, [dash, filterRole]);

  const selected = useMemo(
    () => people.find((p) => p.id === selectedId) || people[0] || null,
    [people, selectedId],
  );

  const maxBar = useMemo(() => {
    if (!dash?.daily.length) return 1;
    return Math.max(1, ...dash.daily.map((d) => d.events + d.seals));
  }, [dash]);

  async function verifyChain() {
    setBusy(true);
    try {
      const res = await api<{ valid: boolean; count: number; failedAt?: number }>('/audit/verify');
      setVerifyNote(
        res.valid
          ? tf(lang, 'aud_verifiedNote', { n: res.count })
          : tf(lang, 'aud_brokenNote', { seq: res.failedAt ?? '' }),
      );
      if (res.valid) toast.success(label('aud_toastVerified'));
      else toast.error(tf(lang, 'aud_brokenNote', { seq: res.failedAt ?? '' }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('aud_verifyFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport() {
    setBusy(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('gow_access') : null;
      const res = await fetch('/api/audit/report', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(label('aud_reportFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(label('aud_toastReport'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('aud_downloadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadExitPack() {
    setBusy(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('gow_access') : null;
      const res = await fetch('/api/export/pack', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(label('aud_exitFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gow-exit-pack-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(label('aud_toastExit'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('aud_exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  const canExport = user?.role === 'SPEAKER' || user?.role === 'ADMIN';

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('aud_eyebrow')}
          </div>
          <h1>{label('audit')}</h1>
          <p className="muted">
            {label('aud_heroSub')}
          </p>
        </div>
        <div className="audit-hero-actions">
          <Link href="/remote" className="btn">
            {label('aud_lookup')}
          </Link>
          {canExport ? (
            <button type="button" className="btn" onClick={downloadExitPack} disabled={busy}>
              {label('aud_exitPack')}
            </button>
          ) : null}
          <button type="button" className="btn primary" onClick={downloadReport} disabled={busy}>
            {label('aud_downloadExcel')}
          </button>
        </div>
      </div>

      {!dash ? (
        <div className="panel">
          <p className="muted">{label('aud_loading')}</p>
        </div>
      ) : (
        <>
          <div className="dash-kpis accent-kpis audit-kpis">
            <div className="dash-kpi accent-sky">
              <div className="label">{label('aud_kpiWorkflows')}</div>
              <div className="value">{dash.kpis.activeWorkflows}</div>
              <div className="hint">{label('aud_kpiWorkflowsHint')}</div>
            </div>
            <div className="dash-kpi accent-blue">
              <div className="label">{label('aud_kpiActions')}</div>
              <div className="value">{dash.kpis.totalActions}</div>
              <div className="hint">{label('aud_kpiActionsHint')}</div>
            </div>
            <div className="dash-kpi accent-gold">
              <div className="label">{label('aud_kpiEsign')}</div>
              <div className="value">{dash.kpis.esignEvents}</div>
              <div className="hint">{label('aud_kpiEsignHint')}</div>
            </div>
            <div className="dash-kpi accent-amber">
              <div className="label">{label('aud_kpiUrgent')}</div>
              <div className="value">{dash.kpis.urgentQueue}</div>
              <div className="hint">{label('aud_kpiUrgentHint')}</div>
            </div>
            <div className="dash-kpi accent-red alert">
              <div className="label">{label('aud_kpiRejected')}</div>
              <div className="value" style={{ color: '#a84e40' }}>
                {dash.kpis.rejectedFlagged}
              </div>
              <div className="hint">{label('aud_kpiRejectedHint')}</div>
            </div>
          </div>

          <div className="audit-mid">
            <div className="panel audit-chart-panel">
              <div className="eyebrow">{label('aud_dailyEyebrow')}</div>
              <h2>{label('aud_volume')}</h2>
              <p className="muted audit-lead">
                {tf(lang, 'aud_dailyLead', {
                  a: dash.dailySummary.eventsPast5,
                  b: dash.dailySummary.sealDays,
                })}
              </p>
              <div className="audit-legend">
                <span>
                  <i className="swatch pine" /> {label('aud_legendEvents')}
                </span>
                <span>
                  <i className="swatch gold" /> {label('aud_legendSeals')}
                </span>
              </div>
              <div className="audit-bars" role="img" aria-label={label('aud_chartAria')}>
                {dash.daily.map((d) => {
                  const total = d.events + d.seals;
                  const h = Math.max(4, Math.round((total / maxBar) * 120));
                  const sealH = total ? Math.round((d.seals / total) * h) : 0;
                  const eventH = h - sealH;
                  return (
                    <div key={d.date} className="audit-bar-col">
                      <div className="audit-bar-stack" style={{ height: h }}>
                        <span className="seg gold" style={{ height: sealH || 0 }} />
                        <span className="seg pine" style={{ height: eventH || (total ? 0 : 4) }} />
                      </div>
                      <span className="audit-bar-label">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel audit-chain-panel">
              <div className="eyebrow">{label('aud_integrity')}</div>
              <h2>{dash.chain.valid ? label('aud_toastVerified') : label('aud_chainIssue')}</h2>
              <p className="muted audit-lead">
                {tf(lang, 'aud_chainLead', { n: dash.chain.count })}
              </p>
              <div className="audit-chain-fields">
                <div>
                  <span>{label('aud_lastCheckpoint')}</span>
                  <code>{shortHash(dash.chain.lastCheckpoint)}</code>
                </div>
                <div>
                  <span>{label('aud_prevLink')}</span>
                  <code>{shortHash(dash.chain.prevHash)}</code>
                </div>
                <div>
                  <span>{label('aud_lastUpdate')}</span>
                  <strong>{dash.chain.lastAt ? fmtStamp(dash.chain.lastAt, locale) : '—'}</strong>
                </div>
              </div>
              {verifyNote ? (
                <p className={dash.chain.valid ? 'ok' : 'error'} style={{ marginTop: 10 }}>
                  {verifyNote}
                </p>
              ) : null}
              <button
                type="button"
                className="btn remote-verify-btn"
                style={{ marginTop: 14 }}
                disabled={busy}
                onClick={verifyChain}
              >
                {busy ? label('aud_verifying') : label('audit_verify')}
              </button>
            </div>
          </div>

          <div className="panel audit-people-panel">
            <div className="remote-section-head">
              <div>
                <div className="eyebrow">{label('aud_byPerson')}</div>
                <h2>{label('aud_participation')}</h2>
                <p className="muted audit-lead">
                  {label('aud_selectOfficer')}
                </p>
              </div>
              <label className="audit-filter">
                {label('aud_filterRole')}
                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                  <option value="all">{label('aud_allOfficers')}</option>
                  <option value="SPEAKER">{roleTitle('SPEAKER')}</option>
                  <option value="SECRETARY_GENERAL">{roleTitle('SECRETARY_GENERAL')}</option>
                  <option value="SPECIAL_SECRETARY">{roleTitle('SPECIAL_SECRETARY')}</option>
                  <option value="DG_IT">{roleTitle('DG_IT')}</option>
                  <option value="ADMIN">{roleTitle('ADMIN')}</option>
                </select>
              </label>
            </div>

            <div className="audit-people-layout">
              <ul className="audit-people-list">
                {people.map((p) => {
                  const src = roleAvatar(p.role);
                  const active = selected?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`audit-person ${active ? 'active' : ''}`}
                        onClick={() => setSelectedId(p.id)}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="remote-avatar" />
                        ) : (
                          <span className="remote-avatar fallback">
                            {p.displayName.slice(0, 1)}
                          </span>
                        )}
                        <div className="audit-person-main">
                          <strong>{p.displayName}</strong>
                          <span className="muted">
                            {roleTitle(p.role)} · {relativeLast(p.lastAt, label, lang, locale)}
                          </span>
                        </div>
                        <div className="audit-person-stats">
                          <span>{tf(lang, 'aud_nActions', { n: p.actions })}</span>
                          <span>{tf(lang, 'aud_nCompletions', { n: p.completions })}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selected ? (
                <div className="audit-person-detail">
                  <h3>
                    {selected.displayName} — {label('aud_activityDetail')}
                  </h3>
                  <div className="audit-mini-kpis">
                    <div>
                      <strong>{selected.assignments}</strong>
                      <span>{label('aud_assignments')}</span>
                    </div>
                    <div>
                      <strong>{selected.pending}</strong>
                      <span>{label('pending')}</span>
                    </div>
                    <div>
                      <strong className={selected.pastDue ? 'bad' : ''}>{selected.pastDue}</strong>
                      <span>{label('aud_pastDue')}</span>
                    </div>
                    <div>
                      <strong>{selected.totalRecords}</strong>
                      <span>{label('aud_ledgerEvents')}</span>
                    </div>
                  </div>
                  <div className="audit-note">
                    {label('aud_note')}
                  </div>
                  <div className="audit-timeline">
                    {selected.recent.length === 0 ? (
                      <p className="muted">{label('aud_noEvents')}</p>
                    ) : (
                      selected.recent.map((e) => (
                        <article key={e.id} className="audit-timeline-item">
                          <time>{fmtStamp(e.createdAt, locale)}</time>
                          <div>
                            <span className="audit-action-tag">{e.action.replace(/_/g, ' ')}</span>
                            <p>{e.summary}</p>
                            <code className="remote-seal">{shortHash(e.hash)}</code>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="audit-bottom">
            <div className="panel">
              <div className="eyebrow">{label('aud_workloadEyebrow')}</div>
              <h2>{label('aud_pendingByOfficer')}</h2>
              <table className="table audit-table">
                <thead>
                  <tr>
                    <th>{label('officer')}</th>
                    <th>{label('actions')}</th>
                    <th>{label('pending')}</th>
                    <th>{label('aud_pastDue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.workload.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.displayName}</strong>
                        <div className="muted tiny">{roleTitle(w.role)}</div>
                      </td>
                      <td>{w.actions}</td>
                      <td>{w.pending}</td>
                      <td className={w.pastDue ? 'audit-pastdue' : ''}>{w.pastDue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div className="eyebrow">{label('aud_mattersBySubject')}</div>
              <h2>{label('aud_markers')}</h2>
              <table className="table audit-table">
                <thead>
                  <tr>
                    <th>{label('files_area')}</th>
                    <th>{label('search_matters')}</th>
                    <th>{label('aud_avgAge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.bySubject.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        {label('aud_noOpenMatters')}
                      </td>
                    </tr>
                  ) : (
                    dash.bySubject.map((s) => (
                      <tr key={s.label}>
                        <td>
                          <strong>{s.label}</strong>
                        </td>
                        <td>
                          {s.count === 1 ? label('aud_oneMatter') : tf(lang, 'aud_nMatters', { n: s.count })}
                        </td>
                        <td>
                          {s.avgDelayDays <= 10
                            ? tf(lang, 'aud_within', { n: s.avgDelayDays || 1 })
                            : tf(lang, 'aud_daysAvg', { n: s.avgDelayDays })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel audit-explore">
            <button
              type="button"
              className="audit-explore-toggle"
              onClick={() => setShowEvents((v) => !v)}
            >
              <span>
                {tf(lang, 'aud_explore', { n: dash.events.length })}
              </span>
              <span aria-hidden>{showEvents ? '▴' : '▾'}</span>
            </button>
            {showEvents ? (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table audit-table">
                  <thead>
                    <tr>
                      <th>{label('aud_seq')}</th>
                      <th>{label('sch_when')}</th>
                      <th>{label('aud_action')}</th>
                      <th>{label('aud_actor')}</th>
                      <th>{label('calls_summary')}</th>
                      <th>{label('aud_hash')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.seq}</td>
                        <td>{fmtStamp(e.createdAt, locale)}</td>
                        <td>{e.action}</td>
                        <td>{e.actor?.displayName || '—'}</td>
                        <td>{e.summary}</td>
                        <td>
                          <code className="remote-seal">{shortHash(e.hash)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="muted audit-footer-note">
              {label('aud_footer')}
            </p>
          </div>
        </>
      )}
    </>
  );
}
