# Task 21 Support and Audit Design

## Goal

Add a tenant-scoped support request workflow for school admins, a time-limited read-only support token for system admins, and system-wide audit log browsing without changing existing authentication behavior.

## Data model

Add `support_requests` with the requested school, requester, title, reason, lifecycle status, approval metadata, and expiry metadata. The request row itself is the support session identifier; no separate session table is introduced. Add `audit_logs` with actor, optional tenant, optional support session, action, target, metadata, IP, and timestamp fields.

Add indexes for support request status/school and audit log filters `(school_id, timestamp)`, `(actor_type, timestamp)`, and `(action, timestamp)`. Generate one new Drizzle migration and leave all prior migrations unchanged. School-side writes use `withTenant`; system-admin reads and approval operate on explicitly filtered global rows.

## Authentication and session lifecycle

Extend `SystemAdminAccessTokenClaims` and its validator with optional `school_id`, `support_session_id`, and `scope: "read_only"` fields. Existing system-admin login tokens keep their current claims and behavior. Support tokens keep `role: "system_admin"`, include the approved school and request id, set `scope` to `read_only`, and expire after two hours or the request's earlier `expiresAt`.

Approval changes a request from `pending` to `approved`, records `approvedBy` and `approvedAt`, and sets `expiresAt` to the supplied expiry or two hours from approval. Session start only succeeds for an approved, unexpired request and issues the temporary token. Session end sets the request to `expired` and its expiry to the current time, making subsequent starts fail. JWT expiry and the database expiry check both enforce the time limit.

## Routes

School-side route `POST /api/v1/school/support/requests` requires `school_admin`, validates `title` and `reason`, and inserts a pending request through `withTenant`.

System routes require `requireAuth` and `requireSystemAdmin`:

- `GET /api/v1/system/support/requests` lists requests with optional status filtering.
- `PATCH /api/v1/system/support/requests/:id/approve` approves a pending request and assigns the default two-hour expiry.
- `POST /api/v1/system/support/session/start` accepts `supportRequestId` and returns the temporary token and expiry.
- `POST /api/v1/system/support/session/end` accepts `supportRequestId` and expires the active session.
- `GET /api/v1/system/audit-logs` filters by `schoolId`, `action`, and `actorType`, with bounded `page` and `limit` parameters.

Every route returns the existing `{ success, data, error }` envelope. Invalid input is `VALIDATION_ERROR`; missing or inaccessible rows are `NOT_FOUND`; expired or inactive sessions use `VALIDATION_ERROR` or `FORBIDDEN` consistently with the existing middleware contract; unexpected database failures use `INTERNAL_ERROR`.

## Audit policy

Record an audit row for support request creation, approval, session start, and session end. School-created rows use `actorType: "user"` and the requesting user's id. System actions use `actorType: "system_admin"` and the system admin id. Each row carries the relevant school and request id as `schoolId` and `supportSessionId`, with action and target identifiers sufficient for the audit list API.

## TDD and verification

Create real PostgreSQL integration tests before production implementation. The tests cover school-admin creation, system-admin approval and token claims, rejection of expired requests, session end revocation, audit creation/list filtering/pagination, tenant isolation, and role denial. Run the targeted test file after each RED/GREEN cycle, then run `bun test`, `bun x tsc --noEmit`, and Prettier.
