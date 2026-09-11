# Database and RLS

Tenant tables carry `school_id` and use FORCE ROW LEVEL SECURITY. The backend sets the transaction-local tenant context through `withTenant(schoolId, callback)`.

Rules:

1. Use the school from verified JWT claims.
2. Wrap every tenant query, including reads, in `withTenant`.
3. Keep schema changes in a new append-only migration under `backend/drizzle/`.
4. Do not use direct frontend database queries.
5. Test cross-tenant isolation for every new tenant endpoint.

Global tables such as `users` and `system_admins` do not use tenant RLS, but authorization must still be explicit.
