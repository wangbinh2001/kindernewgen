import { pgTable, text, timestamp, boolean, unique, integer } from "drizzle-orm/pg-core";

// --- Global / Discovery tables (No RLS) ---

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  globalPhone: text("global_phone").unique().notNull(),
  username: text("username"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  sessionVersion: integer("session_version").default(1).notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => [
  unique().on(t.username)
]);

export const schoolMemberships = pgTable("school_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  schoolId: text("school_id").references(() => schools.id).notNull(),
  role: text("role").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => [
  unique().on(t.userId, t.schoolId, t.role)
]);

// --- Tenant tables (RLS MUST BE ENFORCED) ---
// To be added in upcoming phases (students, classes, attendance, etc.)

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").references(() => schools.id).notNull(),
  fullName: text("full_name").notNull(),
  status: text("status").default("active").notNull()
});
