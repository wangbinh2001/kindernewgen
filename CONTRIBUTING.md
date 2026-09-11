# Contributing

Run commands from the repository root:

```bash
bun install
bun run db:migrate
bun run test
bun run typecheck
bun run format
```

Backend-only work belongs under `backend/`. Keep API changes covered by integration tests in `backend/tests/api`. Database changes require a new migration generated from `backend/src/db/schema.ts`.

For frontend work, read `AGENTS.md`, `docs/api-contract.md`, and `frontend/README.md` first.
