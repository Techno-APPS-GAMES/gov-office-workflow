'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

type MatterOpt = { id: string; diaryNo: string; subject: string; status?: string };
type Person = { id: string; displayName: string; role?: string };

type CallRow = {
  id: string;
  direction: string;
  priority: string;
  status: string;
  partyName: string;
  organisation?: string | null;
  phone?: string | null;
  addressedTo?: string | null;
  summary: string;
  actionRequired?: string | null;
  followUpNotes?: string | null;
  createdAt: string;
  matterId?: string | null;
  meetingId?: string | null;
  matter?: MatterOpt & { holder?: { displayName: string } | null } | null;
  meeting?: { id: string; title: string; startAt?: string | null } | null;
  directionRef?: { id: string; title: string } | null;
};

type DirFilter = 'all' | 'INBOUND' | 'OUTBOUND';
type LinkFilter = 'all' | 'linked' | 'unlinked';
type PriFilter = 'all' | 'VIP' | 'URGENT' | 'NORMAL';
type StatFilter = 'all' | 'FOLLOW_UP' | 'LOGGED' | 'CLOSED';

function callRef(id: string) {
  return `CALL-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function prettyStatus(s: string) {
  if (s === 'FOLLOW_UP') return 'Follow-up pending';
  if (s === 'LOGGED') return 'Message taken';
  if (s === 'CLOSED') return 'Completed';
  return s.replace(/_/g, ' ');
}

function prettyPriority(p: string) {
  if (p === 'NORMAL') return 'Routine';
  if (p === 'PRIORITY') return 'Priority';
  return p;
}

function isInbound(d: string) {
  return d === 'INBOUND' || d === 'IN' || d === 'Incoming';
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

const FLOW = [
  { n: 1, t: 'Log Incoming Call', d: 'Record caller, organisation, subject and time.' },
  { n: 2, t: 'Route or Respond', d: 'Connect the caller or take a message for follow-up.' },
  { n: 3, t: 'Log Outgoing Call', d: 'Capture outbound dials from the office.' },
  { n: 4, t: 'Link to Related Matter', d: 'Attach the log to a file, meeting or direction.', badge: 'INTEGRATED' },
  { n: 5, t: 'Maintain Searchable Register', d: 'Retain the register for audit and reference.' },
];

export default function CallsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<CallRow[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [dir, setDir] = useState<DirFilter>('all');
  const [link, setLink] = useState<LinkFilter>('all');
  const [pri, setPri] = useState<PriFilter>('all');
  const [stat, setStat] = useState<StatFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [matterPick, setMatterPick] = useState('');
  const [form, setForm] = useState({
    direction: 'INBOUND',
    partyName: '',
    organisation: '',
    phone: '',
    addressedTo: '',
    summary: '',
    actionRequired: '',
    followUpNotes: '',
    priority: 'NORMAL',
    status: 'LOGGED',
  });

  const isSpeaker = user?.role === 'SPEAKER' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    const [calls, mats, users] = await Promise.all([
      api<CallRow[]>('/calls'),
      api<MatterOpt[]>('/files').catch(() => [] as MatterOpt[]),
      api<Person[]>('/users').catch(() => [] as Person[]),
    ]);
    setItems(calls);
    setMatters(mats);
    setPeople(users);
  }, []);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  const counts = useMemo(() => {
    const linked = items.filter((c) => !!c.matterId).length;
    const vipUrgent = items.filter((c) => c.priority === 'VIP' || c.priority === 'URGENT').length;
    const pending = items.filter((c) => c.status === 'FOLLOW_UP' || c.status === 'LOGGED').length;
    const closed = items.filter((c) => c.status === 'CLOSED').length;
    return { total: items.length, linked, vipUrgent, pending, closed };
  }, [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((c) => {
      if (dir === 'INBOUND' && !isInbound(c.direction)) return false;
      if (dir === 'OUTBOUND' && isInbound(c.direction)) return false;
      if (link === 'linked' && !c.matterId) return false;
      if (link === 'unlinked' && c.matterId) return false;
      if (pri !== 'all' && c.priority !== pri) return false;
      if (stat !== 'all' && c.status !== stat) return false;
      if (!term) return true;
      return (
        c.partyName.toLowerCase().includes(term) ||
        (c.organisation || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term) ||
        c.summary.toLowerCase().includes(term) ||
        (c.matter?.diaryNo || '').toLowerCase().includes(term) ||
        callRef(c.id).toLowerCase().includes(term)
      );
    });
  }, [items, q, dir, link, pri, stat]);

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

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/calls', {
        method: 'POST',
        json: {
          ...form,
          status: form.status === 'FOLLOW_UP' ? 'FOLLOW_UP' : form.status === 'CLOSED' ? 'CLOSED' : 'LOGGED',
        },
      });
      setForm({
        ...form,
        partyName: '',
        organisation: '',
        phone: '',
        summary: '',
        actionRequired: '',
        followUpNotes: '',
      });
      setShowForm(false);
    }, 'Call logged');
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Call register & telephone log</h1>
          <p className="muted">
            Module 6 — Log incoming and outgoing calls, record messages, route to matters, book
            meetings, and issue directions.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Log a call'}
        </button>
      </div>

      <div className="panel calls-flow-panel">
        <div className="eyebrow">Module 6 · Telephone call management</div>
        <h2 style={{ marginTop: 4 }}>Official Parliamentary Telephone Management Flow</h2>
        <div className="calls-flow">
          {FLOW.map((s) => (
            <div key={s.n} className="calls-flow-step">
              <span className="calls-flow-num">{s.n}</span>
              {s.badge ? <span className="calls-flow-badge">{s.badge}</span> : null}
              <strong>{s.t}</strong>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <h2>Log a call</h2>
          <form className="grid-form" onSubmit={create}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Direction</label>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="INBOUND">Incoming</option>
                  <option value="OUTBOUND">Outgoing</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="NORMAL">Routine</option>
                  <option value="PRIORITY">Priority</option>
                  <option value="URGENT">Urgent</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="LOGGED">Message taken</option>
                  <option value="FOLLOW_UP">Follow-up pending</option>
                  <option value="CLOSED">Completed</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label>Caller / party</label>
                <input value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} required />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label>Organisation / office</label>
                <input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Telephone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Addressed to</label>
              <input
                value={form.addressedTo}
                onChange={(e) => setForm({ ...form, addressedTo: e.target.value })}
                placeholder="e.g. Speaker (demo)"
              />
            </div>
            <div className="field">
              <label>Message substance</label>
              <textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required />
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Action required</label>
                <input value={form.actionRequired} onChange={(e) => setForm({ ...form, actionRequired: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Follow-up notes</label>
                <input value={form.followUpNotes} onChange={(e) => setForm({ ...form, followUpNotes: e.target.value })} />
              </div>
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              Save call log
            </button>
          </form>
        </div>
      )}

      <div className="calls-kpi-row">
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.total}</div>
          <div className="calls-kpi-label">Total logged calls</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.linked}</div>
          <div className="calls-kpi-label">Linked to matters</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.vipUrgent}</div>
          <div className="calls-kpi-label">VIP & urgent</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.pending}</div>
          <div className="calls-kpi-label">Action / message pending</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.closed}</div>
          <div className="calls-kpi-label">Completed calls</div>
        </div>
      </div>

      <div className="calls-filters panel">
        <div className="calls-search-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search caller, organisation, telephone number, message text, or matter ID…"
          />
          <button type="button" className="btn primary" onClick={() => undefined}>
            Search
          </button>
        </div>
        <div className="calls-filter-row">
          <span>Direction</span>
          {(
            [
              ['all', 'All calls'],
              ['INBOUND', 'Incoming'],
              ['OUTBOUND', 'Outgoing'],
            ] as [DirFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={dir === k ? 'active' : ''} onClick={() => setDir(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>Matter link</span>
          {(
            [
              ['all', 'All calls'],
              ['linked', 'Linked to matter'],
              ['unlinked', 'Unlinked'],
            ] as [LinkFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={link === k ? 'active' : ''} onClick={() => setLink(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>Priority</span>
          {(
            [
              ['all', 'All'],
              ['VIP', 'VIP'],
              ['URGENT', 'Urgent'],
              ['NORMAL', 'Routine'],
            ] as [PriFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={pri === k ? 'active' : ''} onClick={() => setPri(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>Status</span>
          {(
            [
              ['all', 'All'],
              ['FOLLOW_UP', 'Follow-up pending'],
              ['LOGGED', 'Message taken'],
              ['CLOSED', 'Completed'],
            ] as [StatFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={stat === k ? 'active' : ''} onClick={() => setStat(k)}>
              {lab}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table calls-table">
            <thead>
              <tr>
                <th>Call ID / time</th>
                <th>Direction</th>
                <th>Caller & office</th>
                <th>Addressed to</th>
                <th>Message substance</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Linked record / evidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const when = fmtWhen(c.createdAt);
                const inbound = isInbound(c.direction);
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{callRef(c.id)}</strong>
                      <div className="muted">{when.date}</div>
                      <div className="muted">{when.time}</div>
                    </td>
                    <td>
                      <span className={`calls-dir ${inbound ? 'in' : 'out'}`}>
                        {inbound ? '↓ In' : '↑ Out'}
                      </span>
                    </td>
                    <td>
                      <strong>{c.partyName}</strong>
                      {c.organisation ? <div className="muted">{c.organisation}</div> : null}
                      {c.phone ? <div className="muted">{c.phone}</div> : null}
                    </td>
                    <td>{c.addressedTo || '—'}</td>
                    <td>
                      <div>{c.summary}</div>
                      {c.actionRequired ? (
                        <div className="muted">Action: {c.actionRequired}</div>
                      ) : null}
                      {c.followUpNotes ? (
                        <div className="muted">Follow-up: {c.followUpNotes}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`calls-pri ${c.priority}`}>{prettyPriority(c.priority)}</span>
                    </td>
                    <td>
                      <span className={`calls-stat ${c.status}`}>{prettyStatus(c.status)}</span>
                    </td>
                    <td>
                      {c.matter ? (
                        <div className="calls-linked">
                          <div className="calls-linked-tag">Matter linked</div>
                          <Link href={`/files/${c.matter.id}`}>
                            {c.matter.diaryNo} · {c.matter.subject}
                          </Link>
                          {c.matter.status ? (
                            <div className="muted">Status: {c.matter.status.replace(/_/g, ' ')}</div>
                          ) : null}
                          <button
                            type="button"
                            className="btn tiny"
                            onClick={() => {
                              setLinkFor(c.id);
                              setMatterPick(c.matterId || '');
                            }}
                          >
                            Change
                          </button>
                        </div>
                      ) : c.meeting ? (
                        <div className="calls-meeting">
                          📅 {c.meeting.title}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setLinkFor(c.id);
                            setMatterPick('');
                          }}
                        >
                          Link to matter
                        </button>
                      )}
                      {linkFor === c.id && (
                        <form
                          className="calls-link-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            run(
                              () =>
                                api(`/calls/${c.id}/matter`, {
                                  method: 'PATCH',
                                  json: { matterId: matterPick || null },
                                }),
                              matterPick ? 'Matter linked' : 'Unlinked',
                            ).then(() => setLinkFor(null));
                          }}
                        >
                          <select value={matterPick} onChange={(e) => setMatterPick(e.target.value)}>
                            <option value="">— Unlink —</option>
                            {matters.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.diaryNo} · {m.subject}
                              </option>
                            ))}
                          </select>
                          <button className="btn primary" type="submit" disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="btn" onClick={() => setLinkFor(null)}>
                            Cancel
                          </button>
                        </form>
                      )}
                    </td>
                    <td>
                      <div className="calls-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => {
                            const next =
                              c.status === 'LOGGED'
                                ? 'FOLLOW_UP'
                                : c.status === 'FOLLOW_UP'
                                  ? 'CLOSED'
                                  : 'LOGGED';
                            run(
                              () =>
                                api(`/calls/${c.id}/status`, {
                                  method: 'PATCH',
                                  json: { status: next },
                                }),
                              `Status → ${prettyStatus(next)}`,
                            );
                          }}
                        >
                          Update status
                        </button>
                        <button
                          type="button"
                          className="btn calls-btn-link"
                          onClick={() => {
                            setLinkFor(c.id);
                            setMatterPick(c.matterId || '');
                          }}
                        >
                          {c.matterId ? 'Switch matter' : 'Link matter'}
                        </button>
                        <button
                          type="button"
                          className="btn calls-btn-meet"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api(`/calls/${c.id}/meeting`, { method: 'POST', json: {} }),
                              'Meeting booked',
                            )
                          }
                        >
                          Book meeting
                        </button>
                        {isSpeaker && (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={busy || !people.length}
                            onClick={() => {
                              const owner =
                                people.find((p) => p.role === 'SECRETARY_GENERAL') || people[0];
                              if (!owner) return;
                              run(
                                () =>
                                  api(`/calls/${c.id}/direction`, {
                                    method: 'POST',
                                    json: {
                                      title: `Follow up call: ${c.partyName}`,
                                      ownerUserId: owner.id,
                                    },
                                  }),
                                'Direction issued',
                              );
                            }}
                          >
                            + Direction
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="muted">
                    No calls in this view — log a call to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
