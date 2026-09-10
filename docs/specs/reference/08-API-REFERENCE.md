# Tổng hợp API Reference

## 1. Mục tiêu

Cung cấp danh sách đầy đủ các API endpoints của toàn bộ hệ thống, phân theo module và role.

## 2. Quy ước chung

### 2.1. Authentication

Tất cả API (trừ login) đều yêu cầu Bearer Token trong Header:
Authorization: Bearer <token>

### 2.2. Response format

Thành công:
{
"success": true,
"data": { ... },
"error": null
}

Thất bại:
{
"success": false,
"data": null,
"error": {
"code": "ERROR_CODE",
"message": "Mô tả lỗi"
}
}

### 2.3. HTTP Status Codes

- 200 OK: Thành công
- 201 Created: Tạo mới thành công
- 400 Bad Request: Lỗi validation
- 401 Unauthorized: Chưa đăng nhập
- 403 Forbidden: Không có quyền
- 404 Not Found: Không tìm thấy
- 500 Internal Server Error: Lỗi server

## 3. API Authentication (Không cần token)

### 3.1. Đăng nhập System Admin

- Method: POST
- Endpoint: /api/v1/auth/admin/login
- Body: { "username": "admin", "password": "123456" }
- Response: { "token": "...", "user": { "id", "username", "display_name", "role": "system_admin" } }

### 3.2. Đăng nhập School Admin / Teacher / Staff

- Method: POST
- Endpoint: /api/v1/auth/login
- Body: { "username": "school_admin_1", "password": "123456" }
- Response: { "token": "...", "user": { "id", "username", "display_name", "role", "school_id", "school_name" } }

### 3.3. Đăng nhập Parent

- Method: POST
- Endpoint: /api/v1/parent/login
- Body: { "username": "0901234567", "password": "123456" }
- Response: { "token": "...", "user": { "id", "username", "display_name", "role": "parent", "must_change_password": true } }

### 3.4. Đăng xuất

- Method: POST
- Endpoint: /api/v1/auth/logout
- Response: { "message": "Đăng xuất thành công" }

## 4. API System Admin (Yêu cầu token + role system_admin)

### 4.1. Quản lý System Admin

- GET /api/v1/system/admins - Lấy danh sách System Admin
- POST /api/v1/system/admins - Tạo System Admin mới
- PATCH /api/v1/system/admins/:id/status - Khóa/Mở khóa System Admin

### 4.2. Quản lý trường

- GET /api/v1/system/schools - Lấy danh sách trường
- POST /api/v1/system/schools - Tạo trường mới
- GET /api/v1/system/schools/:id - Lấy chi tiết trường
- PATCH /api/v1/system/schools/:id - Cập nhật trường
- PATCH /api/v1/system/schools/:id/status - Tạm ngưng/Kích hoạt trường

### 4.3. Hỗ trợ trường & Audit

- GET /api/v1/system/support/requests - Lấy danh sách yêu cầu hỗ trợ
- PATCH /api/v1/system/support/requests/:id/approve - Phê duyệt yêu cầu hỗ trợ
- POST /api/v1/system/support/session/start - Bắt đầu phiên hỗ trợ
- POST /api/v1/system/support/session/end - Kết thúc phiên hỗ trợ
- GET /api/v1/system/audit-logs - Xem audit log

## 5. API School Admin (Yêu cầu token + role school_admin)

### 5.1. Dashboard

- GET /api/v1/school/dashboard/stats - Lấy thống kê Dashboard
- GET /api/v1/school/dashboard/recent-activities - Lấy hoạt động gần đây
- GET /api/v1/school/dashboard/alerts - Lấy cảnh báo

### 5.2. Quản lý năm học

- GET /api/v1/school/school-years - Lấy danh sách năm học
- POST /api/v1/school/school-years - Tạo năm học mới
- GET /api/v1/school/school-years/:id - Lấy chi tiết năm học
- PUT /api/v1/school/school-years/:id - Cập nhật năm học
- DELETE /api/v1/school/school-years/:id - Xóa năm học
- PATCH /api/v1/school/school-years/:id/close - Đóng năm học

### 5.3. Quản lý lớp học

- GET /api/v1/school/classes - Lấy danh sách lớp
- POST /api/v1/school/classes - Tạo lớp mới
- GET /api/v1/school/classes/:id - Lấy chi tiết lớp
- PUT /api/v1/school/classes/:id - Cập nhật lớp
- DELETE /api/v1/school/classes/:id - Xóa lớp
- POST /api/v1/school/classes/:id/migrate - Chuyển lớp sang năm học mới

### 5.4. Quản lý nhân viên

