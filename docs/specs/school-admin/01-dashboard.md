# Dashboard - Tổng quan trường học

## 1. Mục tiêu

Cung cấp cho School Admin một cái nhìn tổng quan nhanh về tình hình hoạt động của trường trong ngày/tuần/tháng, giúp nắm bắt các chỉ số quan trọng và các hoạt động gần đây cần chú ý.

## 2. UX Flow

### 2.1. Hiển thị Dashboard

- Entry: Đăng nhập thành công → Chuyển đến Dashboard.
- Mô tả: Dashboard được chia thành các khu vực:
  1. Thống kê nhanh (Stats Cards): Các chỉ số chính.
  2. Hoạt động gần đây (Recent Activities): Danh sách các sự kiện quan trọng vừa xảy ra.
  3. Cảnh báo / Yêu cầu chờ xử lý (Alerts / Pending Requests): Các vấn đề cần sự chú ý của School Admin.
- Reload: Dashboard tự động làm mới khi tải lại trang hoặc có sự kiện đẩy (WebSocket) nếu có.

### 2.2. Tương tác

- Xem chi tiết: Click vào các chỉ số thống kê có thể chuyển đến trang danh sách tương ứng (VD: Click vào "Số học sinh" → chuyển đến trang Quản lý học sinh).
- Xử lý cảnh báo: Click vào cảnh báo để chuyển đến trang xử lý tương ứng (VD: Click vào yêu cầu phụ huynh chưa xử lý → chuyển đến Quản lý yêu cầu phụ huynh).

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. Thống kê nhanh (Stats Cards)

- Các chỉ số hiển thị:
  - Tổng số học sinh: Tổng số học sinh đang hoạt động trong trường (không tính học sinh đã nghỉ/chuyển trường).
  - Tổng số lớp: Số lớp đang hoạt động trong năm học hiện tại.
  - Điểm danh hôm nay: Số học sinh có mặt / tổng số học sinh (VD: 45/50), kèm tỷ lệ phần trăm.
  - Học phí chưa thu: Tổng số tiền học phí của tháng hiện tại chưa được thanh toán (nếu có tích hợp thanh toán) hoặc chưa được xác nhận.
  - Yêu cầu phụ huynh chờ xử lý: Số lượng yêu cầu phụ huynh ở trạng thái pending.
- Nguồn dữ liệu: Tất cả đều được tính toán từ các bảng dữ liệu (students, attendance, tuition, parent_requests) trong database.

### 3.2. Hoạt động gần đây (Recent Activities)

- Hiển thị: Danh sách 5-10 sự kiện gần nhất, sắp xếp theo thời gian giảm dần.
- Các loại sự kiện:
  - Có học sinh mới được thêm vào.
  - Có lớp mới được tạo.
  - Có yêu cầu hỗ trợ từ phụ huynh mới.
  - Có yêu cầu hỗ trợ từ School Admin gửi lên System Admin (nếu có).
  - Có cập nhật học phí / xác nhận học phí.
  - (Có thể mở rộng thêm sau).
- Hành động: Click vào sự kiện → chuyển đến trang chi tiết tương ứng.

### 3.3. Cảnh báo / Yêu cầu chờ xử lý (Alerts / Pending Requests)

- Hiển thị: Các cảnh báo cần sự chú ý của School Admin.
- Các loại cảnh báo:
  - Yêu cầu phụ huynh chưa xử lý (pending > 24h).
  - Điểm danh hôm nay chưa được thực hiện (nếu đã qua giờ điểm danh).
  - Học phí tháng này chưa được tính toán / xác nhận.
  - (Có thể mở rộng thêm sau).
- Hành động: Click vào cảnh báo → chuyển đến trang xử lý tương ứng.

## 4. Data Model (Mô tả dữ liệu liên quan)

students:

- id, school_id, full_name, cccd, status (active | inactive), created_at

classes:

- id, school_id, name, school_year_id, teacher_id, status (active | archived), created_at

attendance:

- id, student_id, class_id, date, status (present | absent | late | excused), created_at

tuition_history:

- id, student_id, month, final_amount, confirmed_at, confirmed_by

parent_requests:

- id, parent_id, child_id, type, content, status (pending | resolved | rejected), created_at

dashboard_stats_cache (Tùy chọn - nếu cần cache để tăng hiệu suất):

- id, school_id, stat_type, value, calculated_at

## 5. API Contracts

- GET /api/v1/school/dashboard/stats - Lấy dữ liệu thống kê cho Dashboard.
- GET /api/v1/school/dashboard/recent-activities - Lấy danh sách hoạt động gần đây.
- GET /api/v1/school/dashboard/alerts - Lấy danh sách cảnh báo.

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher/Staff: Không có quyền truy cập Dashboard (hoặc chỉ xem được các thống kê liên quan đến lớp mình, nếu có yêu cầu sau này).

## 7. UI Design (Tham khảo)

- Bố cục: Dạng lưới (Grid) với các thẻ (Cards) thống kê ở hàng trên cùng, danh sách hoạt động và cảnh báo ở hàng dưới (chia 2 cột).
- Stats Cards: Mỗi thẻ hiển thị một chỉ số lớn, kèm icon và label. Sử dụng màu sắc khác nhau cho từng loại thẻ.
- Recent Activities: Dạng danh sách (List) với mỗi dòng là một sự kiện, có icon, nội dung và thời gian.
- Alerts: Dạng danh sách với các dòng cảnh báo có màu nền hoặc viền để phân biệt mức độ (warning, danger, info).
- Responsive: Khi trên mobile, các thẻ thống kê xếp thành 1-2 cột, danh sách hoạt động và cảnh báo xếp chồng lên nhau.

## 8. Các lưu ý khi triển khai

1. Cache: Dashboard thường được gọi nhiều lần, nên cân nhắc cache dữ liệu thống kê (VD: cache 5-10 phút) để giảm tải database.
2. Tính toán: Các chỉ số như "Học phí chưa thu" cần được tính toán dựa trên tuition_history và fee_schedules hiện tại.
3. Cảnh báo: Cảnh báo cần được tính toán theo thời gian thực (VD: kiểm tra yêu cầu phụ huynh > 24h, điểm danh chưa thực hiện sau 8h sáng...).
4. Mở rộng: Dashboard có thể được mở rộng thêm các chỉ số khác sau này (VD: Biểu đồ tăng trưởng học sinh theo tháng, thống kê điểm danh theo tuần...), nhưng nên xây dựng module linh hoạt.
