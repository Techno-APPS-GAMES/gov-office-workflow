'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';
import { Lang, enumLabel, roleTitle, tf } from '@/lib/i18n';

type MeetingAction = {
  id: string;
  title: string;
  ownerName: string;
  ownerId?: string | null;
  dueDate?: string | null;
  directionId?: string | null;
  direction?: { id: string; status: string; title: string } | null;
  owner?: { id: string; displayName: string } | null;
};

type Meeting = {
  id: string;
  title: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  brief?: string | null;
  minutes?: string | null;
  outcome?: string | null;
  decision?: string | null;
  screeningStatus?: string | null;
  screeningCnic?: string | null;
  screeningBadge?: string | null;
  screeningNotes?: string | null;
  createdBy?: { displayName: string } | null;
  actions?: MeetingAction[];
};

type StaffUser = { id: string; displayName: string; role: string };

type EngagementType =
  | 'Diary booking'
  | 'Meeting request'
  | 'Invitation'
  | 'Official visitor'
  | 'Delegation'
  | 'Walk-in';

const ENGAGEMENT_TYPES: EngagementType[] = [
  'Diary booking',
  'Meeting request',
  'Invitation',
  'Official visitor',
  'Delegation',
  'Walk-in',
];

const ENGAGEMENT_KEYS: Record<string, string> = {
  'Diary booking': 'mtg_et_diary',
  'Meeting request': 'mtg_et_request',
  Invitation: 'mtg_et_invitation',
  'Official visitor': 'mtg_et_visitor',
  Delegation: 'mtg_et_delegation',
  'Walk-in': 'mtg_et_walkin',
};

