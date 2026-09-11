CREATE TABLE "student_profiles" (
	"student_id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"student_code" text,
	"status_date" date,
	"transferred_from_province" text,
	"transferred_from_commune" text,
	"dropout_reason" text,
	"is_newly_enrolled" boolean,
	"enrolled_date" date,
	"is_full_day" boolean,
	"is_boarding_class" boolean,
	"is_boarding" boolean,
	"ethnicity" text,
	"nationality" text,
	"religion" text,
	"birth_place" text,
	"birth_place_province" text,
	"birth_place_commune" text,
	"birth_cert_province" text,
	"birth_cert_commune" text,
	"native_place_province" text,
	"native_place_commune" text,
	"native_place_village" text,
	"permanent_province" text,
	"permanent_commune" text,
	"permanent_hamlet" text,
	"current_address_detail" text,
	"current_province" text,
	"current_commune" text,
	"current_hamlet" text,
	"personal_id" text,
	"passport_number" text,
	"passport_issue_place" text,
	"passport_issue_date" date,
	"area" text,
	"disability_type" text,
	"policy_target" text,
	"tuition_exempt" boolean,
	"tuition_reduced" boolean,
	"study_cost_support" boolean,
	"lunch_support" boolean,
	"language_familiarization" boolean,
	"mother_ethnicity" text,
	"father_ethnicity" text,
	"knows_swimming" boolean,
	"eye_disease" boolean,
	"parent_has_smartphone" boolean,
	"parent_has_computer_internet" boolean,
	"child_development_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "responsible_persons" ADD COLUMN "occupation" text;--> statement-breakpoint
ALTER TABLE "responsible_persons" ADD COLUMN "is_ethnic" boolean;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_profiles_tenant_policy" ON "student_profiles"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
