# KinderNewGenz Monorepo Instructions

## Repository map

- `backend/` is the Bun + Hono + Drizzle + PostgreSQL API.
- `frontend/` is reserved for the future React client. It must call the backend API and must not query PostgreSQL directly.
- `docs/` contains architecture, API, auth, RLS, and realtime contracts.
- `.claude/` contains project skills and agents. Read the relevant skill before changing code.
- `external_tools/` is development-only tooling and is not part of the API runtime.

## Backend rules

- Preserve the response envelope: `{ success, data, error }`.
- Tenant database queries must use `withTenant(schoolId, callback)`.
- Do not bypass PostgreSQL RLS or trust `school_id` from request bodies. Use the verified JWT claim.
- Keep migrations append-only. Never edit or delete an old migration.
- Use Bun password hashing. Do not add dependencies without a clear reason.
- New features use TDD: write a failing integration test, implement the smallest fix, then run the backend suite.
- Before completion run `bun run test`, `bun run typecheck`, and `bun run format` from the repository root.
- Do not commit or push unless the user explicitly requests it.

## Frontend contract

- Use the API contract in `docs/api-contract.md`.
- Treat realtime events as invalidation signals, then refetch through the backend API.
- Never place database credentials in frontend code.
