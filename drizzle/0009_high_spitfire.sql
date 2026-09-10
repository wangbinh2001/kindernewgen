CREATE TABLE "system_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_created_by_system_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."system_admins"("id") ON DELETE no action ON UPDATE no action;