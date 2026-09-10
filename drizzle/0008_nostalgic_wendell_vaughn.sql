ALTER TABLE "class_history" DROP CONSTRAINT "class_history_teacher_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "class_history" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "class_students" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "class_students" ADD COLUMN "school_year_id" text;--> statement-breakpoint
ALTER TABLE "class_students" ADD COLUMN "left_at" timestamp;--> statement-breakpoint
UPDATE "class_students" AS cs SET "school_id" = c."school_id", "school_year_id" = c."school_year_id" FROM "classes" AS c WHERE c."id" = cs."class_id";--> statement-breakpoint
UPDATE "class_history" AS h SET "school_id" = c."school_id" FROM "classes" AS c WHERE c."id" = h."class_id";--> statement-breakpoint
UPDATE "class_students" SET "left_at" = now() WHERE "status" = 'left';--> statement-breakpoint
ALTER TABLE "class_history" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_students" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_students" ALTER COLUMN "school_year_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_history" ADD CONSTRAINT "class_history_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_history" DROP COLUMN "class_name";--> statement-breakpoint
ALTER TABLE "class_history" DROP COLUMN "teacher_id";--> statement-breakpoint
ALTER TABLE "class_students" DROP COLUMN "status";--> statement-breakpoint
DROP INDEX IF EXISTS "class_students_one_active_student_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "class_students_current_unique_idx" ON "class_students" ("class_id", "student_id") WHERE "left_at" IS NULL;--> statement-breakpoint
DROP POLICY IF EXISTS "class_students_tenant_policy" ON "class_students";--> statement-breakpoint
CREATE POLICY "class_students_tenant_policy" ON "class_students" USING ("school_id" = current_setting('app.school_id', true)) WITH CHECK ("school_id" = current_setting('app.school_id', true));--> statement-breakpoint
DROP POLICY IF EXISTS "class_history_tenant_policy" ON "class_history";--> statement-breakpoint
CREATE POLICY "class_history_tenant_policy" ON "class_history" USING ("school_id" = current_setting('app.school_id', true)) WITH CHECK ("school_id" = current_setting('app.school_id', true));
