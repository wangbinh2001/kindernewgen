# Quản lý học phí

## 1. Mục tiêu

Quản lý toàn bộ quy trình học phí trong trường, bao gồm thiết lập biểu phí (Fee Schedule), quản lý giảm trừ cho học sinh (% hoặc số tiền cố định), khai báo tiền ăn và chi phí vận hành bếp, tính toán học phí theo tháng, và lưu trữ lịch sử học phí bất biến (không thay đổi sau khi xác nhận). Hỗ trợ tính toán dựa trên điểm danh (nghỉ học, tăng ca, phí tùy chọn), học thêm từ hồ sơ học sinh, và công nợ kết chuyển giữa các tháng.

## 2. UX Flow

### 2.1. Quản lý biểu phí (Fee Schedule)

- Entry: Menu "Học phí" → Tab "Biểu phí".
- Hiển thị: Danh sách các khoản phí đã tạo (Tên phí, Số tiền, Loại phí, Áp dụng cho lớp nào, Trạng thái).
- Actions:
  - Thêm phí mới.
  - Chỉnh sửa phí.
  - Xóa phí (nếu chưa được sử dụng).
- Form thêm/sửa phí:
  - Tên phí (bắt buộc).
  - Số tiền (bắt buộc).
  - Loại phí: Học phí cơ bản, Tiền ăn, Tiền bán trú, Phí tăng ca, Phí tùy chọn (sẽ lấy từ optional_fees).
  - Áp dụng cho lớp nào: Tất cả lớp, hoặc chọn từng lớp cụ thể.
  - Chu kỳ: Hàng tháng, Hàng quý, Học kỳ, Năm học.
  - Áp dụng từ tháng (tùy chọn).

### 2.2. Quản lý giảm trừ (Student Reduction)

- Entry: Hồ sơ học sinh → Tab "Học phí" → Phần "Giảm trừ".
- Hiển thị: Form với các tùy chọn:
  - Bật/Tắt giảm trừ (checkbox).
  - Loại giảm trừ: Chọn giữa Phần trăm (%) hoặc Số tiền cố định (VND).
  - Giá trị: Nhập số (VD: 10 cho 10%, hoặc 100000 cho 100,000 VND).
  - Ghi chú (tùy chọn).
- Success: Lưu giảm trừ → Áp dụng cho các lần tính học phí tiếp theo.

### 2.3. Khai báo tiền ăn (Meal Fees)

- Entry: Menu "Học phí" → Tab "Cấu hình ăn uống".
- Form nhập:
  - Tiền ăn sáng (VND/học sinh/ngày) (bắt buộc).
  - Tiền ăn trưa (VND/học sinh/ngày) (bắt buộc).
  - Tiền ăn xế (VND/học sinh/ngày) (bắt buộc).
  - Ngày áp dụng (mặc định là ngày hiện tại).
- Lưu ý: Các khoản này sẽ được sử dụng để tính tổng tiền thu từ phụ huynh trong phiếu đi chợ (module Dinh dưỡng).
- Success: Lưu cấu hình → Áp dụng cho các tháng tiếp theo.

### 2.4. Khai báo chi phí vận hành bếp (Operating Costs)

- Entry: Menu "Học phí" → Tab "Chi phí vận hành".
- Form nhập:
  - Tháng (bắt buộc, mặc định là tháng hiện tại).
  - Tiền điện (VND) (có thể nhập 0 nếu không có).
  - Tiền gas (VND) (có thể nhập 0 nếu không có).
  - Ghi chú (tùy chọn).
- Lưu ý: Các khoản này sẽ được trừ vào tổng tiền đi chợ (module Dinh dưỡng).
- Success: Lưu chi phí → Áp dụng cho tháng tương ứng.

### 2.5. Tính học phí (Calculate Tuition)

- Entry: Menu "Học phí" → Tab "Tính học phí".
- Form nhập:
  - Chọn tháng (bắt buộc).
  - Chọn lớp (bắt buộc) hoặc chọn tất cả học sinh.
  - Chọn loại phí (có thể tính tất cả hoặc từng loại).
