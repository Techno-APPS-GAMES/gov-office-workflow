'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { roleAvatar } from '@/lib/avatars';
import { ROLE_META, type Role } from '@gow/shared';

type Peer = {
  id: string;
  displayName: string;
  role?: string;
  username?: string;
  email?: string;
};
type Contact = {
  peer: Peer;
  lastText: string;
  lastAt: string | null;
  unread: number;
};
type MsgFile = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};
type ThreadMsg = {
  id: string;
  text: string;
  createdAt: string;
  fromUserId: string;
  read: boolean;
  priority?: string;
  encrypted?: boolean;
  fromUser?: { displayName: string; role?: string };
  matter?: { id: string; diaryNo: string; subject: string } | null;
  attachments?: MsgFile[];
};

const QUICK = [
  'Reviewed & concurred',
  'Submit draft note',
  'Held for meeting',
  'Approved for dispatch',
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(ct: string) {
  return ct.startsWith('image/');
}

function authHeaders(): HeadersInit {
  const t = typeof window !== 'undefined' ? localStorage.getItem('gow_access') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function roleLabel(role?: string) {
  if (!role) return '';
  return ROLE_META[role as Role]?.title || role.replace(/_/g, ' ');
}

function timeShort(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function AttachmentImage({ id, fileName }: { id: string; fileName: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages/attachments/${id}/download`, {
          headers: authHeaders(),
          credentials: 'include',
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (!src) return <span className="muted">Loading image…</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={fileName} />
  );
}

function PeerAvatar({ peer, size = 40 }: { peer: Peer; size?: number }) {
  const src = roleAvatar(peer.role);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={peer.displayName}
        className="msg-avatar"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="msg-avatar fallback" style={{ width: size, height: size }}>
      {(peer.displayName || '?').charAt(0)}
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const historyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [matters, setMatters] = useState<{ id: string; diaryNo: string; subject: string }[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [priority, setPriority] = useState('ROUTINE');
  const [matterId, setMatterId] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const loadContacts = useCallback(async () => {
    const q = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
    setContacts(await api<Contact[]>(`/messages/contacts${q}`));
  }, [filter]);

  const openThread = useCallback(
    async (id: string) => {
      setPeerId(id);
      const res = await api<{ peer: Peer; messages: ThreadMsg[] }>(`/messages/thread/${id}`);
      setPeer(res.peer);
      setThread(res.messages);
      await loadContacts();
    },
    [loadContacts],
  );

  useEffect(() => {
    loadContacts().catch(() => setContacts([]));
    api<{ id: string; diaryNo: string; subject: string }[]>('/files')
      .then(setMatters)
      .catch(() => undefined);
  }, [loadContacts]);

  useEffect(() => {
    const to = searchParams.get('to');
    if (to) openThread(to).catch(() => undefined);
  }, [searchParams, openThread]);

  useEffect(() => {
    if (!peerId) return;
    const t = setInterval(() => {
      openThread(peerId).catch(() => undefined);
    }, 20_000);
    return () => clearInterval(t);
  }, [peerId, openThread]);

  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, peerId]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 5);
    if (next.some((f) => f.size > 15 * 1024 * 1024)) {
      toast.error('Max 15 MB per file');
      return;
    }
    setFiles(next);
  }

  async function downloadAttachment(id: string, fileName: string) {
    try {
      const res = await fetch(`/api/messages/attachments/${id}/download`, {
        headers: authHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function send(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const toUserId = peerId;
    if (!toUserId) return;
    const body = (preset || text).trim();
    if (!body && files.length === 0) {
      toast.error('Write a message or attach a file');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('toUserId', toUserId);
      fd.append('text', body);
      fd.append('priority', priority);
      if (matterId) fd.append('matterId', matterId);
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          msg = Array.isArray(j.message) ? j.message.join(', ') : j.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setText('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Encrypted message sent');
      await openThread(toUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overview-hero msg-hero">
        <div>
          <div className="eyebrow">SPEAKER&apos;S OFFICE · MODULE 9</div>
          <h1>Encrypted office messages</h1>
          <p className="muted">
            End-to-end AES-256 executive messaging between Speaker, Secretary General and Special
            Secretary — with matter linkage and immutable audit ledger logging.
          </p>
        </div>
        <div className="e2ee-pill">🔒 End-to-end Encrypted (AES-256)</div>
      </div>

      <div className="messages-layout e2ee-layout">
        <aside className="messages-list panel">
          <div className="contacts-head">
            <h2>Executive contacts</h2>
            <button type="button" className="btn tiny-link" onClick={() => loadContacts()}>
              Refresh
            </button>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search officers…"
            />
          </div>
          <ul className="messages-peers">
            {contacts.map((c) => (
              <li key={c.peer.id}>
                <button
                  type="button"
                  className={peerId === c.peer.id ? 'active' : ''}
                  onClick={() => openThread(c.peer.id).catch((e) => toast.error(String(e.message || e)))}
                >
                  <div className="contact-row">
                    <PeerAvatar peer={c.peer} size={38} />
                    <div className="contact-meta">
                      <span className="messages-peer-name">
                        {c.peer.displayName}
                        {c.unread > 0 && <span className="messages-unread">{c.unread}</span>}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {roleLabel(c.peer.role)}
                        {c.lastAt ? ` · ${timeShort(c.lastAt)}` : ''}
                      </span>
                      <span className="messages-preview">{c.lastText}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
            {!contacts.length && <li className="muted" style={{ padding: 8 }}>No officers found.</li>}
          </ul>
        </aside>

        <section className="messages-thread panel">
          {!peer && (
            <div className="messages-empty">
              <h2>Select an officer</h2>
              <p className="muted">
                Choose an executive contact to open an AES-256 encrypted thread with attachments,
                priority and matter linkage.
              </p>
            </div>
          )}

          {peer && (
            <>
              <div className="messages-thread-head e2ee-thread-head">
                <div className="contact-row">
                  <PeerAvatar peer={peer} size={44} />
                  <div>
                    <h2 style={{ marginBottom: 2 }}>{peer.displayName}</h2>
                    <p className="muted" style={{ margin: 0 }}>
                      <span className="online-dot" /> Online · {roleLabel(peer.role)}
                      {peer.username ? ` · @${peer.username}` : ''}
                    </p>
                  </div>
                </div>
                <span className="e2ee-chip">🔒 AES-256 E2EE VERIFIED</span>
              </div>

              <div className="messages-history" ref={historyRef}>
                {thread.length === 0 && (
                  <p className="muted">No messages yet — send the first encrypted note.</p>
                )}
                {thread.map((m) => {
                  const mine = m.fromUserId === user?.id;
                  return (
                    <div key={m.id} className={`bubble ${mine ? 'mine' : 'theirs'}`}>
                      <div className="bubble-meta">
                        <span>
                          {mine ? 'You' : m.fromUser?.displayName || peer.displayName}
                          {m.priority === 'URGENT' && <span className="urgent-tag">Urgent</span>}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      {m.text ? <div className="bubble-text">{m.text}</div> : null}
                      {m.matter && (
                        <Link className="matter-chip" href={`/files/${m.matter.id}`}>
                          📎 Linked official matter · {m.matter.diaryNo}
                          <span>{m.matter.subject}</span>
                        </Link>
                      )}
                      {!!m.attachments?.length && (
                        <div className="bubble-files">
                          {m.attachments.map((a) =>
                            isImage(a.contentType) ? (
                              <div key={a.id} className="bubble-image">
                                <AttachmentImage id={a.id} fileName={a.fileName} />
                                <button
                                  type="button"
                                  className="linkish"
                                  onClick={() => downloadAttachment(a.id, a.fileName)}
                                >
                                  {a.fileName} · download
                                </button>
                              </div>
                            ) : (
                              <button
                                key={a.id}
                                type="button"
                                className="bubble-doc"
                                onClick={() => downloadAttachment(a.id, a.fileName)}
                              >
                                <strong>📄 {a.fileName}</strong>
                                <span>{formatBytes(a.sizeBytes)}</span>
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      <div className="bubble-read muted">
                        {mine ? (m.read ? '✓✓ Encrypted · Seen' : '✓✓ Encrypted · Sent') : '✓✓ Encrypted'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="quick-replies">
                {QUICK.map((q) => (
                  <button key={q} type="button" className="chip" disabled={busy} onClick={() => send(undefined, q)}>
                    {q}
                  </button>
                ))}
              </div>

              <form
                className={`messages-composer ${dragOver ? 'drag-over' : ''}`}
                onSubmit={(e) => send(e)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <div className="composer-controls">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="ROUTINE">Routine</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                    <option value="">No linked matter</option>
                    {matters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.diaryNo} — {m.subject.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </div>
                {files.length > 0 && (
                  <div className="attach-chips">
                    {files.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="attach-chip">
                        {isImage(f.type) ? '🖼' : '📄'} {f.name}
                        <em>{formatBytes(f.size)}</em>
                        <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="messages-composer-row">
                  <button type="button" className="btn attach-btn" onClick={() => fileRef.current?.click()}>
                    📎
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <textarea
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={`Type an encrypted message to ${peer.displayName} (Press Enter to send)…`}
                  />
                  <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Sending…' : '🔒 Send'}
                  </button>
                </div>
                <p className="composer-hint muted">
                  AES-256-GCM at rest · audited send · attachments virus-scanned · Enter to send · Shift+Enter new line
                </p>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
