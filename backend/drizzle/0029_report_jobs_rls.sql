ALTER TABLE "report_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "kindernewgenz_tenant_isolation" ON "report_jobs";
--> statement-breakpoint
CREATE POLICY "kindernewgenz_tenant_isolation" ON "report_jobs"
  FOR ALL TO newgen_app
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
