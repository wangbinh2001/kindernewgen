-- Bootstrap Postgres for kindernewgenz
-- 1. Create app role (idempotent)
DO $$ BEGIN
  CREATE ROLE newgen_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE newgen_app WITH LOGIN PASSWORD 'newgen_app_dev' NOSUPERUSER NOBYPASSRLS;

-- 2. Grant permissions
GRANT USAGE ON SCHEMA public TO newgen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO newgen_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO newgen_app;

-- 3. Remove RLS from discovery tables
ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE school_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- Enable RLS on tenant tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON students;
CREATE POLICY tenant_isolation_policy ON students
  FOR ALL TO newgen_app
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
