# Quản lý nhân viên

## 1. Mục tiêu

Quản lý tài khoản giáo viên (Teacher) và nhân viên (Staff) trong trường, bao gồm thêm mới, chỉnh sửa, xóa, khóa/mở khóa tài khoản, phân công lớp học cho giáo viên, và phân quyền cho nhân viên.

## 2. UX Flow

### 2.1. Xem danh sách nhân viên

- Entry: Menu "Nhân viên" → Danh sách tất cả giáo viên và nhân viên trong trường.
- Hiển thị: Bảng danh sách với các cột: Họ tên, Vai trò (Teacher/Staff), Username, Số điện thoại, Email, Trạng thái (Hoạt động/Bị khóa), Lớp được phân công.
- Actions: Xem chi tiết, Chỉnh sửa, Xóa, Khóa/Mở khóa, Đặt lại mật khẩu.
- Tìm kiếm: Theo tên, theo vai trò, theo lớp.
- Lọc: Lọc theo vai trò (Teacher/Staff), theo trạng thái.

### 2.2. Tạo nhân viên mới

- Entry: Nút "Thêm nhân viên mới" trên danh sách.
- Form nhập:
  - Họ tên (bắt buộc).
  - Vai trò (bắt buộc): Teacher hoặc Staff.
  - Username (bắt buộc, duy nhất trong hệ thống).
  - Password (bắt buộc, tối thiểu 6 ký tự).
  - Số điện thoại (tùy chọn).
  - Email (tùy chọn).
- Success: Tạo tài khoản → Hiển thị mật khẩu 1 lần duy nhất → Chuyển về danh sách.
- Failure: Báo lỗi nếu username đã tồn tại.

### 2.3. Xem chi tiết nhân viên

- Entry: Click vào tên nhân viên trong danh sách.
- Hiển thị:
  - Thông tin cá nhân: Họ tên, Username, SĐT, Email, Vai trò.
  - Thông tin phân công: Danh sách các lớp đang dạy (nếu là Teacher).
  - Lịch sử hoạt động: Các hành động gần đây (nếu có).

### 2.4. Chỉnh sửa nhân viên

- Entry: Nút "Chỉnh sửa" trong trang chi tiết hoặc danh sách.
- Form: Tương tự form tạo mới, nhưng các trường đã được điền sẵn.
- Success: Cập nhật thông tin → Quay lại trang chi tiết.

### 2.5. Xóa nhân viên

- Entry: Nút "Xóa" trong trang chi tiết hoặc danh sách.
- Điều kiện: Chỉ xóa được nếu nhân viên không còn đang dạy lớp nào.
- Confirmation: Xác nhận trước khi xóa.
- Success: Xóa tài khoản khỏi hệ thống.

### 2.6. Khóa / Mở khóa nhân viên

- Entry: Nút "Khóa" hoặc "Mở khóa" trong danh sách.
- Action: Đổi trạng thái tài khoản từ "Hoạt động" sang "Bị khóa" và ngược lại.
- Lưu ý: Khi bị khóa, nhân viên không thể đăng nhập vào hệ thống.

### 2.7. Đặt lại mật khẩu

- Entry: Nút "Đặt lại mật khẩu" trong trang chi tiết hoặc danh sách.
- Action: Tạo mật khẩu mới ngẫu nhiên.
- Success: Hiển thị mật khẩu mới 1 lần duy nhất → School Admin phải chuyển cho nhân viên.

## 3. Business Logic (Quy tắc nghiệp vụ)

1. Username phải là duy nhất trong toàn bộ hệ thống (không phân biệt vai trò).
2. Mật khẩu mặc định phải có ít nhất 6 ký tự (nên có cả chữ và số để tăng bảo mật).
3. Khi tạo tài khoản mới, hệ thống hiển thị mật khẩu 1 lần duy nhất (School Admin sao chép và chuyển cho nhân viên).
4. Chỉ được xóa nhân viên nếu họ không còn đang dạy bất kỳ lớp nào.
5. Khi khóa tài khoản, nhân viên không thể đăng nhập nhưng dữ liệu lịch sử vẫn được giữ nguyên.
6. Một giáo viên (Teacher) có thể được phân công nhiều lớp.
7. Một lớp chỉ có một giáo viên chủ nhiệm.
8. Staff không được phân công lớp (chỉ có Teacher mới được).

