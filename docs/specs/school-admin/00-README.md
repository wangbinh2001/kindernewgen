# School Admin - Tổng quan

## 1. Mục tiêu

School Admin là người quản lý toàn bộ hoạt động của một trường học trên nền tảng. Module này tập hợp tất cả các danh mục nghiệp vụ cần thiết để vận hành trường mầm non, từ quản lý học sinh, lớp học, điểm danh, học phí, đến các tiện ích như sức khỏe, dinh dưỡng, timeline và tương tác với phụ huynh.

## 2. Các nhóm danh mục

### 2.1. Tổng quan

- **Dashboard** (`01-dashboard.md`): Hiển thị tổng quan tình hình trường (số học sinh, điểm danh hôm nay, học phí chưa thu, hoạt động gần đây...).

### 2.2. Quản lý hệ thống trường

- **Quản lý năm học** (`02-school-years.md`): Tạo và quản lý các năm học, thiết lập thời gian bắt đầu/kết thúc.
- **Quản lý lớp học** (`03-classes.md`): Tạo lớp, phân công giáo viên chủ nhiệm, theo dõi lịch sử lớp theo từng năm học.
- **Quản lý nhân viên** (`04-staff.md`): Tạo tài khoản Teacher/Staff, phân quyền, phân công giảng dạy.
- **Cài đặt trường** (`05-settings.md`): Cấu hình thông tin trường, giờ học, ngày nghỉ lễ, các tùy chỉnh chung.

### 2.3. Quản lý học sinh

- **Quản lý học sinh** (`06-students.md`): Thêm/sửa/xóa học sinh, quản lý CCCD, thông tin Bố/Mẹ/Người giám hộ (đảm bảo ít nhất 1 người có thông tin).
- **Quản lý điểm danh** (`07-attendance.md`): Điểm danh hàng ngày (thủ công/QR/Matrix), lịch sử điểm danh theo từng học sinh/lớp.

### 2.4. Quản lý tài chính

- **Quản lý học phí** (`08-tuition.md`): Thiết lập biểu phí (Fee Schedule), quản lý giảm trừ (% hoặc số tiền cố định), tính học phí, và lưu lịch sử bất biến (không thay đổi sau khi xác nhận).

### 2.5. Quản lý tiện ích

- **Quản lý sức khỏe** (`09-health.md`): Ghi nhận chiều cao, cân nặng, tính BMI, lưu lịch sử đo đạc.
- **Quản lý dinh dưỡng** (`10-nutrition.md`): Tạo thực đơn (Menu), lập phiếu đi chợ (Grocery/Market sheet).
- **Quản lý timeline** (`11-timeline.md`): Đăng tin tức/hình ảnh trên Timeline lớp (Class Timeline) và Timeline cá nhân từng học sinh (Personal Child Timeline).

### 2.6. Quản lý phụ huynh

- **Quản lý yêu cầu phụ huynh** (`12-parent-requests.md`): Xem và xử lý các yêu cầu/ghi chú từ phụ huynh (xin nghỉ, muộn, thuốc men, v.v.).

## 3. Bảng tổng hợp danh mục và file chi tiết

| #   | Nhóm            | Danh mục          | File                    | Mô tả ngắn                 |
| --- | --------------- | ----------------- | ----------------------- | -------------------------- |
| 1   | Tổng quan       | Dashboard         | `01-dashboard.md`       | Tổng quan trường           |
| 2   | Hệ thống trường | Năm học           | `02-school-years.md`    | Quản lý năm học            |
| 3   | Hệ thống trường | Lớp học           | `03-classes.md`         | Quản lý lớp học            |
| 4   | Hệ thống trường | Nhân viên         | `04-staff.md`           | Quản lý Teacher/Staff      |
| 5   | Hệ thống trường | Cài đặt trường    | `05-settings.md`        | Cấu hình trường            |
| 6   | Học sinh        | Học sinh          | `06-students.md`        | Quản lý học sinh           |
| 7   | Học sinh        | Điểm danh         | `07-attendance.md`      | Quản lý điểm danh          |
| 8   | Tài chính       | Học phí           | `08-tuition.md`         | Quản lý học phí            |
| 9   | Tiện ích        | Sức khỏe          | `09-health.md`          | Quản lý sức khỏe           |
| 10  | Tiện ích        | Dinh dưỡng        | `10-nutrition.md`       | Quản lý thực đơn           |
| 11  | Tiện ích        | Timeline          | `11-timeline.md`        | Quản lý dòng thời gian     |
| 12  | Phụ huynh       | Yêu cầu phụ huynh | `12-parent-requests.md` | Xử lý yêu cầu từ phụ huynh |

## 4. Quy tắc chung cho toàn bộ School Admin

1. **Tenant Isolation (Cách ly dữ liệu)**
   - School Admin chỉ được truy cập và thao tác trên dữ liệu thuộc **trường của mình**.
   - Không được phép xem hoặc sửa dữ liệu của trường khác.

2. **Lịch sử bất biến (Historical Integrity)**
   - Học phí sau khi xác nhận (confirm) sẽ **KHÔNG BAO GIỜ** bị thay đổi, dù sau này có thay đổi biểu phí hay giảm trừ.
   - Lịch sử lớp học, điểm danh, đo sức khỏe phải được lưu giữ nguyên vẹn, không được sửa/xóa.

3. **Parent Request không tự động thành dữ liệu hệ thống**
   - Yêu cầu từ phụ huynh (xin nghỉ, thuốc men...) chỉ là **thông tin tham khảo**.
   - School Admin/Teacher phải **xác nhận và xử lý thủ công** (VD: xác nhận nghỉ học → sau đó mới cập nhật điểm danh).

4. **Phân quyền mặc định**
   - School Admin có **FULL quyền** trên toàn bộ các danh mục trên.
   - Teacher/Staff chỉ có quyền trên các danh mục được phân công (VD: điểm danh lớp mình, đăng timeline lớp mình...).
   - Chi tiết phân quyền sẽ được nêu rõ trong từng file danh mục.

## 5. Hướng dẫn sử dụng tài liệu này

1. Đọc file **`00-README.md`** (file này) để nắm tổng quan.
2. Tùy theo công việc cần làm, mở file chi tiết tương ứng:
   - Ví dụ: Đang làm về học phí → mở `08-tuition.md`.
   - Ví dụ: Đang làm về điểm danh → mở `07-attendance.md`.
3. Mỗi file chi tiết sẽ bao gồm:
   - Mục tiêu của danh mục.
   - UX Flow (luồng người dùng).
   - Business Logic (quy tắc nghiệp vụ).
   - Data Model (cấu trúc dữ liệu liên quan).
   - API Contracts (hợp đồng API).
   - Permissions (phân quyền cụ thể).
   - UI Design (thiết kế giao diện tham khảo).

**Lưu ý:** Các file chi tiết sẽ được viết sau khi file tổng quan này được chốt. Việc tạo đúng thứ tự (từ tổng quan → chi tiết) giúp đảm bảo tính đồng bộ và tránh phải sửa lại sau này.
