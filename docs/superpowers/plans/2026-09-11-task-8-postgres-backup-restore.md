# Task 8 PostgreSQL Backup and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide safe, repeatable PostgreSQL backup and restore commands for the Docker-backed KinderNewGenz environment.

**Architecture:** Use `pg_dump` and `pg_restore` through Docker Compose when local PostgreSQL client binaries are unavailable. Backups are custom-format files written without overwriting existing files; restore requires an explicit confirmation flag and targets only the configured database.

**Tech Stack:** Bun, TypeScript, PostgreSQL 17, Docker Compose.

**Spec:** Production hardening checklist: backup and verify PostgreSQL restore.

## Global Constraints

- Do not modify schema, migrations, or API behavior.
- Never overwrite an existing backup file.
- Never restore without `--confirm`.
- Keep database credentials in environment variables, not source files.
- The restore smoke test must use a uniquely named temporary database.

### Task 1: Add operational database scripts

**Files:**
- Create: `backend/scripts/db-tools.ts`
- Create: `backend/scripts/db-backup.ts`
- Create: `backend/scripts/db-restore.ts`
- Modify: `package.json`

- [ ] Add command builders that prefer local `pg_dump`/`pg_restore` and fall back to `docker compose exec -T db`.
- [ ] Add backup output validation and refuse to overwrite an existing file.
- [ ] Add restore confirmation and reject missing/nonexistent backup files.
- [ ] Add root package scripts for `db:backup` and `db:restore`.

### Task 2: Document the runbook

**Files:**
- Modify: `README.md`

- [x] Document backup and restore commands, confirmation requirements, and temporary-database restore verification.

### Task 3: Verify against Docker PostgreSQL

- [x] Run a backup to a temporary file.
- [x] Create a uniquely named temporary database in the Docker PostgreSQL container.
- [x] Restore the dump into that database and verify the `schools` and `storage_objects` tables exist.
- [x] Drop only the uniquely named temporary database.
- [ ] Run `bun run test` and `bun run typecheck`.
