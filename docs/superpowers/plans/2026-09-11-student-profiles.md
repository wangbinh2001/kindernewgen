# Student Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-protected one-to-one `student_profiles` extension and the requested guardian fields without breaking existing student flows.

**Architecture:** Keep the current `students` table and API contract intact. Store the 82-column administrative extension in `student_profiles`, keyed by `student_id`, with `school_id` as the RLS boundary. Add only nullable guardian fields to `responsible_persons` for backward compatibility.

**Tech Stack:** Bun, TypeScript, Drizzle ORM, PostgreSQL, PostgreSQL RLS, Bun test, Prettier.

**Spec:** `docs/superpowers/specs/2026-09-11-student-profiles-design.md`

## Global Constraints

- Do not remove or rename existing `students` columns.
- Do not modify or delete existing migration files.
- Use a real PostgreSQL database in tests; do not mock the database.
- Use `school_id = current_setting('app.school_id', true)` for the new RLS policy.
- Do not commit or push unless explicitly requested.

---

### Task 1: Add the failing schema integration test

**Files:**
- Create: `tests/db/student-profiles.schema.test.ts`

**Interfaces:**
- Consumes: existing `db`, `withTenant`, `schools`, `students`, and `responsiblePersons` schema exports.
- Produces: executable coverage for the new `studentProfiles` export and its tenant behavior.

- [ ] **Step 1: Write the failing test**

Create a real-DB test that inserts two schools and two students, inserts a profile for school A with representative fields from every profile group, verifies the profile is readable in tenant A, verifies the same query returns no row in tenant B, verifies a second profile for the same student fails, verifies deleting the student cascades the profile, and verifies an existing responsible-person insert can omit the new nullable fields.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/db/student-profiles.schema.test.ts`

Expected: FAIL because `studentProfiles` and its new columns do not exist in the schema/database yet.

### Task 2: Implement Drizzle schema changes

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Consumes: existing `schools`, `students`, `responsiblePersons` table definitions.
- Produces: `studentProfiles` with the complete requested field set and nullable `responsiblePersons.occupation`/`isEthnic`.

- [ ] **Step 1: Add the minimal schema implementation**

Add `studentProfiles` after `students`, preserving current student columns. Use text/date/boolean/integer fields matching the approved design, `createdAt` and `updatedAt` defaulting to `now()`, and a `student_id` primary-key foreign key with cascade delete. Add nullable `occupation` and `isEthnic` to `responsiblePersons`.

- [ ] **Step 2: Generate the migration**

Run: `bun x drizzle-kit generate`

Expected: one new migration and matching metadata are created; prior migration files remain unchanged.

### Task 3: Add RLS and apply the migration

**Files:**
- Create: generated migration under `drizzle/`
- Modify: generated `drizzle/meta/_journal.json` and snapshot
- Modify: `src/db/rls_setup.sql`

**Interfaces:**
- Consumes: `student_profiles` table from Task 2.
- Produces: a migrated PostgreSQL table with FORCE RLS and an idempotent tenant policy.

- [ ] **Step 1: Verify the generated migration content**

Confirm it creates `student_profiles`, adds the two nullable responsible-person columns, and does not modify an older migration.

- [ ] **Step 2: Add the new table RLS policy**

Ensure the migration runs `ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and creates a policy whose `USING` and `WITH CHECK` expressions compare `school_id` to `current_setting('app.school_id', true)`.

- [ ] **Step 3: Keep bootstrap RLS aligned**

Add `student_profiles` to the existing RLS setup table list without changing policies for other tables.

- [ ] **Step 4: Apply the migration**

Run: `bun run db:migrate`

Expected: migration completes successfully against the configured PostgreSQL database.

### Task 4: Verify focused GREEN and regression safety

**Files:**
- Test: `tests/db/student-profiles.schema.test.ts`

- [ ] **Step 1: Run the focused test**

Run: `bun test tests/db/student-profiles.schema.test.ts`

Expected: all new profile/RLS/cascade assertions pass.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`

Expected: zero failures and no regression in existing student/auth tests.

- [ ] **Step 3: Run type and formatting checks**

Run: `bun x tsc --noEmit` and `bun x prettier --check src tests`

Expected: both commands exit with code 0. The backend TypeScript project excludes non-runtime `external_tools/` bundle fragments.
