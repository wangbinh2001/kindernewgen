# KinderNewGenz Frontend

This directory contains the KinderNewGenz React landing page.

The frontend must consume the backend API through `/api/v1` and must not connect directly to PostgreSQL. Read the repository `AGENTS.md` and `docs/api-contract.md` before creating the application.

## Local development

```bash
bun install
bun run dev
```

Quality checks:

```bash
bun run test
bun run typecheck
bun run build
bun run test:e2e
```

Playwright saves the desktop and mobile reference captures under `test-results/`.
