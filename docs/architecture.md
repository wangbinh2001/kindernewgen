# Architecture

KinderNewGenz is a monorepo with a separately deployable backend and frontend.

```text
frontend -> backend REST API -> PostgreSQL
                         \-> optional realtime invalidation
```

The backend is the source of truth for authentication, authorization, tenant selection, business rules, transactions, and database access. The frontend never receives database credentials.

## Backend

- Runtime: Bun
- HTTP: Hono
- ORM: Drizzle
- Database: PostgreSQL
- Auth: application JWT with tenant and role claims
- Isolation: PostgreSQL FORCE RLS plus `withTenant`

## Current realtime posture

The API is request/response based. A frontend that needs fresh data should refetch after mutations or use polling. If Supabase Realtime is introduced later, events should invalidate frontend queries and the frontend should refetch from the backend.
