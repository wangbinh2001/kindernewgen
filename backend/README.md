# Backend

This is the KinderNewGenz API service.

```bash
bun install
bun run db:migrate
bun run dev
```

The backend owns authentication, authorization, tenant isolation, business rules, migrations, and API contracts. Run tests with `bun test` from this directory or `bun run test` from the repository root.

Read the repository `AGENTS.md`, `docs/api-contract.md`, `docs/auth-and-roles.md`, and `docs/database-and-rls.md` before changing code.
