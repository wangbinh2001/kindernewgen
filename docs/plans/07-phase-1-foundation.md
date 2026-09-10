# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc superpowers:executing-plans.

**Goal:** Khởi tạo backend SaaS, schema dữ liệu đa tenant, auth middleware, RLS và API nền tảng đầu tiên.

**Spec:** docs/specs/reference/07-DATA-MODEL.md

## Task 0: Đồng bộ đặc tả Tenant & RLS

**Files:**
- Modify: docs/specs/reference/07-DATA-MODEL.md
- Modify: docs/specs/school-admin/04-staff.md
- Modify: docs/specs/school-admin/06-students.md
- Modify: docs/specs/school-admin/11-timeline.md
- Modify: docs/specs/school-admin/12-parent-requests.md

**Interfaces:**
- Produces: Đặc tả thống nhất: users toàn cục; role nằm ở school_memberships; mọi bảng tenant có school_id; unique constraint tenant-scoped; RLS bắt buộc.

- [ ] Xác nhận users không chứa school_id hoặc role.
- [ ] Xác nhận role và membership nằm ở school_memberships.
- [ ] Xác nhận school_id trực tiếp trên mọi bảng tenant.
- [ ] Xác nhận unique constraint tenant-scoped, ví dụ (school_id, cccd).
- [ ] Xác nhận RLS bắt buộc và SET LOCAL app.school_id trong transaction.
- [ ] Commit docs: enforce tenant model and RLS.

**Acceptance:** Không còn schema module mâu thuẫn với 07-DATA-MODEL.md.

## Task 1: Khởi tạo Project & Cấu trúc Backend

**Files:**
- Create: package.json
- Create: tsconfig.json
- Create: drizzle.config.ts
- Create: src/server.ts
- Test: tests/api/server.test.ts

**Interfaces:**
- Produces: HTTP server Hono chạy được bằng Bun.

- [ ] Viết test GET / trả về 200.
- [ ] Chạy test và xác nhận thất bại vì server chưa tồn tại.
- [ ] Tạo Bun project, TypeScript config và Hono server tối thiểu.
- [ ] Chạy test và xác nhận pass.
- [ ] Commit chore: bootstrap Hono and Bun foundation.

## Task 2: Database Schema & Kết nối

**Files:**
- Create: src/db/schema.ts
- Create: src/db/index.ts
- Test: tests/api/db.test.ts

**Interfaces:**
- Produces: Drizzle schema cho schools, users, school_memberships; kết nối PostgreSQL tập trung.

- [ ] Viết test kết nối DB qua db.execute.
- [ ] Chạy test và xác nhận thất bại.
- [ ] Khai báo schema users toàn cục và school_memberships chứa role.
- [ ] Chạy migration và xác nhận schema đúng.
- [ ] Chạy test và xác nhận pass.
- [ ] Commit feat: add tenant database schema.

## Task 3: RLS & Transaction Context

**Files:**
- Create: src/db/tenant.ts
- Create: src/db/migrations
- Test: tests/api/tenant.rls.test.ts

**Interfaces:**
- Produces: withTenant(schoolId, fn) mở transaction và đặt SET LOCAL app.school_id.

- [ ] Viết test hai tenant A và B không đọc được bản ghi của nhau.
- [ ] Chạy test và xác nhận thất bại.
- [ ] Bật RLS cho toàn bộ bảng tenant và tạo policy theo app.school_id.
- [ ] Implement withTenant bằng SET LOCAL trong transaction.
- [ ] Chạy test và xác nhận pass.
- [ ] Commit feat: enforce PostgreSQL tenant isolation.

## Task 4: Middleware Auth & Tenant

**Files:**
- Create: src/middleware/auth.ts
- Test: tests/api/auth.middleware.test.ts

**Interfaces:**
- Consumes: JWT chứa sub, membership_id, school_id, role, session_version.
- Produces: Hono middleware gắn c.get("auth") và mở tenant context.

- [ ] Viết test thiếu token trả 401.
- [ ] Viết test membership bị khóa trả 403.
- [ ] Viết test token hợp lệ trả 200 và có auth context.
- [ ] Chạy test và xác nhận thất bại.
- [ ] Implement verify JWT, kiểm tra membership active và school_id hợp lệ.
- [ ] Chạy test và xác nhận pass.
- [ ] Commit feat: add authenticated tenant middleware.

## Task 5: API Schools & Memberships

**Files:**
- Create: src/routes/schools.ts
- Create: src/routes/memberships.ts
- Test: tests/api/schools.test.ts
- Test: tests/api/memberships.test.ts

**Interfaces:**
- Produces: REST endpoints tạo và đọc school, gắn user với school qua school_memberships.

- [ ] Viết test tạo school thành công.
- [ ] Viết test membership không thuộc tenant bị chặn.
- [ ] Chạy test và xác nhận thất bại.
- [ ] Implement route và service, mọi mutation trong tenant transaction.
- [ ] Chạy test và xác nhận pass.
- [ ] Commit feat: add school and membership APIs.

## Task 6: Kiểm thử chéo tenant bắt buộc

**Files:**
- Create: tests/api/cross-tenant.test.ts

**Interfaces:**
- Consumes: Tất cả route có school_id.
- Produces: Regression test chống rò rỉ PII.

- [ ] Tạo hai trường và dữ liệu riêng cho từng trường.
- [ ] Dùng token trường A gọi API với id thuộc trường B.
- [ ] Kỳ vọng 404 cho GET, PUT, DELETE.
- [ ] Dùng token trường B xác nhận dữ liệu còn nguyên.
- [ ] Chạy toàn bộ suite bun test.
- [ ] Commit test: enforce cross-tenant isolation.
