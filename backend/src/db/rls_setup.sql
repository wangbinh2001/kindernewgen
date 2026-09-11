-- Bootstrap Postgres for kindernewgenz.
-- Run this after the Drizzle migrations have created the tables.

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

-- 3. Discovery/global tables are intentionally not tenant-filtered here.
ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE school_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- System support/audit tables are protected by their system-admin routes. They
-- stay outside this tenant policy because a system admin has no school context.
ALTER TABLE support_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 4. Every table below carries school_id and must be isolated by app.school_id.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'students',
    'student_profiles',
    'school_years',
    'classes',
    'class_students',
    'class_history',
    'school_settings',
    'teacher_assignments',
    'optional_fees',
    'attendance',
    'attendance_optional_fees',
    'fee_schedules',
    'student_reductions',
    'payments',
    'student_balances',
    'tuition_history',
    'tuition_adjustments',
    'health_records',
    'food_items',
    'ingredients',
    'menus',
    'grocery_sheets',
    'operating_costs',
    'timeline_posts',
    'timeline_media',
    'timeline_tags',
    'timeline_edit_history',
    'parent_requests',
    'parent_request_attachments',
    'parent_request_history',
    'notifications',
    'storage_objects',
    'report_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS kindernewgenz_tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY kindernewgenz_tenant_isolation ON %I
       FOR ALL TO newgen_app
       USING (school_id = current_setting(''app.school_id'', true))
       WITH CHECK (school_id = current_setting(''app.school_id'', true))',
      table_name
    );
  END LOOP;
END $$;
