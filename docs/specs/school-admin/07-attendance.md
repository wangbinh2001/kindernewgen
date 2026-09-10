# Quản lý điểm danh

## 1. Mục tiêu

Quản lý điểm danh học sinh hàng ngày, hỗ trợ nhiều phương thức nhập liệu (thủ công, QR Code, Matrix) và lưu trữ lịch sử điểm danh theo từng học sinh, lớp, và ngày. Hỗ trợ thêm các tùy chọn phí phát sinh (tăng ca, ăn sáng, bán trú...) và các khoản phí tùy chọn khác trong quá trình điểm danh.

## 2. UX Flow

### 2.1. Xem điểm danh theo ngày và lớp

- Entry: Menu "Điểm danh" → Chọn lớp → Chọn ngày (mặc định là hôm nay).
- Hiển thị: Bảng danh sách học sinh của lớp đó, mỗi hàng là một học sinh với các cột: STT, Họ tên, Trạng thái điểm danh (Có mặt/Vắng/Muộn/Nghỉ có phép), Tăng ca (checkbox hoặc icon), Phí tùy chọn (các checkbox).
- Actions:
  - Cập nhật trạng thái cho từng học sinh (click vào dropdown hoặc nút).
  - Điểm danh nhanh: Nút "Có mặt tất cả" hoặc "Vắng tất cả".
  - Lưu điểm danh.

### 2.2. Tùy chọn khi click vào một học sinh (Popup/Modal chi tiết)

- Entry: Click vào tên hoặc dòng của một học sinh trong bảng điểm danh.
- Hiển thị: Một popup/modal với các thông tin và tùy chọn chi tiết:
  1. Thông tin cơ bản: Họ tên, Lớp, Ngày.
  2. Trạng thái điểm danh (Dropdown): Có mặt / Vắng / Muộn / Nghỉ có phép.
  3. Ghi chú (Text area): Nhập ghi chú (VD: "Ốm", "Đi muộn 15 phút"...).
  4. Thời gian vào/ra (Time pickers): Giờ vào, Giờ ra (nếu có yêu cầu).
  5. Tăng ca (Checkbox + Time picker):
     - Checkbox "Tăng ca": Nếu tick, hiển thị thêm:
       - Giờ bắt đầu tăng ca.
       - Giờ kết thúc tăng ca (hoặc chọn số giờ tăng ca).
     - Hệ thống sẽ tự động tính phí tăng ca dựa trên cấu hình (sẽ được xử lý ở module Học phí).
  6. Phí tùy chọn (Checkboxes):
     - Danh sách các phí tùy chọn đã được khai báo trong Cài đặt trường (VD: "Ăn sáng", "Ăn trưa", "Bán trú", "Đồng phục", "Sách vở").
     - Mỗi phí là một checkbox để giáo viên đánh dấu học sinh có sử dụng dịch vụ đó trong ngày hay không.
     - Nếu checkbox được tick, hệ thống sẽ tự động thêm khoản phí đó vào học phí của học sinh trong tháng.
- Actions: Lưu thay đổi cho học sinh đó, Đóng popup.

### 2.3. Điểm danh bằng QR Code

- Entry: Nút "Quét QR" trên trang điểm danh.
- Action:
  1. Mở camera (hoặc nhập mã QR thủ công).
  2. Quét mã QR của học sinh.
  3. Hệ thống tự động cập nhật trạng thái của học sinh đó thành "Có mặt".
- Success: Cập nhật trạng thái thành công → Hiển thị thông báo "Đã điểm danh học sinh X".
- Mở rộng: Sau khi quét QR, có thể hiện popup (tương tự 2.2) để nhập thêm các thông tin về tăng ca và phí tùy chọn cho học sinh đó.

### 2.4. Điểm danh bằng Matrix

- Entry: Nút "Matrix" trên trang điểm danh.
- Hiển thị: Bảng Matrix với hàng là học sinh, cột là các khung giờ (VD: 7:30, 8:00, 8:30...).
- Action: Click vào ô để đánh dấu học sinh có mặt tại khung giờ đó.
- Success: Lưu Matrix → Hiển thị thông báo "Đã lưu Matrix điểm danh".
- Mở rộng: Ngoài các cột khung giờ, có thể thêm các cột riêng cho "Tăng ca" và "Phí tùy chọn" (dạng checkbox) ngay trên bảng Matrix.

