CREATE TABLE "fee_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"class_id" text,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_schedules_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"received_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"period" date NOT NULL,
	"opening_amount" integer NOT NULL,
	"charges" integer DEFAULT 0 NOT NULL,
	"payments" integer DEFAULT 0 NOT NULL,
	"adjustments" integer DEFAULT 0 NOT NULL,
	"closing_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_balances_school_student_period_unique" UNIQUE("school_id","student_id","period")
);
--> statement-breakpoint
CREATE TABLE "student_reductions" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"reduction_type" text NOT NULL,
	"reduction_value" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_reductions_school_student_unique" UNIQUE("school_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_school_memberships_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."school_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_balances" ADD CONSTRAINT "student_balances_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_balances" ADD CONSTRAINT "student_balances_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reductions" ADD CONSTRAINT "student_reductions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reductions" ADD CONSTRAINT "student_reductions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_schedules_school_idx" ON "fee_schedules" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "payments_school_student_idx" ON "payments" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "student_balances_school_period_idx" ON "student_balances" USING btree ("school_id","period");--> statement-breakpoint
CREATE INDEX "student_reductions_school_idx" ON "student_reductions" USING btree ("school_id");
--> statement-breakpoint
ALTER TABLE "fee_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_schedules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fee_schedules_tenant_policy" ON "fee_schedules" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "student_reductions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_reductions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "student_reductions_tenant_policy" ON "student_reductions" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payments_tenant_policy" ON "payments" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));--> statement-breakpoint
ALTER TABLE "student_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_balances" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "student_balances_tenant_policy" ON "student_balances" USING (school_id = current_setting('app.school_id', true)) WITH CHECK (school_id = current_setting('app.school_id', true));
