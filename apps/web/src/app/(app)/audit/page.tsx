'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';

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

function roleTitle(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function relativeLast(iso: string | null) {
  if (!iso) return 'No recent activity';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Last activity just now';
  if (mins < 60) return `Last activity ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `Last activity ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `Last activity ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function fmtStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
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
  const { user } = useAuth();
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
          ? `Chain verified — ${res.count} events intact`
          : `Chain broken at seq ${res.failedAt}`,
      );
      if (res.valid) toast.success('Audit chain verified');
      else toast.error(`Chain broken at seq ${res.failedAt}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
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
      if (!res.ok) throw new Error('Report download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel report downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
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
      if (!res.ok) throw new Error('Exit pack failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gow-exit-pack-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Records exit pack downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
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
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · AUDIT
          </div>
          <h1>Audit dashboard</h1>
          <p className="muted">
            Insights for services, participation and audit integrity across the office system.
          </p>
        </div>
        <div className="audit-hero-actions">
          <Link href="/remote" className="btn">
            Lookup certificate
          </Link>
          {canExport ? (
            <button type="button" className="btn" onClick={downloadExitPack} disabled={busy}>
              Exit pack (JSON)
            </button>
          ) : null}
          <button type="button" className="btn primary" onClick={downloadReport} disabled={busy}>
            Download Excel report
          </button>
        </div>
      </div>

      {!dash ? (
        <div className="panel">
          <p className="muted">Loading audit dashboard…</p>
        </div>
      ) : (
        <>
          <div className="dash-kpis accent-kpis audit-kpis">
            <div className="dash-kpi accent-sky">
              <div className="label">Active workflows</div>
              <div className="value">{dash.kpis.activeWorkflows}</div>
              <div className="hint">Open files &amp; live matters</div>
            </div>
            <div className="dash-kpi accent-blue">
              <div className="label">Total actions</div>
              <div className="value">{dash.kpis.totalActions}</div>
              <div className="hint">Audit events · last 30 days</div>
            </div>
            <div className="dash-kpi accent-gold">
              <div className="label">E-sign / SHA-256</div>
              <div className="value">{dash.kpis.esignEvents}</div>
              <div className="hint">Signed certificates on ledger</div>
            </div>
            <div className="dash-kpi accent-amber">
              <div className="label">Urgent queue</div>
              <div className="value">{dash.kpis.urgentQueue}</div>
              <div className="hint">Pending seals &amp; direction attention</div>
            </div>
            <div className="dash-kpi accent-red alert">
              <div className="label">Rejected / flagged</div>
              <div className="value" style={{ color: '#a84e40' }}>
                {dash.kpis.rejectedFlagged}
              </div>
              <div className="hint">Revoked seals, overdue, rejected work</div>
            </div>
          </div>

          <div className="audit-mid">
            <div className="panel audit-chart-panel">
              <div className="eyebrow">Daily audit activity</div>
              <h2>Volume &amp; seal activity</h2>
              <p className="muted audit-lead">
                {dash.dailySummary.eventsPast5} events in the past 5 days ·{' '}
                {dash.dailySummary.sealDays} day
                {dash.dailySummary.sealDays === 1 ? '' : 's'} with digital seals.
              </p>
              <div className="audit-legend">
                <span>
                  <i className="swatch pine" /> Events logged
                </span>
                <span>
                  <i className="swatch gold" /> Seals / receipts
                </span>
              </div>
              <div className="audit-bars" role="img" aria-label="Daily audit activity chart">
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
              <div className="eyebrow">Integrity</div>
              <h2>{dash.chain.valid ? 'Audit chain verified' : 'Audit chain issue'}</h2>
              <p className="muted audit-lead">
                {dash.chain.count} events checked against a linked hash chain and ledger checkpoint.
              </p>
              <div className="audit-chain-fields">
                <div>
                  <span>Last checkpoint</span>
                  <code>{shortHash(dash.chain.lastCheckpoint)}</code>
                </div>
                <div>
                  <span>Previous link</span>
                  <code>{shortHash(dash.chain.prevHash)}</code>
                </div>
                <div>
                  <span>Last update</span>
                  <strong>{dash.chain.lastAt ? fmtStamp(dash.chain.lastAt) : '—'}</strong>
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
                {busy ? 'Verifying…' : 'Verify chain'}
              </button>
            </div>
          </div>

          <div className="panel audit-people-panel">
            <div className="remote-section-head">
              <div>
                <div className="eyebrow">Activity by person</div>
                <h2>Staff participation &amp; audit trail</h2>
                <p className="muted audit-lead">
                  Select an officer to inspect assignments, overdue work, and recent ledger events.
                </p>
              </div>
              <label className="audit-filter">
                Filter by role
                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                  <option value="all">All officers</option>
                  <option value="SPEAKER">Speaker</option>
                  <option value="SECRETARY_GENERAL">Secretary General</option>
                  <option value="SPECIAL_SECRETARY">Special Secretary</option>
                  <option value="DG_IT">DG IT</option>
                  <option value="ADMIN">Administrator</option>
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
                            {roleTitle(p.role)} · {relativeLast(p.lastAt)}
                          </span>
                        </div>
                        <div className="audit-person-stats">
                          <span>{p.actions} actions</span>
                          <span>{p.completions} completions</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selected ? (
                <div className="audit-person-detail">
                  <h3>
                    {selected.displayName} — activity detail
                  </h3>
                  <div className="audit-mini-kpis">
                    <div>
                      <strong>{selected.assignments}</strong>
                      <span>Assignments</span>
                    </div>
                    <div>
                      <strong>{selected.pending}</strong>
                      <span>Pending</span>
                    </div>
                    <div>
                      <strong className={selected.pastDue ? 'bad' : ''}>{selected.pastDue}</strong>
                      <span>Past due</span>
                    </div>
                    <div>
                      <strong>{selected.totalRecords}</strong>
                      <span>Ledger events</span>
                    </div>
                  </div>
                  <div className="audit-note">
                    Past due counts track directions still open after their due date or escalated for
                    attention. Completions include seals, approvals, and closed work.
                  </div>
                  <div className="audit-timeline">
                    {selected.recent.length === 0 ? (
                      <p className="muted">No recent events for this officer.</p>
                    ) : (
                      selected.recent.map((e) => (
                        <article key={e.id} className="audit-timeline-item">
                          <time>{fmtStamp(e.createdAt)}</time>
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
              <div className="eyebrow">Office workload and delay</div>
              <h2>Pending &amp; past due by officer</h2>
              <table className="table audit-table">
                <thead>
                  <tr>
                    <th>Officer</th>
                    <th>Actions</th>
                    <th>Pending</th>
                    <th>Past due</th>
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
              <div className="eyebrow">Matters by subject area</div>
              <h2>Open workload markers</h2>
              <table className="table audit-table">
                <thead>
                  <tr>
                    <th>Subject area</th>
                    <th>Matters</th>
                    <th>Avg age (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.bySubject.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        No open matters.
                      </td>
                    </tr>
                  ) : (
                    dash.bySubject.map((s) => (
                      <tr key={s.label}>
                        <td>
                          <strong>{s.label}</strong>
                        </td>
                        <td>
                          {s.count} matter{s.count === 1 ? '' : 's'}
                        </td>
                        <td>
                          {s.avgDelayDays <= 10
                            ? `Within ${s.avgDelayDays || 1} days`
                            : `${s.avgDelayDays} days avg`}
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
                Explore {dash.events.length} recorded events
              </span>
              <span aria-hidden>{showEvents ? '▴' : '▾'}</span>
            </button>
            {showEvents ? (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table audit-table">
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>When</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Summary</th>
                      <th>Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.seq}</td>
                        <td>{fmtStamp(e.createdAt)}</td>
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
              Checks include digital certifications, per-action individual leaf identity, and
              production-level signature process health on the hash chain.
            </p>
          </div>
        </>
      )}
    </>
  );
}
