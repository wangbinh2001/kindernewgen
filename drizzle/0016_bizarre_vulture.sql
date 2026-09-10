CREATE TABLE "grocery_sheet_items" (
	"id" text PRIMARY KEY NOT NULL,
	"grocery_sheet_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"total_quantity" numeric(14, 4) NOT NULL,
	"unit" text NOT NULL,
	"total_price" numeric(14, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "grocery_sheets" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_students" integer NOT NULL,
	"total_food_cost" numeric(14, 2) NOT NULL,
	"electricity_cost" numeric(14, 2) NOT NULL,
	"gas_cost" numeric(14, 2) NOT NULL,
	"estimated_total" numeric(14, 2) NOT NULL,
	"actual_total" numeric(14, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"date" date NOT NULL,
	"meal_type" text NOT NULL,
	"food_item_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "menus_school_date_meal_food_unique" UNIQUE("school_id","date","meal_type","food_item_id")
);
--> statement-breakpoint
CREATE TABLE "operating_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"month" date NOT NULL,
	"electricity_cost" numeric(14, 2) NOT NULL,
	"gas_cost" numeric(14, 2) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operating_costs_school_month_unique" UNIQUE("school_id","month")
);
--> statement-breakpoint
ALTER TABLE "grocery_sheet_items" ADD CONSTRAINT "grocery_sheet_items_grocery_sheet_id_grocery_sheets_id_fk" FOREIGN KEY ("grocery_sheet_id") REFERENCES "public"."grocery_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_sheet_items" ADD CONSTRAINT "grocery_sheet_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_sheets" ADD CONSTRAINT "grocery_sheets_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_costs" ADD CONSTRAINT "operating_costs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grocery_sheet_items_sheet_idx" ON "grocery_sheet_items" USING btree ("grocery_sheet_id");--> statement-breakpoint
CREATE INDEX "grocery_sheets_school_idx" ON "grocery_sheets" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "menus_school_date_idx" ON "menus" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "operating_costs_school_idx" ON "operating_costs" USING btree ("school_id");
--> statement-breakpoint
ALTER TABLE "grocery_sheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_sheets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grocery_sheets_tenant_policy" ON "grocery_sheets"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menus" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menus_tenant_policy" ON "menus"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
--> statement-breakpoint
ALTER TABLE "operating_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operating_costs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "operating_costs_tenant_policy" ON "operating_costs"
  USING (school_id = current_setting('app.school_id', true))
  WITH CHECK (school_id = current_setting('app.school_id', true));
