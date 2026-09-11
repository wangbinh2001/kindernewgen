CREATE TABLE "school_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"setting_key" text NOT NULL,
	"setting_value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_settings_school_key_unique" UNIQUE("school_id","setting_key")
);
--> statement-breakpoint
CREATE TABLE "teacher_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"class_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "school_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "school_settings_tenant_policy" ON "school_settings" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "teacher_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teacher_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "teacher_assignments_tenant_policy" ON "teacher_assignments" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));
