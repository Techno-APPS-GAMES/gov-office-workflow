'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ROLE_META, type Role } from '@gow/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { useLiveRefresh, notifyDataChanged } from '@/lib/live-refresh';
import { roleBlurb as roleBlurbL, roleTitle as roleTitleL, tf } from '@/lib/i18n';

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



export default function PeoplePage() {
  const { user, label, lang } = useAuth();
  const roleTitle = (r: string) =>
    lang === 'ur'
      ? roleTitleL(lang, r)
      : ROLE_META[r as Role]?.title || r.replace(/_/g, ' ');
  const roleBlurb = (r: string) =>
    lang === 'ur'
      ? roleBlurbL(lang, r) || ROLE_META[r as Role]?.blurb || ''
      : ROLE_META[r as Role]?.blurb || '';
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
  }, [people, q, roleFilter, showInactive, lang]);

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
      toast.success(label('ppl_toastCreated'));
      setForm(emptyForm);
      setShowCreate(false);
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('createFailed'));
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
      toast.success(label('ppl_toastProfile'));
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('prs_updateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusy(true);
    try {
      await api(`/users/${id}`, { method: 'PATCH', json: { active } });
      toast.success(active ? label('ppl_toastActivated') : label('ppl_toastDeactivated'));
      notifyDataChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('prs_updateFailed'));
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
        toast.success(res.message || label('ppl_toastStub'));
      } else {
        toast.success(res.message || tf(lang, 'ppl_toastImported', { n: res.imported ?? 0 }));
        notifyDataChanged();
        await load();
      }
      const st = await api<LdapStatus>('/ldap/status').catch(() => null);
      setLdap(st);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('ppl_syncFailed'));
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
            {label('ppl_eyebrowDirectory')}
          </div>
          <h1>{label('people')}</h1>
          <p className="muted">
            {label('ppl_heroSub')}
          </p>
        </div>
        {isAdmin ? (
          <button type="button" className="btn primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? label('mtg_closeForm') : label('ppl_create')}
          </button>
        ) : null}
      </div>

      <div className="work-kpi-row">
        <div className="work-kpi">
          <strong>{kpis.total}</strong>
          <span className="muted">{label('ppl_kpiAccounts')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.active}</strong>
          <span className="muted">{label('active')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.mfa}</strong>
          <span className="muted">{label('ppl_kpiMfa')}</span>
        </div>
        <div className="work-kpi">
          <strong>{kpis.ldapLinked}</strong>
          <span className="muted">{label('ppl_kpiLdap')}</span>
        </div>
      </div>

      <div className="panel people-search" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={label('ppl_searchPh')}
          aria-label={label('ppl_searchAria')}
          style={{ flex: 1, minWidth: 200 }}
        />
        <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {label('ppl_showInactive')}
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
            {label(`ppl_rf_${f.key}`)}
          </button>
        ))}
      </div>

      {showCreate && isAdmin ? (
        <div className="panel">
          <h2>{label('ppl_createTitle')}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {label('ppl_pwPolicy')}
          </p>
          <form className="grid-form" onSubmit={create}>
            <label>
              {label('username')}
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                minLength={3}
                pattern="[A-Za-z0-9._\-]+"
              />
            </label>
            <label>
              {label('ppl_displayName')}
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </label>
            <label>
              {label('ppl_email')}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              {label('ppl_tempPassword')}
              <input
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label>
              {label('ppl_role')}
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
              {label('ppl_createAccount')}
            </button>
          </form>
        </div>
      ) : null}

      {editing && isAdmin ? (
        <div className="panel remote-preview-panel">
          <div className="eyebrow">{label('ppl_editAccount')}</div>
          <h2>
            {editing.username} · {roleTitle(editing.role)}
          </h2>
          <form className="grid-form" onSubmit={saveEdit}>
            <label>
              {label('ppl_displayName')}
              <input
                value={edit.displayName}
                onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                required
              />
            </label>
            <label>
              {label('ppl_email')}
              <input
                type="email"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                required
              />
            </label>
            <label>
              {label('ppl_role')}
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
                {label('save')}
              </button>
              {editing.active !== false ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || editing.id === user?.id}
                  onClick={() => setActive(editing.id, false)}
                >
                  {label('ppl_deactivate')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setActive(editing.id, true)}
                >
                  {label('ppl_activate')}
                </button>
              )}
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                {label('close')}
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
                {p.active === false ? ` · ${label('ppl_inactive')}` : ''}
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
                    {label('ppl_message')}
                  </Link>
                ) : null}
                {isAdmin ? (
                  <button type="button" className="btn" onClick={() => setEditId(p.id)}>
                    {label('ppl_manage')}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          {label('ppl_noMatch')}
        </p>
      ) : null}

      <div className="people-disclaimer">
        {label('ppl_disclaimer')}
      </div>

      {isAdmin && ldap ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="eyebrow">{label('ppl_connector')} · {label('ppl_tier')} {ldap.tier || 'B'}</div>
          <h2>{label('ppl_ldapTitle')}</h2>
          <p className="muted">{ldap.message}</p>
          <div className="work-filters" style={{ marginBottom: 12 }}>
            <span className={`work-status ${ldap.mode === 'stub' ? 'draft' : ldap.ready ? 'ok' : 'warn'}`}>
              {label('ppl_mode')}: {ldap.mode}
            </span>
            <span className="muted tiny">
              {ldap.enabled ? `${label('ppl_urlSet')}: ${ldap.url ? label('yes') : label('no')}` : 'LDAP_ENABLED=false'}
            </span>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={runLdapSync}>
            {ldap.enabled ? label('ppl_syncAd') : label('ppl_testSync')}
          </button>
        </div>
      ) : null}
    </>
  );
}
