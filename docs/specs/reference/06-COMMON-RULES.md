# AI Coding Rules - Bắt buộc tuân thủ

## 1. Layer

- Logic nghiệp vụ → Backend (API/Service)
- Gọi API → Frontend (Service/Hook)
- Database → Chỉ Backend truy cập
- UI không chứa business logic, không gọi API trực tiếp

## 2. State

- Local state (useState) = UI tạm, KHÔNG thay thế server state
- Server state (React Query/SWR) = source of truth
- Cache phải có school_id trong key

## 3. API

- Mỗi API 1 file riêng, rõ method + endpoint
- Validate input tại Backend, Frontend chỉ UX
- Trả về lỗi chuẩn: { error: { code, message } }

## 4. Security

- Mọi request đều check token (middleware)
- Tenant isolation: Kiểm tra `membership_id` + `school_id` từ token, KHÔNG từ client
- Không hardcode token, secret, ID
- Hash password bằng Argon2id (ưu tiên) hoặc bcrypt; không lưu/ghi log raw password, activation token, JWT.
- Access JWT ngắn hạn; refresh session lưu server-side với rotation, revoke và expiry. Logout phải revoke refresh session; khóa user/đổi role phải làm token/session cũ vô hiệu.
- Rate-limit login/reset/activation; response login luôn chung "Sai tài khoản hoặc mật khẩu" để tránh user enumeration.
- System Admin bắt buộc MFA trước production; action nhạy cảm cần re-authentication.
- Secrets chỉ qua environment/secret manager, không commit `.env`.
- CCCD, sức khỏe, ảnh/video trẻ em: encryption at rest khi có thể; masking ở UI/log; quyền tối thiểu; không trả dư PII trong API.
- Media: validate MIME + kích thước, dùng object storage + signed URL ngắn hạn, malware scan trước khi public.
- Audit log append-only; redact PII/token/password trong `metadata` và application logs.
- Xác định retention, backup, restore và consent hình ảnh/dữ liệu sức khỏe trước production.

## 4.1. JWT Claims tối thiểu

`sub` (user id), `membership_id`, `school_id`, `role`, `session_version`, `exp`, `jti`. Backend xác thực membership vẫn active và user/session_version còn hợp lệ trên mọi request nhạy cảm.

## 4.2. Support Access

System Admin chỉ vào tenant qua support session: yêu cầu có lý do, có thời hạn, audit liên kết `support_session_id`, có thể thu hồi, mặc định read-only nếu nghiệp vụ cho phép. Không cấp quyền tenant vĩnh viễn trong token System Admin.
## 5. Database

- Migration trước khi sửa schema
- Không xóa dữ liệu cứng (dùng soft delete hoặc status)
- Index cho trường hay query (school_id, student_id, date)

## 6. Component

- 1 component 1 file
- Props có type rõ ràng (TypeScript)
- Logic gọi API để ở Hook, không để trong component

## 7. Test

- API acceptance: Postman collection
- Backend: Unit test + Integration test với `bun:test` và `app.request()` của Hono
- Frontend: E2E với Playwright
- Test cả happy path và error path
- API tương ứng phải xanh trước khi viết/chạy E2E UI
- Không dùng Playwright để thay thế API/integration test

**Nguồn sự thật:** Xem `09-STACK.md`. Không dùng Node.js, Express, Prisma, Vitest, Supertest, npm hoặc pnpm.

## 7.1. Thứ tự bắt buộc

1. Chốt request/response/error contract.
2. Viết API test.
3. Implement route/service/database.
4. API test xanh.
5. Implement UI.
6. Chạy Playwright cho UI.

## 8. Code style

- Format theo Prettier
- Lint theo ESLint
- Không console.log ở production
- Tên biến/hàm rõ nghĩa, tiếng Anh

## 9. Test đúng tầng (CRITICAL)

- Postman/Supertest: Test API (Foundation) TRƯỚC
- Playwright: Test UI/UX (Frontend) SAU KHI API XANH
- KHÔNG dùng Playwright để test API
- KHÔNG dùng Postman để test UI

## 10. Fix root cause

- UI hiển thị sai → Kiểm tra API trả về đúng chưa
- API trả về sai → Kiểm tra database đúng chưa
- Sửa đúng layer, KHÔNG sửa UI khi lỗi ở DB
- KHÔNG dùng `||` fallback để giấu lỗi
