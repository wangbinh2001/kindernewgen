CREATE TABLE "report_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"created_by" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"parameters" jsonb,
	"result" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_jobs_school_created_idx" ON "report_jobs" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "report_jobs_school_status_idx" ON "report_jobs" USING btree ("school_id","status");
