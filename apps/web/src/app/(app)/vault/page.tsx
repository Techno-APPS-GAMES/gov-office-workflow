'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';
import { enumLabel, tf } from '@/lib/i18n';

type VaultMatter = {
  id: string;
  diaryNo: string;
  subject: string;
  status: string;
  holder?: { displayName: string; role?: string } | null;
  vaultGrants?: { expiresAt: string }[];
};

type VaultEvent = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  actor?: { displayName: string } | null;
};

type Ledger = {
  valid: boolean;
  count: number;
  unlockedSessions: number;
  ttlMinutes: number;
  cipher: string;
  kdf: string;
  iterations: number;
  saltBytes: number;
};

export default function VaultPage() {
  const { user, lang, label } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<VaultMatter[]>([]);
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [matters, ev, verify] = await Promise.all([
      api<VaultMatter[]>('/vault'),
      api<VaultEvent[]>('/vault/events').catch(() => [] as VaultEvent[]),
      api<Ledger>('/vault/verify').catch(() => null),
    ]);
    setItems(matters);
    setEvents(ev);
    setLedger(verify);
  }, []);

  useEffect(() => {
    load().catch(() => {
      setItems([]);
      setEvents([]);
    });
  }, [load]);

  useLiveRefresh(load, [load]);

  const stats = useMemo(() => {
    const unlocked = items.filter((m) => (m.vaultGrants?.length || 0) > 0).length;
    return {
      total: items.length,
      locked: items.length - unlocked,
      unlocked,
      events: events.length,
    };
  }, [items, events]);

  const ttl = ledger?.ttlMinutes ?? 30;

  async function unlock(e: FormEvent, matterId: string) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/vault/${matterId}/unlock`, {
        method: 'POST',
        json: { password },
      });
      toast.success(label('files_unlocked'));
      setUnlockId(null);
      setPassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_unlockFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function lock(matterId: string) {
    try {
      await api(`/vault/${matterId}/lock`, { method: 'POST' });
      toast.success(label('vt_toastLocked'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('vt_lockFailed'));
    }
  }

  async function verifyLedger() {
    setBusy(true);
    try {
      const v = await api<Ledger>('/vault/verify');
      setLedger(v);
      toast.success(v.valid ? label('vt_ledgerOk') : label('vt_ledgerBad'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('vt_verifyFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? label('cm_speakerOffice') : label('cm_officeWorkflow')} ·{' '}
            {label('cm_conceptDemo')}
          </div>
          <h1>{label('vt_title')}</h1>
          <p className="muted">{label('vt_heroBody')}</p>
        </div>
        <button type="button" className="btn primary" onClick={verifyLedger} disabled={busy}>
          {label('vt_verifyLedger')}
        </button>
      </div>

      <div className="vault-crypto-banner">
        <div className="vault-crypto-top">
          <div>
            <div className="vault-crypto-kicker">{label('vt_kicker')}</div>
            <h2>{label('vt_bannerTitle')}</h2>
            <p>{label('vt_bannerBody')}</p>
          </div>
          <span className="vault-aes-badge">{label('vt_aesBadge')}</span>
        </div>
        <div className="vault-crypto-grid">
          <div>
            <span>{label('vt_kdf')}</span>
            <strong>{label('vt_kdfVal')}</strong>
          </div>
          <div>
            <span>{label('vt_cipher')}</span>
            <strong>{label('vt_cipherVal')}</strong>
          </div>
          <div>
            <span>{label('vt_salt')}</span>
            <strong>{label('vt_saltVal')}</strong>
          </div>
          <div>
            <span>{label('vt_sessions')}</span>
            <strong>
              {tf(lang, 'vt_filesUnlocked', { n: ledger?.unlockedSessions ?? stats.unlocked })}
            </strong>
          </div>
          <div>
            <span>{label('vt_autolock')}</span>
            <strong>{tf(lang, 'vt_inactivity', { n: ttl })}</strong>
          </div>
          <div>
            <span>{label('vt_integrity')}</span>
            <strong className={ledger?.valid === false ? 'bad' : 'ok-text'}>
              {ledger?.valid === false ? label('vt_integrityFail') : label('vt_integrityOk')}
            </strong>
          </div>
        </div>
      </div>

      <div className="vault-stat-row">
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.total}</div>
          <div className="vault-stat-label">{label('vt_totalConf')}</div>
          <div className="muted">{label('vt_safeCustody')}</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.locked}</div>
          <div className="vault-stat-label">{label('vt_lockedVault')}</div>
          <div className="muted">{label('vt_requiresPw')}</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.unlocked}</div>
          <div className="vault-stat-label">{label('vt_currentlyUnlocked')}</div>
          <div className="muted">{label('vt_activeSession')}</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.events}</div>
          <div className="vault-stat-label">{label('vt_auditEvents')}</div>
          <div className="muted">{label('vt_securityLogs')}</div>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">{label('vt_inventoryEyebrow')}</div>
        <h2 style={{ marginTop: 4 }}>{label('vt_inventoryTitle')}</h2>
        {items.length === 0 ? (
          <p className="muted">{label('vt_noMatters')}</p>
        ) : (
          <div className="vault-inventory">
            {items.map((m) => {
              const unlocked = (m.vaultGrants?.length || 0) > 0;
              const expires = unlocked ? m.vaultGrants![0].expiresAt : null;
              return (
                <div key={m.id} className={`vault-card ${unlocked ? 'unlocked' : 'locked'}`}>
                  <div className="vault-card-head">
                    <span className="vault-diary">{m.diaryNo}</span>
                    <span className={`badge ${unlocked ? 'APPROVED' : 'AWAITING_DECISION'}`}>
                      {unlocked ? label('vt_unlocked') : label('vt_locked')}
                    </span>
                  </div>
                  <h3>{unlocked ? m.subject : label('vt_protected')}</h3>
                  <div className="vault-meta">
                    <div>
                      <span>{label('holder')}</span>
                      <strong>{m.holder?.displayName || label('unassigned')}</strong>
                    </div>
                    <div>
                      <span>{label('status')}</span>
                      <strong>{enumLabel(lang, m.status)}</strong>
                    </div>
                  </div>
                  {unlocked && expires && (
                    <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                      {tf(lang, 'vt_sessionUntil', { date: new Date(expires).toLocaleString() })}
                    </p>
                  )}
                  {unlockId === m.id ? (
                    <form className="vault-unlock-form" onSubmit={(e) => unlock(e, m.id)}>
                      <input
                        type="password"
                        placeholder={label('vt_pwPh')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={12}
                        required
                        autoFocus
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        {label('files_unlock')}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setUnlockId(null);
                          setPassword('');
                        }}
                      >
                        {label('cancel')}
                      </button>
                    </form>
                  ) : unlocked ? (
                    <div className="row" style={{ gap: 8 }}>
                      <Link className="btn primary" href={`/files/${m.id}`}>
                        {label('vt_openMatter')}
                      </Link>
                      <button type="button" className="btn" onClick={() => lock(m.id)}>
                        {label('vt_lockNow')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setUnlockId(m.id);
                        setPassword('');
                      }}
                    >
                      {label('vt_enterPassword')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel vault-log-panel">
        <div className="vault-log-head">
          <div>
            <div className="eyebrow">{label('vt_logEyebrow')}</div>
            <h2 style={{ marginTop: 4 }}>{label('vt_logTitle')}</h2>
          </div>
          <span className="muted">{tf(lang, 'vt_eventsCount', { n: events.length })}</span>
        </div>
        {events.length === 0 ? (
          <p className="muted">{label('vt_noEvents')}</p>
        ) : (
          <ul className="timeline">
            {events.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.action.replace(/_/g, ' ')}</strong>
                <div className="muted">
                  {ev.actor?.displayName || label('vt_system')} · {new Date(ev.createdAt).toLocaleString()}
                </div>
                <div>{ev.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
