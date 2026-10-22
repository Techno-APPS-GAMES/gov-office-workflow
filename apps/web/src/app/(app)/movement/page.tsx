'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';
import { enumLabel, tf } from '@/lib/i18n';

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

function fmtDate(iso: string | null | undefined, pendingText: string) {
  if (!iso) return pendingText;
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
  const { user, lang, label } = useAuth();
  const toast = useToast();
  const [matters, setMatters] = useState<MatterList[]>([]);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatterDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [stepId, setStepId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [vaultPw, setVaultPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [confBannerOpen, setConfBannerOpen] = useState(true);
  const [returnRemarks, setReturnRemarks] = useState('');
  const [showReturn, setShowReturn] = useState(false);
  const [people, setPeople] = useState<{ id: string; displayName: string }[]>([]);
  const [routeTo, setRouteTo] = useState('');
  const [procedure, setProcedure] = useState('Forward for action');
  const [routeDue, setRouteDue] = useState('');
  const [showForward, setShowForward] = useState(false);
  const labelRef = useRef(label);
  labelRef.current = label;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const loadList = useCallback(async () => {
    try {
      const all = await api<MatterList[]>('/files');
      setMatters(all);
      setListError('');
      setSelectedId((prev) => prev || all[0]?.id || null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : labelRef.current('loadFailed');
      setListError(msg);
      toastRef.current.error(msg);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    api<{ id: string; displayName: string }[]>('/users')
      .then(setPeople)
      .catch(() => undefined);
  }, []);

  const loadDetail = useCallback(
    async (id: string, soft = false) => {
      if (!soft) {
        setDetailError('');
        setDetail(null);
      }
      try {
        const m = await api<MatterDetail>(`/files/${id}`);
        setDetail(m);
        setDetailError('');
        const steps = m.routeSteps || [];
        const active =
          steps.find((s) => s.status === 'AWAITING_RECEIPT' || s.status === 'IN_PROGRESS') ||
          steps[steps.length - 1];
        setStepId(active?.id || null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : labelRef.current('mv_unableLoad');
        setDetailError(msg);
        if (!soft) setDetail(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useLiveRefresh(
    async () => {
      await loadList();
      if (selectedId) await loadDetail(selectedId, true);
    },
    [loadList, loadDetail, selectedId],
  );

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
    label('mv_previousOfficer');

  async function confirmReceipt() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/files/${selectedId}/acknowledge`, { method: 'POST' });
      toast.success(label('mv_toastReceipt'));
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
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
        json: { outcome: 'PROCEDURE_COMPLETE' },
      });
      toast.success(label('mv_toastProcDone'));
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function forwardFile(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/files/${selectedId}/route`, {
        method: 'POST',
        json: {
          toUserId: routeTo,
          procedure,
          ...(routeDue ? { dueDate: routeDue } : {}),
        },
      });
      toast.success(label('fd_toastRouted'));
      setShowForward(false);
      setRouteTo('');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function returnWithRemarks(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/files/${selectedId}/return`, {
        method: 'POST',
        json: { remarks: returnRemarks },
      });
      toast.success(label('mv_toastReturned'));
      setReturnRemarks('');
      setShowReturn(false);
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mv_returnFailed'));
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
      toast.success(label('files_unlocked'));
      setVaultPw('');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_unlockFailed'));
    } finally {
      setBusy(false);
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
          <h1>{label('movement')}</h1>
          <p className="muted">{label('mv_heroSub')}</p>
        </div>
      </div>

      <div className="movement-stat-row">
        <div className="movement-stat">
          <span className="movement-stat-icon gold">📁</span>
          <div>
            <div className="movement-stat-value">{stats.open}</div>
            <div className="movement-stat-label">{label('mv_statOpen')}</div>
            <div className="muted">{label('mv_statOpenSub')}</div>
          </div>
        </div>
        <div className="movement-stat">
          <span className="movement-stat-icon sand">⏳</span>
          <div>
            <div className="movement-stat-value">{stats.waiting}</div>
            <div className="movement-stat-label">{label('mv_statWaiting')}</div>
            <div className="muted">{label('mv_statWaitingSub')}</div>
          </div>
        </div>
        <div className="movement-stat">
          <span className="movement-stat-icon bolt">⚡</span>
          <div>
            <div className="movement-stat-value">{stats.procedures}</div>
            <div className="movement-stat-label">{label('mv_statProc')}</div>
            <div className="muted">{label('mv_statProcSub')}</div>
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
            {tf(lang, 'mv_confBanner', { count: stats.confidentialLocked.length })}
          </span>
          <span className="muted">{confBannerOpen ? label('mv_hide') : label('mv_show')}</span>
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
              <span className="muted">{label('mv_lockedHint')}</span>
            </button>
          ))}
        </div>
      )}

      <div className="movement-desk">
        <aside className="movement-list panel">
          <div className="eyebrow">{label('mv_oversight')}</div>
          <h2>{label('mv_listTitle')}</h2>
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
                  <span className={`badge ${m.status}`}>{enumLabel(lang, m.status)}</span>
                </div>
                <strong>{m.subject}</strong>
                <div className="muted">{m.holder?.displayName || label('unassigned')}</div>
              </button>
            ))}
            {listError && !matters.length ? (
              <div className="panel error">{listError}</div>
            ) : (
              !matters.length && <p className="muted">{label('mv_listEmpty')}</p>
            )}
          </div>
        </aside>

        <section className="movement-detail">
          {!selectedList ? (
            <div className="panel">
              <p className="muted">{label('mv_selectFile')}</p>
            </div>
          ) : (
            <>
              <div className="panel movement-detail-head">
                <div className="movement-detail-meta">
                  <div className="eyebrow">
                    {selectedList.diaryNo} · {enumLabel(lang, selectedList.classification)}
                  </div>
                  <h2>
                    {detailError.includes('locked') ||
                    (selectedList.classification === 'CONFIDENTIAL' && !selectedList.vaultUnlocked && !detail)
                      ? label('mv_protected')
                      : detail?.subject || selectedList.subject}
                  </h2>
                  <p className="muted">
                    {selectedList.sender}
                    {selectedList.createdAt ? ` · ${fmtShort(selectedList.createdAt)}` : ''}
                  </p>
                </div>

                <div className="movement-fact-grid">
                  <div>
                    <span>{label('mv_currentHolder')}</span>
                    <strong>{detail?.holder?.displayName || selectedList.holder?.displayName || '—'}</strong>
                  </div>
                  <div>
                    <span>{label('mv_fileStatus')}</span>
                    <strong>
                      <span className={`badge ${selectedList.status}`}>
                        {enumLabel(lang, detail?.status || selectedList.status)}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>{label('mv_currentProcedure')}</span>
                    <strong>{currentProcedure}</strong>
                  </div>
                </div>

                {(detailError.includes('locked') ||
                  (selectedList.classification === 'CONFIDENTIAL' &&
                    !selectedList.vaultUnlocked &&
                    !detail)) && (
                  <form className="movement-action-box" onSubmit={unlockVault}>
                    <div>
                      <div className="eyebrow">{label('mv_vaultRequired')}</div>
                      <p>{label('mv_vaultRequiredHelp')}</p>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="password"
                        placeholder={label('cm_filePassword')}
                        value={vaultPw}
                        onChange={(e) => setVaultPw(e.target.value)}
                        minLength={12}
                        required
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        {label('mv_unlockOpen')}
                      </button>
                      <Link className="btn" href="/vault">
                        {label('mv_openVault')}
                      </Link>
                    </div>
                  </form>
                )}

                {needsMyReceipt && (
                  <div className="movement-action-box">
                    <div>
                      <div className="eyebrow">{label('mv_nextAction')}</div>
                      <p>{tf(lang, 'mv_confirmFrom', { name: pendingFrom })}</p>
                    </div>
                    <button
                      type="button"
                      className="btn primary movement-action-btn"
                      onClick={confirmReceipt}
                      disabled={busy}
                    >
                      {label('mv_confirmFileReceipt')}
                    </button>
                  </div>
                )}

                {myInProgress && (
                  <div className="movement-action-box">
                    <div>
                      <div className="eyebrow">{label('mv_nextAction')}</div>
                      <p>{label('mv_completeOrReturn')}</p>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn primary movement-action-btn"
                        onClick={completeProcedure}
                        disabled={busy}
                      >
                        {label('files_completeProcedure')}
                      </button>
                      <button
                        type="button"
                        className="btn movement-action-btn"
                        onClick={() => setShowReturn((v) => !v)}
                        disabled={busy}
                      >
                        {label('files_returnFile')}
                      </button>
                      <button
                        type="button"
                        className="btn movement-action-btn"
                        onClick={() => setShowForward((v) => !v)}
                        disabled={busy}
                      >
                        {label('fd_routeBtn')}
                      </button>
                    </div>
                    {showForward && (
                      <form
                        className="grid-form"
                        style={{ marginTop: 12, width: '100%' }}
                        onSubmit={forwardFile}
                      >
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <select
                            value={routeTo}
                            onChange={(e) => setRouteTo(e.target.value)}
                            required
                          >
                            <option value="">{label('fd_selectOfficer')}</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.displayName}
                              </option>
                            ))}
                          </select>
                          <input
                            value={procedure}
                            onChange={(e) => setProcedure(e.target.value)}
                            required
                            placeholder={label('fd_procedure')}
                          />
                          <input
                            type="date"
                            value={routeDue}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setRouteDue(e.target.value)}
                            title={label('fd_dueOptional')}
                          />
                          <button className="btn primary" type="submit" disabled={busy}>
                            {label('fd_routeBtn')}
                          </button>
                        </div>
                      </form>
                    )}
                    {showReturn && (
                      <form className="grid-form" style={{ marginTop: 12, width: '100%' }} onSubmit={returnWithRemarks}>
                        <div className="field">
                          <label>{label('mv_remarksMin')}</label>
                          <textarea
                            rows={3}
                            value={returnRemarks}
                            onChange={(e) => setReturnRemarks(e.target.value)}
                            minLength={10}
                            required
                            placeholder={label('mv_returnPlaceholder')}
                          />
                        </div>
                        <button className="btn primary" type="submit" disabled={busy}>
                          {label('mv_confirmReturn')}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                <div className="movement-detail-footer">
                  <span className="muted">
                    {tf(lang, 'mv_due', {
                      date: activeStep?.dueDate ? fmtShort(activeStep.dueDate) : label('mv_notSet'),
                    })}
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <Link className="btn" href={`/files/${selectedList.id}`}>
                      {label('mv_openFileDetails')}
                    </Link>
                    <Link className="btn" href="/ai">
                      {label('ai')}
                    </Link>
                  </div>
                </div>
              </div>

              {detail && (
                <>
                  <div className="panel">
                    <div className="eyebrow">{label('mv_route')}</div>
                    <h2 style={{ marginTop: 4 }}>{label('mv_chooseHandoff')}</h2>
                    {steps.length === 0 ? (
                      <p className="muted">{label('mv_noRouteSteps')}</p>
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
                              {s.toUser?.displayName || label('officer')}
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
                            {enumLabel(lang, activeStep.status)}
                          </span>
                        </div>
                        <div className="movement-flow">
                          <span>{activeStep.fromUser?.displayName || label('mv_origin')}</span>
                          <span className="movement-flow-arrow">→</span>
                          <span>{activeStep.toUser?.displayName || label('mv_recipient')}</span>
                        </div>
                        <div className="movement-step-grid">
                          <div>
                            <span>{label('mv_sent')}</span>
                            <strong>{fmtDate(activeStep.createdAt, label('pending'))}</strong>
                          </div>
                          <div>
                            <span>{label('mv_received')}</span>
                            <strong>{fmtDate(activeStep.acknowledgedAt, label('pending'))}</strong>
                          </div>
                          <div>
                            <span>{label('directions_due')}</span>
                            <strong>
                              {activeStep.dueDate
                                ? fmtDate(activeStep.dueDate, label('pending'))
                                : label('pending')}
                            </strong>
                          </div>
                          <div>
                            <span>{label('completed')}</span>
                            <strong>{fmtDate(activeStep.completedAt, label('pending'))}</strong>
                          </div>
                        </div>
                        {activeStep.remarks && (
                          <p className="muted" style={{ marginTop: 10 }}>
                            {tf(lang, 'mv_remarksLine', { text: activeStep.remarks })}
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
                      {tf(lang, 'mv_historyToggle', { count: detail.journeyEvents?.length || 0 })}
                    </span>
                    <span>{historyOpen ? '▾' : '▸'}</span>
                  </button>
                  {historyOpen && (
                    <div className="panel" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                      <ul className="timeline">
                        {(detail.journeyEvents || []).map((ev) => (
                          <li key={ev.id}>
                            <strong>{enumLabel(lang, ev.kind)}</strong>
                            <div className="muted">{fmtDate(ev.createdAt, label('pending'))}</div>
                            <div>{enumLabel(lang, ev.summary)}</div>
                          </li>
                        ))}
                        {!detail.journeyEvents?.length && (
                          <li className="muted">{label('mv_noJourney')}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    className="movement-collapse"
                    onClick={() => setSourceOpen((v) => !v)}
                  >
                    <span>{label('mv_sourceSummary')}</span>
                    <span>{sourceOpen ? '▾' : '▸'}</span>
                  </button>
                  {sourceOpen && (
                    <div className="panel" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                        {detail.body || label('mv_noSource')}
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
