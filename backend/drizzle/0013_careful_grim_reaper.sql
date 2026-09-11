CREATE TABLE "tuition_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"tuition_history_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuition_history" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"month" date NOT NULL,
	"fee_snapshot" jsonb NOT NULL,
	"reduction_type" text,
	"reduction_value" integer,
	"total_fees" integer NOT NULL,
	"total_reduction" integer NOT NULL,
	"final_amount" integer NOT NULL,
	"note" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"voided_reason" text,
	"confirmed_at" timestamp,
	"confirmed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_history_school_student_month_unique" UNIQUE("school_id","student_id","month")
);
--> statement-breakpoint
CREATE TABLE "tuition_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tuition_history_id" text NOT NULL,
	"fee_type" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tuition_adjustments" ADD CONSTRAINT "tuition_adjustments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_adjustments" ADD CONSTRAINT "tuition_adjustments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_adjustments" ADD CONSTRAINT "tuition_adjustments_tuition_history_id_tuition_history_id_fk" FOREIGN KEY ("tuition_history_id") REFERENCES "public"."tuition_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_adjustments" ADD CONSTRAINT "tuition_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_history" ADD CONSTRAINT "tuition_history_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_history" ADD CONSTRAINT "tuition_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_history" ADD CONSTRAINT "tuition_history_confirmed_by_school_memberships_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."school_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_items" ADD CONSTRAINT "tuition_items_tuition_history_id_tuition_history_id_fk" FOREIGN KEY ("tuition_history_id") REFERENCES "public"."tuition_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tuition_adjustments_school_idx" ON "tuition_adjustments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tuition_adjustments_history_idx" ON "tuition_adjustments" USING btree ("tuition_history_id");--> statement-breakpoint
CREATE INDEX "tuition_history_school_month_idx" ON "tuition_history" USING btree ("school_id","month");--> statement-breakpoint
CREATE INDEX "tuition_items_history_idx" ON "tuition_items" USING btree ("tuition_history_id");
--> statement-breakpoint
ALTER TABLE "tuition_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tuition_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tuition_history_tenant_policy" ON "tuition_history" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "tuition_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tuition_adjustments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tuition_adjustments_tenant_policy" ON "tuition_adjustments" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));
