'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';

type Person = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: string;
  mfaEnabled?: boolean;
  active?: boolean;
};

const DEMO_ORDER: Role[] = [
  'SPEAKER',
  'SECRETARY_GENERAL',
  'SPECIAL_SECRETARY',
  'DG_IT',
];

const MESSAGEABLE = new Set<string>(['SECRETARY_GENERAL', 'SPECIAL_SECRETARY']);

function roleTitle(role: string) {
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function roleBlurb(role: string) {
  return ROLE_META[role as Role]?.blurb || '';
}

export default function PeoplePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [ldap, setLdap] = useState<unknown>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
    role: 'SPECIAL_SECRETARY',
  });

  async function load() {
    setPeople(await api<Person[]>('/users'));
  }

  useEffect(() => {
    load().catch(() => setPeople([]));
    if (user?.role === 'DG_IT' || user?.role === 'ADMIN') {
      api('/ldap/status').then(setLdap).catch(() => undefined);
    }
  }, [user]);

  const directory = useMemo(() => {
    const byRole = new Map(people.map((p) => [p.role, p]));
    const cards = DEMO_ORDER.map((role) => {
      const p = byRole.get(role);
      return {
        role,
        id: p?.id || role,
        displayName: p?.displayName || `${roleTitle(role)} (demo)`,
        username: p?.username || ROLE_META[role].usernameHint,
        active: p?.active !== false,
        real: !!p,
      };
    });
    const needle = applied.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter(
      (c) =>
        c.displayName.toLowerCase().includes(needle) ||
        roleTitle(c.role).toLowerCase().includes(needle) ||
        c.username.toLowerCase().includes(needle) ||
        roleBlurb(c.role).toLowerCase().includes(needle),
    );
  }, [people, applied]);

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied(q);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', json: form });
      setMsg('User created');
      toast.success('User created');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'DG_IT';

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Staff directory</h1>
          <p className="muted">
            The four demo roles, their responsibilities and permitted office contacts.
          </p>
        </div>
      </div>

      <form className="panel people-search" onSubmit={search}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search role or staff title"
          aria-label="Search role or staff title"
        />
        <button type="submit" className="btn primary">
          Search directory
        </button>
      </form>

      <div className="people-grid">
        {directory.map((p) => {
          const src = roleAvatar(p.role);
          const canMessage =
            MESSAGEABLE.has(p.role) && p.real && p.id !== user?.id;
          return (
            <article key={p.role} className="people-card">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="people-photo" />
              ) : (
                <div className="people-photo fallback">{p.displayName.slice(0, 1)}</div>
              )}
              <div className="people-role">{roleTitle(p.role)}</div>
              <h2>{p.displayName}</h2>
              <p>{roleBlurb(p.role)}</p>
              {canMessage ? (
                <Link href={`/messages?to=${p.id}`} className="btn people-msg-btn">
                  Write office message
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>

      {directory.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          No roles match “{applied}”.
        </p>
      ) : null}

      <div className="people-disclaimer">
        Profiles are synthetic. Availability and workload are not inferred from this demo.
      </div>

      {isAdmin ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowAdmin((v) => !v)}
          >
            {showAdmin ? 'Hide' : 'Show'} directory administration
          </button>
          {showAdmin ? (
            <div className="people-admin">
              <h2>Create user</h2>
              <form className="grid-form" onSubmit={create}>
                <label>
                  Username
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Display name
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    minLength={12}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Role
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="SPEAKER">SPEAKER</option>
                    <option value="SECRETARY_GENERAL">SECRETARY_GENERAL</option>
                    <option value="SPECIAL_SECRETARY">SPECIAL_SECRETARY</option>
                    <option value="DG_IT">DG_IT</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </label>
                {msg ? <div className="ok">{msg}</div> : null}
                <button type="submit" className="btn primary">
                  Create
                </button>
              </form>
              <h2 style={{ marginTop: 18 }}>LDAP / AD</h2>
              <pre style={{ margin: 0 }}>{JSON.stringify(ldap, null, 2)}</pre>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() =>
                  api('/ldap/sync', { method: 'POST' })
                    .then((r) => {
                      setMsg(JSON.stringify(r));
                      toast.success('LDAP sync requested');
                    })
                    .catch((err) =>
                      toast.error(err instanceof Error ? err.message : 'Sync failed'),
                    )
                }
              >
                Sync directory
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
