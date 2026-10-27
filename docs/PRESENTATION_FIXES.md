# Presentation fixes (applied)

Critical and high issues from the module deep review were fixed for tomorrow’s demo. Restart API + web after pull.

## Security / access

- **Files** — list/get strip `filePasswordHash`; locked confidential subjects/bodies redacted; mutate paths use `assertCanMutateMatter`
- **Downloads** — `assertMatterReadable` + vault before attachment download
- **Users** — only **ADMIN** may create/update users, change roles/passwords; cannot self-promote; refresh tokens revoked on password/role/deactivate
- **MFA** — login has TOTP field; re-enrol blocked once MFA is enabled (needs current code)
- **Guide** — seed password panel hidden unless `NEXT_PUBLIC_SHOW_SEED_CREDS=true`
- **Messages** — matter links gated; UI no longer claims E2EE (encrypted at rest)
- **AI / Calls / Dak / Overview** — matter readability / vault redaction / role-scoped dashboard
- **E-sign verify** — confidential subjects redacted in public verify payload

## Workflow / demo breakers

- **Directions** — overdue job no longer overwrites `EVIDENCE_SUBMITTED` (Speaker can still verify)
- **Inbox** — notification hrefs case-insensitive (`routing` → files); remote queue scoped to user/role
- **Speeches / Press / Greetings** — ownership gates; publishable edits reset APPROVED → DRAFT
- **Meetings** — approve must be boolean; complete requires APPROVED + real minutes (≥20 chars)
- **Overview** — sticky error cleared on successful refresh

## Platform

- **trust proxy** — Nest sets `trust proxy` so rate-limit/audit see real client IP
- **Audit** — Urdu kept (no ascii strip); chain append uses advisory lock
- **Postgres** — `client_encoding=UTF8` on DATABASE_URL

## Still out of scope for tonight (mention if asked)

- Full HSM / managed e-sign keys (LOCAL_PKI remains a pilot integrity seal)
- Real LDAP bind / OIDC
- Greeting card actual email dispatch
- Schedule booking race (DB exclusion constraint)
- Full SSE instead of 3s poll
- Production tunnel hard-hardening (run `PILOT_MODE=true` + production build for public demos)

## Restart

```bash
# from gov-office-workflow
# stop old API/web, then start again so Nest picks up trust proxy + services
```