### 2.5. Xem lịch sử điểm danh

- Entry: Menu "Lịch sử điểm danh" → Chọn học sinh hoặc lớp → Chọn khoảng thời gian.
- Hiển thị: Bảng lịch sử với các cột: Ngày, Học sinh, Lớp, Trạng thái, Tăng ca (số giờ), Các phí tùy chọn đã chọn, Ghi chú.
- Actions: Lọc theo ngày, xuất báo cáo (nếu có).

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. Quy tắc chung

- Mỗi ngày, mỗi học sinh chỉ có một bản ghi điểm danh duy nhất (theo ngày và tenant).
- Trạng thái điểm danh: present (Có mặt), absent (Vắng), late (Muộn), excused (Nghỉ có phép).
- Nếu học sinh chưa được điểm danh, trạng thái mặc định là null (chưa điểm danh).
- **Lịch sử bất biến:** Bản ghi điểm danh có state: `draft` -> `confirmed` -> `voided`. Sau khi chuyển sang `confirmed` (thường là cuối ngày), không được phép `UPDATE` hay `DELETE`. Mọi sai sót phải xử lý bằng thao tác điều chỉnh (tạo bản ghi void/correction với lý do và người thực hiện).

### 3.2. Tăng ca (Overtime)

- Khi nào tính tăng ca? Học sinh ở lại trường sau giờ tan (theo cài đặt giờ học).
- Cách tính: Hệ thống tính số giờ tăng ca dựa trên giờ bắt đầu và giờ kết thúc tăng ca (không chỉ lưu số giờ tổng).
- Đơn giá: Được cấu hình trong Cài đặt trường (school_settings), áp dụng cho tất cả học sinh hoặc theo lớp.
- Lưu ý: Việc tính phí tăng ca sẽ được module Học phí xử lý, nhưng module Điểm danh phải lưu khoảng thời gian tăng ca của từng học sinh trong ngày.

### 3.3. Phí tùy chọn (Optional Fees)

- Bắt buộc snapshot lưu cứng giá tiền (amount) tại thời điểm điểm danh, không link trực tiếp giá từ bảng biểu phí để tránh sai lệch lịch sử.
- Danh sách phí: Được School Admin khai báo trong Cài đặt trường (school_settings), với các trường: Tên phí, Giá tiền, Áp dụng cho lớp nào (nếu có).
- Cách sử dụng: Khi điểm danh, giáo viên tick checkbox cho những học sinh có sử dụng dịch vụ đó trong ngày.
- Lưu ý: Module Điểm danh chỉ lưu trạng thái "Có sử dụng" hay "Không sử dụng" cho từng học sinh và từng phí. Module Học phí sẽ đọc dữ liệu này để tính tiền.

### 3.4. QR Code

- Mỗi học sinh có một mã QR riêng (có thể in ra hoặc hiển thị trên ứng dụng).
- Khi quét QR, hệ thống tự động kiểm tra:
  - Học sinh có thuộc lớp được chọn không?
  - Học sinh đã được điểm danh trong ngày chưa (nếu rồi thì báo lỗi)?
- Nếu hợp lệ, cập nhật trạng thái thành present.

### 3.5. Matrix

- Matrix là bảng điểm danh theo khung giờ, thường được sử dụng cho các trường có nhiều ca học hoặc nhiều giờ vào/ra.
- Các khung giờ có thể được cấu hình trong Cài đặt trường (school_settings).
- Khi học sinh có mặt tại một khung giờ, ô tương ứng được đánh dấu.
- Cuối ngày, trạng thái tổng hợp sẽ được tính dựa trên số khung giờ có mặt (VD: có mặt trên 50% khung giờ → present).

### 3.6. Điểm danh và học phí

- Điểm danh có thể ảnh hưởng đến học phí (VD: học sinh nghỉ học có thể được giảm tiền ăn hoặc tiền học).
- Tuy nhiên, việc tính toán này sẽ được xử lý trong module Học phí (08-tuition.md), không phải ở đây.
- Module Điểm danh chỉ có trách nhiệm lưu trữ dữ liệu điểm danh, bao gồm: Trạng thái, Giờ tăng ca, Các phí tùy chọn đã chọn.

### 3.7. Lịch sử điểm danh và Sửa đổi