## 4. Data Model (Mô tả dữ liệu liên quan)

users (Bảng định danh toàn hệ thống; KHÔNG có `school_id` và KHÔNG có `role`):

- id (PK)
- global_phone (unique toàn hệ thống, dùng đăng nhập)
- username (unique trong tenant, tùy chọn)
- password_hash
- full_name
- phone (nullable)
- email (nullable)
- status (active | locked)
- created_at

school_memberships (Bảng liên kết user ↔ trường và chứa role):

- id (PK)
- user_id (FK → users.id)
- school_id (FK → schools.id)
- role (teacher | staff | school_admin | parent)
- status (active | locked)
- created_at
- Unique: (user_id, school_id, role)

teacher_assignments (Bảng phân công giáo viên):

- id (PK)
- teacher_id (FK → users.id)
- class_id (FK → classes.id)
- assigned_at (timestamp)
- status (active | archived)

staff_permissions (Phân quyền cho Staff - tùy chọn, nếu cần phân quyền chi tiết):

- id (PK)
- staff_id (FK → users.id)
- module (string) (VD: attendance, tuition, health)
- permission (view | edit | delete)
- granted_by (FK → users.id)
- granted_at (timestamp)

## 5. API Contracts

- GET /api/v1/school/staff - Lấy danh sách nhân viên
- POST /api/v1/school/staff - Tạo nhân viên mới
- GET /api/v1/school/staff/:id - Lấy chi tiết nhân viên
- PUT /api/v1/school/staff/:id - Cập nhật thông tin nhân viên
- DELETE /api/v1/school/staff/:id - Xóa nhân viên (chỉ khi không còn lớp)
- PATCH /api/v1/school/staff/:id/status - Khóa/Mở khóa nhân viên
- POST /api/v1/school/staff/:id/reset-password - Đặt lại mật khẩu
- POST /api/v1/school/staff/:id/assign-class - Phân công lớp cho giáo viên
- DELETE /api/v1/school/staff/:id/assign-class/:class_id - Xóa phân công lớp

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher: Chỉ xem được thông tin của mình (không thấy danh sách nhân viên khác).
- Staff: Chỉ xem được thông tin của mình.

## 7. UI Design (Tham khảo)

- Danh sách nhân viên: Bảng với các cột: Họ tên, Vai trò, Username, SĐT, Email, Trạng thái (có màu xanh cho active, đỏ cho locked), Lớp phân công, Actions (Xem, Sửa, Xóa, Khóa, Reset password).
- Form tạo/sửa: Các trường nhập liệu (text, password, phone, email, dropdown chọn vai trò).
- Trang chi tiết: Chia làm 2 cột: Thông tin cá nhân (trái) và Danh sách lớp phân công (phải).
- Responsive: Trên mobile, danh sách xếp dạng thẻ, trang chi tiết xếp chồng.

## 8. Các lưu ý khi triển khai

1. Bảo mật: Mật khẩu phải được mã hóa trước khi lưu vào database (hash).
2. Hiển thị mật khẩu: Khi tạo mới hoặc reset, chỉ hiển thị mật khẩu 1 lần duy nhất trên màn hình.
3. Phân công lớp: Khi phân công giáo viên, kiểm tra xem giáo viên đó đã được phân công lớp này chưa (tránh trùng lặp).
4. Xóa nhân viên: Kiểm tra kỹ các ràng buộc trước khi xóa (lớp học, lịch sử...).
5. Phân quyền Staff: Nếu có yêu cầu phân quyền chi tiết (Staff A chỉ được sửa điểm danh, Staff B chỉ được xem học phí), cần mở rộng bảng staff_permissions.
