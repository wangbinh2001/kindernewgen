# Quản lý lớp học

## 1. Mục tiêu

Quản lý các lớp học trong trường, bao gồm tạo mới, chỉnh sửa, xóa, phân công giáo viên chủ nhiệm, và theo dõi lịch sử lớp theo từng năm học.

## 2. UX Flow

### 2.1. Xem danh sách lớp

- Entry: Menu "Lớp học" → Danh sách tất cả lớp trong trường.
- Hiển thị: Bảng danh sách với các cột: Tên lớp, Giáo viên chủ nhiệm, Sĩ số, Năm học, Trạng thái (Hoạt động/Đã kết thúc).
- Actions: Xem chi tiết, Chỉnh sửa, Xóa (nếu chưa có học sinh), Chuyển sang năm học mới.
- Tìm kiếm: Theo tên lớp, theo giáo viên, theo năm học.
- Phân trang: Hỗ trợ phân trang nếu danh sách dài.

### 2.2. Tạo lớp mới

- Entry: Nút "Thêm lớp mới" trên danh sách.
- Form nhập:
  - Tên lớp (bắt buộc, duy nhất trong năm học).
  - Năm học (chọn từ danh sách năm học đã tạo).
  - Giáo viên chủ nhiệm (chọn từ danh sách giáo viên).
  - Sĩ số tối đa (tùy chọn).
- Success: Tạo lớp mới → Chuyển về danh sách.
- Failure: Báo lỗi nếu tên lớp đã tồn tại trong năm học.

### 2.3. Xem chi tiết lớp

- Entry: Click vào tên lớp trong danh sách.
- Hiển thị:
  - Thông tin lớp: Tên, Năm học, Giáo viên chủ nhiệm, Sĩ số.
  - Danh sách học sinh trong lớp (có thể chuyển đến trang Quản lý học sinh).
  - Lịch sử năm học (nếu lớp đã tồn tại qua nhiều năm).

### 2.4. Chỉnh sửa lớp

- Entry: Nút "Chỉnh sửa" trong trang chi tiết hoặc danh sách.
- Form: Tương tự form tạo mới, nhưng các trường đã được điền sẵn.
- Success: Cập nhật thông tin → Quay lại trang chi tiết.
- Lưu ý: Không được phép thay đổi năm học nếu lớp đã có học sinh.

### 2.5. Xóa lớp

- Entry: Nút "Xóa" trong trang chi tiết hoặc danh sách.
- Điều kiện: Chỉ xóa được nếu lớp chưa có học sinh.
- Confirmation: Xác nhận trước khi xóa.
- Success: Xóa lớp khỏi hệ thống.

### 2.6. Chuyển lớp sang năm học mới

- Entry: Nút "Chuyển sang năm học mới" trong trang chi tiết (khi năm học kết thúc).
- Action: Chọn năm học mới → Hệ thống tạo bản sao lớp với học sinh hiện tại.
- Lưu ý: Lịch sử lớp cũ vẫn được giữ nguyên.

## 3. Business Logic (Quy tắc nghiệp vụ)

1. Tên lớp phải là duy nhất trong cùng một năm học.
2. Một lớp chỉ có thể có một giáo viên chủ nhiệm tại một thời điểm.
3. Khi xóa lớp, phải kiểm tra xem lớp có học sinh hay không. Nếu có, không cho phép xóa (chỉ cho phép chuyển trạng thái thành "Đã kết thúc").
4. Lịch sử lớp phải được lưu lại theo năm học (VD: Lớp Lá 1 năm 2023-2024, Lớp Lá 1 năm 2024-2025 là 2 bản ghi khác nhau).
5. Chuyển lớp sang năm học mới:
   - Tạo một bản ghi lớp mới với cùng tên (hoặc tên mới nếu người dùng thay đổi).
   - Copy danh sách học sinh từ lớp cũ sang lớp mới.
   - Giữ nguyên lịch sử lớp cũ.
6. Phân công giáo viên: Một giáo viên có thể là chủ nhiệm của nhiều lớp, nhưng cần kiểm tra xung đột thời gian (nếu có nhiều lớp học cùng giờ).

## 4. Data Model (Mô tả dữ liệu liên quan)

classes:

- id (PK)
- school_id (FK → schools.id)
- school_year_id (FK → school_years.id)
- name (string)
- teacher_id (FK → users.id) (Giáo viên chủ nhiệm)
- max_students (int | null)
- status (active | archived)
- created_at

class_students (Bảng liên kết lớp-học sinh):

- id (PK)
- class_id (FK → classes.id)
- student_id (FK → students.id)
- enrolled_at (timestamp)
- status (active | left)

class_history (Lịch sử lớp theo năm học):

- id (PK)
- class_id (FK → classes.id)
- school_year_id (FK → school_years.id)
- name (string) (Lưu tên lớp tại thời điểm đó)
- teacher_id (FK → users.id)
- student_count (int) (Số lượng học sinh tại thời điểm đó)
- created_at

## 5. API Contracts

- GET /api/v1/school/classes - Lấy danh sách lớp học
- POST /api/v1/school/classes - Tạo lớp mới
- GET /api/v1/school/classes/:id - Lấy chi tiết lớp
- PUT /api/v1/school/classes/:id - Cập nhật thông tin lớp
- DELETE /api/v1/school/classes/:id - Xóa lớp (chỉ khi chưa có học sinh)
- POST /api/v1/school/classes/:id/archive - Chuyển lớp sang trạng thái "Đã kết thúc"
- POST /api/v1/school/classes/:id/migrate - Chuyển lớp sang năm học mới

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher: Chỉ xem được danh sách lớp mình đang dạy (nếu có quyền).

## 7. UI Design (Tham khảo)

- Danh sách lớp: Dạng bảng, có cột Tên lớp, Giáo viên, Sĩ số, Năm học, Actions (Xem, Sửa, Xóa, Chuyển năm học).
- Form tạo/sửa lớp: Các trường nhập liệu, dropdown chọn giáo viên, dropdown chọn năm học.
- Trang chi tiết lớp: Chia làm 2 phần: Thông tin lớp (bên trái) và Danh sách học sinh (bên phải, dạng bảng).
- Responsive: Trên mobile, danh sách lớp xếp dạng thẻ, trang chi tiết xếp chồng.

## 8. Các lưu ý khi triển khai

1. Kiểm tra ràng buộc: Khi tạo/sửa lớp, kiểm tra tên lớp không trùng trong cùng năm học.
2. Xóa lớp: Kiểm tra lớp có học sinh hay không trước khi cho phép xóa.
3. Lịch sử: Đảm bảo lịch sử lớp được lưu đầy đủ khi có thay đổi.
4. Chuyển năm học: Khi chuyển lớp sang năm mới, cần copy danh sách học sinh và đánh dấu trạng thái mới.
5. Phân công giáo viên: Nên có cơ chế kiểm tra xung đột lịch dạy của giáo viên (nếu có nhiều lớp cùng giờ).