- Action: Bấm nút "Tính toán".
- Hiển thị: Bảng kết quả tạm tính (chưa lưu), với các cột:
  - STT, Học sinh, Lớp.
  - Biểu phí áp dụng: Từng khoản phí và số tiền.
  - Giảm trừ: Loại và giá trị.
  - Số dư tháng trước (Previous Balance).
  - Thành tiền (đã bao gồm số dư).
  - Ghi chú (nếu có).
- Actions: Xem chi tiết từng học sinh, Xuất báo cáo (PDF/Excel).
- Lưu ý: Đây là bước tính toán tạm thời, chưa lưu vào lịch sử.

### 2.6. Xác nhận học phí (Confirm Tuition)

- Entry: Sau khi tính toán → Bấm nút "Xác nhận".
- Confirmation: Hiển thị popup xác nhận với thông báo: "Sau khi xác nhận, học phí của tháng này sẽ không thể thay đổi. Bạn có chắc chắn?"
- Success: Lưu kết quả vào tuition_history và cập nhật số dư mới → Hiển thị thông báo "Đã xác nhận học phí tháng X".
- Lưu ý: Sau khi xác nhận, không thể chỉnh sửa hoặc xóa học phí của tháng đó.

### 2.7. Xem lịch sử học phí

- Entry: Menu "Học phí" → Tab "Lịch sử".
- Hiển thị: Bảng danh sách các tháng đã xác nhận.
- Columns: Tháng, Số học sinh, Tổng phí (gốc), Tổng giảm trừ, Tổng thực thu, Người xác nhận, Thời gian xác nhận.
- Actions: Xem chi tiết từng học sinh, Xuất báo cáo, Hủy xác nhận (chỉ trong 24h hoặc chưa phát sinh thanh toán - nếu có yêu cầu).

### 2.8. Xem chi tiết học phí của học sinh

- Entry: Hồ sơ học sinh → Tab "Học phí".
- Hiển thị:
  - Biểu phí hiện tại của học sinh.
  - Giảm trừ hiện tại.
  - Các môn học thêm đã đăng ký.
  - Lịch sử học phí (các tháng đã xác nhận).
  - Dự tính học phí tháng hiện tại (nếu chưa xác nhận).

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. Biểu phí (Fee Schedule)

- Mỗi trường có thể có nhiều biểu phí.
- Biểu phí có thể áp dụng cho tất cả học sinh hoặc chỉ một số lớp cụ thể.
- Khi tính học phí, hệ thống sẽ lấy biểu phí áp dụng cho từng học sinh dựa trên lớp học của học sinh đó.
- Nếu có nhiều biểu phí áp dụng cho cùng một học sinh, tất cả sẽ được cộng dồn.
- Biểu phí có thể có hiệu lực từ một tháng nhất định (VD: áp dụng từ tháng 9).

### 3.2. Giảm trừ (Reduction)

- Mỗi học sinh có thể có một giảm trừ (lưu trong hồ sơ học sinh).
- Giảm trừ có thể là percentage hoặc fixed.
- Nếu là percentage, giá trị được áp dụng trên tổng số tiền.
- Nếu là fixed, giá trị được trừ trực tiếp vào tổng số tiền.
- Giảm trừ có thể được bật/tắt (active/inactive).
- Khi thay đổi giảm trừ, nó sẽ áp dụng cho các tháng tiếp theo, không ảnh hưởng đến lịch sử.

### 3.3. Tiền ăn và chi phí vận hành bếp

- Tiền ăn: Được khai báo theo từng bữa (sáng, trưa, xế) và áp dụng cho tất cả học sinh.
  - Tổng tiền thu từ phụ huynh (dự kiến) = Sĩ số tổng × (Tiền ăn sáng + Tiền ăn trưa + Tiền ăn xế)
- Chi phí vận hành bếp: Được khai báo theo từng tháng (tiền điện, tiền gas).
  - Tổng tiền đi chợ dự kiến = Tổng tiền nguyên liệu - Tiền điện - Tiền gas
- Sai số: Khi đi chợ thực tế, số tiền chi ra không được vượt quá 5,000 VND so với dự toán.

### 3.4. Tính toán học phí

