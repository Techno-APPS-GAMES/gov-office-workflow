'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

type Person = { id?: string; displayName: string; role?: string };
type MatterList = {
  id: string;
  diaryNo: string;
  subject: string;
  sender: string;
  status: string;
  classification: string;
  vaultUnlocked?: boolean;
  createdAt?: string;
  holder?: Person | null;
  assignee?: Person | null;
};

type RouteStep = {
  id: string;
  procedure: string;
  status: string;
  dueDate?: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  completedAt?: string | null;
  remarks?: string | null;
  fromUser?: Person | null;
  toUser?: Person | null;
};

type JourneyEvent = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
};

type MatterDetail = MatterList & {
  body?: string;
  subjectArea?: string;
  holderId?: string;
  assigneeId?: string;
  routeSteps?: RouteStep[];
  journeyEvents?: JourneyEvent[];
};

function pretty(s: string) {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso?: string | null) {
  if (!iso) return 'Pending';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtShort(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function MovementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [matters, setMatters] = useState<MatterList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatterDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [stepId, setStepId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [vaultPw, setVaultPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [confBannerOpen, setConfBannerOpen] = useState(true);

  const loadList = useCallback(async () => {
    const all = await api<MatterList[]>('/files');
    setMatters(all);
    setSelectedId((prev) => prev || all[0]?.id || null);
  }, []);

  useEffect(() => {
    loadList().catch(() => setMatters([]));
  }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailError('');
    setDetail(null);
    try {
      const m = await api<MatterDetail>(`/files/${id}`);
      setDetail(m);
      const steps = m.routeSteps || [];
      const active =
        steps.find((s) => s.status === 'AWAITING_RECEIPT' || s.status === 'IN_PROGRESS') ||
        steps[steps.length - 1];
      setStepId(active?.id || null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load matter';
      setDetailError(msg);
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const stats = useMemo(() => {
    const uid = user?.id;
    const open = matters.filter((m) => m.status !== 'CLOSED').length;
    const waiting = matters.filter(
      (m) => m.status === 'AWAITING_RECEIPT' && m.assignee?.id === uid,
    ).length;
    const procedures = matters.filter(
      (m) => m.status === 'IN_PROGRESS' && m.holder?.id === uid,
    ).length;
    const confidentialLocked = matters.filter(
      (m) => m.classification === 'CONFIDENTIAL' && !m.vaultUnlocked,
    );
    return { open, waiting, procedures, confidentialLocked };
  }, [matters, user?.id]);

  const selectedList = matters.find((m) => m.id === selectedId) || null;
  const steps = detail?.routeSteps || [];
  const activeStep = steps.find((s) => s.id === stepId) || steps[steps.length - 1] || null;
  const currentProcedure =
    steps.find((s) => s.status === 'AWAITING_RECEIPT' || s.status === 'IN_PROGRESS')?.procedure ||
    activeStep?.procedure ||
    '—';

  const needsMyReceipt =
    !!detail &&
    detail.status === 'AWAITING_RECEIPT' &&
    (detail.assigneeId === user?.id || detail.assignee?.id === user?.id);

  const myInProgress =
    !!detail &&
    detail.status === 'IN_PROGRESS' &&
    (detail.holderId === user?.id || detail.holder?.id === user?.id);

  const pendingFrom =
    activeStep?.fromUser?.displayName ||
    detail?.holder?.displayName ||
    selectedList?.holder?.displayName ||
    'previous officer';

  async function confirmReceipt() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/files/${selectedId}/acknowledge`, { method: 'POST' });
      toast.success('Receipt confirmed');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function completeProcedure() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/files/${selectedId}/complete-procedure`, {
        method: 'POST',
        json: { outcome: 'Procedure complete' },
      });
      toast.success('Procedure completed');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function unlockVault(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/vault/${selectedId}/unlock`, {
        method: 'POST',
        json: { password: vaultPw },
      });
      toast.success('Vault unlocked');
      setVaultPw('');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>File movement</h1>
          <p className="muted">
            Track every handoff, confirm receipts, and inspect the live procedure route.
          </p>
        </div>
      </div>

      <div className="movement-stat-row">
        <div className="movement-stat">
          <span className="movement-stat-icon gold">📁</span>
          <div>
            <div className="movement-stat-value">{stats.open}</div>
            <div className="movement-stat-label">Open in view</div>
            <div className="muted">Active queue matters</div>
          </div>
        </div>
        <div className="movement-stat">
          <span className="movement-stat-icon sand">⏳</span>
          <div>
            <div className="movement-stat-value">{stats.waiting}</div>
            <div className="movement-stat-label">Waiting for your receipt</div>
            <div className="muted">Pending confirmation</div>
          </div>
        </div>
        <div className="movement-stat">
          <span className="movement-stat-icon bolt">⚡</span>
          <div>
            <div className="movement-stat-value">{stats.procedures}</div>
            <div className="movement-stat-label">Your procedures in progress</div>
            <div className="muted">Active desk actions</div>
          </div>
        </div>
      </div>

      {stats.confidentialLocked.length > 0 && (
        <button
          type="button"
          className={`movement-conf-banner ${confBannerOpen ? 'open' : ''}`}
          onClick={() => setConfBannerOpen((v) => !v)}
        >
          <span>
            Confidential files needing a password · {stats.confidentialLocked.length}
          </span>
          <span className="muted">{confBannerOpen ? 'Hide' : 'Show'}</span>
        </button>
      )}
      {confBannerOpen && stats.confidentialLocked.length > 0 && (
        <div className="movement-conf-list">
          {stats.confidentialLocked.map((m) => (
            <button
              key={m.id}
              type="button"
              className={selectedId === m.id ? 'active' : ''}
              onClick={() => setSelectedId(m.id)}
            >
              <strong>{m.diaryNo}</strong>
              <span className="muted">Locked · unlock in vault or below</span>
            </button>
          ))}
        </div>
      )}

      <div className="movement-desk">
        <aside className="movement-list panel">
          <div className="eyebrow">Oversight</div>
          <h2>Files under oversight</h2>
          <div className="movement-list-scroll">
            {matters.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`movement-list-item ${selectedId === m.id ? 'active' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <div className="movement-list-ref">
                  <span>{m.diaryNo}</span>
                  <span className={`badge ${m.status}`}>{pretty(m.status)}</span>
                </div>
                <strong>{m.subject}</strong>
                <div className="muted">{m.holder?.displayName || 'Unassigned'}</div>
              </button>
            ))}
            {!matters.length && <p className="muted">No files under oversight.</p>}
          </div>
        </aside>

        <section className="movement-detail">
          {!selectedList ? (
            <div className="panel">
              <p className="muted">Select a file to inspect its movement.</p>
            </div>
          ) : (
            <>
              <div className="panel movement-detail-head">
                <div className="movement-detail-meta">
                  <div className="eyebrow">
                    {selectedList.diaryNo} · {pretty(selectedList.classification)}
                  </div>
                  <h2>
                    {detailError.includes('locked') ||
                    (selectedList.classification === 'CONFIDENTIAL' && !selectedList.vaultUnlocked && !detail)
                      ? 'Protected confidential record'
                      : detail?.subject || selectedList.subject}
                  </h2>
                  <p className="muted">
                    {selectedList.sender}
                    {selectedList.createdAt ? ` · ${fmtShort(selectedList.createdAt)}` : ''}
                  </p>
                </div>

                <div className="movement-fact-grid">
                  <div>
                    <span>Current holder</span>
                    <strong>{detail?.holder?.displayName || selectedList.holder?.displayName || '—'}</strong>
                  </div>
                  <div>
                    <span>File status</span>
                    <strong>
                      <span className={`badge ${selectedList.status}`}>
                        {pretty(detail?.status || selectedList.status)}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>Current procedure</span>
                    <strong>{currentProcedure}</strong>
                  </div>
                </div>

                {(detailError.includes('locked') ||
                  (selectedList.classification === 'CONFIDENTIAL' &&
                    !selectedList.vaultUnlocked &&
                    !detail)) && (
                  <form className="movement-action-box" onSubmit={unlockVault}>
                    <div>
                      <div className="eyebrow">Vault required</div>
                      <p>Enter the file password to inspect this confidential handoff.</p>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="password"
                        placeholder="File password"
                        value={vaultPw}
                        onChange={(e) => setVaultPw(e.target.value)}
                        minLength={12}
                        required
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        Unlock & open
                      </button>
                      <Link className="btn" href="/vault">
                        Open vault
                      </Link>
                    </div>
                  </form>
                )}

                {needsMyReceipt && (
                  <div className="movement-action-box">
                    <div>
                      <div className="eyebrow">Your next action</div>
                      <p>Confirm receipt from {pendingFrom}.</p>
                    </div>
                    <button
                      type="button"
                      className="btn primary movement-action-btn"
                      onClick={confirmReceipt}
                      disabled={busy}
                    >
                      Confirm file receipt
                    </button>
                  </div>
                )}

                {myInProgress && (
                  <div className="movement-action-box">
                    <div>
                      <div className="eyebrow">Your next action</div>
                      <p>Complete your procedure on this file.</p>
                    </div>
                    <button
                      type="button"
                      className="btn primary movement-action-btn"
                      onClick={completeProcedure}
                      disabled={busy}
                    >
                      Complete procedure
                    </button>
                  </div>
                )}

                <div className="movement-detail-footer">
                  <span className="muted">
                    Due{' '}
                    {activeStep?.dueDate
                      ? fmtShort(activeStep.dueDate)
                      : 'not set'}
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <Link className="btn" href={`/files/${selectedList.id}`}>
                      Open file details
                    </Link>
                    <Link className="btn" href="/ai">
                      AI helper
                    </Link>
                  </div>
                </div>
              </div>

              {detail && (
                <>
                  <div className="panel">
                    <div className="eyebrow">Route</div>
                    <h2 style={{ marginTop: 4 }}>Choose a handoff to inspect</h2>
                    {steps.length === 0 ? (
                      <p className="muted">No route steps yet — file has not been handed off.</p>
                    ) : (
                      <div className="movement-route">
                        {steps.map((s, i) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`movement-route-step ${stepId === s.id ? 'active' : ''} ${
                              s.status === 'COMPLETED' ? 'done' : ''
                            }`}
                            onClick={() => setStepId(s.id)}
                          >
                            <span className="movement-route-num">{i + 1}</span>
                            <strong>{s.procedure}</strong>
                            <span className="muted">
                              {s.toUser?.displayName || 'Officer'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {activeStep && (
                      <div className="movement-step-detail">
                        <div className="movement-step-head">
                          <h3>{activeStep.procedure}</h3>
                          <span className={`badge ${activeStep.status}`}>
                            {pretty(activeStep.status)}
                          </span>
                        </div>
                        <div className="movement-flow">
                          <span>{activeStep.fromUser?.displayName || 'Origin'}</span>
                          <span className="movement-flow-arrow">→</span>
                          <span>{activeStep.toUser?.displayName || 'Recipient'}</span>
                        </div>
                        <div className="movement-step-grid">
                          <div>
                            <span>Sent</span>
                            <strong>{fmtDate(activeStep.createdAt)}</strong>
                          </div>
                          <div>
                            <span>Received</span>
                            <strong>{fmtDate(activeStep.acknowledgedAt)}</strong>
                          </div>
                          <div>
                            <span>Due</span>
                            <strong>
                              {activeStep.dueDate ? fmtDate(activeStep.dueDate) : 'Pending'}
                            </strong>
                          </div>
                          <div>
                            <span>Completed</span>
                            <strong>{fmtDate(activeStep.completedAt)}</strong>
                          </div>
                        </div>
                        {activeStep.remarks && (
                          <p className="muted" style={{ marginTop: 10 }}>
                            Remarks: {activeStep.remarks}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="movement-collapse"
                    onClick={() => setHistoryOpen((v) => !v)}
                  >
                    <span>
                      Full activity history · {detail.journeyEvents?.length || 0} events
                    </span>
                    <span>{historyOpen ? '▾' : '▸'}</span>
                  </button>
                  {historyOpen && (
                    <div className="panel" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                      <ul className="timeline">
                        {(detail.journeyEvents || []).map((ev) => (
                          <li key={ev.id}>
                            <strong>{ev.kind}</strong>
                            <div className="muted">{fmtDate(ev.createdAt)}</div>
                            <div>{ev.summary}</div>
                          </li>
                        ))}
                        {!detail.journeyEvents?.length && (
                          <li className="muted">No journey events yet.</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    className="movement-collapse"
                    onClick={() => setSourceOpen((v) => !v)}
                  >
                    <span>Source summary</span>
                    <span>{sourceOpen ? '▾' : '▸'}</span>
                  </button>
                  {sourceOpen && (
                    <div className="panel" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                        {detail.body || 'No source text.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
