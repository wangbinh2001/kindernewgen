# KinderNewGenz

KinderNewGenz is a Bun, Hono, Drizzle, and PostgreSQL school-management monorepo.

## Structure

- `backend/`: API, database schema, migrations, seed scripts, and integration tests.
- `frontend/`: reserved for the frontend application.
- `docs/`: shared architecture and API contracts for human and AI contributors.
- `AGENTS.md`: mandatory repository rules.

## Start backend

```bash
bun install
bun run db:migrate
bun run dev
```

The API listens on `http://localhost:3000`. Backend environment details are in `backend/.env.example`.

## Verify

```bash
bun run test
bun run typecheck
bun run format
```

Integration tests use the configured PostgreSQL database and exercise real RLS, authentication, tenant isolation, and transactions.

## Production hardening

- Configure `CORS_ORIGINS` with a comma-separated allowlist of frontend origins.
- Login and password-recovery endpoints have in-memory rate limits for a single API process. Use a shared limiter such as Redis when running multiple API replicas.
- Every response includes `X-Request-ID`; clients may send a safe request id or let the API generate one.
- Tenant authentication checks that the school is still `active`; suspended schools cannot use existing tokens.
- Set `ACCESS_TOKEN_SECRET` to a unique secret of at least 32 characters in production.

### PostgreSQL backup and restore

Create a non-overwriting custom-format backup:

```bash
bun run db:backup
bun run db:backup -- C:\path\to\backup.dump
```

Restore requires an explicit confirmation. For a disaster recovery drill, restore into a temporary database first:

```bash
bun run db:restore -- C:\path\to\backup.dump --confirm --database kindernewgenz_restore_check
```

The restore command uses local PostgreSQL client binaries when available and otherwise uses the project Docker Compose PostgreSQL container. Never point a restore drill at the production database without an approved change window and verified backup.
