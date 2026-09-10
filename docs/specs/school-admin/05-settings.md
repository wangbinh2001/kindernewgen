# Cài đặt trường

## 1. Mục tiêu

Cung cấp giao diện để School Admin quản lý các cấu hình và thông tin chung của trường, bao gồm thông tin trường, giờ học, ngày nghỉ, và các tùy chỉnh khác.

## 2. UX Flow

### 2.1. Xem và chỉnh sửa thông tin trường

- Entry: Menu "Cài đặt" → Tab "Thông tin trường".
- Hiển thị: Form với các trường thông tin trường đã được điền sẵn.
- Actions: Chỉnh sửa → Lưu.
- Success: Cập nhật thông tin thành công → Hiển thị thông báo "Đã lưu".

### 2.2. Cấu hình giờ học

- Entry: Menu "Cài đặt" → Tab "Giờ học".
- Hiển thị: Form cho phép thiết lập giờ vào lớp, giờ tan trường, giờ nghỉ trưa (nếu có).
- Actions: Chỉnh sửa → Lưu.
- Success: Cập nhật thành công → Áp dụng cho các chức năng liên quan (VD: điểm danh, tính giờ học).

### 2.3. Quản lý ngày nghỉ

- Entry: Menu "Cài đặt" → Tab "Ngày nghỉ".
- Hiển thị: Danh sách các ngày nghỉ đã thiết lập (ngày lễ, ngày nghỉ đặc biệt).
- Actions: Thêm mới, Xóa, Chỉnh sửa.
- Success: Cập nhật danh sách ngày nghỉ.

### 2.4. Cấu hình học phí

- Entry: Menu "Cài đặt" → Tab "Học phí".
- Hiển thị: Các tham số liên quan đến học phí:
  - Chu kỳ tính học phí (hàng tháng, hàng quý...).
  - Ngày chốt học phí (VD: ngày 25 hàng tháng).
  - Cách tính ngày nghỉ (nếu có).
- Success: Cập nhật thành công.

### 2.5. Cấu hình điểm danh

- Entry: Menu "Cài đặt" → Tab "Điểm danh".
- Hiển thị: Các tham số liên quan đến điểm danh:
  - Giờ bắt đầu điểm danh (VD: 7:30 AM).
  - Giờ kết thúc điểm danh (VD: 8:30 AM).
  - Cho phép điểm danh muộn hay không.
  - Tự động điểm danh QR (nếu có).
- Success: Cập nhật thành công.

### 2.6. Cài đặt chung

- Entry: Menu "Cài đặt" → Tab "Cài đặt chung".
- Hiển thị: Các tùy chỉnh khác:
  - Ngôn ngữ (nếu có hỗ trợ đa ngôn ngữ).
  - Đơn vị tiền tệ (VD: VND, USD).
  - Định dạng ngày/giờ.
  - Màu sắc chủ đạo (nếu có tùy chỉnh giao diện).

## 3. Business Logic (Quy tắc nghiệp vụ)

1. Thông tin trường: Các trường bắt buộc bao gồm Tên trường, Số điện thoại, Địa chỉ.
2. Giờ học: Giờ vào phải trước giờ tan. Giờ nghỉ trưa phải nằm trong khoảng giữa giờ vào và giờ tan.
3. Ngày nghỉ: Không được phép trùng lặp ngày nghỉ trong cùng một ngày.
4. Học phí: Chu kỳ tính học phí mặc định là hàng tháng, ngày chốt mặc định là ngày 25.
5. Điểm danh: Giờ bắt đầu điểm danh mặc định là 7:30, giờ kết thúc là 8:30.
6. Khi cập nhật cài đặt, các chức năng liên quan sẽ áp dụng ngay lập tức (VD: thay đổi giờ học ảnh hưởng đến việc tính điểm danh).

## 4. Data Model (Mô tả dữ liệu liên quan)

schools (Thông tin trường):

- id (PK)
- name (string)
- phone (string)
- email (string)
- address (text)
- logo (string | null) (Đường dẫn ảnh logo)
- created_at

school_settings (Cài đặt trường):

- id (PK)
- school_id (FK → schools.id)
- setting_key (string) (VD: school_hours, holiday, tuition_config...)
- setting_value (json) (Lưu dữ liệu dạng JSON)
- updated_at

## 5. API Contracts

- GET /api/v1/school/settings - Lấy tất cả cài đặt của trường
- PUT /api/v1/school/settings/school-info - Cập nhật thông tin trường
- PUT /api/v1/school/settings/school-hours - Cập nhật giờ học
- POST /api/v1/school/settings/holidays - Thêm ngày nghỉ mới
- DELETE /api/v1/school/settings/holidays/:id - Xóa ngày nghỉ
- PUT /api/v1/school/settings/tuition-config - Cập nhật cấu hình học phí
- PUT /api/v1/school/settings/attendance-config - Cập nhật cấu hình điểm danh
- PUT /api/v1/school/settings/general - Cập nhật cài đặt chung

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher/Staff: Không có quyền truy cập (chỉ xem, không sửa).

## 7. UI Design (Tham khảo)

- Bố cục: Sử dụng tab để phân chia các nhóm cài đặt.
- Form: Mỗi tab là một form riêng, với các trường nhập liệu phù hợp (text, date, time, dropdown...).
- Nút lưu: Mỗi tab có nút "Lưu" riêng hoặc nút "Lưu tất cả" ở cuối trang.
- Responsive: Trên mobile, các tab có thể chuyển thành accordion để tiết kiệm không gian.

## 8. Các lưu ý khi triển khai

1. Lưu dữ liệu: Sử dụng JSON để lưu các cấu hình phức tạp (VD: school_hours, tuition_config) để dễ dàng mở rộng sau này.
2. Validate dữ liệu: Kiểm tra dữ liệu nhập vào trước khi lưu (VD: giờ học hợp lệ, ngày nghỉ không trùng).
3. Áp dụng cài đặt: Khi cập nhật cài đặt, các module liên quan (điểm danh, học phí) phải sử dụng giá trị mới ngay lập tức.
4. Mở rộng: Thiết kế hệ thống cho phép thêm các cài đặt mới mà không cần thay đổi cấu trúc database (sử dụng key-value).
