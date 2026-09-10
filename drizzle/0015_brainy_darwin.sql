CREATE TABLE "food_items" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_items_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"price_per_unit" numeric(12, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"food_item_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity_per_student" numeric(12, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_food_ingredient_unique" UNIQUE("food_item_id","ingredient_id")
);
--> statement-breakpoint
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_items_school_idx" ON "food_items" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "ingredients_school_idx" ON "ingredients" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "recipes_food_item_idx" ON "recipes" USING btree ("food_item_id");
--> statement-breakpoint
ALTER TABLE "food_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "food_items_tenant_policy" ON "food_items"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredients" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ingredients_tenant_policy" ON "ingredients"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