- GET /api/v1/school/staff - Lấy danh sách nhân viên
- POST /api/v1/school/staff - Tạo nhân viên mới
- GET /api/v1/school/staff/:id - Lấy chi tiết nhân viên
- PUT /api/v1/school/staff/:id - Cập nhật nhân viên
- DELETE /api/v1/school/staff/:id - Xóa nhân viên
- PATCH /api/v1/school/staff/:id/status - Khóa/Mở khóa nhân viên
- POST /api/v1/school/staff/:id/reset-password - Đặt lại mật khẩu
- POST /api/v1/school/staff/:id/assign-class - Phân công lớp
- DELETE /api/v1/school/staff/:id/assign-class/:class_id - Xóa phân công lớp

### 5.5. Quản lý học sinh

- GET /api/v1/school/students - Lấy danh sách học sinh
- POST /api/v1/school/students - Thêm học sinh mới
- GET /api/v1/school/students/:id - Lấy chi tiết học sinh
- PUT /api/v1/school/students/:id - Cập nhật học sinh
- DELETE /api/v1/school/students/:id - Xóa học sinh
- PATCH /api/v1/school/students/:id/status - Cập nhật trạng thái
- POST /api/v1/school/students/:id/transfer-class - Chuyển lớp
- GET /api/v1/school/students/search - Tìm kiếm học sinh

### 5.6. Quản lý điểm danh

- GET /api/v1/school/attendance - Lấy điểm danh theo ngày/lớp
- POST /api/v1/school/attendance - Lưu điểm danh (bulk)
- POST /api/v1/school/attendance/qr-scan - Điểm danh bằng QR
- POST /api/v1/school/attendance/matrix - Lưu Matrix điểm danh
- GET /api/v1/school/attendance/history - Xem lịch sử điểm danh
- PUT /api/v1/school/attendance/:id - Cập nhật điểm danh

### 5.7. Quản lý học phí

- GET /api/v1/school/fees - Lấy danh sách biểu phí
- POST /api/v1/school/fees - Tạo biểu phí mới
- PUT /api/v1/school/fees/:id - Cập nhật biểu phí
- DELETE /api/v1/school/fees/:id - Xóa biểu phí
- GET /api/v1/school/meal-fees - Lấy danh sách tiền ăn
- PUT /api/v1/school/meal-fees - Cập nhật tiền ăn
- GET /api/v1/school/operating-costs - Lấy chi phí vận hành
- POST /api/v1/school/operating-costs - Tạo chi phí vận hành
- PUT /api/v1/school/operating-costs/:id - Cập nhật chi phí vận hành
- DELETE /api/v1/school/operating-costs/:id - Xóa chi phí vận hành
- GET /api/v1/school/students/:id/reduction - Lấy giảm trừ học sinh
- PUT /api/v1/school/students/:id/reduction - Cập nhật giảm trừ
- POST /api/v1/school/tuition/calculate - Tính học phí (tạm tính)
- POST /api/v1/school/tuition/confirm - Xác nhận học phí
- GET /api/v1/school/tuition/history - Xem lịch sử học phí
- GET /api/v1/school/tuition/history/:id - Xem chi tiết học phí
- POST /api/v1/school/tuition/history/:id/adjust - Điều chỉnh học phí

### 5.8. Quản lý sức khỏe

- GET /api/v1/school/health - Lấy danh sách sức khỏe
- POST /api/v1/school/health - Thêm đo sức khỏe mới
- GET /api/v1/school/health/:id - Lấy chi tiết đo
- GET /api/v1/school/students/:id/health-history - Lấy lịch sử sức khỏe
- DELETE /api/v1/school/health/:id - Xóa đo sức khỏe

### 5.9. Quản lý dinh dưỡng

- GET /api/v1/school/food-items - Lấy danh sách món ăn
- POST /api/v1/school/food-items - Tạo món ăn mới
- PUT /api/v1/school/food-items/:id - Cập nhật món ăn
- DELETE /api/v1/school/food-items/:id - Xóa món ăn
- GET /api/v1/school/ingredients - Lấy danh sách nguyên liệu
- POST /api/v1/school/ingredients - Tạo nguyên liệu mới
- PUT /api/v1/school/ingredients/:id - Cập nhật nguyên liệu
- DELETE /api/v1/school/ingredients/:id - Xóa nguyên liệu
- POST /api/v1/school/recipes - Tạo công thức
- PUT /api/v1/school/recipes/:id - Cập nhật công thức
- GET /api/v1/school/menus - Lấy thực đơn
- POST /api/v1/school/menus - Tạo thực đơn
- POST /api/v1/school/menus/generate-week - Tạo thực đơn tuần
- DELETE /api/v1/school/menus/:id - Xóa thực đơn
- POST /api/v1/school/grocery-sheets/generate - Tạo phiếu đi chợ
- GET /api/v1/school/grocery-sheets - Lấy danh sách phiếu đi chợ
- GET /api/v1/school/grocery-sheets/:id - Lấy chi tiết phiếu đi chợ
- PUT /api/v1/school/grocery-sheets/:id - Cập nhật phiếu đi chợ
- PATCH /api/v1/school/grocery-sheets/:id/confirm - Xác nhận phiếu đi chợ

