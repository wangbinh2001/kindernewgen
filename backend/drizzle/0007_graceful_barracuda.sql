CREATE TABLE "class_history" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"class_id" text NOT NULL,
	"school_year_id" text NOT NULL,
	"class_name" text NOT NULL,
	"teacher_id" text,
	"enrolled_at" timestamp NOT NULL,
	"left_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_students" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"student_id" text NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "current_class_id" text;--> statement-breakpoint
ALTER TABLE "class_history" ADD CONSTRAINT "class_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_history" ADD CONSTRAINT "class_history_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_history" ADD CONSTRAINT "class_history_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_history" ADD CONSTRAINT "class_history_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_current_class_id_classes_id_fk" FOREIGN KEY ("current_class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_students_one_active_student_idx" ON "class_students" ("student_id") WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "class_students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_students_tenant_policy" ON "class_students" USING (EXISTS (SELECT 1 FROM "classes" WHERE "classes"."id" = "class_students"."class_id" AND "classes"."school_id" = current_setting('app.school_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "classes" WHERE "classes"."id" = "class_students"."class_id" AND "classes"."school_id" = current_setting('app.school_id', true)));--> statement-breakpoint
ALTER TABLE "class_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_history_tenant_policy" ON "class_history" USING (EXISTS (SELECT 1 FROM "classes" WHERE "classes"."id" = "class_history"."class_id" AND "classes"."school_id" = current_setting('app.school_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "classes" WHERE "classes"."id" = "class_history"."class_id" AND "classes"."school_id" = current_setting('app.school_id', true)));
