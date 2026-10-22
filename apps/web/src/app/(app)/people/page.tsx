'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';

type Person = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: string;
  mfaEnabled?: boolean;
  active?: boolean;
  ldapDn?: string | null;
  createdAt?: string;
};

type LdapStatus = {
  mode: string;
  enabled: boolean;
  ready: boolean;
  url?: string | null;
  searchBase?: string | null;
  bindDnSet?: boolean;
  message: string;
  tier?: string;
};

const ROLE_FILTERS: { key: 'ALL' | Role; label: string }[] = [
  { key: 'ALL', label: 'All roles' },
  { key: 'SPEAKER', label: 'Speaker' },
  { key: 'SECRETARY_GENERAL', label: 'Sec Gen' },
  { key: 'SPECIAL_SECRETARY', label: 'Spec Sec' },
  { key: 'DG_IT', label: 'DG IT' },
  { key: 'ADMIN', label: 'Admin' },
];

const emptyForm = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  role: 'SPECIAL_SECRETARY' as Role,
};

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
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [ldap, setLdap] = useState<LdapStatus | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [edit, setEdit] = useState({ displayName: '', email: '', role: 'SPECIAL_SECRETARY' as Role });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'DG_IT';

  const load = useCallback(async () => {
    const rows = await api<Person[]>('/users');
    setPeople(rows);
    if (user?.role === 'DG_IT' || user?.role === 'ADMIN') {
      const st = await api<LdapStatus>('/ldap/status').catch(() => null);
      setLdap(st);
    }
  }, [user?.role]);

  useLiveRefresh(load, [user?.role]);

  useEffect(() => {
    load().catch(() => setPeople([]));
  }, [load]);

  useEffect(() => {
    try {
      const focus = new URLSearchParams(window.location.search).get('focus');
      if (focus) setEditId(focus);
    } catch {
      /* ignore */
    }
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => {
      if (!showInactive && p.active === false) return false;
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        p.displayName.toLowerCase().includes(needle) ||
        p.username.toLowerCase().includes(needle) ||
        (p.email || '').toLowerCase().includes(needle) ||
        roleTitle(p.role).toLowerCase().includes(needle) ||
        roleBlurb(p.role).toLowerCase().includes(needle)
      );
    });
  }, [people, q, roleFilter, showInactive]);

  const editing = useMemo(
    () => people.find((p) => p.id === editId) || null,
    [people, editId],
  );

  useEffect(() => {
    if (!editing) return;
    setEdit({
      displayName: editing.displayName,
      email: editing.email || '',
      role: editing.role as Role,
    });
  }, [editing]);

  const kpis = useMemo(() => {
    const active = people.filter((p) => p.active !== false).length;
    const mfa = people.filter((p) => p.mfaEnabled).length;
    const ldapLinked = people.filter((p) => p.ldapDn).length;
    return { total: people.length, active, mfa, ldapLinked };
  }, [people]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/users', { method: 'POST', json: form });
      toast.success('User created');
      setForm(emptyForm);
      setShowCreate(false);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setBusy(true);
    try {
      await api(`/users/${editId}`, {
        method: 'PATCH',
        json: {
          displayName: edit.displayName.trim(),
          email: edit.email.trim(),
          role: edit.role,
        },
      });
      toast.success('Profile updated');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusy(true);
    try {
      await api(`/users/${id}`, { method: 'PATCH', json: { active } });
      toast.success(active ? 'User activated' : 'User deactivated');
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function runLdapSync() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; stub?: boolean; message?: string; imported?: number }>(
        '/ldap/sync',
        { method: 'POST' },
      );
      if (res.stub || !res.ok) {
        toast.success(res.message || 'LDAP stub — local directory only');
      } else {
        toast.success(res.message || `Imported ${res.imported ?? 0}`);
        notifyDataChanged();
        await load();
      }
      const st = await api<LdapStatus>('/ldap/status').catch(() => null);
      setLdap(st);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · DIRECTORY
          </div>
          <h1>Staff directory</h1>
          <p className="muted">
            Local office accounts, roles and contacts. Live Active Directory / SSO remains Tier B
            (LDAP stub available for Admin / DG IT).
          </p>
        </div>
        {isAdmin ? (
          <button type="button" className="btn primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Close form' : '+ Create user'}
          </button>
        ) : null}
      </div>

      <div className="work-kpi-row">
        <div className="work-kpi">
          <strong>{kpis.total}</strong>
          <span className="muted">Accounts</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.active}</strong>
          <span className="muted">Active</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.mfa}</strong>
          <span className="muted">MFA enabled</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.ldapLinked}</strong>
          <span className="muted">LDAP-linked</span>
        </div>
      </div>

      <div className="panel people-search" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, username, email or role"
          aria-label="Search directory"
          style={{ flex: 1, minWidth: 200 }}
        />
        <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <div className="work-filters">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={roleFilter === f.key ? 'active' : ''}
            onClick={() => setRoleFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showCreate && isAdmin ? (
        <div className="panel">
          <h2>Create local user</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Password policy: 12+ chars with upper, lower, digit and special (unless demo weak passwords).
          </p>
          <form className="grid-form" onSubmit={create}>
            <label>
              Username
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                minLength={3}
                pattern="[A-Za-z0-9._\-]+"
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
              Temporary password
              <input
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {(Object.keys(ROLE_META) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {roleTitle(r)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Create account
            </button>
          </form>
        </div>
      ) : null}

      {editing && isAdmin ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">Edit account</div>
          <h2>
            {editing.username} · {roleTitle(editing.role)}
          </h2>
          <form className="grid-form" onSubmit={saveEdit}>
            <label>
              Display name
              <input
                value={edit.displayName}
                onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}
              >
                {(Object.keys(ROLE_META) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {roleTitle(r)}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={busy}>
                Save
              </button>
              {editing.active !== false ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || editing.id === user?.id}
                  onClick={() => setActive(editing.id, false)}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setActive(editing.id, true)}
                >
                  Activate
                </button>
              )}
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="people-grid">
        {visible.map((p) => {
          const src = roleAvatar(p.role);
          const canMessage = p.id !== user?.id && p.active !== false;
          return (
            <article
              key={p.id}
              id={`person-${p.id}`}
              className={`people-card${editId === p.id ? ' focus' : ''}${p.active === false ? ' inactive' : ''}`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="people-photo" />
              ) : (
                <div className="people-photo fallback">{p.displayName.slice(0, 1)}</div>
              )}
              <div className="people-role">
                {roleTitle(p.role)}
                {p.active === false ? ' · Inactive' : ''}
                {p.mfaEnabled ? ' · MFA' : ''}
              </div>
              <h2>{p.displayName}</h2>
              <p>{roleBlurb(p.role)}</p>
              <p className="muted tiny">
                @{p.username}
                {p.email ? ` · ${p.email}` : ''}
                {p.ldapDn ? ' · LDAP' : ''}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {canMessage ? (
                  <Link href={`/messages?to=${p.id}`} className="btn people-msg-btn">
                    Message
                  </Link>
                ) : null}
                {isAdmin ? (
                  <button type="button" className="btn" onClick={() => setEditId(p.id)}>
                    Manage
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          No staff match this filter.
        </p>
      ) : null}

      <div className="people-disclaimer">
        Local directory is authoritative for this pilot. Availability is not inferred from workload.
      </div>

      {isAdmin && ldap ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="eyebrow">Directory connector · Tier {ldap.tier || 'B'}</div>
          <h2>LDAP / Active Directory</h2>
          <p className="muted">{ldap.message}</p>
          <div className="work-filters" style={{ marginBottom: 12 }}>
            <span className={`work-status ${ldap.mode === 'stub' ? 'draft' : ldap.ready ? 'ok' : 'warn'}`}>
              Mode: {ldap.mode}
            </span>
            <span className="muted tiny">
              {ldap.enabled ? `URL set: ${ldap.url ? 'yes' : 'no'}` : 'LDAP_ENABLED=false'}
            </span>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={runLdapSync}>
            {ldap.enabled ? 'Sync directory from AD' : 'Test sync (stub)'}
          </button>
        </div>
      ) : null}
    </>
  );
}
