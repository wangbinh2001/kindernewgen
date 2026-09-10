# Quản lý yêu cầu phụ huynh

## 1. Mục tiêu

Quản lý các yêu cầu, ghi chú, và thông báo từ phụ huynh gửi đến nhà trường. Bao gồm các loại yêu cầu: xin nghỉ học, đến muộn, đón muộn, yêu cầu y tế (thuốc men), thông báo tình trạng sức khỏe, và các yêu cầu khác.

## 2. UX Flow

### 2.1. Xem danh sách yêu cầu

- Entry: Menu "Yêu cầu phụ huynh" → Danh sách tất cả yêu cầu từ phụ huynh.
- Hiển thị: Bảng danh sách với các cột:
  - Học sinh
  - Phụ huynh
  - Loại yêu cầu
  - Nội dung (tóm tắt)
  - Trạng thái (Chờ xử lý | Đã xử lý | Đã hủy)
  - Ngày gửi
  - Actions: Xem chi tiết, Xử lý, Từ chối, Xóa
- Lọc: Lọc theo trạng thái, theo loại yêu cầu, theo học sinh, theo ngày.
- Sắp xếp: Theo ngày gửi (mới nhất trước).

### 2.2. Xem chi tiết yêu cầu

- Entry: Click vào một yêu cầu trong danh sách.
- Hiển thị:
  - Thông tin phụ huynh: Họ tên, SĐT liên hệ.
  - Thông tin học sinh: Họ tên, Lớp.
  - Loại yêu cầu.
  - Nội dung chi tiết.
  - Thời gian gửi.
  - Ghi chú của giáo viên (nếu có).
  - Lịch sử trạng thái (nếu có).
- Actions: Xử lý, Từ chối, Ghi chú, Xóa.

### 2.3. Xử lý yêu cầu

- Entry: Nút "Xử lý" trong chi tiết yêu cầu.
- Form nhập:
  - Trạng thái (bắt buộc): Đã xử lý (có thể chọn thành công hoặc không).
  - Phản hồi (tùy chọn): Nhập phản hồi cho phụ huynh (nếu có).
  - Ghi chú nội bộ (tùy chọn): Ghi chú cho giáo viên/School Admin.
- Success: Cập nhật trạng thái → Gửi thông báo (nếu có) cho phụ huynh → Quay lại danh sách.

### 2.4. Từ chối yêu cầu

- Entry: Nút "Từ chối" trong chi tiết yêu cầu.
- Form nhập:
  - Lý do từ chối (bắt buộc).
- Success: Cập nhật trạng thái thành "Đã hủy" → Gửi thông báo (nếu có) cho phụ huynh → Quay lại danh sách.

### 2.5. Yêu cầu cần xử lý khẩn (Urgent)

- Entry: Các yêu cầu có dấu hiệu khẩn (VD: yêu cầu y tế, đón muộn) sẽ được đánh dấu ưu tiên.
- Hiển thị: Trên Dashboard (màu đỏ hoặc có biểu tượng cảnh báo).
- Lưu ý: Yêu cầu khẩn cần được xử lý càng sớm càng tốt.

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. Các loại yêu cầu

- **Yêu cầu xin nghỉ học (Absence Request):**
  - Phụ huynh báo nghỉ học (có thể kèm lý do).
  - Giáo viên xác nhận → Cập nhật điểm danh (nếu cần).
- **Yêu cầu đến muộn (Late Arrival):**
  - Phụ huynh báo con đến muộn.
  - Giáo viên lưu ý khi điểm danh.
- **Yêu cầu đón muộn (Late Pickup):**
  - Phụ huynh báo đón con muộn hơn giờ tan.
  - Giáo viên chuẩn bị (giữ trẻ, thông báo).
  - Hệ thống có thể tự động tính phí tăng ca (nếu có cấu hình).
- **Yêu cầu y tế (Medical Request):**
  - Phụ huynh báo con cần uống thuốc tại trường.
  - Kèm theo hướng dẫn (tên thuốc, liều lượng, thời gian).
  - Giáo viên/Nhân viên y tế tiếp nhận và xử lý.
- **Thông báo sức khỏe (Health Notice):**
  - Phụ huynh báo con bị ốm, sốt, ho, hoặc tình trạng sức khỏe khác.
  - Giáo viên lưu ý và theo dõi.
