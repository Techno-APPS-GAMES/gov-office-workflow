'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider';
import { useLiveRefresh } from '@/lib/live-refresh';
import { enumLabel } from '@/lib/i18n';

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
  const { lang, label } = useAuth();
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
      toast.success(label('registry_stamped'));
      setForm({ ...form, fromName: '', toName: '', subject: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label('cm_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero">
        <div>
          <div className="eyebrow">{label('rg_eyebrow')}</div>
          <h1>{label('registry')}</h1>
          <p className="muted">{label('rg_heroBody')}</p>
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
            {f === 'ALL'
              ? label('rg_all')
              : f === 'IN'
                ? label('registry_filterIn')
                : label('registry_filterOut')}
          </button>
        ))}
      </div>

      <div className="panel">
        <h2>{label('registry_stamp')}</h2>
        <form className="grid-form" onSubmit={submit}>
          <div className="field">
            <label>{label('registry_direction')}</label>
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value as 'IN' | 'OUT' })}
            >
              <option value="IN">{enumLabel(lang, 'IN')}</option>
              <option value="OUT">{enumLabel(lang, 'OUT')}</option>
            </select>
          </div>
          <div className="field">
            <label>{label('from')}</label>
            <input
              value={form.fromName}
              onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              required={form.direction === 'IN'}
              placeholder={label('rg_namePh')}
            />
          </div>
          <div className="field">
            <label>{label('to')}</label>
            <input
              value={form.toName}
              onChange={(e) => setForm({ ...form, toName: e.target.value })}
              required={form.direction === 'OUT'}
              placeholder={label('rg_namePh')}
            />
          </div>
          <div className="field">
            <label>{label('subject')}</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>{label('registry_channel')}</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                <option value="HAND">{enumLabel(lang, 'HAND')}</option>
                <option value="POST">{enumLabel(lang, 'POST')}</option>
                <option value="EMAIL">{enumLabel(lang, 'EMAIL')}</option>
                <option value="INTERNAL">{enumLabel(lang, 'INTERNAL')}</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{label('classification')}</label>
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                <option value="PUBLIC">{enumLabel(lang, 'PUBLIC')}</option>
                <option value="INTERNAL">{enumLabel(lang, 'INTERNAL')}</option>
                <option value="CONFIDENTIAL">{enumLabel(lang, 'CONFIDENTIAL')}</option>
              </select>
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {label('rg_affix')}
          </button>
        </form>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table files-table">
            <thead>
              <tr>
                <th>{label('rg_thDir')}</th>
                <th>{label('rg_thStamp')}</th>
                <th>{label('rg_thFromTo')}</th>
                <th>{label('subject')}</th>
                <th>{label('registry_channel')}</th>
                <th>{label('rg_thDiaryRef')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={`badge ${d.direction === 'IN' ? 'APPROVED' : 'AWAITING_DECISION'}`}>
                      {d.direction === 'IN'
                        ? label('rg_dirIn')
                        : d.direction === 'OUT'
                          ? label('rg_dirOut')
                          : d.direction}
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
                  <td>{enumLabel(lang, d.channel)}</td>
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
                    {label('rg_emptyFull')}
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
