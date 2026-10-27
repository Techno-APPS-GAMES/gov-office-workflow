'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, ROLE_META } from '@gow/shared';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { roleAvatar } from '@/lib/avatars';
import { roleBlurb, roleTitle } from '@/lib/i18n';

const PICKABLE: Role[] = [
  Role.SPEAKER,
  Role.SECRETARY_GENERAL,
  Role.SPECIAL_SECRETARY,
  Role.DG_IT,
];

function LoginForm() {
  const { login, label, lang, setLang, user, refreshMe } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>(Role.SPEAKER);
  const [username, setUsername] = useState(ROLE_META[Role.SPEAKER].usernameHint);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);

  useEffect(() => {
    if (user && !mfaQr) {
      router.replace('/overview');
    }
  }, [user, mfaQr, router]);

  function pickRole(r: Role) {
    setRole(r);
    setUsername(ROLE_META[r].usernameHint);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login(username, password, totpCode.trim() || undefined);
      setNeedsTotp(false);
      if (res.mfaSetupRequired) {
        const setup = await api<{ qr: string }>('/auth/mfa/setup', { method: 'POST' });
        setMfaQr(setup.qr);
      } else {
        router.replace('/overview');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : label('loginFailed');
      if (/MFA code required/i.test(msg)) {
        setNeedsTotp(true);
        setError(label('totp'));
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmMfa(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/mfa/confirm', { method: 'POST', json: { code: mfaCode } });
      await refreshMe();
      setMfaQr(null);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : label('mfaFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-left">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/na-emblem-v4.png" alt="National Assembly Secretariat" className="login-emblem" />
          <div className="kicker">{label('kicker')}</div>
          <h1>{label('appName')}</h1>
          <p>{label('tagline')}</p>
        </div>
        <div className="login-foot">
          {label('loginFoot')}
          {process.env.NEXT_PUBLIC_MFA_REQUIRED !== 'false'
            ? label('loginFootMfaOn')
            : label('loginFootMfaOff')}
        </div>
      </section>
      <section className="login-right">
        <div className="login-box">
          <div className="login-lang" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={lang === 'ur' ? 'active' : ''}
              onClick={() => setLang('ur')}
            >
              اردو
            </button>
          </div>
          {mfaQr ? (
            <form className="grid-form" onSubmit={confirmMfa}>
              <h2>{label('mfaEnableTitle')}</h2>
              <p>{label('mfaEnableHelp')}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mfaQr} alt="MFA QR" style={{ width: 200, margin: '0 auto', display: 'block' }} />
              <div className="field">
                <label>{label('mfaConfirmCode')}</label>
                <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn primary" type="submit" disabled={busy}>{label('mfaConfirm')}</button>
            </form>
          ) : (
            <form onSubmit={onSubmit}>
              <h2>{label('chooseRole')}</h2>
              <p>{label('chooseRoleHelp')}</p>
              <div className="role-grid">
                {PICKABLE.map((r) => {
                  const meta = ROLE_META[r];
                  const title = roleTitle(lang, r);
                  const blurb = roleBlurb(lang, r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`role-option ${role === r ? 'selected' : ''}`}
                      onClick={() => pickRole(r)}
                      aria-pressed={role === r}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={roleAvatar(r) || ''}
                        alt={title}
                        className="role-option-avatar"
                      />
                      <span className="role-option-body">
                        <strong>{title}</strong>
                        <span>{blurb || meta.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="field">
                <label>{label('username')}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="field">
                <label>{label('password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
              </div>
              <div className="field">
                <label>{label('totp')}</label>
                <input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  required={needsTotp}
                />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn primary" type="submit" disabled={busy}>
                {label('enterWorkspace')}
              </button>
              <div className="login-note">{label('loginNote')}</div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
