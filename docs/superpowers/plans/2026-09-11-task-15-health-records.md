# Task 15: Health Records

## Plan

- [x] Write real integration tests first for BMI/age calculation, teacher class authorization, voiding, and cross-tenant isolation.
- [x] Add the `health_records` Drizzle schema and generate a new migration with FORCE RLS and tenant policy.
- [x] Implement health routes with `requireAuth`, role checks, `withTenant`, BMI/age calculations, latest-per-class reads, history, and immutable voiding.
- [x] Register the health routes without changing existing route behavior.
- [x] Run targeted tests RED then GREEN, typecheck, formatting, migration idempotency, and the full suite.

## Verification

- Targeted health integration tests pass (4/4).
- `bun test` passes with zero failures (77/77).
- `bun x tsc --noEmit` passes.
- Prettier passes for changed files.
- Migration applies idempotently and RLS/policy metadata is verified.
