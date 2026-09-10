CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year_id" text NOT NULL,
	"name" text NOT NULL,
	"teacher_id" text,
	"max_students" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "classes_school_year_name_unique" UNIQUE("school_id","school_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'coming_soon' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_years_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_years_one_active_idx" ON "school_years" ("school_id") WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "school_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "school_years" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "school_years_tenant_policy" ON "school_years" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "classes_tenant_policy" ON "classes" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));
