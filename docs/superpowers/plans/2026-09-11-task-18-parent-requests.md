# Parent Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated parent requests with parent creation/cancellation and school-side teacher/admin processing.

**Architecture:** Add `parent_requests`, attachment, and status-history tables with direct tenant columns and FORCE RLS. Separate parent-portal and school-management Hono routers; parent ownership is checked through the existing `parent_children.parent_id = users.id` relation, while teacher access is checked through active class enrollment and assignment.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Zod, real integration tests.

**Spec:** `docs/specs/school-admin/12-parent-requests.md` and `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Use TDD: write and observe failing integration tests before production implementation.
- Do not modify existing migration files; generate one new migration.
- All route database queries and mutations must execute through `withTenant`.
- Every parent-request table has direct `school_id`, FORCE RLS, and a tenant policy.
- Use the existing `{ success, data, error }` envelope and shared error helpers.
- Parent requests can only be cancelled while pending; resolve/reject writes status history.

### Task 1: RED integration tests

**Files:**

- Create: `tests/api/parent-requests.integration.test.ts`

- [x] Write real database tests for parent create/list with attachment, teacher class scoping, resolve/history, and parent cancellation rules.
- [x] Run `bun test tests/api/parent-requests.integration.test.ts` and verify failure is caused by missing request schema/routes.

### Task 2: Schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0018_*.sql` and matching snapshot/journal entry

- [x] Add request, attachment, and history tables with required foreign keys, status fields, unique/index constraints, and direct tenant columns.
- [x] Run `bun run db:generate`, append FORCE RLS and policies for all three tables, and leave migrations 0000-0017 unchanged.
- [x] Run `bun run db:migrate` twice to verify application and idempotency.

### Task 3: Parent Portal API

**Files:**

- Create: `src/parent/routes.ts`
- Modify: `src/server.ts`

- [x] Implement parent-only POST with `parent_children` ownership validation, attachments, and initial pending history in one transaction.
- [x] Implement parent-owned GET list and pending-only DELETE with related records cleanup.
- [x] Register at `/api/v1/parent/requests`.

### Task 4: School Management API

**Files:**

- Create: `src/parent-requests/routes.ts`
- Modify: `src/server.ts`

- [x] Implement admin/teacher request list, teacher class filtering, detail with attachments/history, resolve/reject transitions, and pending delete.
- [x] Enforce teacher assignment and admin bypass; write resolver and history atomically.
- [x] Register at `/api/v1/school/parent-requests`.

### Task 5: GREEN and verification

- [x] Run targeted request tests and fix production code only until green.
- [x] Run `bun x tsc --noEmit` and Prettier.
- [x] Verify RLS/policy metadata for all three request tables.
- [x] Run the full `bun test` suite and confirm no regression.
