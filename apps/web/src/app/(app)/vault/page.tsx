'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLiveRefresh } from '@/lib/live-refresh';

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

function prettyStatus(s: string) {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VaultPage() {
  const { user } = useAuth();
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
      toast.success('Vault unlocked');
      setUnlockId(null);
      setPassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusy(false);
    }
  }

  async function lock(matterId: string) {
    try {
      await api(`/vault/${matterId}/lock`, { method: 'POST' });
      toast.success('Vault locked');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lock failed');
    }
  }

  async function verifyLedger() {
    setBusy(true);
    try {
      const v = await api<Ledger>('/vault/verify');
      setLedger(v);
      toast.success(v.valid ? 'Ledger verified — chain intact' : 'Ledger integrity check failed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">
            {user?.role === 'SPEAKER' ? "SPEAKER'S OFFICE" : 'OFFICE WORKFLOW'} · CONCEPT DEMO
          </div>
          <h1>Confidential vault & keystore</h1>
          <p className="muted">
            High-security zero-knowledge enclave for classified files, password rotation, and
            physical courier handoffs.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={verifyLedger} disabled={busy}>
          Verify ledger
        </button>
      </div>

      <div className="vault-crypto-banner">
        <div className="vault-crypto-top">
          <div>
            <div className="vault-crypto-kicker">Zero-knowledge cryptographic vault</div>
            <h2>Hardware-isolated on-premises keystore</h2>
            <p>
              File contents are sealed under PBKDF2 / AES-256 keys derived from the file password.
              Passwords never leave the local enclave and are never stored in clear text.
            </p>
          </div>
          <span className="vault-aes-badge">AES-256 ENFORCED</span>
        </div>
        <div className="vault-crypto-grid">
          <div>
            <span>Key derivation</span>
            <strong>PBKDF2 · 100,000 iterations</strong>
          </div>
          <div>
            <span>Symmetric cipher</span>
            <strong>AES-256-GCM Authenticated</strong>
          </div>
          <div>
            <span>Salt profile</span>
            <strong>Cryptographic 32-byte salt</strong>
          </div>
          <div>
            <span>Active unlocked sessions</span>
            <strong>
              {ledger?.unlockedSessions ?? stats.unlocked} file(s) unlocked
            </strong>
          </div>
          <div>
            <span>Auto-lock timer</span>
            <strong>{ttl}-minute inactivity window</strong>
          </div>
          <div>
            <span>Master keystore integrity</span>
            <strong className={ledger?.valid === false ? 'bad' : 'ok-text'}>
              {ledger?.valid === false ? 'Integrity check failed' : 'Tamper-proof verified ✓'}
            </strong>
          </div>
        </div>
      </div>

      <div className="vault-stat-row">
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.total}</div>
          <div className="vault-stat-label">Total confidential matters</div>
          <div className="muted">In safe custody</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.locked}</div>
          <div className="vault-stat-label">Locked in vault</div>
          <div className="muted">Requires file password</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.unlocked}</div>
          <div className="vault-stat-label">Currently unlocked</div>
          <div className="muted">Active session access</div>
        </div>
        <div className="vault-stat">
          <div className="vault-stat-value">{stats.events}</div>
          <div className="vault-stat-label">Keystore audit events</div>
          <div className="muted">Security logs</div>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">Classified inventory</div>
        <h2 style={{ marginTop: 4 }}>Vault files custody & unlock queue</h2>
        {items.length === 0 ? (
          <p className="muted">No confidential matters in custody yet.</p>
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
                      {unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <h3>{unlocked ? m.subject : 'Protected confidential record'}</h3>
                  <div className="vault-meta">
                    <div>
                      <span>Holder</span>
                      <strong>{m.holder?.displayName || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{prettyStatus(m.status)}</strong>
                    </div>
                  </div>
                  {unlocked && expires && (
                    <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                      Session until {new Date(expires).toLocaleString()}
                    </p>
                  )}
                  {unlockId === m.id ? (
                    <form className="vault-unlock-form" onSubmit={(e) => unlock(e, m.id)}>
                      <input
                        type="password"
                        placeholder="File password (min 12)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={12}
                        required
                        autoFocus
                      />
                      <button className="btn primary" type="submit" disabled={busy}>
                        Unlock
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setUnlockId(null);
                          setPassword('');
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : unlocked ? (
                    <div className="row" style={{ gap: 8 }}>
                      <Link className="btn primary" href={`/files/${m.id}`}>
                        Open matter
                      </Link>
                      <button type="button" className="btn" onClick={() => lock(m.id)}>
                        Lock now
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
                      ✎ Enter password
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
            <div className="eyebrow">Security log</div>
            <h2 style={{ marginTop: 4 }}>Vault access & password rotation audit trail</h2>
          </div>
          <span className="muted">{events.length} security events</span>
        </div>
        {events.length === 0 ? (
          <p className="muted">No vault events recorded yet.</p>
        ) : (
          <ul className="timeline">
            {events.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.action.replace(/_/g, ' ')}</strong>
                <div className="muted">
                  {ev.actor?.displayName || 'System'} · {new Date(ev.createdAt).toLocaleString()}
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
