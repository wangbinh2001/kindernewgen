CREATE TABLE "health_records" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"date" date NOT NULL,
	"height" numeric(6, 2) NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"bmi" numeric(6, 2) NOT NULL,
	"who_standard_version" text,
	"age_months" integer NOT NULL,
	"classification" text,
	"note" text,
	"created_by" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"voided_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_created_by_school_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."school_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_records_school_student_date_idx" ON "health_records" USING btree ("school_id","student_id","date");
--> statement-breakpoint
ALTER TABLE "health_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "health_records_tenant_policy" ON "health_records"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
