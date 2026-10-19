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
See seed output. Default pattern: `ChangeMe!Gov2026` + MFA setup on first login.

## Backup
- PostgreSQL: `pg_dump`
- MinIO: mirror bucket to offline store
- Store FILE_ENCRYPTION_MASTER_KEY offline — loss = unrecoverable Confidential blobs

## Restore
Restore DB, restore MinIO bucket, restore master key, restart API.
