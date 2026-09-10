# Nutrition Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated food items, ingredients, and recipe management APIs for the nutrition foundation.

**Architecture:** Add three Drizzle tables, with direct tenant columns and FORCE RLS on `food_items` and `ingredients`; recipes are scoped through their food item and ingredient ownership checks. Expose one Hono router mounted at `/api/v1/school`, with all database work inside `withTenant` and school admin/staff authorization.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Zod, PostgreSQL numeric columns, real integration tests.

**Spec:** `docs/specs/school-admin/10-nutrition.md` and `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Use TDD: write and observe failing integration tests before production implementation.
- Do not modify existing migration files; generate one new migration.
- Every database query and mutation in routes must run through `withTenant`.
- `food_items` and `ingredients` must use FORCE RLS and tenant policies.
- Use the existing `{ success, data, error }` envelope and shared error helpers.
- Do not add dependencies or mock the database.

### Task 1: RED integration tests

**Files:**

- Create: `tests/api/nutrition.integration.test.ts`

- [x] Write real database tests for food/ingredient CRUD, recipe replacement, recipe detail joins, delete protection, and cross-tenant isolation.
- [x] Run `bun test tests/api/nutrition.integration.test.ts` and verify the expected failure is caused by missing nutrition schema/routes.

### Task 2: Schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0015_*.sql` and matching snapshot/journal entry

- [x] Add `foodItems`, `ingredients`, and `recipes` with tenant-scoped unique constraints and numeric quantities/prices.
- [x] Run `bun run db:generate`, inspect the SQL, append FORCE RLS/policy statements for the two direct-tenant tables, and leave all previous migration files unchanged.
- [x] Run `bun run db:migrate` twice to verify applying and idempotency.

### Task 3: Nutrition routes and registration

**Files:**

- Create: `src/nutrition/routes.ts`
- Modify: `src/server.ts`

- [x] Implement food item list/create/update/delete and detail with recipe ingredient name/unit joins.
- [x] Implement ingredient list/create/update/delete; return validation error when a recipe references an ingredient being deleted.
- [x] Implement recipe upsert by validating that the food item and all ingredients belong to the current school, deleting old links and inserting the submitted list in one transaction.
- [x] Apply `requireAuth` and `requireRole("school_admin", "staff")`; format numeric database values as API numbers.
- [x] Register the router at `/api/v1/school`.

### Task 4: GREEN and verification

- [x] Run the targeted nutrition tests and fix production code only until green.
- [x] Run `bun x tsc --noEmit` and Prettier.
- [x] Run `bun test` and confirm no regression in the existing suite.
- [x] Verify `health`/`forcerowsecurity` and `pg_policies` metadata for both nutrition tables.