- Mọi thay đổi điểm danh khi còn ở trạng thái `draft` có thể sửa trực tiếp.
- Khi trạng thái là `confirmed`, KHÔNG sử dụng `PUT /api/v1/school/attendance/:id` để ghi đè. Cần có endpoint `/adjust` hoặc `/void` để vô hiệu hóa bản ghi cũ và tạo bản ghi mới (correction) có ghi lại `voided_reason` và `updated_by`.

## 4. Data Model (Mô tả dữ liệu liên quan)

Tham chiếu `07-DATA-MODEL.md` để lấy schema chuẩn (bảng `attendance`, `attendance_qr`, `attendance_matrix`, `attendance_optional_fees`).

## 5. API Contracts

- `GET /api/v1/school/attendance` - Lấy điểm danh theo ngày và lớp
- `POST /api/v1/school/attendance` - Lưu điểm danh cho nhiều học sinh (bulk) - lưu ở trạng thái `draft` hoặc `confirmed`
- `POST /api/v1/school/attendance/qr-scan` - Điểm danh bằng QR
- `POST /api/v1/school/attendance/matrix` - Lưu Matrix điểm danh
- `GET /api/v1/school/attendance/history` - Xem lịch sử điểm danh của học sinh
- `POST /api/v1/school/attendance/:id/adjust` - Điều chỉnh điểm danh (tạo correction) cho bản ghi đã confirmed
- `GET /api/v1/school/optional-fees` - Lấy danh sách phí tùy chọn của trường
- `POST /api/v1/school/optional-fees` - Tạo phí tùy chọn mới

## 6. Permissions (Phân quyền)

- School Admin: Full access (xem, tạo, sửa, xóa phí tùy chọn).
- Teacher: Chỉ được điểm danh cho các lớp mình đang dạy, có thể tick chọn các phí tùy chọn đã có sẵn.
- Staff: Chỉ xem được điểm danh (không được sửa).

## 7. UI Design (Tham khảo)

- Bảng điểm danh: Bảng với các cột: STT, Họ tên, Trạng thái (dropdown hoặc các nút radio/nút bấm), Tăng ca (icon hoặc checkbox), Các phí tùy chọn (các checkbox nhỏ hoặc icon + popup khi click vào), Ghi chú.
- Popup chi tiết: Khi click vào một học sinh, hiện popup với các tab hoặc các phần: Thông tin chung, Trạng thái, Ghi chú, Thời gian vào/ra, Tăng ca (với time picker), Các phí tùy chọn (dạng checkbox list). Có nút "Lưu" và "Hủy".
- QR Scanner: Hiển thị khung quét camera (hoặc nhập mã QR thủ công). Khi quét thành công, có hiệu ứng âm thanh hoặc thông báo.
- Matrix: Bảng với hàng là học sinh, cột là khung giờ (khoảng 5-10 cột). Có thể thêm các cột riêng cho "Tăng ca" và "Phí tùy chọn" (dạng checkbox) ngay trên bảng Matrix.

## 8. Các lưu ý khi triển khai

1. Bảo mật QR: Mã QR không được chứa thông tin nhạy cảm (chỉ nên chứa ID học sinh đã được mã hóa hoặc token ngắn).
2. Xử lý concurrency: Nếu nhiều giáo viên cùng điểm danh một lớp vào cùng thời điểm, cần có cơ chế khóa hoặc cảnh báo để tránh xung đột dữ liệu.
3. Lịch sử sửa đổi: Nếu cho phép sửa điểm danh sau khi đã lưu, nên lưu lại lịch sử thay đổi (bảng attendance_history) để truy vết.
4. Tính toán tự động: Matrix có thể được tự động tổng hợp thành trạng thái cuối ngày (VD: có mặt >= 50% khung giờ → present), nhưng nên có cơ chế để School Admin có thể ghi đè.
5. Tích hợp với học phí: Điểm danh (bao gồm tăng ca và phí tùy chọn) sẽ được sử dụng để tính học phí, nhưng cần tách biệt module để tránh phụ thuộc chặt chẽ.
6. Cấu hình phí tùy chọn: School Admin cần có giao diện để quản lý các phí tùy chọn (thêm, sửa, xóa, cập nhật giá). Giao diện này nên nằm trong Cài đặt trường (05-settings.md).
