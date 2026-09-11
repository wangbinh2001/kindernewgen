CREATE TABLE "storage_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_at" timestamp,
	CONSTRAINT "storage_objects_school_key_unique" UNIQUE("school_id","object_key")
);
--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_objects_school_owner_idx" ON "storage_objects" USING btree ("school_id","owner_id");
--> statement-breakpoint
ALTER TABLE "storage_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_objects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "storage_objects_tenant_policy" ON "storage_objects"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
