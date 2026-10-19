'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, ROLE_META } from '@gow/shared';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { roleAvatar } from '@/lib/avatars';

const PICKABLE: Role[] = [
  Role.SPEAKER,
  Role.SECRETARY_GENERAL,
  Role.SPECIAL_SECRETARY,
  Role.DG_IT,
];

function LoginForm() {
  const { login, label, user, refreshMe } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>(Role.SPEAKER);
  const [username, setUsername] = useState(ROLE_META[Role.SPEAKER].usernameHint);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !mfaQr) {
    router.replace('/overview');
  }

  function pickRole(r: Role) {
    setRole(r);
    setUsername(ROLE_META[r].usernameHint);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login(username, password);
      if (res.mfaSetupRequired) {
        const setup = await api<{ qr: string }>('/auth/mfa/setup', { method: 'POST' });
        setMfaQr(setup.qr);
      } else {
        router.replace('/overview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
      setError(err instanceof Error ? err.message : 'MFA failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-left">
        <div>
          <div className="kicker">{label('kicker')}</div>
          <h1>{label('appName')}</h1>
          <p>{label('tagline')}</p>
        </div>
        <div className="login-foot">Private on-prem deployment · Real accounts · MFA required</div>
      </section>
      <section className="login-right">
        <div className="login-box">
          {mfaQr ? (
            <form className="grid-form" onSubmit={confirmMfa}>
              <h2>Enable authenticator</h2>
              <p>Scan this QR, then enter a 6-digit code to finish MFA enrollment.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mfaQr} alt="MFA QR" style={{ width: 200, margin: '0 auto', display: 'block' }} />
              <div className="field">
                <label>Confirmation code</label>
                <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn primary" type="submit" disabled={busy}>Confirm MFA</button>
            </form>
          ) : (
            <form onSubmit={onSubmit}>
              <h2>{label('chooseRole')}</h2>
              <p>{label('chooseRoleHelp')}</p>
              <div className="role-grid">
                {PICKABLE.map((r) => {
                  const meta = ROLE_META[r];
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
                        alt={meta.title}
                        className="role-option-avatar"
                      />
                      <span className="role-option-body">
                        <strong>{meta.title}</strong>
                        <span>{meta.blurb}</span>
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
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
