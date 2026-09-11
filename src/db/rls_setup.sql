-- Roles: app runtime role (non-superuser, RLS enforced)
DO $$ BEGIN
  CREATE ROLE newgen_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE newgen_app WITH LOGIN PASSWORD 'newgen_app_dev' NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO newgen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO newgen_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO newgen_app;

-- Tenant tables: enforce RLS even for table owner
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_memberships FORCE ROW LEVEL SECURITY;

-- Policies (idempotent)
DROP POLICY IF EXISTS tenant_isolation_policy ON schools;
CREATE POLICY tenant_isolation_policy ON schools
  FOR ALL TO newgen_app
  USING (id = current_setting('app.school_id', true))
  WITH CHECK (id = current_setting('app.school_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy ON school_memberships;
CREATE POLICY tenant_isolation_policy ON school_memberships
  FOR ALL TO newgen_app
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
