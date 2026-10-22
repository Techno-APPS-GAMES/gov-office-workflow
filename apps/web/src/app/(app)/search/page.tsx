'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { enumLabel, roleTitle } from '@/lib/i18n';

type SearchResult = {
  intent?: { kind: string; keywords: string } | null;
  note?: string;
  matters?: { id: string; diaryNo: string; subject: string; status: string }[];
  people?: { id: string; displayName: string; role: string }[];
  workItems?: { id: string; title: string; status: string; kind: string }[];
  directions?: {
    id: string;
    title: string;
    status: string;
    dueDate?: string | null;
    matter?: { diaryNo: string } | null;
    owner?: { displayName: string } | null;
  }[];
  meetings?: {
    id: string;
    title: string;
    status: string;
    startAt?: string | null;
    location?: string | null;
  }[];
};

export default function SearchPage() {
  const { lang, label } = useAuth();
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(await api<SearchResult>(`/search?q=${encodeURIComponent(q)}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{label('search')}</h1>
      <p className="muted">{label('sr_help')}</p>
      <div className="panel">
        <form className="row" onSubmit={run}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={label('sr_placeholderFull')}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={busy}>
            {busy ? label('sr_searching') : label('searchAction')}
          </button>
        </form>
        {result?.note ? <p className="muted" style={{ marginTop: 10 }}>{result.note}</p> : null}
      </div>
      {result && (
        <>
          {(result.directions?.length || 0) > 0 ? (
            <div className="panel">
              <h2>{label('search_directions')}</h2>
              <ul>
                {result.directions!.map((d) => (
                  <li key={d.id}>
                    <Link href="/directions">{d.title}</Link>
                    {' — '}
                    {enumLabel(lang, d.status)}
                    {d.matter?.diaryNo ? ` · ${d.matter.diaryNo}` : ''}
                    {d.owner?.displayName ? ` · ${d.owner.displayName}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(result.meetings?.length || 0) > 0 ? (
            <div className="panel">
              <h2>{label('search_meetings')}</h2>
              <ul>
                {result.meetings!.map((m) => (
                  <li key={m.id}>
                    <Link href="/meetings">{m.title}</Link>
                    {' — '}
                    {enumLabel(lang, m.status)}
                    {m.location ? ` · ${m.location}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="panel">
            <h2>{label('search_matters')}</h2>
            {(result.matters?.length || 0) === 0 ? (
              <p className="muted">{label('sr_noMatters')}</p>
            ) : (
              <ul>
                {result.matters!.map((m) => (
                  <li key={m.id}>
                    <Link href={`/files/${m.id}`}>{m.diaryNo}</Link> — {m.subject}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel">
            <h2>{label('sr_people')}</h2>
            {(result.people?.length || 0) === 0 ? (
              <p className="muted">{label('sr_noPeople')}</p>
            ) : (
              <ul>
                {result.people!.map((p) => (
                  <li key={p.id}>
                    {p.displayName} ({roleTitle(lang, p.role)})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel">
            <h2>{label('sr_workRecords')}</h2>
            {(result.workItems?.length || 0) === 0 ? (
              <p className="muted">{label('sr_noWork')}</p>
            ) : (
              <ul>
                {result.workItems!.map((w) => (
                  <li key={w.id}>
                    {w.title} — {enumLabel(lang, w.status)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
