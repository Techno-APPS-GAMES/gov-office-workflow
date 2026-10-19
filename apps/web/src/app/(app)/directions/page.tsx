'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';

type Person = { id?: string; displayName: string; role?: string };
type MatterRef = { id: string; diaryNo: string; subject: string };

type Direction = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  evidence?: string | null;
  escalateNote?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: Person | null;
  ownerId?: string;
  createdBy?: Person | null;
  matter?: MatterRef | null;
};

type Activity = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  actor?: { displayName: string } | null;
};

type Filter = 'all' | 'active' | 'evidence' | 'overdue' | 'closed';

const PIPELINE = [
  { key: 'issued', label: 'Issued' },
  { key: 'progress', label: 'In progress' },
  { key: 'evidence', label: 'Evidence submitted' },
  { key: 'closed', label: 'Verified & closed' },
] as const;

function prettyStatus(status: string) {
  if (status === 'EVIDENCE_SUBMITTED') return 'Completion submitted';
  if (status === 'CLOSED') return 'Closed';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string) {
  if (status === 'OVERDUE' || status === 'ESCALATED') return 'dir-overdue';
  if (status === 'EVIDENCE_SUBMITTED') return 'dir-evidence';
  if (status === 'CLOSED') return 'dir-closed';
  return 'dir-active';
}

function pipelineIndex(status: string) {
  switch (status) {
    case 'CLOSED':
      return 3;
    case 'EVIDENCE_SUBMITTED':
      return 2;
    case 'ISSUED':
      return 0;
    default:
      return 1;
  }
}

function isActive(s: string) {
  return ['ISSUED', 'IN_PROGRESS', 'RETURNED', 'ESCALATED'].includes(s);
}

function shortRef(id: string) {
  const n = parseInt(id.replace(/\D/g, '').slice(0, 4) || '0', 10);
  return `D-${1000 + (n % 9000)}`;
}

function roleTitle(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function OwnerChip({ owner }: { owner?: Person | null }) {
  const name = owner?.displayName || 'Unassigned';
  const title = roleTitle(owner?.role);
  const src = roleAvatar(owner?.role);
  return (
    <div className="dir-owner">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="dir-owner-avatar" />
      ) : (
        <span className="dir-owner-avatar fallback">{name.charAt(0)}</span>
      )}
      <div>
        <strong>{name}</strong>
        {title ? <div className="muted">{title}</div> : null}
      </div>
    </div>
  );
}

