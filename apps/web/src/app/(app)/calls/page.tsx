'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { enumLabel, tf, type Lang } from '@/lib/i18n';

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

function statusText(lang: Lang, label: (k: string) => string, s: string) {
  if (s === 'CLOSED') return label('completed');
  return enumLabel(lang, s);
}

function priorityText(lang: Lang, label: (k: string) => string, p: string) {
  if (p === 'NORMAL') return label('cl_priRoutine');
  return enumLabel(lang, p);
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
  { n: 1, t: 'cl_flow1t', d: 'cl_flow1d' },
  { n: 2, t: 'cl_flow2t', d: 'cl_flow2d' },
  { n: 3, t: 'cl_flow3t', d: 'cl_flow3d' },
  { n: 4, t: 'cl_flow4t', d: 'cl_flow4d', badge: 'cl_flowIntegrated' },
  { n: 5, t: 'cl_flow5t', d: 'cl_flow5d' },
] as const;

export default function CallsPage() {
  const { user, lang, label } = useAuth();
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
  const [focusId, setFocusId] = useState<string | null>(null);
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

  useEffect(() => {
    try {
      const focus = new URLSearchParams(window.location.search).get('focus');
      if (focus) setFocusId(focus);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`call-${focusId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, items]);

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
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
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
    }, label('cl_toastLogged'));
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_conceptDemo')}
          </div>
          <h1>{label('cl_title')}</h1>
          <p className="muted">{label('cl_heroSub')}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? label('cl_closeForm') : label('cl_logCall')}
        </button>
      </div>

      <div className="panel calls-flow-panel">
        <div className="eyebrow">{label('cl_module')}</div>
        <h2 style={{ marginTop: 4 }}>{label('cl_flowTitle')}</h2>
        <div className="calls-flow">
          {FLOW.map((s) => (
            <div key={s.n} className="calls-flow-step">
              <span className="calls-flow-num">{s.n}</span>
              {'badge' in s ? <span className="calls-flow-badge">{label(s.badge)}</span> : null}
              <strong>{label(s.t)}</strong>
              <p>{label(s.d)}</p>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <h2>{label('cl_formTitle')}</h2>
          <form className="grid-form" onSubmit={create}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>{label('cl_fDirection')}</label>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="INBOUND">{enumLabel(lang, 'INBOUND')}</option>
                  <option value="OUTBOUND">{enumLabel(lang, 'OUTBOUND')}</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>{label('priority')}</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="NORMAL">{label('cl_priRoutine')}</option>
                  <option value="PRIORITY">{enumLabel(lang, 'PRIORITY')}</option>
                  <option value="URGENT">{enumLabel(lang, 'URGENT')}</option>
                  <option value="VIP">{enumLabel(lang, 'VIP')}</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>{label('status')}</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="LOGGED">{enumLabel(lang, 'LOGGED')}</option>
                  <option value="FOLLOW_UP">{enumLabel(lang, 'FOLLOW_UP')}</option>
                  <option value="CLOSED">{label('completed')}</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label>{label('cl_callerParty')}</label>
                <input value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} required />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label>{label('cl_orgOffice')}</label>
                <input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>{label('cl_telephone')}</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{label('cl_addressedTo')}</label>
              <input
                value={form.addressedTo}
                onChange={(e) => setForm({ ...form, addressedTo: e.target.value })}
                placeholder={label('cl_addressedPlaceholder')}
              />
            </div>
            <div className="field">
              <label>{label('cl_messageSubstance')}</label>
              <textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required />
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>{label('cl_actionRequired')}</label>
                <input value={form.actionRequired} onChange={(e) => setForm({ ...form, actionRequired: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{label('cl_followUpNotes')}</label>
                <input value={form.followUpNotes} onChange={(e) => setForm({ ...form, followUpNotes: e.target.value })} />
              </div>
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {label('cl_saveLog')}
            </button>
          </form>
        </div>
      )}

      <div className="calls-kpi-row">
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.total}</div>
          <div className="calls-kpi-label">{label('cl_kpiTotal')}</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.linked}</div>
          <div className="calls-kpi-label">{label('cl_kpiLinked')}</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.vipUrgent}</div>
          <div className="calls-kpi-label">{label('cl_kpiVipUrgent')}</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.pending}</div>
          <div className="calls-kpi-label">{label('cl_kpiPending')}</div>
        </div>
        <div className="calls-kpi">
          <div className="calls-kpi-value">{counts.closed}</div>
          <div className="calls-kpi-label">{label('cl_kpiCompleted')}</div>
        </div>
      </div>

      <div className="calls-filters panel">
        <div className="calls-search-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={label('cl_searchPlaceholder')}
          />
          <button type="button" className="btn primary" onClick={() => undefined}>
            {label('searchAction')}
          </button>
        </div>
        <div className="calls-filter-row">
          <span>{label('cl_fDirection')}</span>
          {(
            [
              ['all', label('cl_fAllCalls')],
              ['INBOUND', enumLabel(lang, 'INBOUND')],
              ['OUTBOUND', enumLabel(lang, 'OUTBOUND')],
            ] as [DirFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={dir === k ? 'active' : ''} onClick={() => setDir(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>{label('cl_fMatterLink')}</span>
          {(
            [
              ['all', label('cl_fAllCalls')],
              ['linked', label('cl_fLinked')],
              ['unlinked', label('cl_fUnlinked')],
            ] as [LinkFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={link === k ? 'active' : ''} onClick={() => setLink(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>{label('priority')}</span>
          {(
            [
              ['all', label('all')],
              ['VIP', enumLabel(lang, 'VIP')],
              ['URGENT', enumLabel(lang, 'URGENT')],
              ['NORMAL', label('cl_priRoutine')],
            ] as [PriFilter, string][]
          ).map(([k, lab]) => (
            <button key={k} type="button" className={pri === k ? 'active' : ''} onClick={() => setPri(k)}>
              {lab}
            </button>
          ))}
        </div>
        <div className="calls-filter-row">
          <span>{label('status')}</span>
          {(
            [
              ['all', label('all')],
              ['FOLLOW_UP', enumLabel(lang, 'FOLLOW_UP')],
              ['LOGGED', enumLabel(lang, 'LOGGED')],
              ['CLOSED', label('completed')],
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
                <th>{label('cl_thCallId')}</th>
                <th>{label('cl_fDirection')}</th>
                <th>{label('cl_thCaller')}</th>
                <th>{label('cl_addressedTo')}</th>
                <th>{label('cl_messageSubstance')}</th>
                <th>{label('priority')}</th>
                <th>{label('status')}</th>
                <th>{label('cl_thLinked')}</th>
                <th>{label('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const when = fmtWhen(c.createdAt);
                const inbound = isInbound(c.direction);
                return (
                  <tr key={c.id} id={`call-${c.id}`} className={focusId === c.id ? 'focus' : undefined}>
                    <td>
                      <strong>{callRef(c.id)}</strong>
                      <div className="muted">{when.date}</div>
                      <div className="muted">{when.time}</div>
                    </td>
                    <td>
                      <span className={`calls-dir ${inbound ? 'in' : 'out'}`}>
                        {inbound ? label('cl_in') : label('cl_out')}
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
                        <div className="muted">{tf(lang, 'cl_actionLine', { text: c.actionRequired })}</div>
                      ) : null}
                      {c.followUpNotes ? (
                        <div className="muted">{tf(lang, 'cl_followLine', { text: c.followUpNotes })}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`calls-pri ${c.priority}`}>{priorityText(lang, label, c.priority)}</span>
                    </td>
                    <td>
                      <span className={`calls-stat ${c.status}`}>{statusText(lang, label, c.status)}</span>
                    </td>
                    <td>
                      {c.matter ? (
                        <div className="calls-linked">
                          <div className="calls-linked-tag">{label('cl_matterLinked')}</div>
                          <Link href={`/files/${c.matter.id}`}>
                            {c.matter.diaryNo} · {c.matter.subject}
                          </Link>
                          {c.matter.status ? (
                            <div className="muted">
                              {tf(lang, 'cl_statusLine', { status: enumLabel(lang, c.matter.status) })}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="btn tiny"
                            onClick={() => {
                              setLinkFor(c.id);
                              setMatterPick(c.matterId || '');
                            }}
                          >
                            {label('cl_change')}
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
                          {label('cl_linkToMatter')}
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
                              matterPick ? label('cl_toastLinked') : label('cl_toastUnlinked'),
                            ).then(() => setLinkFor(null));
                          }}
                        >
                          <select value={matterPick} onChange={(e) => setMatterPick(e.target.value)}>
                            <option value="">{label('cl_unlinkOpt')}</option>
                            {matters.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.diaryNo} · {m.subject}
                              </option>
                            ))}
                          </select>
                          <button className="btn primary" type="submit" disabled={busy}>
                            {label('save')}
                          </button>
                          <button type="button" className="btn" onClick={() => setLinkFor(null)}>
                            {label('cancel')}
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
                              tf(lang, 'cl_toastStatus', { status: statusText(lang, label, next) }),
                            );
                          }}
                        >
                          {label('cl_updateStatus')}
                        </button>
                        <button
                          type="button"
                          className="btn calls-btn-link"
                          onClick={() => {
                            setLinkFor(c.id);
                            setMatterPick(c.matterId || '');
                          }}
                        >
                          {c.matterId ? label('cl_switchMatter') : label('calls_linkMatter')}
                        </button>
                        <button
                          type="button"
                          className="btn calls-btn-meet"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api(`/calls/${c.id}/meeting`, { method: 'POST', json: {} }),
                              label('cl_toastMeeting'),
                            )
                          }
                        >
                          {label('cl_bookMeeting')}
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
                                label('cl_toastDirection'),
                              );
                            }}
                          >
                            {label('cl_plusDirection')}
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
                    {label('cl_empty')}
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
