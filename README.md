# Government Office Workflow (Production)

Original on-prem file-routing platform: NestJS API, Next.js workspace, PostgreSQL, Redis, MinIO.

## Quick start

```bash
cp .env.example .env
# Prefer Docker Compose (Postgres/Redis/MinIO). If Docker is unavailable:
#   set DATABASE_URL to port 5433 and run: npm run db:local -w @gow/api
docker compose -f deploy/docker-compose.yml up -d
npm install
npm run build -w @gow/shared
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/health  

Seed users (password from `SEED_PASSWORD`, default `ChangeMe!Office1`): `speaker`, `secgen`, `specsec`, `dgit`, `admin`.  
Re-run `npm run db:seed` after pulling seed changes.  
Enroll MFA on first login when `MFA_REQUIRED=true`.  
Demo may set `MFA_SKIP_LOGIN_TOTP=true` / `DEMO_WEAK_PASSWORDS=true` — **forbidden in pilot** (`PILOT_MODE=true` or `NODE_ENV=production`).  
MinIO is optional in development — the API falls back to `.local-storage/`.

## Smoke test

With API running on :4000 and users seeded (`ChangeMe!Office1`):

```bash
npm run smoke -w @gow/api
```

Covers Path A, confidential Path B + Direction evidence file, related link, return-with-remarks, and close.

## Docs

- [SECURITY.md](docs/SECURITY.md)
- [RUNBOOK.md](docs/RUNBOOK.md)
- [THREAT_MODEL.md](docs/THREAT_MODEL.md)
- [Sprint 1 backlog](docs/SPRINT1_BACKLOG.md)
- [Pilot env example](deploy/.env.pilot.example)
