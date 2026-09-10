# Quản lý Timeline

## 1. Mục tiêu

Quản lý các bài đăng trên dòng thời gian (Timeline) của trường, bao gồm **Timeline lớp** (Class Timeline) và **Timeline cá nhân học sinh** (Personal Child Timeline). Cho phép giáo viên và School Admin đăng tin tức, hình ảnh, thông báo, và sự kiện liên quan đến lớp học hoặc từng học sinh cụ thể.

## 2. UX Flow

### 2.1. Xem Timeline lớp

- Entry: Menu "Timeline" → Chọn lớp → Xem tất cả bài đăng của lớp đó.
- Hiển thị: Dạng danh sách (feed) với các bài đăng, sắp xếp theo thời gian giảm dần (bài mới nhất lên đầu).
- Mỗi bài đăng hiển thị:
  - Người đăng (Tên giáo viên hoặc School Admin).
  - Thời gian đăng.
  - Nội dung (văn bản).
  - Hình ảnh/Video (nếu có).
  - Số lượng học sinh được tag (nếu có).
  - Actions: Xem chi tiết, Chỉnh sửa, Xóa.

### 2.2. Xem Timeline cá nhân học sinh

- Entry: Hồ sơ học sinh → Tab "Timeline".
- Hoặc: Menu "Timeline" → Chọn học sinh (tìm kiếm).
- Hiển thị: Danh sách các bài đăng liên quan đến học sinh đó (có thể là bài đăng của lớp có tag học sinh đó, hoặc bài đăng riêng cho học sinh đó).
- Mỗi bài đăng hiển thị tương tự như Timeline lớp.

### 2.3. Tạo bài đăng mới

- Entry: Nút "Đăng bài mới" trên trang Timeline lớp hoặc hồ sơ học sinh.
- Form nhập:
  - Chọn loại timeline: **Lớp** hoặc **Cá nhân học sinh**.
  - Nếu chọn **Lớp**: Chọn lớp (bắt buộc). Có thể tag học sinh cụ thể (tùy chọn).
  - Nếu chọn **Cá nhân học sinh**: Chọn học sinh (bắt buộc).
  - Nội dung (văn bản) (bắt buộc).
  - Hình ảnh/Video (tùy chọn, có thể upload nhiều file).
  - Ghi chú riêng (cho giáo viên/School Admin, không hiển thị với phụ huynh) (tùy chọn).
- Success: Đăng bài thành công → Quay lại Timeline và hiển thị bài mới.
- Lưu ý: Bài đăng trên Timeline lớp sẽ hiển thị cho tất cả phụ huynh có con trong lớp đó. Bài đăng trên Timeline cá nhân chỉ hiển thị cho phụ huynh của học sinh đó.

### 2.4. Chỉnh sửa bài đăng

- Entry: Nút "Chỉnh sửa" trên bài đăng (chỉ người đăng hoặc School Admin mới có quyền).
- Form: Tương tự form tạo mới, các trường đã được điền sẵn.
- Success: Cập nhật bài đăng → Quay lại Timeline.
- Lưu ý: Lịch sử chỉnh sửa có thể được lưu lại (nếu cần).

### 2.5. Xóa bài đăng

- Entry: Nút "Xóa" trên bài đăng (chỉ người đăng hoặc School Admin mới có quyền).
- Confirmation: Xác nhận trước khi xóa.
- Success: Xóa bài đăng khỏi Timeline.

### 2.6. Xem chi tiết bài đăng

- Entry: Click vào bài đăng để xem chi tiết.
- Hiển thị:
  - Toàn bộ nội dung bài đăng.
  - Danh sách các hình ảnh/Video (nếu có).
  - Danh sách học sinh được tag (nếu có).
  - Lịch sử chỉnh sửa (nếu có).

## 3. Business Logic (Quy tắc nghiệp vụ)

### 3.1. Phân loại Timeline

- **Timeline lớp (Class Timeline):**
  - Bài đăng thuộc về một lớp cụ thể.
  - Hiển thị cho tất cả phụ huynh có con trong lớp đó.
  - Giáo viên của lớp và School Admin có quyền đăng bài.
- **Timeline cá nhân học sinh (Personal Child Timeline):**
  - Bài đăng thuộc về một học sinh cụ thể.
  - Chỉ hiển thị cho phụ huynh của học sinh đó.
  - Giáo viên của lớp (có học sinh đó) và School Admin có quyền đăng bài.

### 3.2. Quyền đăng bài

- **School Admin:** Có quyền đăng bài trên tất cả Timeline (lớp và cá nhân).
- **Teacher:** Chỉ được đăng bài trên Timeline của lớp mình đang dạy và Timeline cá nhân của học sinh trong lớp mình.
- **Parent:** Chỉ xem, không được đăng bài.

### 3.3. Tag học sinh (Student Tagging)

- Khi đăng bài trên Timeline lớp, giáo viên có thể tag (gắn thẻ) một hoặc nhiều học sinh trong lớp.
- Học sinh được tag sẽ xuất hiện trong bài đăng.
- Phụ huynh của học sinh được tag sẽ thấy bài đăng này trên Timeline cá nhân của con mình (cùng với Timeline lớp).