- Công thức tổng hợp:
  - Tổng phí gốc = Sum of all applicable fees (từ fee_schedules)
  - Phí học thêm = Sum of fees from extra_curriculars (đã chọn trong hồ sơ học sinh)
  - Phí tăng ca = overtime_hours (làm tròn block 30 phút) * đơn giá tăng ca
  - Phí tùy chọn = Sum of optional_fees (từ điểm danh)
  - Tổng phí = Tổng phí gốc + Phí học thêm + Phí tăng ca + Phí tùy chọn
  - Giảm trừ = (percentage) ? Tổng phí * (giá_trị / 100) : giá_trị
  - Thành tiền tạm tính = Tổng phí - Giảm trừ
  - Số dư tháng trước = balance từ bảng student_balances (có thể âm hoặc dương)
  - Thành tiền (bao gồm số dư) = Thành tiền tạm tính + Số dư tháng trước
- Nguồn dữ liệu:
  - Hồ sơ học sinh: fee_schedules (qua lớp học), student_reductions, student_extra_curricular.
  - Điểm danh: attendance (nghỉ học, tăng ca, phí tùy chọn).
  - Công nợ: student_balances (số dư tháng trước).
- Xác nhận: Sau khi xác nhận, bản ghi sẽ được lưu vào tuition_history và không thể thay đổi.

### 3.5. Lịch sử bất biến

- Sau khi xác nhận, học phí của tháng đó KHÔNG BAO GIỜ bị thay đổi.
- Nếu có sai sót, School Admin có thể tạo một bản ghi điều chỉnh (adjustment) hoặc hủy xác nhận (nếu chưa phát sinh thanh toán).
- Khi thay đổi biểu phí hoặc giảm trừ, các tháng đã xác nhận vẫn giữ nguyên.

### 3.6. Tính toán dựa trên điểm danh

- Học phí có thể được tính dựa trên số ngày nghỉ của học sinh.
- Ví dụ: Nếu học sinh nghỉ 5 ngày trong tháng, tiền ăn sẽ được trừ đi tương ứng.
- Quy tắc cụ thể sẽ được cấu hình trong Cài đặt trường.

### 3.7. Công nợ và kết chuyển số dư

- Quy tắc: Khi tính học phí đầu tháng (VD: tháng 9), hệ thống sẽ tự động kiểm tra công nợ từ bảng `student_balances` và ledger `payments`.
- Công thức (Quy ước dấu chuẩn): 
  - `amount_due` (số cần thu) = `opening_amount + charges - payments + adjustments`
  - Nếu `amount_due > 0` → Khách còn nợ (phải thu thêm)
  - Nếu `amount_due < 0` → Khách trả thừa (credit)
- Khi kết chuyển sang tháng mới:
  - `payable` = `current_charges + previous_due - previous_credit`
  - TUYỆT ĐỐI KHÔNG dùng công thức "balance = paid - due" (làm đảo ngược dấu khi kết chuyển).
- Xác nhận: Khi xác nhận học phí, hệ thống sẽ chốt `charges` vào `student_balances` và snapshot vào `tuition_history`.

### 3.8. Tăng ca (Overtime)

- Quy tắc: Tăng ca được tính theo giờ, và làm tròn theo block 30 phút.
- Cách tính:
  - Số giờ tăng ca = (Giờ kết thúc - Giờ bắt đầu)
  - Làm tròn lên thành block 30 phút gần nhất.
  - Ví dụ: 1 giờ 15 phút → làm tròn thành 1.5 giờ (90 phút). 1 giờ 40 phút → làm tròn thành 2 giờ.
- Đơn giá: Được cấu hình trong Cài đặt trường (school_settings), có thể theo giờ hoặc theo block 30 phút.
- Công thức:
  - Phí tăng ca = Số giờ tăng ca (làm tròn) * Đơn giá / giờ (hoặc block 30 phút)

## 4. Data Model (Mô tả dữ liệu liên quan)

Tham chiếu `07-DATA-MODEL.md` để lấy schema chuẩn (`fee_schedules`, `tuition_history`, `student_balances`, `tuition_adjustments`, `payments`, `meal_fees`, `operating_costs`). Các tên bảng phải khớp đúng với `07-DATA-MODEL.md`.

