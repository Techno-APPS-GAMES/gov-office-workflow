# Deploy

## Infrastructure only (default)

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Starts Postgres, Redis, and MinIO. Run API/web on the host:

```bash
npm run db:local   # or point DATABASE_URL at compose Postgres
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

## Full stack containers

```bash
docker compose -f deploy/docker-compose.yml --profile apps up --build
```

Set strong JWT secrets and passwords before production use. MFA is on by default (`MFA_REQUIRED=true`).
