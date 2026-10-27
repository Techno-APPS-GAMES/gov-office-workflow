'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { enumLabel, roleTitle, tf } from '@/lib/i18n';

type Person = { id?: string; displayName: string; role?: string };
type MatterRef = { id: string; diaryNo: string; subject: string };

type Direction = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  evidence?: string | null;
  evidenceFileName?: string | null;
  evidenceSizeBytes?: number | null;
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
  { key: 'issued', labelKey: 'dr_pipeIssued' },
  { key: 'progress', labelKey: 'dr_pipeProgress' },
  { key: 'evidence', labelKey: 'dr_pipeEvidence' },
  { key: 'closed', labelKey: 'dr_pipeClosed' },
] as const;

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

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function OwnerChip({ owner }: { owner?: Person | null }) {
  const { lang, label } = useAuth();
  const name = owner?.displayName || label('unassigned');
  const title = roleTitle(lang, owner?.role);
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
  const { user, lang, label } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Direction[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<Record<string, File | null>>({});
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<{ id: string; displayName: string }[]>([]);
  const [extendDue, setExtendDue] = useState<Record<string, string>>({});
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const [clearNote, setClearNote] = useState<Record<string, string>>({});
  const isSpeaker = user?.role === 'SPEAKER' || user?.role === 'ADMIN';

  async function downloadEvidenceFile(directionId: string, fileName: string) {
    try {
      const t = localStorage.getItem('gow_access');
      const res = await fetch(`/api/directions/${directionId}/evidence-file/download`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.text()) || label('dr_downloadFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(label('dr_toastDownload'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('dr_downloadFailed'));
    }
  }

  async function submitEvidence(directionId: string) {
    const text = (evidence[directionId] || '').trim();
    const file = evidenceFiles[directionId];
    if (!text || !file) {
      toast.error(label('dr_evidenceRequired'));
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('evidence', text);
      fd.append('file', file);
      const t = localStorage.getItem('gow_access');
      const res = await fetch(`/api/directions/${directionId}/evidence`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.text()) || label('dr_submitFailed'));
      toast.success(label('dr_toastEvidence'));
      setEvidence({ ...evidence, [directionId]: '' });
      setEvidenceFiles({ ...evidenceFiles, [directionId]: null });
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    setItems(await api<Direction[]>('/directions'));
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    if (!isSpeaker) return;
    api<{ id: string; displayName: string }[]>('/users')
      .then(setStaff)
      .catch(() => undefined);
  }, [isSpeaker]);

  useLiveRefresh(load, [load]);

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
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
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
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_conceptDemo')}
          </div>
          <h1>{label('dr_title')}</h1>
          <p className="muted">{label('dr_heroSub')}</p>
        </div>
      </div>

      <div className="dir-kpi-row">
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.total}</div>
          <div className="dir-kpi-label">{label('dr_kpiTotal')}</div>
          <div className="muted">{label('dr_kpiTotalSub')}</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.inProgress}</div>
          <div className="dir-kpi-label">{label('dr_pipeProgress')}</div>
          <div className="muted">{label('dr_kpiProgressSub')}</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.evidence}</div>
          <div className="dir-kpi-label">{label('dr_pipeEvidence')}</div>
          <div className="muted">{label('dr_kpiEvidenceSub')}</div>
        </div>
        <div className="dir-kpi alert">
          <div className="dir-kpi-value">{counts.overdue}</div>
          <div className="dir-kpi-label">{enumLabel(lang, 'OVERDUE')}</div>
          <div className="muted">{label('dr_kpiOverdueSub')}</div>
        </div>
        <div className="dir-kpi">
          <div className="dir-kpi-value">{counts.closed}</div>
          <div className="dir-kpi-label">{label('dr_pipeClosed')}</div>
          <div className="muted">{label('dr_kpiClosedSub')}</div>
        </div>
      </div>

      {counts.overdue > 0 && (
        <div className="dir-overdue-banner">
          {tf(lang, 'dr_overdueBanner', { count: counts.overdue })}
        </div>
      )}

      <div className="dir-filters">
        {(
          [
            ['all', tf(lang, 'dr_fAll', { count: counts.total })],
            ['active', tf(lang, 'dr_fActive', { count: counts.active })],
            ['evidence', tf(lang, 'dr_fEvidence', { count: counts.evidence })],
            ['overdue', tf(lang, 'dr_fOverdue', { count: counts.overdue })],
            ['closed', tf(lang, 'dr_fClosed', { count: counts.closed })],
          ] as [Filter, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {text}
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
                  {shortRef(d.id)} · {d.matter ? label('dr_refFile') : label('dr_refStandalone')}
                </span>
                <span className={`dir-status ${statusClass(d.status)}`}>
                  {enumLabel(lang, d.status)}
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
                    <span className="dir-pipe-label">{label(p.labelKey)}</span>
                  </div>
                ))}
              </div>

              {d.matter && (
                <div className="dir-meta">
                  <span>{label('dr_source')}</span>
                  <Link href={`/files/${d.matter.id}`}>
                    {d.matter.diaryNo} — {d.matter.subject}
                  </Link>
                </div>
              )}

              <div className="dir-meta">
                <span>{label('dr_responsible')}</span>
                <OwnerChip owner={d.owner} />
              </div>

              <div className="dir-dates">
                <div>
                  <span>{label('directions_due')}</span>
                  <strong>{fmtDate(d.dueDate)}</strong>
                </div>
                <div>
                  <span>{label('dr_lastUpdate')}</span>
                  <strong>{fmtDate(d.updatedAt)}</strong>
                </div>
              </div>

              {d.evidence && (
                <div className="dir-evidence-box">
                  <span>{label('dr_completionEvidence')}</span>
                  <p>{d.evidence}</p>
                  {d.evidenceFileName && (
                    <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                      <span className="muted">
                        {tf(lang, 'dr_attachment', { name: d.evidenceFileName })}
                        {d.evidenceSizeBytes != null
                          ? tf(lang, 'dr_bytes', { size: d.evidenceSizeBytes.toLocaleString() })
                          : ''}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => downloadEvidenceFile(d.id, d.evidenceFileName!)}
                      >
                        {label('dr_downloadFile')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {d.escalateNote && d.status === 'ESCALATED' && (
                <div className="dir-escalate-note">
                  {tf(lang, 'dr_escalatedNote', { note: d.escalateNote })}
                  <div className="muted">{tf(lang, 'dr_recorded', { date: fmtDate(d.updatedAt) })}</div>
                </div>
              )}

              <div className="dir-actions">
                {isOwner && (d.status === 'ISSUED' || d.status === 'RETURNED') && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/directions/${d.id}/start`, { method: 'POST' }),
                        label('dr_toastStarted'),
                      )
                    }
                  >
                    {label('directions_start')}
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
                        void submitEvidence(d.id);
                      }}
                    >
                      <input
                        placeholder={label('dr_evidencePlaceholder')}
                        value={evidence[d.id] || ''}
                        onChange={(e) => setEvidence({ ...evidence, [d.id]: e.target.value })}
                        required
                      />
                      <input
                        type="file"
                        required
                        onChange={(e) =>
                          setEvidenceFiles({
                            ...evidenceFiles,
                            [d.id]: e.target.files?.[0] || null,
                          })
                        }
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        {label('directions_evidence')}
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
                          label('dr_toastVerified'),
                        )
                      }
                    >
                      {label('dr_reviewEvidence')}
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
                          label('dr_toastReturned'),
                        )
                      }
                    >
                      {label('dr_returnBtn')}
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
                          label('dr_toastEscalated'),
                        )
                      }
                    >
                      {label('directions_escalate')}
                    </button>
                  )}

                {isSpeaker && d.status === 'ESCALATED' && (
                  <div className="dir-evidence-form">
                    <input
                      placeholder={label('dr_clearEscalationNote')}
                      value={clearNote[d.id] || ''}
                      onChange={(e) =>
                        setClearNote({ ...clearNote, [d.id]: e.target.value })
                      }
                      minLength={5}
                      required
                    />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || (clearNote[d.id] || '').trim().length < 5}
                      onClick={() =>
                        run(
                          () =>
                            api(`/directions/${d.id}/clear-escalation`, {
                              method: 'POST',
                              json: { note: (clearNote[d.id] || '').trim() },
                            }),
                          label('dr_toastCleared'),
                        )
                      }
                    >
                      {label('dr_clearEscalation')}
                    </button>
                  </div>
                )}

                {(isSpeaker ||
                  (isOwner && (d.status === 'RETURNED' || d.status === 'OVERDUE'))) &&
                  ['RETURNED', 'ESCALATED', 'OVERDUE', 'IN_PROGRESS'].includes(d.status) && (
                    <div className="dir-evidence-form">
                      <input
                        type="date"
                        value={extendDue[d.id] || ''}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) =>
                          setExtendDue({ ...extendDue, [d.id]: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || !extendDue[d.id]}
                        onClick={() =>
                          run(
                            () =>
                              api(`/directions/${d.id}/extend-due`, {
                                method: 'POST',
                                json: { dueDate: extendDue[d.id] },
                              }),
                            label('dr_toastDueExtended'),
                          )
                        }
                      >
                        {label('dr_extendDue')}
                      </button>
                    </div>
                  )}

                {isSpeaker &&
                  ['RETURNED', 'ESCALATED', 'OVERDUE', 'IN_PROGRESS'].includes(d.status) && (
                    <div className="dir-evidence-form">
                      <select
                        value={reassignTo[d.id] || ''}
                        onChange={(e) =>
                          setReassignTo({ ...reassignTo, [d.id]: e.target.value })
                        }
                      >
                        <option value="">{label('fd_selectOfficer')}</option>
                        {staff.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || !reassignTo[d.id]}
                        onClick={() =>
                          run(
                            () =>
                              api(`/directions/${d.id}/reassign`, {
                                method: 'POST',
                                json: { ownerId: reassignTo[d.id] },
                              }),
                            label('dr_toastReassigned'),
                          )
                        }
                      >
                        {label('dr_reassign')}
                      </button>
                    </div>
                  )}
              </div>

              <button
                type="button"
                className="dir-history-toggle"
                onClick={() => toggleHistory(d.id)}
              >
                {label('dr_activityHistory')}{' '}
                {historyId === d.id ? activity.length : '…'}
                <span>{historyId === d.id ? '▾' : '▸'}</span>
              </button>
              {historyId === d.id && (
                <ul className="dir-history">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <strong>{enumLabel(lang, a.action)}</strong>
                      <div className="muted">
                        {a.actor?.displayName || label('dr_system')} · {fmtDate(a.createdAt)}
                      </div>
                      <div>{a.summary}</div>
                    </li>
                  ))}
                  {!activity.length && <li className="muted">{label('dr_noActivity')}</li>}
                </ul>
              )}
            </article>
          );
        })}
        {!filtered.length && (
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <p className="muted">{label('dr_emptyView')}</p>
          </div>
        )}
      </div>
    </>
  );
}
