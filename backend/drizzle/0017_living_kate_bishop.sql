CREATE TABLE "timeline_edit_history" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"post_id" text NOT NULL,
	"editor_id" text NOT NULL,
	"old_content" text NOT NULL,
	"new_content" text NOT NULL,
	"edited_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_media" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"post_id" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"author_membership_id" text NOT NULL,
	"type" text NOT NULL,
	"class_id" text,
	"student_id" text,
	"content" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"post_id" text NOT NULL,
	"student_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_tags_post_student_unique" UNIQUE("post_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "timeline_edit_history" ADD CONSTRAINT "timeline_edit_history_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_edit_history" ADD CONSTRAINT "timeline_edit_history_post_id_timeline_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."timeline_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_edit_history" ADD CONSTRAINT "timeline_edit_history_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_media" ADD CONSTRAINT "timeline_media_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_media" ADD CONSTRAINT "timeline_media_post_id_timeline_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."timeline_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_author_membership_id_school_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_tags" ADD CONSTRAINT "timeline_tags_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_tags" ADD CONSTRAINT "timeline_tags_post_id_timeline_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."timeline_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_tags" ADD CONSTRAINT "timeline_tags_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timeline_edit_history_school_post_idx" ON "timeline_edit_history" USING btree ("school_id","post_id");--> statement-breakpoint
CREATE INDEX "timeline_media_school_post_idx" ON "timeline_media" USING btree ("school_id","post_id");--> statement-breakpoint
CREATE INDEX "timeline_posts_school_created_idx" ON "timeline_posts" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "timeline_posts_school_class_idx" ON "timeline_posts" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX "timeline_posts_school_student_idx" ON "timeline_posts" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "timeline_tags_school_student_idx" ON "timeline_tags" USING btree ("school_id","student_id");
--> statement-breakpoint
ALTER TABLE "timeline_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timeline_posts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timeline_posts_tenant_policy" ON "timeline_posts"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "timeline_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timeline_media" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timeline_media_tenant_policy" ON "timeline_media"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "timeline_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timeline_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timeline_tags_tenant_policy" ON "timeline_tags"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "timeline_edit_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timeline_edit_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timeline_edit_history_tenant_policy" ON "timeline_edit_history"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
