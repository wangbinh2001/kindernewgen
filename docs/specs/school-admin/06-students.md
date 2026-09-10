# Quản lý học sinh

## 1. Mục tiêu

Quản lý toàn bộ hồ sơ học sinh trong trường, bao gồm thêm mới, chỉnh sửa, xóa, tìm kiếm, quản lý CCCD (căn cước công dân), thông tin Bố/Mẹ/Người giám hộ, và các môn học thêm. Đảm bảo tính toàn vẹn dữ liệu và liên kết với Parent Account.

## 2. UX Flow

### 2.1. Xem danh sách học sinh

- Entry: Menu "Học sinh" → Danh sách tất cả học sinh trong trường.
- Hiển thị: Bảng danh sách với các cột: Họ tên, CCCD, Ngày sinh, Giới tính, Lớp hiện tại, Các môn học thêm (tổng hợp), Trạng thái (Đang học/Đã nghỉ).
- Actions: Xem chi tiết, Chỉnh sửa, Xóa, Chuyển lớp.
- Tìm kiếm: Theo tên, theo CCCD, theo lớp, theo số điện thoại của người giám hộ.
- Phân trang và lọc: Hỗ trợ phân trang và lọc theo lớp, trạng thái.

### 2.2. Thêm học sinh mới

- Entry: Nút "Thêm học sinh mới" trên danh sách.
- Form nhập (Chia làm 4 phần):
  - Phần 1 - Thông tin cơ bản:
    - Họ tên (bắt buộc).
    - Ngày sinh (bắt buộc).
    - Giới tính (bắt buộc).
    - Địa chỉ (tùy chọn).
    - Lớp (chọn từ danh sách lớp đang hoạt động).
  - Phần 2 - CCCD:
    - Số CCCD (bắt buộc, duy nhất trong hệ thống).
    - Ngày cấp (tùy chọn).
    - Nơi cấp (tùy chọn).
  - Phần 3 - Bố/Mẹ/Người giám hộ (Ít nhất 1 người):
    - Với mỗi người, có các trường: Họ tên (bắt buộc), Năm sinh (bắt buộc), CCCD (bắt buộc), Số điện thoại (bắt buộc).
  - Phần 4 - Học thêm (Extra-curricular):
    - Danh sách các môn học thêm đã được School Admin khai báo trong Cài đặt trường (VD: "Vẽ", "Nhạc", "Bơi lội", "Tiếng Anh").
    - Mỗi môn là một checkbox để chọn học sinh có tham gia hay không.
    - Khi tick chọn, hệ thống sẽ tự động áp dụng phí của môn học đó vào học phí của học sinh (khi tính học phí).
- Business Logic:
  - Ít nhất 1 trong 3 người (Bố/Mẹ/Người giám hộ) phải có đầy đủ: Họ tên, Năm sinh, CCCD, Số điện thoại.
  - Khi nhập SĐT của người giám hộ, hệ thống tự động kiểm tra và tạo Parent Account (nếu chưa có).
- Success: Tạo học sinh mới → Chuyển về danh sách.
- Failure: Báo lỗi nếu CCCD đã tồn tại, hoặc chưa có đủ thông tin người giám hộ.

### 2.3. Xem chi tiết học sinh

- Entry: Click vào tên học sinh trong danh sách.
- Hiển thị:
  - Thông tin cơ bản: Họ tên, Ngày sinh, Giới tính, CCCD, Địa chỉ.
  - Thông tin lớp: Lớp hiện tại, Lịch sử lớp theo năm học.
  - Thông tin Bố/Mẹ/Người giám hộ: Danh sách 3 người (nếu có).
  - Học thêm: Danh sách các môn học thêm đã đăng ký.
  - Thông tin liên kết: Tài khoản Parent (nếu đã được tạo).

### 2.4. Chỉnh sửa học sinh

- Entry: Nút "Chỉnh sửa" trong trang chi tiết hoặc danh sách.
- Form: Tương tự form thêm mới, các trường đã được điền sẵn.
- Success: Cập nhật thông tin → Quay lại trang chi tiết.
- Lưu ý: Không được phép thay đổi CCCD nếu đã tồn tại lịch sử (có thể cho phép trong trường hợp đặc biệt, nhưng cần cảnh báo).

