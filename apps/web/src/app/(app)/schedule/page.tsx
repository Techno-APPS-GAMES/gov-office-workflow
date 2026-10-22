'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';
import { enumLabel, tf } from '@/lib/i18n';

type ScheduleItem = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string | null;
  owner?: { displayName: string } | null;
  createdAt?: string;
};

type Meeting = {
  id: string;
  title: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  brief?: string | null;
  screeningNotes?: string | null;
};

type Engagement = {
  id: string;
  source: 'schedule' | 'meeting';
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  status: string;
  kind: string;
};

type Tour = {
  id: string;
  title: string;
  when: string;
  place: string;
  note: string;
};

const TOURS: Tour[] = [
  {
    id: 'tour-1',
    title: 'Provincial Speakers conference — Lahore',
    when: '12–14 Nov 2026',
    place: 'Punjab Assembly',
    note: 'Bilateral protocol & federal–provincial calendar alignment',
  },
  {
    id: 'tour-2',
    title: 'State visit courtesy — diplomatic corps briefing',
    when: '3 Dec 2026',
    place: 'Parliament House',
    note: 'Hosted reception for accredited heads of mission',
  },
  {
    id: 'tour-3',
    title: 'IPU regional programme — working visit',
    when: '18–20 Jan 2027',
    place: 'Geneva / virtual hybrid',
    note: 'Speaker delegation for parliamentary diplomacy track',
  },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function weekStart(anchor: Date) {
  const d = startOfDay(anchor);
  const day = d.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(d, mondayOffset);
}

function fmtDayLabel(d: Date, locale?: string) {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtWeekday(d: Date, locale?: string) {
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

function fmtTime(iso: string, locale?: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

function fmtRange(start: string, end: string, locale?: string) {
  const s = new Date(start);
  const date = s.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${date} · ${fmtTime(start, locale)}–${fmtTime(end, locale)}`;
}

const KIND_KEYS: Record<string, string> = {
  Diary: 'sch_kindDiary',
  Meeting: 'sch_kindMeeting',
  'Diary booking': 'mtg_et_diary',
  'Meeting request': 'mtg_et_request',
  Invitation: 'mtg_et_invitation',
  'Official visitor': 'mtg_et_visitor',
  Delegation: 'mtg_et_delegation',
  'Walk-in': 'mtg_et_walkin',
};

function kindLabel(kind: string, label: (k: string) => string) {
  const k = KIND_KEYS[kind];
  return k ? label(k) : kind;
}

function toIcsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function downloadIcs(rows: Engagement[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GOW//Official Schedule//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const e of rows) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.source}-${e.id}@gow.local`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(e.startAt)}`,
      `DTEND:${toIcsDate(e.endAt)}`,
      `SUMMARY:${e.title.replace(/\n/g, ' ')}`,
      `LOCATION:${(e.location || '').replace(/\n/g, ' ')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `official-schedule-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SchedulePage() {
  const { user, label, lang } = useAuth();
  const locale = lang === 'ur' ? 'ur-PK' : undefined;
  const toast = useToast();
  const [tab, setTab] = useState<'diary' | 'tours'>('diary');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [openDirections, setOpenDirections] = useState(0);
  const [pendingMeetings, setPendingMeetings] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const briefRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    startAt: '',
    endAt: '',
    location: '',
  });
  const [conflictInfo, setConflictInfo] = useState<{
    conflicts: { id: string; title: string; startAt: string; endAt: string; source: string }[];
    alternatives: { startAt: string; endAt: string; label: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    const [sched, meets, dirs] = await Promise.all([
      api<ScheduleItem[]>('/schedule').catch(() => [] as ScheduleItem[]),
      api<Meeting[]>('/meetings').catch(() => [] as Meeting[]),
      api<any[]>('/directions').catch(() => [] as any[]),
    ]);
    setSchedule(sched);
    setMeetings(meets);
    setOpenDirections(
      dirs.filter((d) => !['CLOSED'].includes(d.status)).length,
    );
    setPendingMeetings(meets.filter((m) => m.status === 'REQUESTED').length);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useLiveRefresh(load, [load]);

  const engagements = useMemo(() => {
    const rows: Engagement[] = [];
    for (const s of schedule) {
      rows.push({
        id: s.id,
        source: 'schedule',
        title: s.title,
        startAt: s.startAt,
        endAt: s.endAt,
        location: s.location || '—',
        status: 'CONFIRMED',
        kind: 'Diary',
      });
    }
    for (const m of meetings) {
      if (m.status !== 'APPROVED' || !m.startAt) continue;
      const end =
        m.endAt ||
        new Date(new Date(m.startAt).getTime() + 60 * 60 * 1000).toISOString();
      rows.push({
        id: m.id,
        source: 'meeting',
        title: m.title,
        startAt: m.startAt,
        endAt: end,
        location: m.location || '—',
        status: 'CONFIRMED',
        kind: m.screeningNotes || 'Meeting',
      });
    }
    rows.sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
    return rows;
  }, [schedule, meetings]);

  const weekDays = useMemo(() => {
    const start = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const weekLabel = useMemo(() => {
    const a = weekDays[0];
    const b = weekDays[6];
    return `${fmtDayLabel(a, locale)} – ${fmtDayLabel(b, locale)}`;
  }, [weekDays, locale]);

  const byDay = useMemo(() => {
    return weekDays.map((day) => {
      const items = engagements.filter((e) => sameDay(new Date(e.startAt), day));
      return { day, items };
    });
  }, [weekDays, engagements]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return engagements.filter((e) => new Date(e.endAt) >= now).slice(0, 12);
  }, [engagements]);

  const tomorrow = useMemo(() => addDays(startOfDay(new Date()), 1), []);

  const tomorrowItems = useMemo(
    () => engagements.filter((e) => sameDay(new Date(e.startAt), tomorrow)),
    [engagements, tomorrow],
  );

  const recentChanges = useMemo(() => {
    const rows: { id: string; text: string; when: string }[] = [];
    for (const s of schedule.slice().reverse().slice(0, 5)) {
      rows.push({
        id: `s-${s.id}`,
        text: `${label('sch_diaryAdded')}: ${s.title}`,
        when: s.createdAt || s.startAt,
      });
    }
    for (const m of meetings.filter((x) => x.status === 'APPROVED').slice(0, 5)) {
      rows.push({
        id: `m-${m.id}`,
        text: `${label('sch_meetingOnDiary')}: ${m.title}`,
        when: m.startAt || new Date().toISOString(),
      });
    }
    return rows.slice(0, 8);
  }, [schedule, meetings, label]);

  async function create(e: FormEvent, force = false) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/schedule', {
        method: 'POST',
        json: {
          title: form.title,
          location: form.location || undefined,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          force,
        },
      });
      toast.success(force ? label('sch_toastAddedForced') : label('sch_toastAdded'));
      setShowForm(false);
      setConflictInfo(null);
      setForm({ title: '', startAt: '', endAt: '', location: '' });
      await load();
    } catch (err) {
      const pe = err as Error & {
        status?: number;
        payload?: {
          conflicts?: { id: string; title: string; startAt: string; endAt: string; source: string }[];
          alternatives?: { startAt: string; endAt: string; label: string }[];
        };
      };
      if (pe.status === 409 && pe.payload) {
        setConflictInfo({
          conflicts: pe.payload.conflicts || [],
          alternatives: pe.payload.alternatives || [],
        });
        toast.error(label('sch_toastConflict'));
      } else {
        toast.error(err instanceof Error ? err.message : label('createFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('hero_speakerOffice') : label('hero_officeWorkflow')} ·{' '}
            {label('hero_conceptDemo')}
          </div>
          <h1>{label('sch_title')}</h1>
          <p className="muted">
            {label('sch_heroSub')}{' '}
            <Link href="/meetings">{label('meetings')}</Link>
            {label('sch_heroSubEnd')}
          </p>
        </div>
        <div className="sched-hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTab('diary');
              briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {label('sch_dailyBrief')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              downloadIcs(engagements);
              toast.success(label('sch_toastIcs'));
            }}
          >
            ⬇ {label('sch_calendarFile')}
          </button>
          <Link href="/meetings" className="btn">
            {label('sch_bookMeeting')}
          </Link>
          <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? label('mtg_closeForm') : label('sch_newEngagement')}
          </button>
        </div>
      </div>

      <div className="sched-tabs">
        <button
          type="button"
          className={tab === 'diary' ? 'active' : ''}
          onClick={() => setTab('diary')}
        >
          📅 {label('sch_tabDiary')}
        </button>
        <button
          type="button"
          className={tab === 'tours' ? 'active' : ''}
          onClick={() => setTab('tours')}
        >
          ✈ {label('sch_tabTours')} ({TOURS.length})
        </button>
      </div>

      {showForm ? (
        <div className="panel">
          <h2>{label('sch_newDiaryTitle')}</h2>
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
              {label('mtg_start')}
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
            </label>
            <label>
              {label('mtg_end')}
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                required
              />
            </label>
            <label>
              {label('mtg_location')}
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {label('sch_addToDiary')}
            </button>
          </form>
          {conflictInfo ? (
            <div className="sched-conflict" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px', color: 'var(--pine)' }}>{label('sch_conflictDetected')}</h3>
              <ul className="muted" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                {conflictInfo.conflicts.map((c) => (
                  <li key={c.id}>
                    {c.title} · {fmtRange(c.startAt, c.endAt, locale)} ({c.source})
                  </li>
                ))}
              </ul>
              {conflictInfo.alternatives.length ? (
                <>
                  <div className="eyebrow">{label('sch_suggestedAlt')}</div>
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
                          toast.success(`${label('sch_slotSet')}: ${a.label}`);
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">{label('sch_noFreeSlots')}</p>
              )}
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                disabled={busy}
                onClick={(ev) => create(ev as unknown as FormEvent, true)}
              >
                {label('sch_forceBook')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'diary' ? (
        <>
          <div className="panel sched-week-panel">
            <div className="sched-week-head">
              <div>
                <div className="eyebrow">{label('sch_sevenDay')}</div>
                <h2>{weekLabel}</h2>
              </div>
              <div className="sched-week-nav">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAnchor(addDays(weekStart(anchor), -7))}
                >
                  {label('previous')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAnchor(startOfDay(new Date()))}
                >
                  {label('sch_today')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAnchor(addDays(weekStart(anchor), 7))}
                >
                  {label('next')}
                </button>
              </div>
            </div>
            <div className="sched-week">
              {byDay.map(({ day, items }) => {
                const isToday = sameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className={`sched-day ${isToday ? 'today' : ''}`}>
                    <div className="sched-day-head">
                      <strong>{fmtWeekday(day, locale)}</strong>
                      <span>{fmtDayLabel(day, locale)}</span>
                    </div>
                    <div className="sched-day-count">
                      {items.length === 1
                        ? label('sch_oneBooking')
                        : tf(lang, 'sch_nBookings', { n: items.length })}
                    </div>
                    {items.length === 0 ? (
                      <p className="muted tiny">{label('sch_noEngagements')}</p>
                    ) : (
                      <ul className="sched-day-list">
                        {items.map((e) => (
                          <li key={`${e.source}-${e.id}`}>
                            <button type="button" onClick={() => setSelected(e)}>
                              <strong>{fmtTime(e.startAt, locale)}</strong>
                              <span>{e.title}</span>
                              <em>
                                {kindLabel(e.kind, label)} · {e.location}
                              </em>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sched-split">
            <div className="panel">
              <div className="eyebrow">{label('sch_upcoming')}</div>
              <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
                {label('sch_chrono')}
              </h2>
              {upcoming.length === 0 ? (
                <p className="muted">{label('sch_noUpcoming')}</p>
              ) : (
                <ul className="sched-upcoming">
                  {upcoming.map((e) => (
                    <li key={`${e.source}-${e.id}`}>
                      <div>
                        <strong>{e.title}</strong>
                        <div className="muted">
                          {fmtRange(e.startAt, e.endAt, locale)} · {e.location}
                        </div>
                      </div>
                      <div className="sched-upcoming-right">
                        <span className="sched-confirmed">{enumLabel(lang, e.status)}</span>
                        <button type="button" className="btn" onClick={() => setSelected(e)}>
                          {label('view')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel sched-brief-panel" ref={briefRef}>
              <div className="eyebrow">{label('sch_dailyBriefing')}</div>
              <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
                {label('sch_tomorrow')}
              </h2>
              <p className="muted tiny">{fmtDayLabel(tomorrow, locale)}</p>
              {tomorrowItems.length === 0 ? (
                <p className="muted">{label('sch_noTomorrow')}</p>
              ) : (
                <ul className="sched-brief-list">
                  {tomorrowItems.map((e) => (
                    <li key={`${e.source}-${e.id}`}>
                      <strong>{fmtTime(e.startAt, locale)}</strong>
                      <span>{e.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sched-brief-kpis">
                <div>
                  <span>{label('overview_directionsOpen')}</span>
                  <strong>{openDirections}</strong>
                </div>
                <div>
                  <span>{label('sch_requestsAwaiting')}</span>
                  <strong>{pendingMeetings}</strong>
                </div>
              </div>
              <Link href="/meetings" className="btn" style={{ marginTop: 12 }}>
                {label('sch_openMeetingsDesk')}
              </Link>
            </div>
          </div>

          <div className="panel">
            <button
              type="button"
              className="sched-changes-toggle"
              onClick={() => setShowChanges((v) => !v)}
            >
              <span>{label('sch_recentChanges')} · {recentChanges.length}</span>
              <span aria-hidden>{showChanges ? '▴' : '▾'}</span>
            </button>
            {showChanges ? (
              <ul className="sched-changes">
                {recentChanges.length === 0 ? (
                  <li className="muted">{label('sch_noChanges')}</li>
                ) : (
                  recentChanges.map((c) => (
                    <li key={c.id}>
                      <strong>{c.text}</strong>
                      <span className="muted">
                        {new Date(c.when).toLocaleString(locale, {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </>
      ) : (
        <div className="panel">
          <div className="eyebrow">{label('sch_tabTours')}</div>
          <h2 style={{ marginTop: 4, fontFamily: 'var(--font-display)', color: 'var(--pine)' }}>
            {label('sch_planned')}
          </h2>
          <ul className="sched-tours">
            {TOURS.map((t) => (
              <li key={t.id}>
                <strong>{label(`sch_${t.id.replace('-', '')}_title`)}</strong>
                <div className="muted">
                  {label(`sch_${t.id.replace('-', '')}_when`)} ·{' '}
                  {label(`sch_${t.id.replace('-', '')}_place`)}
                </div>
                <p>{label(`sch_${t.id.replace('-', '')}_note`)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected ? (
        <div className="meet-drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="meet-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="meet-section-head">
              <div>
                <div className="eyebrow">{kindLabel(selected.kind, label)}</div>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setSelected(null)}>
                {label('close')}
              </button>
            </div>
            <div className="meet-detail-grid">
              <div>
                <span>{label('sch_when')}</span>
                <strong>{fmtRange(selected.startAt, selected.endAt, locale)}</strong>
              </div>
              <div>
                <span>{label('mtg_location')}</span>
                <strong>{selected.location}</strong>
              </div>
              <div>
                <span>{label('status')}</span>
                <strong>{enumLabel(lang, selected.status)}</strong>
              </div>
              <div>
                <span>{label('sch_source')}</span>
                <strong>{selected.source === 'meeting' ? label('sch_srcMeetings') : label('sch_srcDiary')}</strong>
              </div>
            </div>
            {selected.source === 'meeting' ? (
              <Link href="/meetings" className="btn primary">
                {label('sch_openInMeetings')}
              </Link>
            ) : null}
          </aside>
        </div>
      ) : null}

    </>
  );
}
