# Module deep review (updated 2026-10-22)

Post–presentation-fix status. Interactive canvas:

`C:\Users\WAJID\.cursor\projects\c-Users-WAJID-Desktop-Reverse-Eng\canvases\module-deep-review.canvas.tsx`

Also see [PRESENTATION_FIXES.md](./PRESENTATION_FIXES.md).

---

## Fixed for presentation

1. Files: hash/body redaction + `assertCanMutateMatter` on mutate/download  
2. Directions: `markOverdue` no longer clobbers `EVIDENCE_SUBMITTED`  
3. Inbox: notification hrefs + scoped `remoteQueue`  
4. Auth: login TOTP + MFA re-enrol gate; People ADMIN-only role/password  
5. Messages / AI / Overview / DAK / Calls: readability + vault; honest encrypted-at-rest  
6. Speeches / Press / Greetings: ownership + approval reset; reject UX fixed  
7. Audit advisory lock + Urdu; trust proxy; Guide seed hidden; meetings minutes  

## Remaining risks (demo talking points)

1. LOCAL_PKI e-sign is still a **pilot integrity seal** (pubkey with signature)  
2. Vault crypto claims / unlock lockout not fully production-hardened  
3. Schedule booking race; greeting dispatch KPIs are fictional counts  
4. Public tunnel should run `PILOT_MODE` + production build, not `start:dev`  
5. Sync stamp polling and i18n hydration flash remain polish items  

## Next wins after the demo

1. Label LOCAL_PKI as pilot seal; optional document-byte hash  
2. Vault unlock lockout + align crypto copy with implementation  
3. Schedule exclusion constraint + Asia/Karachi TZ  
4. Cookie/SSR language to kill EN flash; logical CSS  
5. Tunnel: production build + `PILOT_MODE` for any public hostname  

---

## Per-module snapshot

| Module | Maturity | Fixed highlights | Still open |
|--------|----------|------------------|------------|
| Files | partial | Redaction, mutate/download gates, closed decide guard | OCR plaintext, LOCAL_PKI depth, EN outcomes |
| Dak register | partial | Confidential subject redaction | Serials, void/amend, matter link UX |
| Vault | partial | — | Crypto claims, lockout, rotate auth |
| Movement | partial | — | Forward/recall, error UX, desk API |
| Directions | partial | Overdue ≠ EVIDENCE_SUBMITTED | Auth/transition table, escalate UX |
| Overview | partial | Role-scoped KPIs, Retry | Donut slices, drill-down links |
| Inbox | partial | Hrefs + scoped queue | i18n notices, pipeline honesty |
| Messages | partial | At-rest label, matter gate | Attachment crypto, poll cost |
| Calls | partial | Matter link validation | Idempotent book/issue, enums |
| Remote / e-sign | partial | Public verify redaction | Pilot seal trust model, wet-ink |
| Meetings | partial | Explicit approve, real minutes | CNIC, promote :id |
| Schedule | partial | — | Booking race, TZ, tours |
| Speeches | partial | Ownership + DRAFT reset | Version history, review gate |
| Press | partial | Ownership + reset + reject UX | Dispatch/PID |
| Greetings | partial | Ownership + reset + reject UX | Fake dispatch KPIs, occasions |
| Auth | partial | TOTP UI, MFA re-enrol gate | Dev secret fallbacks, localStorage tokens |
| People | partial | ADMIN-only role/password | LDAP login, sync |
| Search | partial | — | FTS, scope parity |
| Work records | partial | — | Unique WR code, vault |
| Audit | partial | Chain lock, Urdu UTF-8 | Full verify cost, coverage |
| AI | partial | Readable + vault + remote block | Question cap/timeout |
| Guide | **strong** | Seed creds hidden | Role-filtered sections |
| Sync | partial | — | Stamp scale, edit overwrite |
| i18n | partial | — | Hydration flash, logical CSS |
| Infra | partial | trust proxy, UTF-8 URL | Public start:dev, compose secrets, Redis |

Open the canvas and filter **Open only** / **Fixed only** for the live breakdown.
