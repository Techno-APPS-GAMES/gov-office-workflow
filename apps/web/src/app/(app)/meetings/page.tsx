'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return 'Time TBD';
  const s = new Date(start);
  const date = s.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const t1 = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!end) return `${date}, ${t1}`;
  const t2 = new Date(end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${t1} – ${t2}`;
}

function statusLabel(s: string) {
  if (s === 'APPROVED') return 'Confirmed';
  if (s === 'REQUESTED') return 'Requested';
  if (s === 'DECLINED') return 'Declined';
  if (s === 'COMPLETED') return 'Completed';
  if (s === 'ARCHIVED') return 'Archived';
  return s.replace(/_/g, ' ');
}

function isCleared(m: Meeting) {
  const s = (m.screeningStatus || '').toUpperCase();
  return ['CLEARED', 'VERIFIED', 'APPROVED', 'PASSED'].includes(s) || !!m.screeningBadge;
}

function participantsLine(m: Meeting) {
  const brief = (m.brief || '').trim();
  if (brief) {
    const first = brief.split('\n')[0].trim();
    if (first.length <= 120) return first;
    return `${first.slice(0, 117)}…`;
  }
  return 'Participants not recorded';
}

function engagementType(m: Meeting): string {
  return m.screeningNotes || 'Meeting request';
}

export default function MeetingsPage() {
  const { user } = useAuth();
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
        toast.error('Diary conflict — choose an alternative or force submit');
        return;
      }
      toast.success('Engagement booked / requested');
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
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function addAction(meetingId: string) {
    if (!actionForm.title.trim()) {
      toast.error('Action title required');
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
          ? 'Action linked to directions tracker'
          : 'Action point recorded',
      );
      setActionForm({ title: '', ownerId: '', dueDate: '', promoteToDirection: true });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
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
      toast.success('Promoted to directions tracker');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      await api(`/meetings/${id}/decide`, { method: 'POST', json: { approve } });
      toast.success(approve ? 'Meeting confirmed' : 'Meeting declined');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    setBusy(true);
    try {
      await api(`/meetings/${id}/complete`, {
        method: 'POST',
        json: { minutes: 'Recorded on desk', outcome: 'Held', decision: 'Noted' },
      });
      toast.success('Meeting marked complete');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Complete failed');
    } finally {
      setBusy(false);
    }
  }

  function Row({ m, showStatus }: { m: Meeting; showStatus?: boolean }) {
    return (
      <li className="meet-row">
        <div className="meet-main">
          <div className="meet-when">{fmtRange(m.startAt, m.endAt)}</div>
          <strong>{m.title}</strong>
          <div className="muted">
            {participantsLine(m)} · {m.location || 'Location TBD'} · {engagementType(m)}
          </div>
          <div className="meet-badges">
            {isCleared(m) ? (
              <span className="meet-cleared">✓ Verified &amp; Cleared</span>
            ) : m.screeningStatus === 'PENDING' ? (
              <span className="meet-pending-screen">Screening pending</span>
            ) : null}
            {showStatus ? (
              <span className={`meet-status ${m.status.toLowerCase()}`}>{statusLabel(m.status)}</span>
            ) : null}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setOpenId(m.id)}>
          Open
        </button>
      </li>
    );
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Meetings &amp; visitors</h1>
          <p className="muted">
            Meeting requests, confirmed diary bookings, briefings and outcomes stay together here.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Book engagement'}
        </button>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>Book engagement</h2>
          <form className="grid-form" onSubmit={create}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Engagement type
              <select
                value={form.screeningNotes}
                onChange={(e) => setForm({ ...form, screeningNotes: e.target.value })}
              >
                {ENGAGEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </label>
            <label>
              End
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </label>
            <label>
              Location
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              Participants / brief
              <textarea
                rows={3}
                value={form.brief}
                onChange={(e) => setForm({ ...form, brief: e.target.value })}
                placeholder="Names or organisations attending"
              />
            </label>
            <label>
              Visitor CNIC
              <input
                value={form.screeningCnic}
                onChange={(e) => setForm({ ...form, screeningCnic: e.target.value })}
              />
            </label>
            <label>
              Screening
              <select
                value={form.screeningStatus}
                onChange={(e) => setForm({ ...form, screeningStatus: e.target.value })}
              >
                <option value="PENDING">Pending</option>
                <option value="CLEARED">Verified &amp; Cleared</option>
              </select>
            </label>
            <label>
              Security badge no.
              <input
                value={form.screeningBadge}
                onChange={(e) => setForm({ ...form, screeningBadge: e.target.value })}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Submit
            </button>
          </form>
          {conflictInfo ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px', color: 'var(--pine)' }}>Schedule conflict</h3>
              <ul className="muted" style={{ paddingLeft: 18 }}>
                {conflictInfo.conflicts.map((c) => (
                  <li key={c.id}>
                    {c.title} · {fmtRange(c.startAt, c.endAt)}
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
                  Force submit
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel meet-upcoming-panel">
        <div className="meet-section-head">
          <div>
            <div className="eyebrow">Next on the calendar</div>
            <h2>Today and upcoming meetings</h2>
          </div>
          <span className="meet-count">{upcoming.length} confirmed</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">No confirmed upcoming meetings.</p>
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
              <div className="eyebrow">Inbox</div>
              <h2>Meeting requests awaiting your decision</h2>
            </div>
            <span className="meet-count">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <p className="muted">No pending requests.</p>
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
              <div className="eyebrow">History</div>
              <h2>Past and declined</h2>
            </div>
            <span className="meet-count">{past.length}</span>
          </div>
          {past.length === 0 ? (
            <p className="muted">No past engagements yet.</p>
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
                <div className="eyebrow">{statusLabel(selected.status)}</div>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
            <p className="muted">{fmtRange(selected.startAt, selected.endAt)}</p>
            <div className="meet-detail-grid">
              <div>
                <span>Location</span>
                <strong>{selected.location || '—'}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{engagementType(selected)}</strong>
              </div>
              <div>
                <span>Participants / brief</span>
                <strong>{selected.brief || '—'}</strong>
              </div>
              <div>
                <span>Requested by</span>
                <strong>{selected.createdBy?.displayName || '—'}</strong>
              </div>
              <div>
                <span>Screening</span>
                <strong>
                  {isCleared(selected)
                    ? 'Verified & Cleared'
                    : selected.screeningStatus || 'Not recorded'}
                  {selected.screeningCnic ? ` · CNIC ${selected.screeningCnic}` : ''}
                  {selected.screeningBadge ? ` · Badge ${selected.screeningBadge}` : ''}
                </strong>
              </div>
              {selected.outcome ? (
                <div>
                  <span>Outcome</span>
                  <strong>{selected.outcome}</strong>
                </div>
              ) : null}
              {selected.minutes ? (
                <div>
                  <span>Minutes</span>
                  <strong>{selected.minutes}</strong>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow">Action points → directions</div>
              <h3 style={{ margin: '4px 0 10px', fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
                Follow-up tracker
              </h3>
              {(selected.actions || []).length === 0 ? (
                <p className="muted">No action points yet.</p>
              ) : (
                <ul className="meet-list">
                  {(selected.actions || []).map((a) => (
                    <li key={a.id} className="meet-row">
                      <div className="meet-main">
                        <strong>{a.title}</strong>
                        <div className="muted">
                          {a.owner?.displayName || a.ownerName}
                          {a.dueDate
                            ? ` · due ${new Date(a.dueDate).toLocaleDateString()}`
                            : ''}
                          {a.direction
                            ? ` · Direction ${a.direction.status.replace(/_/g, ' ')}`
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
                          → Directions
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManageActions ? (
                <div className="grid-form" style={{ marginTop: 12 }}>
                  <label>
                    New action
                    <input
                      value={actionForm.title}
                      onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
                      placeholder="What must be done"
                    />
                  </label>
                  <label>
                    Owner
                    <select
                      value={actionForm.ownerId}
                      onChange={(e) => setActionForm({ ...actionForm, ownerId: e.target.value })}
                    >
                      <option value="">Select officer…</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName} ({s.role})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Due date
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
                    Create linked direction immediately
                  </label>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => addAction(selected.id)}
                  >
                    Add action point
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
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => decide(selected.id, false)}
                  >
                    Decline
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
                  Mark complete
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
