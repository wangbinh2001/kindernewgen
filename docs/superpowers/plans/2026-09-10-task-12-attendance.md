# Task 12 Attendance and Optional Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated optional-fee CRUD and immutable attendance workflows with draft upsert, confirmation, and adjustment.

**Architecture:** Add direct-tenant tables with FORCE RLS and route modules mounted under the school API namespace. Every route query and mutation runs inside `withTenant`; attendance authorization derives the tenant and teacher class scope from the authenticated claims and assignments.

**Tech Stack:** Bun, Hono, Zod, Drizzle ORM, PostgreSQL, PostgreSQL RLS.

**Spec:** `docs/specs/school-admin/07-attendance.md`, `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Do not modify existing migrations.
- Use real PostgreSQL integration tests; no database mocks.
- Preserve the API envelope `{ success, data, error }`.
- Keep `draft -> confirmed -> voided` immutable behavior.
- Use `withTenant` for every database query and mutation in new routes.

---

### Task 1: Optional fees

**Files:**
- Create: `tests/api/optional-fees.integration.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0011_*.sql`
- Create: `src/optional-fees/routes.ts`
- Modify: `src/server.ts`

- [x] Write real integration tests for admin CRUD, staff/teacher read-only access, and cross-tenant isolation.
- [x] Run the new test file and confirm RED because the table/router does not exist.
- [x] Add `optional_fees` schema, generate migration, append FORCE RLS and tenant policy without editing old migrations.
- [x] Implement GET/POST/PUT/DELETE with Zod, unique-violation validation, soft-delete, and role guards.
- [x] Mount `/api/v1/school/optional-fees` and run the targeted tests GREEN.

### Task 2: Attendance schema and read/write tests

**Files:**
- Create: `tests/api/attendance.integration.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0012_*.sql` or include in the next generated migration
- Create: `src/attendance/routes.ts`
- Modify: `src/server.ts`

- [x] Add fixtures for two schools, school admins, teachers, school years, classes, students, and assignments.
- [x] Write tests for teacher draft attendance, unauthorized class, draft upsert, confirmation lock, and adjustment history.
- [x] Run the new test file and confirm RED before production implementation.
- [x] Add `attendance` and `attendance_optional_fees` schema and migration with unique attendance key, indexes, FORCE RLS, and policies.
- [x] Implement GET class roster with attendance and fee snapshots; enforce teacher assignment scope.
- [x] Implement transactional POST bulk draft upsert, confirmed-write blocking, and fee amount snapshots.
- [x] Implement transactional `/:id/adjust` that voids the old confirmed row and inserts a confirmed correction.
- [x] Mount `/api/v1/school/attendance` and run targeted tests GREEN.

### Task 3: Verification

- [x] Run `bun run db:migrate` and rerun it to verify idempotence.
- [x] Run the complete `bun test` suite.
- [x] Run `bun x tsc --noEmit`.
- [x] Run Prettier checks on all changed TypeScript files.
- [x] Query PostgreSQL metadata to verify FORCE RLS and policies for every new tenant table.
