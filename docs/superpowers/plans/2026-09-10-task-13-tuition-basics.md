# Task 13 Tuition Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated fee schedules, student reductions, payment ledger entries, and formula-driven student balances.

**Architecture:** Add four direct-tenant tables with FORCE RLS. School-admin routes perform all reads and writes through `withTenant`; payment creation inserts an immutable ledger row and locks/upserts the monthly balance row before recalculating `opening + charges - payments + adjustments`.

**Tech Stack:** Bun, Hono, Zod, Drizzle ORM, PostgreSQL, PostgreSQL RLS.

**Spec:** `docs/specs/school-admin/08-tuition.md`, `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Do not modify existing migration files.
- Use real PostgreSQL integration tests and no database mocks.
- Preserve `{ success, data, error }` envelopes.
- Use `withTenant` for every new route query and mutation.
- Keep payment ledger rows append-only; update only the derived balance.

---

### Task 1: Schema and fee schedule API

**Files:**
- Create: `tests/api/tuition-basics.integration.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0012_*.sql`
- Create: `src/tuition/fee-schedules-routes.ts`
- Modify: `src/server.ts`

- [x] Write RED tests for fee CRUD and cross-tenant list isolation.
- [x] Add `fee_schedules`, `student_reductions`, `payments`, and `student_balances` schema definitions.
- [x] Generate the new migration, append FORCE RLS policies, and migrate the real database.
- [x] Implement fee schedule GET/POST/PUT/soft-delete with Zod and unique-violation handling.
- [x] Mount `/api/v1/school/fees` and run the fee tests GREEN.

### Task 2: Reductions and payments

**Files:**
- Create: `src/tuition/student-reductions-routes.ts`
- Create: `src/tuition/payments-routes.ts`
- Modify: `src/server.ts`
- Test: `tests/api/tuition-basics.integration.test.ts`

- [x] Add RED tests for percentage/fixed reduction upsert, payment balance creation/update, and cross-tenant rejection.
- [x] Implement reduction GET/PUT for `/api/v1/school/students/:id/reduction`.
- [x] Implement payment POST with membership lookup, payment insert, `FOR UPDATE` balance locking, upsert, and formula recalculation.
- [x] Mount the reduction and payment routes and run all targeted tests GREEN.

### Task 3: Verification

- [x] Run `bun run db:migrate` twice to verify idempotence.
- [x] Run `bun test`.
- [x] Run `bun x tsc --noEmit`.
- [x] Run Prettier checks on all changed TypeScript files.
- [x] Query PostgreSQL metadata for FORCE RLS, tenant policies, and unique indexes.
