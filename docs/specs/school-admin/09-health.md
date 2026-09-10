# Quản lý sức khỏe

## 1. Mục tiêu

Quản lý thông tin sức khỏe của học sinh, bao gồm ghi nhận chiều cao, cân nặng, tính chỉ số BMI, và lưu trữ lịch sử đo đạc theo thời gian. Hỗ trợ theo dõi sức khỏe định kỳ và cảnh báo các chỉ số bất thường.

## 2. UX Flow

### 2.1. Xem danh sách sức khỏe của học sinh

- Entry: Menu "Sức khỏe" → Chọn lớp hoặc tìm kiếm học sinh.
- Hiển thị: Bảng danh sách học sinh với các cột: Họ tên, Lớp, Chiều cao (cm), Cân nặng (kg), BMI, Phân loại (theo WHO), Ngày đo gần nhất.
- Actions: Xem chi tiết, Thêm đo mới, Xem lịch sử.

### 2.2. Thêm đo sức khỏe mới

- Entry: Nút "Thêm đo mới" trên danh sách hoặc trong hồ sơ học sinh → Tab "Sức khỏe".
- Form nhập:
  - Chọn học sinh (bắt buộc).
  - Ngày đo (mặc định là hôm nay).
  - Chiều cao (cm) (bắt buộc, > 0).
  - Cân nặng (kg) (bắt buộc, > 0).
  - Ghi chú (tùy chọn).
- Action: Bấm nút "Lưu".
- Success: Lưu đo mới → Hệ thống tự động tính BMI và phân loại (theo WHO) → Hiển thị thông báo "Đã lưu đo sức khỏe".
- Failure: Báo lỗi nếu chiều cao hoặc cân nặng không hợp lệ.

### 2.3. Xem lịch sử sức khỏe

- Entry: Click vào tên học sinh trong danh sách → Tab "Lịch sử sức khỏe".
- Hiển thị: Biểu đồ hoặc bảng danh sách các lần đo trước đó với các cột: Ngày đo, Chiều cao (cm), Cân nặng (kg), BMI, Phân loại, Ghi chú.
- Actions: Xem chi tiết, Xóa đo (nếu cần).

### 2.4. Xem chi tiết học sinh (Tab Sức khỏe)

- Entry: Hồ sơ học sinh → Tab "Sức khỏe".
- Hiển thị:
  - Thông tin đo gần nhất: Chiều cao, Cân nặng, BMI, Phân loại, Ngày đo.
  - Biểu đồ tăng trưởng (nếu có).
  - Lịch sử các lần đo.

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. BMI (Chỉ số khối cơ thể)

- Công thức: BMI = Cân nặng (kg) / (Chiều cao (m) * Chiều cao (m))
- Ví dụ: Học sinh nặng 20kg, cao 1.1m → BMI = 20 / (1.1 * 1.1) = 16.53
- Lưu ý: BMI được tính tự động sau khi nhập chiều cao và cân nặng.

### 3.2. Phân loại theo tiêu chuẩn (WHO/CDC)

- Dựa trên: BMI và độ tuổi (tính theo tháng).
- KHÔNG triển khai tự động hiển thị phân loại y tế nếu chưa có chuyên gia y tế xác nhận tiêu chuẩn. Cần version cụ thể của bộ tiêu chuẩn đang sử dụng.
- Lưu ý: Trẻ sinh non cần quy tắc tính tuổi điều chỉnh.
- Cảnh báo sức khỏe trên giao diện PHẢI có disclaimer "Kết quả mang tính tham khảo, không thay thế chẩn đoán y khoa".

### 3.3. Lịch sử đo

- Mỗi lần đo đều được lưu lại với thời gian cụ thể (BẤT BIẾN).
- Lịch sử đo giúp theo dõi sự phát triển của học sinh theo thời gian.
- **KHÔNG được phép xóa cứng (DELETE) hay ghi đè (UPDATE)** lịch sử đo. Nếu có sai sót, chỉ có thể thêm bản ghi mới (correction) hoặc vô hiệu hóa (void) bản ghi cũ kèm lý do.

## 4. Data Model (Mô tả dữ liệu liên quan)

Tham chiếu `07-DATA-MODEL.md` để lấy schema chuẩn (`health_records`).

## 5. API Contracts

- `GET /api/v1/school/health` - Lấy danh sách sức khỏe gần nhất của học sinh
- `POST /api/v1/school/health` - Thêm đo sức khỏe mới
- `GET /api/v1/school/health/:id` - Lấy chi tiết một lần đo
- `GET /api/v1/school/students/:id/health-history` - Lấy lịch sử sức khỏe của học sinh
- `POST /api/v1/school/health/:id/void` - Vô hiệu hóa một lần đo (chỉ khi có sai sót, có lưu lại voided_reason)

## 6. Permissions (Phân quyền)

- School Admin: Full access.
- Teacher: Chỉ xem được sức khỏe của học sinh trong lớp mình dạy.
- Staff: Chỉ xem được sức khỏe (không được thêm/sửa/xóa).
- Parent: Chỉ xem được sức khỏe của con mình (thông qua API Parent).

## 7. UI Design (Tham khảo)

- Danh sách sức khỏe: Bảng với các cột: Họ tên, Lớp, Chiều cao, Cân nặng, BMI, Phân loại (có màu sắc: xanh cho normal, vàng cho overweight, đỏ cho obese), Ngày đo gần nhất, Actions (Thêm đo, Xem lịch sử).
- Form thêm đo: Form đơn giản với các trường nhập chiều cao, cân nặng, ngày đo.
- Lịch sử: Biểu đồ đường (chart) hiển thị sự thay đổi chiều cao và cân nặng theo thời gian, kèm bảng danh sách các lần đo.
- Trang chi tiết học sinh: Tab Sức khỏe hiển thị thông tin gần nhất và biểu đồ tăng trưởng.

## 8. Các lưu ý khi triển khai

1. Tính BMI: BMI được tính tự động, không cho phép nhập thủ công.
2. Phân loại WHO: Cần có dữ liệu chuẩn WHO theo tuổi và giới tính. Có thể nhập từ file CSV hoặc tích hợp với API (nếu có).
3. Lịch sử: Giữ nguyên lịch sử đo, không cho phép sửa/xóa trừ trường hợp đặc biệt (có phân quyền).
4. Đơn vị: Chiều cao (cm), Cân nặng (kg). Cần thống nhất đơn vị trong toàn hệ thống.
5. Cảnh báo: Hiển thị cảnh báo trên Dashboard và trong hồ sơ học sinh nếu BMI nằm ngoài ngưỡng bình thường.
6. Biểu đồ: Sử dụng thư viện biểu đồ (Chart.js, Recharts...) để hiển thị biểu đồ tăng trưởng.
