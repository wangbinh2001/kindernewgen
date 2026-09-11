-- Setup roles (run once)
DO $$ BEGIN
  CREATE ROLE newgen_app;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

GRANT USAGE ON SCHEMA public TO newgen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO newgen_app;

-- Enable RLS on tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;

-- Create policies for newgen_app role
CREATE POLICY tenant_isolation_policy ON schools
  FOR ALL
  TO newgen_app
  USING (id = current_setting('app.school_id', true))
  WITH CHECK (id = current_setting('app.school_id', true));

CREATE POLICY tenant_isolation_policy ON school_memberships
  FOR ALL
  TO newgen_app
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
