# Nutrition Menus and Grocery Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-isolated menu planning, operating costs, and grocery sheet generation on top of the Task 16a nutrition foundation.

**Architecture:** Add direct-tenant `menus`, `grocery_sheets`, and `operating_costs` tables plus indirect `grocery_sheet_items`. Use separate Hono routers for menus and grocery/operating costs, with all reads and writes inside `withTenant`; grocery generation aggregates recipe quantities for active students and snapshots the computed costs into a grocery sheet transaction.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Zod, numeric columns, real PostgreSQL integration tests.

**Spec:** `docs/specs/school-admin/10-nutrition.md` and `docs/specs/reference/07-DATA-MODEL.md`

## Global Constraints

- Use TDD: write and observe failing integration tests before production implementation.
- Do not modify existing migration files; generate one new migration.
- Every route database query/mutation must use `withTenant`.
- Every table with `school_id` must use FORCE RLS and a tenant policy.
- Use the existing `{ success, data, error }` envelope and shared error helpers.
- Use numeric values safely and round API/calculation results to two decimal places.
- Do not add dependencies or mock the database.

### Task 1: RED integration tests

**Files:**

- Create: `tests/api/menus-grocery.integration.test.ts`

- [x] Write real DB tests for menu replacement, grocery calculation using five active students, operating cost subtraction, grocery detail/confirmation, and cross-tenant reads.
- [x] Run `bun test tests/api/menus-grocery.integration.test.ts` and verify failure is caused by missing menu/grocery schema or routes.

### Task 2: Schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0016_*.sql` and matching snapshot/journal entry

- [x] Add `menus`, `grocerySheets`, `grocerySheetItems`, and `operatingCosts` with required foreign keys, unique constraints, indexes, and numeric columns.
- [x] Run `bun run db:generate`, inspect SQL, append FORCE RLS/policies for all tables with `school_id`, and leave migrations 0000-0015 unchanged.
- [x] Run `bun run db:migrate` twice to verify applying and idempotency.

### Task 3: Menu API

**Files:**

- Create: `src/nutrition/menu-routes.ts`
- Modify: `src/server.ts`

- [x] Implement GET `/api/v1/school/menus?startDate=&endDate=` with food item names and tenant filtering.
- [x] Implement POST `/api/v1/school/menus` to validate date/items, validate owned food items, replace that date's rows in one transaction, and return the saved menu.
- [x] Require `school_admin` or `staff` for now.

### Task 4: Grocery and operating-cost API

**Files:**

- Create: `src/nutrition/grocery-routes.ts`
- Modify: `src/server.ts`

- [x] Implement operating-cost list/create/update/delete for monthly electricity/gas values.
- [x] Implement POST `/api/v1/school/grocery-sheets/generate`: count active students, aggregate recipes through menus, subtract operating costs, round values, and insert sheet/items atomically.
- [x] Implement GET `/:id` with items and ingredient data, and PATCH `/:id/confirm` with `actualTotal` and confirmed status.
- [x] Require `school_admin` or `staff` and return validation/not-found/internal envelopes.

### Task 5: GREEN and verification

- [x] Run targeted tests and fix production code only until green.
- [x] Run `bun x tsc --noEmit` and Prettier.
- [x] Verify RLS/policy metadata for every direct-tenant table.
- [x] Run the full `bun test` suite and confirm no regression.
