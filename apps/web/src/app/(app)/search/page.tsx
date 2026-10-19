'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

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
  const { label } = useAuth();
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
      <p className="muted">
        Permission-aware retrieval. Try natural prompts such as “overdue directions”, “meetings about
        protocol”, or a diary number.
      </p>
      <div className="panel">
        <form className="row" onSubmit={run}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Diary, subject, overdue directions, meetings…"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
        {result?.note ? <p className="muted" style={{ marginTop: 10 }}>{result.note}</p> : null}
      </div>
      {result && (
        <>
          {(result.directions?.length || 0) > 0 ? (
            <div className="panel">
              <h2>Directions</h2>
              <ul>
                {result.directions!.map((d) => (
                  <li key={d.id}>
                    <Link href="/directions">{d.title}</Link>
                    {' — '}
                    {d.status.replace(/_/g, ' ')}
                    {d.matter?.diaryNo ? ` · ${d.matter.diaryNo}` : ''}
                    {d.owner?.displayName ? ` · ${d.owner.displayName}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(result.meetings?.length || 0) > 0 ? (
            <div className="panel">
              <h2>Meetings</h2>
              <ul>
                {result.meetings!.map((m) => (
                  <li key={m.id}>
                    <Link href="/meetings">{m.title}</Link>
                    {' — '}
                    {m.status.replace(/_/g, ' ')}
                    {m.location ? ` · ${m.location}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="panel">
            <h2>Matters</h2>
            {(result.matters?.length || 0) === 0 ? (
              <p className="muted">No matters matched.</p>
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
            <h2>People</h2>
            {(result.people?.length || 0) === 0 ? (
              <p className="muted">No people matched.</p>
            ) : (
              <ul>
                {result.people!.map((p) => (
                  <li key={p.id}>
                    {p.displayName} ({p.role})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel">
            <h2>Work records</h2>
            {(result.workItems?.length || 0) === 0 ? (
              <p className="muted">No work records matched.</p>
            ) : (
              <ul>
                {result.workItems!.map((w) => (
                  <li key={w.id}>
                    {w.title} — {w.status}
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
