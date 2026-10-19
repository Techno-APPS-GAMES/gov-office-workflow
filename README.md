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

Seed users (password `ChangeMe!Office1`): `speaker`, `secgen`, `specsec`, `dgit`, `admin`.  
Enroll MFA on first login when `MFA_REQUIRED=true`.  
MinIO is optional in development — the API falls back to `.local-storage/`.

## Docs

- [SECURITY.md](docs/SECURITY.md)
- [RUNBOOK.md](docs/RUNBOOK.md)
- [THREAT_MODEL.md](docs/THREAT_MODEL.md)