- **Yêu cầu khác (Other):**
  - Các yêu cầu không thuộc các loại trên.
  - Giáo viên/School Admin xem xét và xử lý.

### 3.2. Trạng thái yêu cầu

- **Chờ xử lý (Pending):** Yêu cầu mới, chưa được xử lý.
- **Đã xử lý (Resolved):** Yêu cầu đã được xử lý thành công.
- **Đã hủy (Rejected):** Yêu cầu bị từ chối hoặc không hợp lệ.

### 3.3. Quyền xử lý

- **School Admin:** Xem và xử lý tất cả yêu cầu.
- **Teacher:** Xem và xử lý yêu cầu của học sinh trong lớp mình.
- **Staff:** Xem yêu cầu (không được xử lý, trừ khi được phân quyền).

### 3.4. Phản hồi cho phụ huynh

- Khi xử lý hoặc từ chối yêu cầu, có thể gửi phản hồi cho phụ huynh (nếu có tích hợp thông báo).
- Phản hồi có thể là văn bản (tin nhắn) hoặc thông báo trên ứng dụng Parent Portal.

### 3.5. Tích hợp với điểm danh

## 4. Data Model (Mô tả dữ liệu liên quan)

parent_requests:

- id (PK)
- school_id (FK → schools.id)
- parent_id (FK → users.id)
- child_id (FK → students.id)
- type (enum: absence | late_arrival | late_pickup | medical | health_notice | other)
- content (text) (Nội dung yêu cầu)
- urgent (boolean) (Có phải yêu cầu khẩn không?)
- status (pending | resolved | rejected)
- resolved_by (FK → school_memberships.id | null) (Người xử lý trong trường)
- resolved_at (timestamp | null)
- response (text | null) (Phản hồi cho phụ huynh)
- note (text | null) (Ghi chú nội bộ)
- created_at (timestamp)
- updated_at (timestamp)

parent_request_attachments (File đính kèm, nếu có):

- id (PK)
- request_id (FK → parent_requests.id)
- file_url (string)
- file_name (string)
- file_size (int)
- created_at (timestamp)

parent_request_history (Lịch sử thay đổi trạng thái):

- id (PK)
- request_id (FK → parent_requests.id)
- old_status (enum)
- new_status (enum)
- changed_by (FK → users.id)
- note (text | null)
- changed_at (timestamp)

## 5. API Contracts

- GET /api/v1/school/parent-requests - Lấy danh sách yêu cầu
- GET /api/v1/school/parent-requests/:id - Lấy chi tiết yêu cầu
- PUT /api/v1/school/parent-requests/:id/resolve - Xử lý yêu cầu
- PUT /api/v1/school/parent-requests/:id/reject - Từ chối yêu cầu
- DELETE /api/v1/school/parent-requests/:id - Xóa yêu cầu (chỉ khi chưa xử lý)

## 6. Permissions (Phân quyền)

- School Admin: Full access (xem, xử lý, từ chối, xóa).
- Teacher: Xem và xử lý yêu cầu của học sinh trong lớp mình.
- Staff: Xem yêu cầu (không được xử lý).
- Parent: Chỉ tạo và xem yêu cầu của con mình (qua API Parent).

## 7. UI Design (Tham khảo)

- Danh sách yêu cầu: Bảng với các cột: Học sinh, Loại, Nội dung (tóm tắt), Trạng thái (có màu sắc: vàng cho pending, xanh cho resolved, đỏ cho rejected), Ngày gửi, Actions (Xem, Xử lý, Từ chối).
- Form xử lý: Hiển thị nội dung yêu cầu, các trường nhập phản hồi và ghi chú, nút "Xử lý" và "Từ chối".
- Dashboard: Hiển thị số lượng yêu cầu chờ xử lý, đặc biệt là yêu cầu khẩn (urgent).

## 8. Các lưu ý khi triển khai

1. Yêu cầu khẩn (Urgent): Các yêu cầu y tế và đón muộn nên được đánh dấu khẩn và ưu tiên xử lý.

2. Thông báo: Có thể gửi thông báo cho phụ huynh khi yêu cầu được xử lý hoặc từ chối (nếu có tích hợp).
3. Lịch sử: Lưu lịch sử thay đổi trạng thái để truy vết.
4. Phản hồi: Phản hồi cho phụ huynh nên được lưu lại để tham khảo sau này.
