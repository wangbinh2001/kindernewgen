# Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated class and student timelines with media, tags, edit history, and teacher authorization.

**Architecture:** Add four direct-tenant timeline tables with FORCE RLS. A Hono router mounted at `/api/v1/school/timeline` validates class/child scope inside `withTenant`, writes posts and related records atomically, and returns joined feed records with author/media/tags.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Zod, real integration tests.

**Spec:** `docs/specs/school-admin/11-timeline.md` and `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Use TDD: write and observe failing integration tests before production implementation.
- Do not modify existing migration files; generate one new migration.
- All route database operations must execute through `withTenant`.
- Every timeline table has direct `school_id`, FORCE RLS, and a tenant policy.
- Use the existing `{ success, data, error }` envelope and shared error helpers.
- Teacher writes require an active assignment to the class containing the target student; admins bypass that restriction.
- Soft-delete posts; preserve edit history and related records.

### Task 1: RED integration tests

**Files:**

- Create: `tests/api/timeline.integration.test.ts`

- [x] Write real database tests for class posts with tags/media, child posts, teacher assignment rejection, update/edit history, and student feed inclusion of tagged class posts.
- [x] Run `bun test tests/api/timeline.integration.test.ts` and verify failure is caused by missing timeline schema/routes.

### Task 2: Schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0017_*.sql` and matching snapshot/journal entry

- [x] Add `timelinePosts`, `timelineMedia`, `timelineTags`, and `timelineEditHistory` with required foreign keys, unique tag constraint, and query indexes.
- [x] Run `bun run db:generate`, append FORCE RLS and tenant policies for all four tables, and leave migrations 0000-0016 unchanged.
- [x] Run `bun run db:migrate` twice to verify application and idempotency.

### Task 3: Timeline routes and registration

**Files:**

- Create: `src/timeline/routes.ts`
- Modify: `src/server.ts`

- [x] Implement POST validation, teacher assignment checks, post/tag/media inserts, and tenant-owned class/student validation in one transaction.
- [x] Implement class and student feeds with author, media, and tag joins ordered newest first, excluding deleted posts.
- [x] Implement PUT ownership/admin authorization plus edit-history insert, and DELETE soft-delete ownership/admin authorization.
- [x] Register at `/api/v1/school/timeline` for `school_admin` and `teacher`.

### Task 4: GREEN and verification

- [x] Run targeted timeline tests and fix production code only until green.
- [x] Run `bun x tsc --noEmit` and Prettier.
- [x] Verify RLS/policy metadata for all four timeline tables.
- [x] Run the full `bun test` suite and confirm no regression.