## 5. API Contracts

- `GET /api/v1/school/fees` - Lấy danh sách biểu phí
- `POST /api/v1/school/fees` - Tạo biểu phí mới
- `PUT /api/v1/school/fees/:id` - Cập nhật biểu phí
- `DELETE /api/v1/school/fees/:id` - Xóa biểu phí (chỉ khi chưa được sử dụng)
- `GET /api/v1/school/meal-fees` - Lấy danh sách tiền ăn hiện tại
- `PUT /api/v1/school/meal-fees` - Cập nhật tiền ăn
- `GET /api/v1/school/operating-costs` - Lấy danh sách chi phí vận hành
- `POST /api/v1/school/operating-costs` - Tạo chi phí vận hành mới
- `PUT /api/v1/school/operating-costs/:id` - Cập nhật chi phí vận hành
- `DELETE /api/v1/school/operating-costs/:id` - Xóa chi phí vận hành
- `GET /api/v1/school/students/:id/reduction` - Lấy giảm trừ của học sinh
- `PUT /api/v1/school/students/:id/reduction` - Cập nhật giảm trừ cho học sinh
- `POST /api/v1/school/tuition/calculate` - Tính học phí (tạm tính)
- `POST /api/v1/school/tuition/confirm` - Xác nhận và lưu học phí vào lịch sử
- `GET /api/v1/school/tuition/history` - Xem lịch sử học phí
- `GET /api/v1/school/tuition/history/:id` - Xem chi tiết một bản ghi học phí
- `POST /api/v1/school/tuition/history/:id/adjust` - Điều chỉnh học phí (nếu có sai sót)
- `POST /api/v1/school/tuition/payments` - Ghi nhận thanh toán (thêm vào ledger)

## 6. Permissions (Phân quyền)

- School Admin: Full access (quản lý biểu phí, tiền ăn, chi phí vận hành, giảm trừ, tính toán, xác nhận).
- Teacher: Không có quyền truy cập (chỉ xem điểm danh).
- Staff (Accounting): Có thể xem và tính toán, nhưng không được xác nhận (nếu có phân quyền chi tiết).

## 7. UI Design (Tham khảo)

- Biểu phí: Bảng danh sách, có nút Thêm, Sửa, Xóa.
- Tiền ăn: Form nhập tiền ăn sáng, trưa, xế, ngày áp dụng.
- Chi phí vận hành: Form nhập tháng, tiền điện, tiền gas, ghi chú.
- Giảm trừ: Form trong hồ sơ học sinh (tab Học phí).
- Tính học phí: Form chọn tháng và lớp, nút "Tính toán", hiển thị bảng kết quả (có thể xuất Excel), nút "Xác nhận".
- Lịch sử: Bảng danh sách các tháng đã xác nhận, có nút "Xem chi tiết" và "Xuất báo cáo".

## 8. Các lưu ý khi triển khai

1. Xác nhận học phí: Cần có popup xác nhận để tránh thao tác nhầm. Sau khi xác nhận, không cho phép chỉnh sửa.
2. Lịch sử bất biến: Khi thay đổi biểu phí hoặc giảm trừ, các tháng đã xác nhận vẫn giữ nguyên.
3. Tích hợp với điểm danh: Cần đọc dữ liệu điểm danh (nghỉ học, tăng ca, phí tùy chọn) để tính toán học phí.
4. Tích hợp với hồ sơ học sinh: Cần đọc dữ liệu học thêm (extra_curriculars) và giảm trừ (student_reductions) từ hồ sơ học sinh.
5. Công nợ: Cần tính toán và cập nhật số dư (student_balances) sau mỗi lần xác nhận học phí.
6. Tính toán: Cần xác định rõ công thức tính (thứ tự ưu tiên giữa các khoản phí và giảm trừ).
7. Báo cáo: Có thể xuất báo cáo học phí theo tháng, theo lớp, theo học sinh.
8. Tiền ăn và chi phí vận hành: Các khoản này sẽ được sử dụng trong module Dinh dưỡng để tính phiếu đi chợ.
