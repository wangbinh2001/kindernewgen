# School Admin Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khởi tạo project Hono + React, thiết lập Database, Auth Middleware Tenant đa điểm, và API CRUD cơ bản (Học sinh, Năm học).

**Architecture:** Modular Monolith. Backend (Hono + Drizzle), Frontend (React + Vite).

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, React, Vite, Tailwind CSS.

**Spec:** Base on `03-PLAN.md` Phase 1 và `07-DATA-MODEL.md`

## Global Constraints
- **Tenant Isolation:** Mọi query dữ liệu phải lọc theo `school_id`.
- **Database:** Dùng `status` để soft delete.

---

### Task 1: Khởi tạo Project & Cấu trúc Backend

**Files:**
- Create: `package.json`
- Create: `src/server.ts`
- Create: `tsconfig.json`

**Interfaces:**
- Produces: Server Hono chạy ở port 3000.

- [ ] **Step 1: Write the failing test**
```typescript
import { expect, test } from "bun:test";
import { app } from "../src/server";

test("GET / healthcheck", async () => {
  const res = await app.request("/");
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/api/server.test.ts`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Write minimal implementation**
```typescript
// src/server.ts
import { Hono } from "hono";
export const app = new Hono();
app.get("/", (c) => c.json({ ok: true }));
export default { port: 3000, fetch: app.fetch };
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/api/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add tests/api/server.test.ts src/server.ts
git commit -m "chore: init hono server and base test"
```

### Task 2: Database Schema & Kết nối

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`

**Interfaces:**
- Produces: `db` instance và schema `schools`, `users`, `schoolMemberships`.

- [ ] **Step 1: Write the failing test**
```typescript
import { expect, test } from "bun:test";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";

test("Database connection works", async () => {
  const result = await db.execute(sql`SELECT 1 as num`);
  expect(result[0].num).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/api/db.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow()
});
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  globalPhone: text("global_phone").unique(),
  status: text("status").default("active")
});

const client = postgres(process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kinder");
export const db = drizzle(client);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/api/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/db tests/api/db.test.ts
git commit -m "feat(db): schema and connection for schools and users"
```
