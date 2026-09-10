# Task 14 Tuition Calculation and Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side tuition calculation, immutable monthly confirmation, and balance-backed tuition adjustments.

**Architecture:** Add tenant-scoped tuition history and adjustment tables plus non-tenant child items. Calculation reads active class fees, attendance fee snapshots, current reductions, and the previous balance without persisting. Confirmation validates the whole batch before inserting confirmed history/items and recalculating locked monthly balances.

**Tech Stack:** Bun, Hono, Zod, Drizzle ORM, PostgreSQL, PostgreSQL RLS.

**Spec:** `docs/specs/school-admin/08-tuition.md`, `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Do not modify existing migration files.
- Use real PostgreSQL integration tests and no database mocks.
- Preserve `{ success, data, error }` envelopes.
- Use `withTenant` for every new route query and mutation.
- Never overwrite confirmed tuition history; adjustments update the balance through a separate ledger row.

---

### Task 1: Tuition history schema and calculation tests

**Files:**
- Create: `tests/api/tuition-calculation.integration.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0013_*.sql`
- Create: `src/tuition/calculation-routes.ts`
- Modify: `src/server.ts`

- [x] Write RED integration tests for calculation math, confirmation, duplicate confirmation rejection, adjustment, and cross-tenant isolation.
- [x] Add `tuition_history`, `tuition_items`, and `tuition_adjustments` schema definitions.
- [x] Generate the new migration, append FORCE RLS/policies for direct-tenant tables, and migrate PostgreSQL.
- [x] Implement `/calculate` from fee schedules, attendance optional-fee snapshots, reductions, and previous balance.
- [x] Implement transactional `/confirm` with whole-batch validation, history/items inserts, and balance charge recalculation.
- [x] Mount `/api/v1/school/tuition` and run targeted tests GREEN.

### Task 2: Tuition adjustments

**Files:**
- Create: `src/tuition/adjustments-routes.ts`
- Modify: `src/server.ts`
- Test: `tests/api/tuition-calculation.integration.test.ts`

- [x] Implement `POST /history/:id/adjust` for confirmed history only.
- [x] Insert an adjustment row, lock the corresponding balance, add the adjustment amount, and recalculate closing balance in one transaction.
- [x] Return validation/not-found envelopes for invalid or cross-tenant histories and run the targeted suite.

### Task 3: Verification

- [x] Run `bun run db:migrate` twice for idempotence.
- [x] Run `bun test`.
- [x] Run `bun x tsc --noEmit`.
- [x] Run Prettier checks on changed TypeScript files.
- [x] Query PostgreSQL metadata for FORCE RLS, policies, and unique indexes.
