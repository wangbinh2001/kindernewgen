# 00 Overview

**Goal:** Xây dựng backend API và database cho module School Admin của hệ thống SaaS quản lý mầm non đa điểm (Multi-tenant).
**Architecture:** Modular Monolith (Hono), Drizzle ORM, Postgres. UI (React) làm song song hoặc sau.
**Tech Stack:** Bun, Hono, Drizzle, PostgreSQL, Zod, React, Vite.
**Constraints:** Lọc dữ liệu theo tenant (school_id), không xóa cứng, JWT ngắn hạn + kiểm tra quyền hạn.
