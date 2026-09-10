# Kinder New Genz

Backend API for school management, built with Bun, Hono, Drizzle ORM, and PostgreSQL.

## Local setup

```bash
bun install
bun run db:migrate
bun run dev
```

The API listens on `http://localhost:3000`. Copy `.env.example` to `.env` and set a
strong `ACCESS_TOKEN_SECRET` with at least 32 characters. Database migrations use
`MIGRATION_DATABASE_URL`; runtime queries use `DATABASE_URL`.

## Verification

```bash
bun test
bun x tsc --noEmit
bun x prettier --check src tests
bun x drizzle-kit check
bun audit
```

The integration tests use the configured PostgreSQL database and exercise real RLS,
authentication, tenant isolation, and API transactions. Run the migration command
before the first test run on a fresh database.

## Security boundaries

- Tenant queries must run through `withTenant(schoolId, callback)`.
- Tenant tables use PostgreSQL `FORCE ROW LEVEL SECURITY` and the
  `app.school_id` setting. `src/db/rls_setup.sql` is the bootstrap reference for
  new environments.
- System-admin support sessions are temporary, read-only tokens and are audited.
- `external_tools/` is development tooling only and is excluded from the Docker
  production context; it is not an API runtime dependency.

## Useful commands

```bash
bun run db:generate
bun run db:migrate
bun run seed:sysadmin
```

See `src/server.ts` for route registration and `tests/api` for endpoint examples.
