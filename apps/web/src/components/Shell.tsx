'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_GROUPS } from '@gow/shared';
import { useAuth } from './AuthProvider';
import { pageTitle } from '@/lib/i18n';
import { roleAvatar } from '@/lib/avatars';
import { api, saveUser } from '@/lib/api';

const ICONS: Record<string, string> = {
  overview: '◈',
  inbox: '✉',
  messages: '💬',
  files: '▤',
  registry: '📮',
  vault: '🔒',
  movement: '⇄',
  directions: '◎',
  calls: '☎',
  remote: '✍',
  meetings: '📅',
  schedule: '▦',
  speeches: '🎤',
  press: '📰',
  greetings: '✿',
  search: '⌕',
  extensions: '▤',
  people: '☺',
  audit: '☰',
  ai: '✦',
  guide: '?',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, nav, logout, label, lang, setLang, refreshMe } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const page = pathname.split('/')[1] || 'overview';
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const mfaRequired = process.env.NEXT_PUBLIC_MFA_REQUIRED !== 'false';

  useEffect(() => {
    if (!user && pathname !== '/login') router.replace('/login');
  }, [user, pathname, router]);

  useEffect(() => {
    if (!user || (mfaRequired && !user.mfaEnabled)) return;
    let alive = true;
    const tick = () => {
      api<{ count: number }>('/inbox/unread-count')
        .then((r) => { if (alive) setInboxUnread(r.count || 0); })
        .catch(() => undefined);
      api<{ unread?: number }[]>('/messages/conversations')
        .then((rows) => {
          if (!alive) return;
          setMsgUnread(rows.reduce((s, c) => s + Number(c.unread || 0), 0));
        })
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [user, mfaRequired, pathname]);

  useEffect(() => {
    if (!user || !mfaRequired || user.mfaEnabled || mfaQr) return;
    api<{ qr: string }>('/auth/mfa/setup', { method: 'POST' })
      .then((s) => setMfaQr(s.qr))
      .catch(() => setMfaError('Unable to start MFA enrollment'));
  }, [user, mfaRequired, mfaQr]);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map(([groupLabel, items]) => [
        groupLabel,
        items.filter((item) => nav.includes(item)),
      ] as [string, string[]]).filter(([, items]) => items.length > 0),
    [nav],
  );

  if (!user) return null;

  async function confirmMfa(e: FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
    setMfaError('');
    try {
      await api('/auth/mfa/confirm', { method: 'POST', json: { code: mfaCode } });
      saveUser({ ...user!, mfaEnabled: true });
      await refreshMe();
      setMfaQr(null);
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'MFA failed');
    } finally {
      setMfaBusy(false);
    }
  }

  if (mfaRequired && !user.mfaEnabled) {
    return (
      <div className="login-page">
        <section className="login-left">
          <div>
            <div className="kicker">{label('kicker')}</div>
            <h1>MFA required</h1>
            <p>Complete authenticator enrollment before using the workspace.</p>
          </div>
        </section>
        <section className="login-right">
          <div className="login-box">
            <form className="grid-form" onSubmit={confirmMfa}>
              <h2>Enable authenticator</h2>
              {mfaQr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mfaQr} alt="MFA QR" style={{ width: 200, margin: '0 auto', display: 'block' }} />
              )}
              <div className="field">
                <label>Confirmation code</label>
                <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required />
              </div>
              {mfaError && <div className="error">{mfaError}</div>}
              <button className="btn primary" type="submit" disabled={mfaBusy || !mfaQr}>
                Confirm MFA
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => logout().then(() => router.push('/login'))}
              >
                {label('logout')}
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  const title = pageTitle(lang, page, user.role);
  const avatar = roleAvatar(user.role);
  const today = new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">§</div>
          <div>
            <strong>Workflow</strong>
            <span>{label('brandSub')}</span>
          </div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {groups.map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <div className="nav-group">{groupLabel}</div>
              {items.map((item) => (
                <Link
                  key={item}
                  href={`/${item}`}
                  className={pathname === `/${item}` || pathname.startsWith(`/${item}/`) ? 'active' : ''}
                >
                  <span className="nav-icon">{ICONS[item] || '·'}</span>
                  <span className="nav-label">
                    {pageTitle(lang, item, user.role)}
                    {item === 'inbox' && inboxUnread > 0 && (
                      <span className="nav-badge">{inboxUnread > 99 ? '99+' : inboxUnread}</span>
                    )}
                    {item === 'messages' && msgUnread > 0 && (
                      <span className="nav-badge">{msgUnread > 99 ? '99+' : msgUnread}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ))}
          <div className="nav-group">{label('help')}</div>
          <Link href="/guide" className={pathname === '/guide' ? 'active' : ''}>
            <span className="nav-icon">{ICONS.guide}</span>
            {label('guide')}
          </Link>
        </nav>
        <div className="side-bottom">
          <div className="role-card">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={user.displayName} className="role-avatar-img" />
            ) : (
              <div className="avatar">{initials(user.displayName)}</div>
            )}
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.role.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <button
            type="button"
            className="language-toggle"
            onClick={() => setLang(lang === 'en' ? 'ur' : 'en')}
          >
            {lang === 'ur' ? 'English' : 'اردو'}
          </button>
          <button
            type="button"
            className="language-toggle"
            onClick={() => logout().then(() => router.push('/login'))}
          >
            ⇄ {label('logout')}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb">
            {label('workspace')} / <strong>{title}</strong>
          </div>
          <div className="topright">
            <button
              type="button"
              className="topbar-search-trigger"
              onClick={() => router.push('/search')}
            >
              <span>⌕</span>
              <span className="search-trigger-text">{label('searchHint')}</span>
              <kbd className="search-trigger-kbd">⌘K</kbd>
            </button>
            <div className="topbar-user">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={user.displayName} />
              ) : (
                <span className="dot">{initials(user.displayName)}</span>
              )}
              <span>{user.displayName}</span>
            </div>
            <Link href="/inbox" className="notification-button">✉</Link>
            <span className="live-pill">{label('livePill')}</span>
            <span className="top-date">{today}</span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