### 2.5. Xóa học sinh

- Entry: Nút "Xóa" trong trang chi tiết hoặc danh sách.
- Điều kiện: Chỉ xóa được nếu học sinh chưa có lịch sử điểm danh, học phí, hoặc các dữ liệu liên quan khác.
- Confirmation: Xác nhận trước khi xóa.
- Success: Xóa học sinh khỏi hệ thống (hoặc chuyển trạng thái thành "Đã nghỉ" nếu có dữ liệu lịch sử).

### 2.6. Chuyển lớp

- Entry: Nút "Chuyển lớp" trong trang chi tiết.
- Action: Chọn lớp mới (trong năm học hiện tại).
- Lưu ý: Lịch sử lớp cũ vẫn được giữ nguyên trong bảng class_history.
- Success: Cập nhật lớp mới cho học sinh.

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. CCCD (Căn cước công dân)

- Số CCCD phải là duy nhất trong toàn bộ hệ thống (không chỉ trong trường).
- Nếu nhập CCCD đã tồn tại, hệ thống báo lỗi và không cho phép thêm mới.
- CCCD có thể được sử dụng để định danh học sinh khi chuyển trường (nhưng không cho phép truy cập dữ liệu cũ).

### 3.2. Bố/Mẹ/Người giám hộ

- Phải có ít nhất 1 người có đầy đủ: Họ tên, Năm sinh, CCCD, Số điện thoại.
- Nếu thiếu bất kỳ trường nào trong 4 trường trên, hệ thống báo lỗi.
- Thông tin này sẽ được sử dụng để tạo Parent Account (nếu chưa có) hoặc link với Parent Account đã tồn tại (dựa trên SĐT).

### 3.3. Tự động tạo Parent Account

- Khi nhập SĐT của người giám hộ, hệ thống kiểm tra `users.global_phone`, rồi xác nhận membership `(user_id, school_id, role = parent)` trong `school_memberships`.
  - Nếu SĐT đã tồn tại: Link Parent Account hiện tại với học sinh này (thêm bản ghi vào bảng parent_children).
  - Nếu SĐT chưa tồn tại: Tạo Parent Account mới với:
    - Username: Số điện thoại.
    - Password: 123456 (mật khẩu mặc định, bắt buộc đổi lần đầu).
    - Role: parent.
    - School_id: Trường hiện tại.
- Sau khi tạo, Parent Account sẽ được tự động liên kết với học sinh này.

### 3.4. Lớp học và lịch sử

- Học sinh luôn thuộc về một lớp trong năm học hiện tại.
- Khi chuyển lớp, lịch sử lớp cũ được lưu vào bảng class_history.
- Khi năm học kết thúc, tất cả học sinh sẽ được chuyển sang lớp mới (hoặc năm học mới) thông qua quy trình "Chuyển năm học".

### 3.5. Học thêm (Extra-curricular)

- School Admin có thể khai báo các môn học thêm trong Cài đặt trường (extra_curriculars).
- Khi thêm/sửa học sinh, có thể tick chọn các môn học thêm mà học sinh tham gia.
- Khi tính học phí, hệ thống sẽ tự động cộng thêm phí của các môn học thêm đã chọn.

### 3.6. Trạng thái học sinh

- active: Đang học.
- inactive: Đã nghỉ học hoặc chuyển trường.
- Chỉ cho phép xóa học sinh nếu chưa có lịch sử (điểm danh, học phí, v.v.). Nếu đã có lịch sử, chỉ cho phép chuyển trạng thái thành inactive.

## 4. Data Model (Mô tả dữ liệu liên quan)

students:

- id (PK)
- school_id (FK → schools.id)
- full_name (string)
- dob (date)
- gender (male | female | other)
- cccd (string, unique theo `(school_id, cccd)`)
- cccd_issue_date (date | null)
- cccd_issue_place (string | null)
- address (text | null)
- status (active | inactive)
- current_class_id (FK → classes.id | null)
- created_at

