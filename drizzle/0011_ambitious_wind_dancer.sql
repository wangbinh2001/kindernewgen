CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"class_id" text NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"check_in_time" text,
	"check_out_time" text,
	"overtime_start" text,
	"overtime_end" text,
	"overtime_hours" numeric(6, 2),
	"state" text DEFAULT 'draft' NOT NULL,
	"voided_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "attendance_optional_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"attendance_id" text NOT NULL,
	"optional_fee_id" text NOT NULL,
	"fee_snapshot_amount" integer NOT NULL,
	CONSTRAINT "attendance_optional_fees_unique" UNIQUE("attendance_id","optional_fee_id")
);
--> statement-breakpoint
CREATE TABLE "optional_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "optional_fees_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_optional_fees" ADD CONSTRAINT "attendance_optional_fees_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_optional_fees" ADD CONSTRAINT "attendance_optional_fees_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_optional_fees" ADD CONSTRAINT "attendance_optional_fees_optional_fee_id_optional_fees_id_fk" FOREIGN KEY ("optional_fee_id") REFERENCES "public"."optional_fees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optional_fees" ADD CONSTRAINT "optional_fees_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_school_student_date_live_unique" ON "attendance" USING btree ("school_id","student_id","date") WHERE "attendance"."state" <> 'voided';--> statement-breakpoint
CREATE INDEX "attendance_school_date_class_idx" ON "attendance" USING btree ("school_id","date","class_id");--> statement-breakpoint
CREATE INDEX "attendance_optional_fees_school_idx" ON "attendance_optional_fees" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "optional_fees_school_idx" ON "optional_fees" USING btree ("school_id");
--> statement-breakpoint
ALTER TABLE "optional_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "optional_fees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "optional_fees_tenant_policy" ON "optional_fees" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_tenant_policy" ON "attendance" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "attendance_optional_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_optional_fees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_optional_fees_tenant_policy" ON "attendance_optional_fees" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));