### 3.4. Hình ảnh và Video

- Hỗ trợ upload nhiều hình ảnh và video.
- Hình ảnh sẽ được hiển thị dạng gallery (thư viện ảnh) trong bài đăng.
- Video sẽ được hiển thị với trình phát nhúng (nếu có hỗ trợ).
- Kích thước file và định dạng được cấu hình trong Cài đặt trường.

### 3.5. Quyền riêng tư

- API trả về cho Parent phải tự động ẩn (strip) metadata tag của các học sinh khác để bảo mật.
- Bài đăng trên Timeline lớp: Mặc định là **công khai trong lớp** (tất cả phụ huynh trong lớp đều thấy).
- Bài đăng trên Timeline cá nhân: Mặc định là **riêng tư** (chỉ phụ huynh của học sinh đó thấy).
- Không có chế độ công khai toàn trường cho phụ huynh (chỉ dành cho School Admin và Teacher).

### 3.6. Lịch sử bài đăng

- Lưu lại lịch sử chỉnh sửa bài đăng (người sửa, thời gian, nội dung cũ) để truy vết sau này.

## 4. Data Model (Mô tả dữ liệu liên quan)

timeline_posts:

- id (PK)
- school_id (FK → schools.id)
- author_membership_id (FK → school_memberships.id) (Người đăng - Teacher hoặc School Admin)
- type (enum: class | child)
- class_id (FK → classes.id | null) (Nếu type = class)
- student_id (FK → students.id | null) (Nếu type = child)
- content (text)
- note (text | null) (Ghi chú riêng cho giáo viên/School Admin)
- status (active | deleted)
- created_at (timestamp)
- updated_at (timestamp)

timeline_media:

- id (PK)
- post_id (FK → timeline_posts.id)
- file_url (string) (Đường dẫn file)
- file_type (enum: image | video)
- file_name (string) (Tên file gốc)
- file_size (int) (Kích thước file - bytes)
- created_at (timestamp)

timeline_tags (Bảng tag học sinh trong bài đăng):

- id (PK)
- post_id (FK → timeline_posts.id)
- student_id (FK → students.id)
- created_at (timestamp)

timeline_edit_history (Lịch sử chỉnh sửa):

- id (PK)
- post_id (FK → timeline_posts.id)
- editor_id (FK → users.id)
- old_content (text)
- new_content (text)
- edited_at (timestamp)

## 5. API Contracts

- GET /api/v1/school/timeline/class/:class_id - Lấy Timeline của lớp
- GET /api/v1/school/timeline/student/:student_id - Lấy Timeline cá nhân của học sinh
- POST /api/v1/school/timeline - Tạo bài đăng mới
- PUT /api/v1/school/timeline/:id - Cập nhật bài đăng
- DELETE /api/v1/school/timeline/:id - Xóa bài đăng (chuyển trạng thái thành deleted)
- GET /api/v1/school/timeline/:id - Lấy chi tiết bài đăng
- POST /api/v1/school/timeline/:id/media - Thêm media vào bài đăng
- DELETE /api/v1/school/timeline/:id/media/:media_id - Xóa media khỏi bài đăng

## 6. Permissions (Phân quyền)

- School Admin: Full access (đăng, sửa, xóa trên tất cả Timeline).
- Teacher: Đăng, sửa, xóa trên Timeline lớp mình và Timeline cá nhân của học sinh trong lớp mình.
- Parent: Chỉ xem (không được đăng/sửa/xóa).

## 7. UI Design (Tham khảo)

- Timeline lớp: Dạng feed (danh sách bài đăng) với avatar người đăng, tên người đăng, thời gian, nội dung, hình ảnh, nút tương tác (nếu có). Có nút "Đăng bài mới".
- Timeline cá nhân học sinh: Tương tự như Timeline lớp nhưng chỉ hiển thị bài đăng liên quan đến học sinh đó.
- Form đăng bài: Cho phép nhập nội dung, upload hình ảnh/video, tag học sinh (nếu đăng trên Timeline lớp), có nút "Đăng" và "Hủy".
- Trang chi tiết bài đăng: Hiển thị đầy đủ nội dung, hình ảnh, danh sách học sinh được tag, và lịch sử chỉnh sửa (nếu có).

## 8. Các lưu ý khi triển khai

1. Quyền riêng tư: Đảm bảo bài đăng trên Timeline cá nhân chỉ hiển thị cho phụ huynh của học sinh đó.
2. Tag học sinh: Khi tag học sinh, bài đăng sẽ xuất hiện trên cả Timeline lớp và Timeline cá nhân của học sinh được tag.
3. Hình ảnh: Hỗ trợ upload nhiều hình ảnh, hiển thị dạng gallery. Nén ảnh để tối ưu dung lượng.
4. Lịch sử chỉnh sửa: Lưu lại lịch sử chỉnh sửa để truy vết nếu cần.
5. Thông báo: Có thể gửi thông báo (nếu có tích hợp) đến phụ huynh khi có bài đăng mới (tùy chọn).
6. Xóa bài đăng: Chỉ chuyển trạng thái thành deleted, không xóa vĩnh viễn để giữ lịch sử.