### 5.10. Quản lý Timeline

- GET /api/v1/school/timeline/class/:class_id - Lấy Timeline lớp
- GET /api/v1/school/timeline/student/:student_id - Lấy Timeline cá nhân
- POST /api/v1/school/timeline - Tạo bài đăng mới
- PUT /api/v1/school/timeline/:id - Cập nhật bài đăng
- DELETE /api/v1/school/timeline/:id - Xóa bài đăng
- GET /api/v1/school/timeline/:id - Lấy chi tiết bài đăng
- POST /api/v1/school/timeline/:id/media - Thêm media
- DELETE /api/v1/school/timeline/:id/media/:media_id - Xóa media

### 5.11. Quản lý yêu cầu phụ huynh

- GET /api/v1/school/parent-requests - Lấy danh sách yêu cầu
- GET /api/v1/school/parent-requests/:id - Lấy chi tiết yêu cầu
- PUT /api/v1/school/parent-requests/:id/resolve - Xử lý yêu cầu
- PUT /api/v1/school/parent-requests/:id/reject - Từ chối yêu cầu
- DELETE /api/v1/school/parent-requests/:id - Xóa yêu cầu

### 5.12. Cài đặt trường

- GET /api/v1/school/settings - Lấy tất cả cài đặt
- PUT /api/v1/school/settings/school-info - Cập nhật thông tin trường
- PUT /api/v1/school/settings/school-hours - Cập nhật giờ học
- POST /api/v1/school/settings/holidays - Thêm ngày nghỉ
- DELETE /api/v1/school/settings/holidays/:id - Xóa ngày nghỉ
- PUT /api/v1/school/settings/tuition-config - Cập nhật cấu hình học phí
- PUT /api/v1/school/settings/attendance-config - Cập nhật cấu hình điểm danh
- PUT /api/v1/school/settings/general - Cập nhật cài đặt chung

## 6. API Teacher (Yêu cầu token + role teacher)

- GET /api/v1/teacher/classes - Lấy danh sách lớp được phân công
- GET /api/v1/teacher/classes/:id/students - Lấy danh sách học sinh trong lớp
- POST /api/v1/teacher/attendance - Điểm danh cho lớp
- GET /api/v1/teacher/timeline/class/:class_id - Lấy Timeline lớp
- POST /api/v1/teacher/timeline - Đăng bài mới
- GET /api/v1/teacher/parent-requests - Lấy yêu cầu phụ huynh
- PUT /api/v1/teacher/parent-requests/:id/resolve - Xử lý yêu cầu

## 7. API Parent (Yêu cầu token + role parent)

- POST /api/v1/parent/change-password - Đổi mật khẩu
- GET /api/v1/parent/children - Lấy danh sách con
- GET /api/v1/parent/children/:id - Lấy thông tin con
- GET /api/v1/parent/children/:id/attendance - Lấy lịch sử điểm danh
- GET /api/v1/parent/children/:id/tuition - Lấy lịch sử học phí
- GET /api/v1/parent/children/:id/health - Lấy lịch sử sức khỏe
- GET /api/v1/parent/children/:id/timeline - Lấy Timeline của con
- GET /api/v1/parent/menu - Lấy thực đơn hôm nay
- POST /api/v1/parent/requests - Gửi yêu cầu
- GET /api/v1/parent/requests - Lấy danh sách yêu cầu đã gửi
- GET /api/v1/parent/requests/:id - Lấy chi tiết yêu cầu
- DELETE /api/v1/parent/requests/:id - Hủy yêu cầu (chỉ khi chưa xử lý)

## 8. Tóm tắt số lượng API

| Module                         | Số API       |
| ------------------------------ | ------------ |
| Authentication                 | 4            |
| System Admin                   | 11           |
| School Admin - Dashboard       | 3            |
| School Admin - School Years    | 6            |
| School Admin - Classes         | 6            |
| School Admin - Staff           | 10           |
| School Admin - Students        | 7            |
| School Admin - Attendance      | 6            |
| School Admin - Tuition         | 16           |
| School Admin - Health          | 5            |
| School Admin - Nutrition       | 18           |
| School Admin - Timeline        | 7            |
| School Admin - Parent Requests | 5            |
| School Admin - Settings        | 8            |
| Teacher                        | 7            |
| Parent                         | 12           |
| **Tổng**                       | **~131 API** |
