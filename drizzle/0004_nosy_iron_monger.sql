CREATE TABLE "parent_children" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responsible_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"type" text NOT NULL,
	"full_name" text NOT NULL,
	"year_of_birth" integer NOT NULL,
	"cccd" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "dob" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "cccd" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "cccd_issue_date" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "cccd_issue_place" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_child_id_students_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsible_persons" ADD CONSTRAINT "responsible_persons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_cccd_unique" UNIQUE("school_id","cccd");