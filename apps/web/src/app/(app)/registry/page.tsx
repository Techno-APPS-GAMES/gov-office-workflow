'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider';
import { useLiveRefresh } from '@/lib/live-refresh';

type Dak = {
  id: string;
  direction: string;
  branchName: string;
  fromName: string;
  fromDesignation?: string | null;
  toName: string;
  toDesignation?: string | null;
  channel: string;
  subject: string;
  classification?: string | null;
  diaryNo?: string | null;
  reference?: string | null;
  stampedAt: string;
  stampedBy?: { displayName: string } | null;
  matter?: { id: string; diaryNo: string; subject: string } | null;
};

export default function RegistryPage() {
  const { label } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Dak[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    direction: 'IN' as 'IN' | 'OUT',
    fromName: '',
    toName: '',
    subject: '',
    channel: 'HAND',
    classification: 'INTERNAL',
  });

  const load = useCallback(async () => {
    const q = filter === 'ALL' ? '' : `?direction=${filter}`;
    setItems(await api<Dak[]>(`/dak${q}`));
  }, [filter]);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useLiveRefresh(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (form.direction === 'IN') {
        await api('/dak/in', {
          method: 'POST',
          json: {
            fromName: form.fromName,
            toName: form.toName || undefined,
            subject: form.subject,
            channel: form.channel,
            classification: form.classification,
          },
        });
      } else {
        await api('/dak/out', {
          method: 'POST',
          json: {
            toName: form.toName,
            fromName: form.fromName || undefined,
            subject: form.subject,
            channel: form.channel,
            classification: form.classification,
          },
        });
      }
      toast.success('Dak stamped');
      setForm({ ...form, fromName: '', toName: '', subject: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">R&amp;I · RECEIPT &amp; ISSUE</div>
          <h1>{label('registry') === 'registry' ? 'Dak register' : label('registry')}</h1>
          <p className="muted">
            Diarise incoming and outgoing dak with Received/Despatched stamp fields (branch, from,
            by, date/time, channel) — aligned to National Assembly R&amp;I practice.
          </p>
        </div>
      </div>

      <div className="dir-filters">
        {(['ALL', 'IN', 'OUT'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'active' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'All entries' : f === 'IN' ? 'Received (IN)' : 'Despatched (OUT)'}
          </button>
        ))}
      </div>

      <div className="panel">
        <h2>Stamp dak</h2>
        <form className="grid-form" onSubmit={submit}>
          <div className="field">
            <label>Direction</label>
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value as 'IN' | 'OUT' })}
            >
              <option value="IN">IN — Received</option>
              <option value="OUT">OUT — Despatched</option>
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input
              value={form.fromName}
              onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              required={form.direction === 'IN'}
              placeholder="Name / office"
            />
          </div>
          <div className="field">
            <label>To</label>
            <input
              value={form.toName}
              onChange={(e) => setForm({ ...form, toName: e.target.value })}
              required={form.direction === 'OUT'}
              placeholder="Name / office"
            />
          </div>
          <div className="field">
            <label>Subject</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                <option value="HAND">Hand</option>
                <option value="POST">Post</option>
                <option value="EMAIL">Email</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Classification</label>
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                <option value="PUBLIC">Public</option>
                <option value="INTERNAL">Internal</option>
                <option value="CONFIDENTIAL">Confidential</option>
              </select>
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            Affix stamp
          </button>
        </form>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table files-table">
            <thead>
              <tr>
                <th>Dir</th>
                <th>Stamp</th>
                <th>From → To</th>
                <th>Subject</th>
                <th>Channel</th>
                <th>Diary / ref</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={`badge ${d.direction === 'IN' ? 'APPROVED' : 'AWAITING_DECISION'}`}>
                      {d.direction}
                    </span>
                  </td>
                  <td>
                    <div>{new Date(d.stampedAt).toLocaleString()}</div>
                    <div className="muted">{d.stampedBy?.displayName || '—'}</div>
                  </td>
                  <td>
                    {d.fromName} → {d.toName}
                  </td>
                  <td>{d.subject}</td>
                  <td>{d.channel}</td>
                  <td>
                    {d.matter ? (
                      <Link href={`/files/${d.matter.id}`}>{d.matter.diaryNo}</Link>
                    ) : (
                      d.diaryNo || d.reference || '—'
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No dak entries yet — register a matter or stamp manually.
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
