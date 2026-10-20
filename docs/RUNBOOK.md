# Operations Runbook

## Start dependencies
```bash
cd deploy
docker compose up -d
```

## Configure
```bash
cp .env.example .env
# edit secrets
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Run
```bash
npm run dev:api
npm run dev:web
```

- Web: http://localhost:3000
- API: http://localhost:4000/api
- MinIO console: http://localhost:9001

## Seed accounts (change passwords immediately)
Default seed password: `ChangeMe!Office1` (override with `SEED_PASSWORD`).  
Accounts: `speaker`, `secgen`, `specsec`, `dgit`, `admin`.  
Enroll MFA on first login when `MFA_REQUIRED=true`.

## Clean UAT pack for testers
Wipe smoke/dev data and load **3 test records per area**:
```bash
npm run prepare:testers
```
Password defaults to `Tester@Office1`. Full cases: `docs/TESTER_HANDOFF.md`.

## Demo vs pilot
| Flag | Demo | Pilot |
|------|------|-------|
| `PILOT_MODE` | unset / false | `true` |
| `MFA_SKIP_LOGIN_TOTP` | may be `true` | **must be false / unset** (ignored if pilot anyway) |
| `DEMO_WEAK_PASSWORDS` | may be `true` | **must be false** |
| `SEED_PASSWORD` | default `ChangeMe!Office1` | strong unique value |

Pilot template: `deploy/.env.pilot.example`.

## File workflow (pilot)
1. Register → attach → route (optional due) → acknowledge → noting / return or complete → Speaker decide.
2. Direction: required due date → owner start → evidence **text + file** → Speaker verify → then Close matter.
3. Confidential: unlock with file password before open/download; vault TTL from `VAULT_UNLOCK_TTL_MINUTES`.
4. Related matters: search on Related tab. Versions: Versions tab on the matter.
5. In-app guide: `/guide`.

## Backup
- PostgreSQL: `pg_dump`
- MinIO: mirror bucket to offline store
- Store FILE_ENCRYPTION_MASTER_KEY offline — loss = unrecoverable Confidential blobs

## Restore
Restore DB, restore MinIO bucket, restore master key, restart API.