export default function DirectionsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Direction[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const isSpeaker = user?.role === 'SPEAKER' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setItems(await api<Direction[]>('/directions'));
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  const counts = useMemo(() => {
    const overdue = items.filter((d) => d.status === 'OVERDUE').length;
    const evidenceCount = items.filter((d) => d.status === 'EVIDENCE_SUBMITTED').length;
    const closed = items.filter((d) => d.status === 'CLOSED').length;
    const inProgress = items.filter((d) => d.status === 'IN_PROGRESS').length;
    const active = items.filter((d) => isActive(d.status) || d.status === 'OVERDUE').length;
    return {
      total: items.length,
      inProgress,
      evidence: evidenceCount,
      overdue,
      closed,
      active,
    };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (filter === 'all') return true;
      if (filter === 'active') return isActive(d.status) || d.status === 'OVERDUE';
      if (filter === 'evidence') return d.status === 'EVIDENCE_SUBMITTED';
      if (filter === 'overdue') return d.status === 'OVERDUE';
      if (filter === 'closed') return d.status === 'CLOSED';
      return true;
    });
  }, [items, filter]);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      setActivity([]);
      return;
    }
    setHistoryId(id);
    try {
      setActivity(await api<Activity[]>(`/directions/${id}/activity`));
    } catch {
      setActivity([]);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Directions tracker</h1>
          <p className="muted">
            Follow each instruction from issuance through named ownership, reminders, escalation
            and verified evidence.
          </p>
        </div>
      </div>

      <div className="dir-kpi-row">
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.total}</div>
          <div className="dir-kpi-label">Total directions</div>
          <div className="muted">Official mandates</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.inProgress}</div>
          <div className="dir-kpi-label">In progress</div>
          <div className="muted">Active execution</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.evidence}</div>
          <div className="dir-kpi-label">Evidence submitted</div>
          <div className="muted">Awaiting Speaker review</div>
        </div>
        <div className="dir-kpi alert">
          <div className="dir-kpi-value">{counts.overdue}</div>
          <div className="dir-kpi-label">Overdue</div>
          <div className="muted">Attention needed</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.closed}</div>
          <div className="dir-kpi-label">Verified & closed</div>
          <div className="muted">Fully reached</div>
        </div>
      </div>

      {counts.overdue > 0 && (
        <div className="dir-overdue-banner">
          {counts.overdue} overdue direction(s). Due dates are checked live. The Speaker can record
          a reviewed escalation; no external message is sent in this demo.
        </div>
      )}

      <div className="dir-filters">
        {(
          [
            ['all', `All directions · ${counts.total}`],
            ['active', `Active & in progress · ${counts.active}`],
            ['evidence', `Evidence submitted · ${counts.evidence}`],
            ['overdue', `Overdue · ${counts.overdue}`],
            ['closed', `Verified & closed · ${counts.closed}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dir-grid">
        {filtered.map((d) => {
          const step = pipelineIndex(d.status);
          const isOwner = d.ownerId === user?.id || d.owner?.id === user?.id;
          return (
            <article key={d.id} className="dir-card">
              <div className="dir-card-top">
                <span className="dir-ref">
                  {shortRef(d.id)} · {d.matter ? 'FILE' : 'STANDALONE'}
                </span>
                <span className={`dir-status ${statusClass(d.status)}`}>
                  {prettyStatus(d.status)}
                </span>
              </div>
              <h3>{d.title}</h3>

              <div className="dir-pipeline">
                {PIPELINE.map((p, i) => (
                  <div
                    key={p.key}
                    className={`dir-pipe-step ${i <= step ? 'done' : ''} ${i === step ? 'current' : ''}`}
                  >
                    <span className="dir-pipe-dot" />
                    <span className="dir-pipe-label">{p.label}</span>
                  </div>
                ))}
              </div>

              {d.matter && (
                <div className="dir-meta">
                  <span>Source</span>
                  <Link href={`/files/${d.matter.id}`}>
                    {d.matter.diaryNo} — {d.matter.subject}
                  </Link>
                </div>
              )}

              <div className="dir-meta">
                <span>Responsible</span>
                <OwnerChip owner={d.owner} />
              </div>

              <div className="dir-dates">
                <div>
                  <span>Due</span>
                  <strong>{fmtDate(d.dueDate)}</strong>
                </div>
                <div>
                  <span>Last update</span>
                  <strong>{fmtDate(d.updatedAt)}</strong>
                </div>
              </div>

              {d.evidence && (
                <div className="dir-evidence-box">
                  <span>Completion evidence</span>
                  <p>{d.evidence}</p>
                </div>
              )}

              {d.escalateNote && d.status === 'ESCALATED' && (
                <div className="dir-escalate-note">
                  Escalated · {d.escalateNote}
                  <div className="muted">Recorded {fmtDate(d.updatedAt)}</div>
                </div>
              )}

              <div className="dir-actions">
                {isOwner && (d.status === 'ISSUED' || d.status === 'RETURNED') && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => run(() => api(`/directions/${d.id}/start`, { method: 'POST' }), 'Started')}
                  >
                    Start work
                  </button>
                )}

                {isOwner &&
                  (d.status === 'IN_PROGRESS' ||
                    d.status === 'OVERDUE' ||
                    d.status === 'RETURNED') && (
                    <form
                      className="dir-evidence-form"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        run(
                          () =>
                            api(`/directions/${d.id}/evidence`, {
                              method: 'POST',
                              json: { evidence: evidence[d.id] || '' },
                            }),
                          'Evidence submitted',
                        );
                      }}
                    >
                      <input
                        placeholder="Describe completion evidence"
                        value={evidence[d.id] || ''}
                        onChange={(e) => setEvidence({ ...evidence, [d.id]: e.target.value })}
                        required
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        Submit evidence
                      </button>
                    </form>
                  )}

                {isSpeaker && d.status === 'EVIDENCE_SUBMITTED' && (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/directions/${d.id}/verify`, {
                              method: 'POST',
                              json: { approve: true },
                            }),
                          'Evidence verified',
                        )
                      }
                    >
                      Review evidence
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/directions/${d.id}/verify`, {
                              method: 'POST',
                              json: { approve: false },
                            }),
                          'Returned for more work',
                        )
                      }
                    >
                      Return
                    </button>
                  </>
                )}

                {(isSpeaker || isOwner) &&
                  (d.status === 'OVERDUE' || d.status === 'IN_PROGRESS') && (
                    <button
                      type="button"
                      className="btn dir-escalate-btn"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/directions/${d.id}/escalate`, {
                              method: 'POST',
                              json: {
                                note: isSpeaker
                                  ? 'Speaker-reviewed escalation recorded (demo — no external message)'
                                  : 'Owner escalation for attention',
                              },
                            }),
                          'Escalation recorded',
                        )
                      }
                    >
                      Escalate
                    </button>
                  )}
              </div>

              <button
                type="button"
                className="dir-history-toggle"
                onClick={() => toggleHistory(d.id)}
              >
                Activity history ·{' '}
                {historyId === d.id ? activity.length : '…'}
                <span>{historyId === d.id ? '▾' : '▸'}</span>
              </button>
              {historyId === d.id && (
                <ul className="dir-history">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <strong>{a.action.replace(/_/g, ' ')}</strong>
                      <div className="muted">
                        {a.actor?.displayName || 'System'} · {fmtDate(a.createdAt)}
                      </div>
                      <div>{a.summary}</div>
                    </li>
                  ))}
                  {!activity.length && <li className="muted">No activity recorded yet.</li>}
                </ul>
              )}
            </article>
          );
        })}
        {!filtered.length && (
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <p className="muted">No directions in this view.</p>
          </div>
        )}
      </div>
    </>
  );
}
