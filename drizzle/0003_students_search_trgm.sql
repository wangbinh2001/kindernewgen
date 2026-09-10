CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS students_full_name_trgm_idx
ON "students"
USING gin ("full_name" gin_trgm_ops);
