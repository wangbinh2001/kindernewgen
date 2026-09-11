# Supabase Realtime Option

Supabase can provide realtime events only when the PostgreSQL database is hosted on Supabase or changes are explicitly published to a Supabase Realtime channel. It does not synchronize an unrelated PostgreSQL instance automatically.

For this project, keep the backend as the data and authorization authority:

```text
teacher -> backend transaction -> PostgreSQL
frontend <- realtime invalidation or polling
frontend -> backend GET refetch
```

Do not subscribe the frontend directly to tenant tables while the current RLS model depends on `current_setting('app.school_id', true)`. Supabase Realtime does not automatically set that backend transaction variable. Direct subscriptions would require a separately designed Supabase JWT/RLS model.

The low-cost MVP is polling or refetch-on-focus. Realtime can be added later without changing the API contract if it is used only as an invalidation signal.
