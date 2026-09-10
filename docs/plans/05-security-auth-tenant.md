# 05 Security, Auth & Tenant Isolation

1. **Authentication:** JWT Bearer Token chứa sub (userId), school_id, membership_id, ole.
2. **Tenant Isolation (RBAC):** Middleware \equireAuth\ kiểm tra JWT hợp lệ. Middleware \equireTenant\ kiểm tra \school_id\ khớp với \membership_id\ trong DB và \ole\ cho phép thực hiện thao tác.
3. **Data Access:** Mọi query Drizzle (select, update, delete) trên bảng con (student, class, etc.) BẮT BUỘC có điều kiện \.where(eq(table.schoolId, c.var.schoolId))\.
4. **Password:** Hash bằng \un:password\ (argon2/bcrypt). KHÔNG bao giờ trả \password_hash\ ra API.
