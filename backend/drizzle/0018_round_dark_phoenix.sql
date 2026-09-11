CREATE TABLE "parent_request_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"request_id" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_request_history" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"request_id" text NOT NULL,
	"status" text NOT NULL,
	"changed_by" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"response" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parent_request_attachments" ADD CONSTRAINT "parent_request_attachments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_request_attachments" ADD CONSTRAINT "parent_request_attachments_request_id_parent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."parent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_request_history" ADD CONSTRAINT "parent_request_history_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_request_history" ADD CONSTRAINT "parent_request_history_request_id_parent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."parent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_request_history" ADD CONSTRAINT "parent_request_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_requests" ADD CONSTRAINT "parent_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_requests" ADD CONSTRAINT "parent_requests_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_requests" ADD CONSTRAINT "parent_requests_child_id_students_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_requests" ADD CONSTRAINT "parent_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parent_request_attachments_school_request_idx" ON "parent_request_attachments" USING btree ("school_id","request_id");--> statement-breakpoint
CREATE INDEX "parent_request_history_school_request_idx" ON "parent_request_history" USING btree ("school_id","request_id");--> statement-breakpoint
CREATE INDEX "parent_requests_school_status_idx" ON "parent_requests" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "parent_requests_school_child_idx" ON "parent_requests" USING btree ("school_id","child_id");
--> statement-breakpoint
ALTER TABLE "parent_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_requests_tenant_policy" ON "parent_requests"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "parent_request_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_request_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_request_attachments_tenant_policy" ON "parent_request_attachments"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "parent_request_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_request_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_request_history_tenant_policy" ON "parent_request_history"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
