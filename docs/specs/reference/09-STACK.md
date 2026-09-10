# Stack Công Nghệ — Nguồn sự thật

Tài liệu này là nguồn sự thật duy nhất cho stack. Các tài liệu khác không được thay thế công nghệ nếu chưa có ADR được phê duyệt.

## 1. Frontend

- **Runtime/Package manager:** Bun
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **Server state:** TanStack React Query
- **Local state:** React state/Context; chỉ thêm Zustand khi có nhu cầu đã chứng minh
- **Routing:** React Router
- **Validation:** Zod dùng chung schema khi phù hợp

## 2. Backend

- **Runtime/Package manager/Test runner:** Bun
- **Framework:** Hono
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL
- **Validation:** Zod
- **Auth:** JWT access token + refresh session có thể thu hồi

## 3. Testing

- **API collection/acceptance:** Postman
- **Backend unit/integration:** `bun:test`; gọi trực tiếp Hono app bằng `app.request()`
- **E2E/UI:** Playwright, chỉ chạy sau khi API tương ứng xanh

## 4. DevOps & Tools

- **Linter/Formatter:** ESLint + Prettier
- **Package manager/scripts:** Bun (`bun install`, `bun run`, `bunx`)
- **Migration:** Drizzle Kit chạy qua Bun

## 5. Không sử dụng

Không dùng Node.js runtime, Express, NestJS, Prisma, Vitest, Supertest, npm, pnpm hoặc yarn trong dự án này.

## 6. Kiến trúc

Dùng **modular monolith**. Route chỉ xử lý HTTP; service giữ business logic; repository/Drizzle truy cập database; frontend gọi API qua service/hook. Không tách microservice khi chưa có nhu cầu vận hành đã chứng minh.