function engagementLabel(v: string, label: (k: string) => string) {
  const k = ENGAGEMENT_KEYS[v];
  return k ? label(k) : v;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtRange(
  start: string | null | undefined,
  end: string | null | undefined,
  label: (k: string) => string,
  locale?: string,
) {
  if (!start) return label('mtg_timeTbd');
  const s = new Date(start);
  const date = s.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const t1 = s.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (!end) return `${date}, ${t1}`;
  const t2 = new Date(end).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${t1} – ${t2}`;
}

function statusLabel(s: string, lang: Lang) {
  if (s === 'APPROVED') return enumLabel(lang, 'CONFIRMED');
  return enumLabel(lang, s);
}

function isCleared(m: Meeting) {
  const s = (m.screeningStatus || '').toUpperCase();
  return ['CLEARED', 'VERIFIED', 'APPROVED', 'PASSED'].includes(s) || !!m.screeningBadge;
}

function participantsLine(m: Meeting, label: (k: string) => string) {
  const brief = (m.brief || '').trim();
  if (brief) {
    const first = brief.split('\n')[0].trim();
    if (first.length <= 120) return first;
    return `${first.slice(0, 117)}…`;
  }
  return label('mtg_participantsNotRecorded');
}

function engagementType(m: Meeting): string {
  return m.screeningNotes || 'Meeting request';
}

export default function MeetingsPage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
  const toast = useToast();
  const [items, setItems] = useState<Meeting[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [actionForm, setActionForm] = useState({
    title: '',
    ownerId: '',
    dueDate: '',
    promoteToDirection: true,
  });
  const [conflictInfo, setConflictInfo] = useState<{
    conflicts: { id: string; title: string; startAt: string; endAt: string }[];
    alternatives: { startAt: string; endAt: string; label: string }[];
  } | null>(null);
  const [form, setForm] = useState({
    title: '',
    startAt: '',
    endAt: '',
    location: '',
    brief: '',
    screeningStatus: 'PENDING',
    screeningCnic: '',
    screeningBadge: '',
    screeningNotes: 'Meeting request' as string,
  });

  const canDecide =
    user?.role === 'SPEAKER' ||
    user?.role === 'SECRETARY_GENERAL' ||
    user?.role === 'ADMIN';

  const canManageActions =
    canDecide || user?.role === 'SPECIAL_SECRETARY';

  const load = useCallback(async () => {
    setItems(await api<Meeting[]>('/meetings'));
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
    api<StaffUser[]>('/users')
      .then((u) => setStaff(u.map((x) => ({ id: x.id, displayName: x.displayName, role: x.role }))))
      .catch(() => setStaff([]));
  }, [load]);

  useLiveRefresh(load, [load]);

  const { upcoming, pending, past } = useMemo(() => {
    const today = startOfToday();
    const upcoming: Meeting[] = [];
    const pending: Meeting[] = [];
    const past: Meeting[] = [];

    for (const m of items) {
      const start = m.startAt ? new Date(m.startAt) : null;
      if (m.status === 'REQUESTED') {
        pending.push(m);
        continue;
      }
      if (m.status === 'DECLINED' || m.status === 'COMPLETED' || m.status === 'ARCHIVED') {
        past.push(m);
        continue;
      }
      if (m.status === 'APPROVED') {
        if (start && start >= today) upcoming.push(m);
        else past.push(m);
        continue;
      }
      past.push(m);
    }

    const byStart = (a: Meeting, b: Meeting) =>
      +new Date(a.startAt || 0) - +new Date(b.startAt || 0);
    const byStartDesc = (a: Meeting, b: Meeting) =>
      +new Date(b.startAt || 0) - +new Date(a.startAt || 0);

    upcoming.sort(byStart);
    pending.sort(byStart);
    past.sort(byStartDesc);
    return { upcoming, pending, past };
  }, [items]);

  const selected = useMemo(
    () => items.find((m) => m.id === openId) || null,
    [items, openId],
  );

  async function create(e: FormEvent, force = false) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{
        meeting: Meeting | null;
        conflict?: boolean;
        conflicts?: { id: string; title: string; startAt: string; endAt: string }[];
        alternatives?: { startAt: string; endAt: string; label: string }[];
      }>('/meetings', {
        method: 'POST',
        json: {
          title: form.title,
          location: form.location || undefined,
          brief: form.brief || undefined,
          screeningStatus: form.screeningStatus,
          screeningCnic: form.screeningCnic || undefined,
          screeningBadge: form.screeningBadge || undefined,
          screeningNotes: form.screeningNotes || undefined,
          startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
          endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
          force,
        },
      });
      if (res.conflict && !res.meeting) {
        setConflictInfo({
          conflicts: res.conflicts || [],
          alternatives: res.alternatives || [],
        });
        toast.error(label('mtg_toastConflict'));
        return;
      }
      toast.success(label('mtg_toastBooked'));
      setShowForm(false);
      setConflictInfo(null);
      setForm({
        title: '',
        startAt: '',
        endAt: '',
        location: '',
        brief: '',
        screeningStatus: 'PENDING',
        screeningCnic: '',
        screeningBadge: '',
        screeningNotes: 'Meeting request',
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('createFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function addAction(meetingId: string) {
    if (!actionForm.title.trim()) {
      toast.error(label('mtg_toastActionTitle'));
      return;
    }
    const owner = staff.find((s) => s.id === actionForm.ownerId);
    setBusy(true);
    try {
      await api(`/meetings/${meetingId}/actions`, {
        method: 'POST',
        json: {
          title: actionForm.title,
          ownerName: owner?.displayName || actionForm.ownerId || 'Unassigned',
          ownerId: actionForm.ownerId || undefined,
          dueDate: actionForm.dueDate
            ? new Date(actionForm.dueDate).toISOString()
            : undefined,
          promoteToDirection: actionForm.promoteToDirection,
        },
      });
      toast.success(
        actionForm.promoteToDirection
          ? label('mtg_toastActionLinked') : label('mtg_toastActionRecorded'),
      );
      setActionForm({ title: '', ownerId: '', dueDate: '', promoteToDirection: true });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mtg_actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function promoteAction(meetingId: string, actionId: string) {
    setBusy(true);
    try {
      await api(`/meetings/${meetingId}/actions/${actionId}/promote`, {
        method: 'POST',
        json: {},
      });
      toast.success(label('mtg_toastPromoted'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mtg_promoteFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      await api(`/meetings/${id}/decide`, { method: 'POST', json: { approve } });
      toast.success(approve ? label('mtg_toastConfirmed') : label('mtg_toastDeclined'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mtg_decisionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    const minutes = window.prompt(label('mtg_minutes'), '')?.trim() || '';
    if (minutes.length < 20) {
      toast.error(label('mtg_completeFailed'));
      return;
    }
    setBusy(true);
    try {
      await api(`/meetings/${id}/complete`, {
        method: 'POST',
        json: { minutes, outcome: 'Held', decision: 'Noted' },
      });
      toast.success(label('mtg_toastComplete'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('mtg_completeFailed'));
    } finally {
      setBusy(false);
    }
  }

  function Row({ m, showStatus }: { m: Meeting; showStatus?: boolean }) {
    return (
      <li className="meet-row">
        <div className="meet-main">
          <div className="meet-when">{fmtRange(m.startAt, m.endAt, label, locale)}</div>
          <strong>{m.title}</strong>
          <div className="muted">
            {participantsLine(m, label)} · {m.location || label('mtg_locationTbd')} ·{' '}
            {engagementLabel(engagementType(m), label)}
          </div>
          <div className="meet-badges">
            {isCleared(m) ? (
              <span className="meet-cleared">✓ {label('mtg_verifiedCleared')}</span>
            ) : m.screeningStatus === 'PENDING' ? (
              <span className="meet-pending-screen">{label('mtg_screeningPending')}</span>
            ) : null}
            {showStatus ? (
              <span className={`meet-status ${m.status.toLowerCase()}`}>{statusLabel(m.status, lang)}</span>
            ) : null}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setOpenId(m.id)}>
          {label('open')}
        </button>
      </li>
    );
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('hero_conceptDemo')}
          </div>
          <h1>{label('mtg_title')}</h1>
          <p className="muted">
            {label('mtg_heroSub')}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('mtg_closeForm') : label('mtg_book')}
        </button>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('mtg_bookTitle')}</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              {label('title')}
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              {label('mtg_engagementType')}
              <select
                value={form.screeningNotes}
                onChange={(e) => setForm({ ...form, screeningNotes: e.target.value })}
              >
                {ENGAGEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {engagementLabel(t, label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('mtg_start')}
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </label>
            <label>
              {label('mtg_end')}
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </label>
            <label>
              {label('mtg_location')}
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              {label('mtg_participantsBrief')}
              <textarea
                rows={3}
                value={form.brief}
                onChange={(e) => setForm({ ...form, brief: e.target.value })}
                placeholder={label('mtg_participantsPh')}
              />
            </label>
            <label>
              {label('mtg_cnic')}
              <input
                value={form.screeningCnic}
                onChange={(e) => setForm({ ...form, screeningCnic: e.target.value })}
              />
            </label>
            <label>
              {label('mtg_screening')}
              <select
                value={form.screeningStatus}
                onChange={(e) => setForm({ ...form, screeningStatus: e.target.value })}
              >
                <option value="PENDING">{label('pending')}</option>
                <option value="CLEARED">{label('mtg_verifiedCleared')}</option>
              </select>
            </label>
            <label>
              {label('mtg_badge')}
              <input
                value={form.screeningBadge}
                onChange={(e) => setForm({ ...form, screeningBadge: e.target.value })}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {label('submit')}
            </button>
          </form>
          {conflictInfo ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px', color: 'var(--pine)' }}>{label('mtg_scheduleConflict')}</h3>
              <ul className="muted" style={{ paddingLeft: 18 }}>
                {conflictInfo.conflicts.map((c) => (
                  <li key={c.id}>
                    {c.title} · {fmtRange(c.startAt, c.endAt, label, locale)}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {conflictInfo.alternatives.map((a) => (
                  <button
                    key={a.startAt}
                    type="button"
                    className="btn"
                    onClick={() => {
                      const toLocal = (iso: string) => {
                        const d = new Date(iso);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      };
                      setForm((f) => ({
                        ...f,
                        startAt: toLocal(a.startAt),
                        endAt: toLocal(a.endAt),
                      }));
                      setConflictInfo(null);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={(ev) => create(ev as unknown as FormEvent, true)}
                >
                  {label('mtg_forceSubmit')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel meet-upcoming-panel">
        <div className="meet-section-head">
          <div>
            <div className="eyebrow">{label('mtg_nextOnCalendar')}</div>
            <h2>{label('mtg_todayUpcoming')}</h2>
          </div>
          <span className="meet-count">{tf(lang, 'mtg_nConfirmed', { n: upcoming.length })}</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">{label('mtg_noUpcoming')}</p>
        ) : (
          <ul className="meet-list">
            {upcoming.map((m) => (
              <Row key={m.id} m={m} showStatus />
            ))}
          </ul>
        )}
      </div>

      <div className="meet-split">
        <div className="panel">
          <div className="meet-section-head">
            <div>
              <div className="eyebrow">{label('mtg_inboxEyebrow')}</div>
              <h2>{label('mtg_awaitingDecision')}</h2>
            </div>
            <span className="meet-count">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <p className="muted">{label('mtg_noPending')}</p>
          ) : (
            <ul className="meet-list">
              {pending.map((m) => (
                <Row key={m.id} m={m} />
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="meet-section-head">
            <div>
              <div className="eyebrow">{label('mtg_history')}</div>
              <h2>{label('mtg_pastDeclined')}</h2>
            </div>
            <span className="meet-count">{past.length}</span>
          </div>
          {past.length === 0 ? (
            <p className="muted">{label('mtg_noPast')}</p>
          ) : (
            <ul className="meet-list">
              {past.map((m) => (
                <Row key={m.id} m={m} showStatus />
              ))}
            </ul>
          )}
        </div>
      </div>

      {selected ? (
        <div className="meet-drawer-backdrop" onClick={() => setOpenId(null)}>
          <aside className="meet-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="meet-section-head">
              <div>
                <div className="eyebrow">{statusLabel(selected.status, lang)}</div>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                {label('close')}
              </button>
            </div>
            <p className="muted">{fmtRange(selected.startAt, selected.endAt, label, locale)}</p>
            <div className="meet-detail-grid">
              <div>
                <span>{label('mtg_location')}</span>
                <strong>{selected.location || '—'}</strong>
              </div>
              <div>
                <span>{label('type')}</span>
                <strong>{engagementLabel(engagementType(selected), label)}</strong>
              </div>
              <div>
                <span>{label('mtg_participantsBrief')}</span>
                <strong>{selected.brief || '—'}</strong>
              </div>
              <div>
                <span>{label('mtg_requestedBy')}</span>
                <strong>{selected.createdBy?.displayName || '—'}</strong>
              </div>
              <div>
                <span>{label('mtg_screening')}</span>
                <strong>
                  {isCleared(selected)
                    ? label('mtg_verifiedCleared')
                    : selected.screeningStatus
                      ? enumLabel(lang, selected.screeningStatus)
                      : label('mtg_notRecorded')}
                  {selected.screeningCnic ? ` · ${label('mtg_cnicShort')} ${selected.screeningCnic}` : ''}
                  {selected.screeningBadge ? ` · ${label('mtg_badgeShort')} ${selected.screeningBadge}` : ''}
                </strong>
              </div>
              {selected.outcome ? (
                <div>
                  <span>{label('outcome')}</span>
                  <strong>{selected.outcome}</strong>
                </div>
              ) : null}
              {selected.minutes ? (
                <div>
                  <span>{label('mtg_minutes')}</span>
                  <strong>{selected.minutes}</strong>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow">{label('mtg_actionPoints')}</div>
              <h3 style={{ margin: '4px 0 10px', fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
                {label('mtg_followUp')}
              </h3>
              {(selected.actions || []).length === 0 ? (
                <p className="muted">{label('mtg_noActions')}</p>
              ) : (
                <ul className="meet-list">
                  {(selected.actions || []).map((a) => (
                    <li key={a.id} className="meet-row">
                      <div className="meet-main">
                        <strong>{a.title}</strong>
                        <div className="muted">
                          {a.owner?.displayName || a.ownerName}
                          {a.dueDate
                            ? ` · ${label('directions_due')} ${new Date(a.dueDate).toLocaleDateString(locale)}`
                            : ''}
                          {a.direction
                            ? ` · ${label('mtg_direction')} ${enumLabel(lang, a.direction.status)}`
                            : ''}
                        </div>
                      </div>
                      {canManageActions && !a.directionId ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => promoteAction(selected.id, a.id)}
                        >
                          {label('mtg_toDirections')}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManageActions ? (
                <div className="grid-form" style={{ marginTop: 12 }}>
                  <label>
                    {label('mtg_newAction')}
                    <input
                      value={actionForm.title}
                      onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
                      placeholder={label('mtg_whatToDo')}
                    />
                  </label>
                  <label>
                    {label('owner')}
                    <select
                      value={actionForm.ownerId}
                      onChange={(e) => setActionForm({ ...actionForm, ownerId: e.target.value })}
                    >
                      <option value="">{label('mtg_selectOfficer')}</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName} ({roleTitle(lang, s.role)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {label('mtg_dueDate')}
                    <input
                      type="date"
                      value={actionForm.dueDate}
                      onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })}
                    />
                  </label>
                  <label className="row" style={{ alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={actionForm.promoteToDirection}
                      onChange={(e) =>
                        setActionForm({ ...actionForm, promoteToDirection: e.target.checked })
                      }
                    />
                    {label('mtg_createLinked')}
                  </label>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => addAction(selected.id)}
                  >
                    {label('mtg_addAction')}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="meet-drawer-actions">
              {selected.status === 'REQUESTED' && canDecide ? (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => decide(selected.id, true)}
                  >
                    {label('confirm')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => decide(selected.id, false)}
                  >
                    {label('mtg_decline')}
                  </button>
                </>
              ) : null}
              {selected.status === 'APPROVED' ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => complete(selected.id)}
                >
                  {label('mtg_markComplete')}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