responsible_persons:

- id (PK)
- student_id (FK → students.id)
- type (father | mother | guardian)
- full_name (string)
- year_of_birth (int)
- cccd (string)
- phone (string)
- created_at

class_history:

- id (PK)
- student_id (FK → students.id)
- class_id (FK → classes.id)
- school_year_id (FK → school_years.id)
- enrolled_at (timestamp)
- left_at (timestamp | null)
- created_at

parent_children (Bảng liên kết Parent Account - Học sinh):

- id (PK)
- parent_id (FK → users.id)
- child_id (FK → students.id)
- linked_at (timestamp)

student_extra_curricular:

- id (PK)
- student_id (FK → students.id)
- extra_curricular_id (FK → extra_curriculars.id)
- is_enrolled (boolean)
- enrolled_at (timestamp)

extra_curriculars (Bảng danh sách môn học thêm, do School Admin tạo):

- id (PK)
- school_id (FK → schools.id)
- name (string) (VD: "Vẽ", "Nhạc", "Bơi lội")
- amount (decimal)
- status (active | inactive)
- created_at (timestamp)

## 5. API Contracts

- GET /api/v1/school/students - Lấy danh sách học sinh
- POST /api/v1/school/students - Thêm học sinh mới
- GET /api/v1/school/students/:id - Lấy chi tiết học sinh
- PUT /api/v1/school/students/:id - Cập nhật thông tin học sinh
- DELETE /api/v1/school/students/:id - Xóa học sinh (chỉ khi chưa có lịch sử)
- PATCH /api/v1/school/students/:id/status - Cập nhật trạng thái học sinh (active/inactive)
- POST /api/v1/school/students/:id/transfer-class - Chuyển lớp cho học sinh
- GET /api/v1/school/students/search - Tìm kiếm học sinh theo CCCD hoặc tên
- GET /api/v1/school/extra-curriculars - Lấy danh sách các môn học thêm của trường
- POST /api/v1/school/extra-curriculars - Tạo môn học thêm mới

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher: Chỉ xem được danh sách học sinh trong lớp mình dạy.
- Staff: Chỉ xem được danh sách học sinh (không được thêm/sửa/xóa).

## 7. UI Design (Tham khảo)

- Danh sách học sinh: Bảng với các cột: Họ tên, CCCD, Ngày sinh, Lớp, Học thêm (tổng hợp), Trạng thái, Actions (Xem, Sửa, Xóa, Chuyển lớp). Có thanh tìm kiếm và bộ lọc.
- Form thêm/sửa học sinh: Chia làm 4 phần (Thông tin cơ bản, CCCD, Bố/Mẹ/Người giám hộ, Học thêm). Sử dụng accordion hoặc tab để dễ dàng điều hướng.
- Trang chi tiết học sinh: Chia làm các tab: Thông tin chung, Bố/Mẹ/Người giám hộ, Lịch sử lớp, Học thêm, Tài khoản Parent.

## 8. Các lưu ý khi triển khai

1. Kiểm tra ràng buộc CCCD: Khi tạo/sửa học sinh, kiểm tra CCCD không trùng với bất kỳ học sinh nào khác trong hệ thống.
2. Tự động tạo Parent Account: Khi tạo học sinh mới, kiểm tra SĐT người giám hộ và tự động tạo Parent Account nếu chưa có. Cần xử lý trường hợp nhiều học sinh có cùng SĐT (liên kết tất cả với cùng một Parent Account).
3. Đổi CCCD: Có thể cho phép thay đổi CCCD trong trường hợp đặc biệt (sai sót), nhưng cần ghi lại lịch sử thay đổi.
4. Lịch sử lớp: Khi chuyển lớp hoặc chuyển năm học, luôn lưu vào bảng class_history để truy vết sau này.
5. Xóa học sinh: Nếu học sinh đã có lịch sử (điểm danh, học phí), không cho phép xóa mà chuyển trạng thái thành inactive.
6. Học thêm: Khi thêm/sửa học sinh, đảm bảo danh sách môn học thêm được load từ bảng extra_curriculars của trường.
