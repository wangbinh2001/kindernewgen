import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow()
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  globalPhone: text("global_phone").unique(),
  passwordHash: text("password_hash"),
  status: text("status").default("active")
});

export const schoolMemberships = pgTable("school_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  schoolId: text("school_id").references(() => schools.id),
  role: text("role"),
  status: text("status").default("active")
});
