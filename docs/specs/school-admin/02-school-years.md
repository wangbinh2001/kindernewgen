# Quản lý năm học

## 1. Mục tiêu

Quản lý các năm học của trường, bao gồm tạo mới, chỉnh sửa, xóa và thiết lập thời gian bắt đầu/kết thúc cho từng năm học. Đây là dữ liệu nền tảng để các danh mục khác (lớp học, học sinh, điểm danh...) hoạt động.

## 2. UX Flow

### 2.1. Xem danh sách năm học

- Entry: Menu "Năm học" → Danh sách tất cả năm học của trường.
- Hiển thị: Bảng danh sách với các cột: Tên năm học, Ngày bắt đầu, Ngày kết thúc, Trạng thái (Đang diễn ra/Đã kết thúc), Số lớp.
- Actions: Xem chi tiết, Chỉnh sửa, Xóa (nếu chưa có lớp học).
- Tìm kiếm: Theo tên năm học.

### 2.2. Tạo năm học mới

- Entry: Nút "Thêm năm học mới" trên danh sách.
- Form nhập:
  - Tên năm học (bắt buộc, duy nhất trong trường). VD: "Năm học 2024-2025".
  - Ngày bắt đầu (bắt buộc).
  - Ngày kết thúc (bắt buộc, phải sau ngày bắt đầu).
  - Trạng thái: Mặc định là "Sắp diễn ra" hoặc "Đang diễn ra".
- Success: Tạo năm học mới → Chuyển về danh sách.
- Failure: Báo lỗi nếu tên năm học đã tồn tại.

### 2.3. Xem chi tiết năm học

- Entry: Click vào tên năm học trong danh sách.
- Hiển thị:
  - Thông tin năm học: Tên, Ngày bắt đầu, Ngày kết thúc, Trạng thái.
  - Danh sách các lớp thuộc năm học này (có thể chuyển đến trang Quản lý lớp học).
  - Danh sách học sinh (tổng hợp từ các lớp).

### 2.4. Chỉnh sửa năm học

- Entry: Nút "Chỉnh sửa" trong trang chi tiết hoặc danh sách.
- Form: Tương tự form tạo mới, nhưng các trường đã được điền sẵn.
- Success: Cập nhật thông tin → Quay lại trang chi tiết.
- Lưu ý: Không được phép thay đổi ngày nếu năm học đã có dữ liệu.

### 2.5. Xóa năm học

- Entry: Nút "Xóa" trong trang chi tiết hoặc danh sách.
- Điều kiện: Chỉ xóa được nếu năm học chưa có lớp học nào.
- Confirmation: Xác nhận trước khi xóa.
- Success: Xóa năm học khỏi hệ thống.

### 2.6. Đóng năm học

- Entry: Nút "Đóng năm học" trong trang chi tiết (khi năm học kết thúc).
- Action: Chuyển trạng thái từ "Đang diễn ra" sang "Đã kết thúc".
- Lưu ý: Sau khi đóng, không thể thêm/sửa dữ liệu vào năm học này (chỉ xem).

## 3. Business Logic (Quy tắc nghiệp vụ)

1. Tên năm học phải là duy nhất trong toàn bộ trường.
2. Ngày bắt đầu phải trước ngày kết thúc.
3. Mỗi trường chỉ có một năm học có trạng thái "Đang diễn ra" tại một thời điểm.
4. Nếu một năm học đã có lớp học, không cho phép xóa (chỉ cho phép chuyển trạng thái thành "Đã kết thúc").
5. Khi đóng năm học:
   - Chuyển trạng thái thành "Đã kết thúc".
   - Tất cả lớp học thuộc năm học này cũng chuyển trạng thái thành "Đã kết thúc" (nếu có).
   - Không cho phép thêm/sửa dữ liệu vào năm học đã đóng.
6. Trạng thái năm học:
   - Sắp diễn ra (coming_soon): Chưa bắt đầu.
   - Đang diễn ra (active): Đang hoạt động.
   - Đã kết thúc (archived): Đã đóng.

## 4. Data Model (Mô tả dữ liệu liên quan)

school_years:

- id (PK)
- school_id (FK → schools.id)
- name (string, unique trong trường)
- start_date (date)
- end_date (date)
- status (coming_soon | active | archived)
- created_at

## 5. API Contracts

- GET /api/v1/school/school-years - Lấy danh sách năm học
- POST /api/v1/school/school-years - Tạo năm học mới
- GET /api/v1/school/school-years/:id - Lấy chi tiết năm học
- PUT /api/v1/school/school-years/:id - Cập nhật năm học
- DELETE /api/v1/school/school-years/:id - Xóa năm học (chỉ khi chưa có lớp học)
- PATCH /api/v1/school/school-years/:id/close - Đóng năm học (chuyển trạng thái thành archived)
- POST /api/v1/school/school-years/:id/activate - Kích hoạt năm học (chuyển trạng thái thành active)

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher/Staff: Chỉ xem danh sách năm học (không được tạo/sửa/xóa).

## 7. UI Design (Tham khảo)

- Danh sách năm học: Dạng bảng, có cột Tên, Ngày bắt đầu, Ngày kết thúc, Trạng thái (có màu sắc phân biệt: xanh cho active, vàng cho coming_soon, xám cho archived), Actions (Xem, Sửa, Xóa, Đóng/Kích hoạt).
- Form tạo/sửa: Các trường nhập liệu (text, date), dropdown chọn trạng thái.
- Trang chi tiết: Chia làm 2 phần: Thông tin năm học (bên trái) và Danh sách lớp học (bên phải).
- Responsive: Trên mobile, danh sách xếp dạng thẻ, trang chi tiết xếp chồng.

## 8. Các lưu ý khi triển khai

1. Kiểm tra ràng buộc: Khi tạo năm học mới, kiểm tra tên không trùng và ngày hợp lệ.
2. Trạng thái active: Chỉ cho phép một năm học active tại một thời điểm. Nếu tạo mới với status active, tự động chuyển các năm học khác sang archived.
3. Xóa năm học: Kiểm tra xem có lớp học nào thuộc năm học này không. Nếu có, không cho phép xóa.
4. Đóng năm học: Sau khi đóng, các API thêm/sửa dữ liệu liên quan đến năm học này sẽ trả về lỗi.
5. Mở rộng: Có thể thêm trường "Học kỳ" nếu trường muốn chia năm học thành nhiều kỳ (nhưng hiện tại chưa có yêu cầu).
