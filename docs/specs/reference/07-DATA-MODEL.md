# Sơ đồ dữ liệu tổng thể

## 1. Mục tiêu

Cung cấp cái nhìn tổng quan về cấu trúc dữ liệu của toàn bộ hệ thống, bao gồm các bảng chính, mối quan hệ giữa các bảng, và các trường dữ liệu quan trọng.

## 2. Danh sách bảng và mô tả ngắn

| #   | Bảng                         | Mô tả                                                       |
| --- | ---------------------------- | ----------------------------------------------------------- |
| 1   | `system_admins`              | Tài khoản System Admin                                      |
| 2   | `schools`                    | Thông tin trường học                                        |
| 3   | `school_years`               | Năm học                                                     |
| 4   | `users`                      | Tài khoản người dùng (School Admin, Teacher, Staff, Parent) |
| 5   | `students`                   | Hồ sơ học sinh                                              |
| 6   | `responsible_persons`        | Thông tin Bố/Mẹ/Người giám hộ                               |
| 7   | `parent_children`            | Liên kết Parent-Học sinh                                    |
| 8   | `classes`                    | Lớp học                                                     |
| 9   | `class_history`              | Lịch sử lớp học theo năm học                                |
| 10  | `teacher_assignments`        | Phân công giáo viên                                         |
| 11  | `attendance`                 | Điểm danh hàng ngày                                         |
| 12  | `attendance_matrix`          | Điểm danh dạng Matrix                                       |
| 13  | `attendance_qr`              | Điểm danh bằng QR                                           |
| 14  | `attendance_optional_fees`   | Phí tùy chọn trong điểm danh                                |
| 15  | `optional_fees`              | Danh sách phí tùy chọn                                      |
| 16  | `fee_schedules`              | Biểu phí                                                    |
| 17  | `student_reductions`         | Giảm trừ học sinh                                           |
| 18  | `tuition_history`            | Lịch sử học phí (bất biến)                                  |
| 19  | `tuition_adjustments`        | Điều chỉnh học phí                                          |
| 20  | `student_balances`           | Số dư công nợ học sinh                                      |
| 21  | `meal_fees`                  | Tiền ăn (sáng, trưa, xế)                                    |
| 22  | `operating_costs`            | Chi phí vận hành bếp (điện, gas)                            |
| 23  | `health_records`             | Lịch sử đo sức khỏe                                         |
| 24  | `who_standards`              | Tiêu chuẩn WHO                                              |
| 25  | `meals`                      | Thực đơn                                                    |
| 26  | `meal_items`                 | Món ăn trong thực đơn                                       |
| 27  | `ingredients`                | Nguyên liệu                                                 |
| 28  | `recipes`                    | Công thức nấu ăn (liên kết món-nguyên liệu)                 |
| 29  | `grocery_sheets`             | Phiếu đi chợ                                                |
| 30  | `grocery_sheet_items`        | Chi tiết phiếu đi chợ                                       |
| 31  | `timeline_posts`             | Bài đăng Timeline                                           |
| 32  | `timeline_media`             | Hình ảnh/Video trong bài đăng                               |
| 33  | `timeline_tags`              | Tag học sinh trong bài đăng                                 |
| 34  | `timeline_edit_history`      | Lịch sử chỉnh sửa bài đăng                                  |
| 35  | `parent_requests`            | Yêu cầu phụ huynh                                           |
| 36  | `parent_request_attachments` | File đính kèm trong yêu cầu                                 |
| 37  | `parent_request_history`     | Lịch sử trạng thái yêu cầu                                  |
| 38  | `support_requests`           | Yêu cầu hỗ trợ từ School Admin lên System Admin             |
| 39  | `audit_logs`                 | Nhật ký kiểm tra (hỗ trợ System Admin)                      |
| 40  | `dashboard_stats_cache`      | Cache thống kê Dashboard                                    |

## 2.5. Quy tắc Tenant Defense (BẮT BUỘC)

Mọi bảng nghiệp vụ nhạy cảm PHẢI có cột `school_id` trực tiếp (không chỉ truy qua FK). Lý do: nếu chỉ kiểm tra tenant ở application query, một join/mutation thiếu điều kiện sẽ rò rỉ dữ liệu chéo trường.

1. **Direct `school_id`:** Các bảng sau bắt buộc có `school_id` (FK → schools.id), không phụ thuộc vào FK gián tiếp:
   - `responsible_persons`, `parent_children`, `class_history`, `attendance`, `attendance_matrix`, `attendance_qr`, `attendance_optional_fees`, `health_records`, `tuition_history`, `tuition_items`, `tuition_adjustments`, `student_balances`, `timeline_media`, `timeline_tags`, `timeline_edit_history`, `parent_requests`, `parent_request_attachments`, `parent_request_history`.
2. **Composite FK / constraint:** Mọi unique index có liên quan tới tenant phải là tenant-scoped (VD: unique `(school_id, cccd)`, unique `(school_id, student_id, month)`).
3. **RLS (BẮT BUỘC, lớp phòng vệ 2):** Mọi bảng có `school_id` phải bật PostgreSQL Row-Level Security. Policy đọc/ghi dùng `school_id = current_setting('app.school_id', true)::bigint`. Application phải set biến này bằng `SET LOCAL app.school_id = ...` bên trong transaction của request, không set session-level trên connection pool. Database user của app không được là superuser/owner của bảng.
4. **Cross-tenant test:** Integration test phải cover mọi endpoint kiểm tra truy cập chéo trường, không chỉ vài endpoint Phase 1. Mỗi endpoint tối thiểu có test: user trường A truy cập dữ liệu trường B phải 404/403.

## 2.6. Mô hình Parent Account (QUYẾT ĐỊNH)

Dùng **global identity + school_memberships**:
- `users` KHÔNG có `school_id` cố định. Thay vào đó:
  - `users.global_phone` (unique toàn hệ thống) làm định danh đăng nhập.
  - `school_memberships (user_id, school_id, role, status)` liên kết user với từng trường.
  - `parent_children (membership_id, student_id)` liên kết qua membership, không qua user trực tiếp.
- Token chứa `user_id`; khi vào một trường, server xác định `school_id` hợp lệ từ `school_memberships`.
- Phụ huynh có con ở 2 trường → 2 dòng `school_memberships`, 2 trường chọn riêng biệt khi login/context switch.

Lý do: mô hình cũ (1 user = 1 `school_id`) vỡ khi phụ huynh có con ở nhiều trường, hoặc link sai tenant. KHÔNG dùng mô hình lai.

## 3. Quan hệ chính

| #   | Quan hệ                                 | Mô tả                                           |
| --- | --------------------------------------- | ----------------------------------------------- |
| 1   | `schools` - `users`                     | 1 trường có nhiều người dùng                    |
| 2   | `schools` - `students`                  | 1 trường có nhiều học sinh                      |
| 3   | `schools` - `classes`                   | 1 trường có nhiều lớp                           |
| 4   | `schools` - `school_years`              | 1 trường có nhiều năm học                       |
| 5   | `students` - `responsible_persons`      | 1 học sinh có nhiều người giám hộ               |
| 6   | `students` - `parent_children`          | 1 học sinh có thể có nhiều Parent               |
| 7   | `users` (parent) - `parent_children`    | 1 Parent có nhiều con                           |
| 8   | `classes` - `students`                  | 1 lớp có nhiều học sinh                         |
| 9   | `classes` - `teacher_assignments`       | 1 lớp có 1 giáo viên chủ nhiệm                  |
| 10  | `classes` - `class_history`             | 1 lớp có nhiều bản ghi lịch sử                  |
| 11  | `students` - `attendance`               | 1 học sinh có nhiều bản ghi điểm danh           |
| 12  | `students` - `health_records`           | 1 học sinh có nhiều bản ghi sức khỏe            |
| 13  | `students` - `tuition_history`          | 1 học sinh có nhiều bản ghi học phí             |
| 14  | `students` - `student_reductions`       | 1 học sinh có 1 giảm trừ                        |
| 15  | `students` - `student_extra_curricular` | 1 học sinh có nhiều môn học thêm                |
| 16  | `students` - `student_balances`         | 1 học sinh có nhiều bản ghi công nợ             |
| 17  | `students` - `parent_requests`          | 1 học sinh có nhiều yêu cầu từ phụ huynh        |
| 18  | `students` - `timeline_posts`           | 1 học sinh có nhiều bài đăng Timeline           |
| 19  | `students` - `timeline_tags`            | 1 học sinh có thể được tag trong nhiều bài đăng |
| 20  | `meals` - `meal_items`                  | 1 bữa ăn có nhiều món                           |
| 21  | `meal_items` - `recipes`                | 1 món ăn có nhiều nguyên liệu                   |
| 22  | `ingredients` - `recipes`               | 1 nguyên liệu có thể xuất hiện trong nhiều món  |

## 4. Chi tiết các bảng chính

### 4.1. system_admins

- `id` (PK)
- `username` (unique)
- `password_hash`
- `display_name`
- `status` (active | locked)
- `created_at`

### 4.2. schools

- `id` (PK)
- `name` (unique)
- `phone`
- `email`
- `address`
- `status` (active | suspended)
- `created_by` (system_admin_id)
- `created_at`

### 4.3. users

- `id` (PK)
- `global_phone` (unique toàn hệ thống) — định danh login, dùng cho cả Parent đa trường
- `username` (unique, tùy chọn; cho School Admin/Teacher/Staff trong tenant)
- `password_hash`
- `display_name`
- `email`
- `status` (active | locked)
- `must_change_password` (boolean)
- `created_at`
- LƯU Ý: KHÔNG có `school_id` trong `users`. Mỗi user có thể là member của nhiều trường (xem `school_memberships`).

### 4.3.1. school_memberships

- `id` (PK)
- `user_id` (FK → users.id)
- `school_id` (FK → schools.id)
- `role` (school_admin | teacher | staff | parent)
- `status` (active | locked)
- `created_at`
- Unique: `(user_id, school_id, role)`
- Đây là nguồn sự thật cho "user này thuộc trường này với role nào". Token chứa `membership_id` + `school_id`.

### 4.3.2. staff_permissions

- `id` (PK)
- `membership_id` (FK → school_memberships.id)
- `permission` (string, VD: `kitchen.manage_menu`, `accounting.view_tuition`, `health.edit_records`)
- Unique: `(membership_id, permission)`
- Staff role granular quyền theo membership, không theo user toàn cục.

### 4.4. students

- `id` (PK)
- `school_id` (FK → schools.id)
- `full_name`
- `dob` (date)
- `gender` (male | female | other)
- `cccd` — unique theo tenant: `(school_id, cccd)`, KHÔNG unique toàn cục
- `cccd_issue_date` (date | null)
- `cccd_issue_place` (string | null)
- `address`
- `status` (active | inactive)
- `current_class_id` (FK → classes.id | null) — chỉ là cache/denorm, nguồn sự thật membership là `class_students`
- `created_at`

### 4.5. responsible_persons

- `id` (PK)
- `school_id` (FK → schools.id) — tenant defense
- `student_id` (FK → students.id)
- `type` (father | mother | guardian)
- `full_name`
- `year_of_birth`
- `cccd`
- `phone`
- `created_at`
- Constraint: `student_id` phải cùng `school_id` (composite FK `(student_id, school_id)` → `(id, school_id)` của students)

### 4.6. parent_children

- `id` (PK)
- `school_id` (FK → schools.id) — tenant defense
- `membership_id` (FK → school_memberships.id) — link qua membership, không qua user trực tiếp
- `child_id` (FK → students.id)
- `linked_at` (timestamp)
- Constraint: membership và student phải cùng `school_id`
- Unique: `(membership_id, child_id)`

### 4.6.1. class_students

- `id` (PK)
- `school_id` (FK → schools.id)
- `class_id` (FK → classes.id)
- `student_id` (FK → students.id)
- `school_year_id` (FK → school_years.id)
- `enrolled_at` (timestamp)
- `left_at` (timestamp | null)
- Unique: `(class_id, student_id)` khi `left_at` IS NULL
- NGUỒN SỰ THẬT cho "học sinh thuộc lớp nào". `students.current_class_id` là cache; `class_history` là snapshot theo năm học. Chỉ một trong ba được coi là authoritative (class_students), hai cái kia cập nhật từ nó.

### 4.7. classes

- `id` (PK)
- `school_id` (FK → schools.id)
- `school_year_id` (FK → school_years.id)
- `name`
- `teacher_id` (FK → users.id)
- `max_students` (int | null)
- `status` (active | archived)
- `created_at`

### 4.8. class_history

- `id` (PK)
- `student_id` (FK → students.id)
- `class_id` (FK → classes.id)
- `school_year_id` (FK → school_years.id)
- `enrolled_at` (timestamp)
- `left_at` (timestamp | null)
- `created_at`

### 4.9. attendance

- `id` (PK)
- `school_id` (FK → schools.id) — tenant defense
- `student_id` (FK → students.id)
- `class_id` (FK → classes.id)
- `date` (date)
- `status` (present | absent | late | excused | null)
- `note`
- `check_in_time` (time | null)
- `check_out_time` (time | null)
- `overtime_start` (time | null) — overtime cần khoảng thời gian, không chỉ số giờ
- `overtime_end` (time | null)
- `overtime_hours` (decimal | null) — computed từ start/end
- `state` (draft | confirmed | voided) — state machine, xem COMMON-RULES
- `voided_reason` (string | null)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `updated_by` (FK → users.id | null)
- Unique: `(school_id, student_id, date)` — 1 bản ghi điểm danh/học sinh/ngày
- BẤT BIẾN: sau khi `state = confirmed`, không UPDATE/DELETE; sai sót tạo bản ghi adjustment hoặc void với lý do

### 4.10. tuition_history

- `id` (PK)
- `school_id` (FK → schools.id)
- `student_id` (FK → students.id)
- `month` (date)
- `fee_snapshot` (json) — snapshot biểu phí, lớp, giảm trừ, cài đặt tại thời điểm tính
- `reduction_type` (percentage | fixed | null)
- `reduction_value` (decimal | null)
- `total_fees` (decimal)
- `total_reduction` (decimal)
- `final_amount` (decimal)
- `note`
- `state` (draft | confirmed | voided)
- `voided_reason` (string | null)
- `confirmed_at` (timestamp)
- `confirmed_by` (FK → school_memberships.id)
- `created_at` (timestamp)
- Unique: `(school_id, student_id, month)`
- BẤT BIẾN: sau confirmed không UPDATE/DELETE; dùng adjustment/void

### 4.11. health_records

- `id` (PK)
- `school_id` (FK → schools.id)
- `student_id` (FK → students.id)
- `date` (date)
- `height` (decimal)
- `weight` (decimal)
- `bmi` (decimal)
- `who_standard_version` (string) — phiên bản tiêu chuẩn WHO dùng để phân loại
- `age_months` (int) — tuổi tính theo tháng (sinh non xét riêng)
- `classification` (underweight | normal | overweight | obese | null) — xem WHO, CDC hoặc chuyên gia xác nhận; KHÔNG triển khai phân loại y tế trước khi có nguồn chuẩn
- `note`
- `created_by` (FK → school_memberships.id)
- `created_at` (timestamp)
- BẤT BIẾN: sau khi ghi nhận, không UPDATE/DELETE; sai sót → correction/void với lý do
- Lưu ý: `classification` KHÔNG được trình bày như chẩn đoán y khoa, cần disclaimer

### 4.12. timeline_posts

- `id` (PK)
- `school_id` (FK → schools.id)
- `author_id` (FK → users.id)
- `type` (class | child)
- `class_id` (FK → classes.id | null)
- `student_id` (FK → students.id | null)
- `content`
- `note`
- `status` (active | deleted)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 4.13. parent_requests

- `id` (PK)
- `school_id` (FK → schools.id)
- `parent_id` (FK → users.id)
- `child_id` (FK → students.id)
- `type` (absence | late_arrival | late_pickup | medical | health_notice | other)
- `content`
- `urgent` (boolean)
- `status` (pending | resolved | rejected)
- `resolved_by` (FK → users.id | null)
- `resolved_at` (timestamp | null)
- `response`
- `note`
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 4.14. tuition_items

- `id` (PK)
- `tuition_history_id` (FK → tuition_history.id)
- `fee_type`
- `description`
- `amount` (decimal)

### 4.15. tuition_adjustments

- `id` (PK)
- `school_id` (FK → schools.id)
- `student_id` (FK → students.id)
- `tuition_history_id` (FK → tuition_history.id)
- `amount` (decimal)
- `reason`
- `created_by` (FK → users.id)
- `created_at` (timestamp)

### 4.16. student_balances

- `id` (PK)
- `school_id` (FK → schools.id)
- `student_id` (FK → students.id)
- `period` (date)
- `opening_amount` (decimal) — `>0` = còn phải thu; `<0` = khách trả thừa
- `charges` (decimal) — học phí + phí phát sinh kỳ này
- `payments` (decimal) — đã thu kỳ này
- `adjustments` (decimal) — điều chỉnh có dấu
- `closing_amount` (decimal) — `opening + charges - payments + adjustments`
- `created_at` (timestamp)
- QUY ƯỚC DẤU (CHUẨN): `amount_due = opening + charges - payments + adjustments`. `amount_due > 0` = còn phải thu; `amount_due < 0` = credit (trừ vào kỳ sau). KHÔNG dùng "balance = paid - due" (đảo dấu gây lỗi khi kết chuyển).
- Công thức kết chuyển: `payable = current_charges + previous_due - previous_credit`
- Unique: `(school_id, student_id, period)`
- Rounding: tiền VND, đơn vị đồng, làm tròn tới đồng; ghi rule rõ
- Nguồn số phải dựa trên payment ledger (bảng payments), xem tuition module

### 4.16.1. payments

- `id` (PK)
- `school_id` (FK → schools.id)
- `student_id` (FK → students.id)
- `amount` (decimal) — số tiền thu/hoàn (hoàn = negative)
- `method` (cash | transfer | other)
- `received_at` (timestamp)
- `received_by` (FK → school_memberships.id)
- BẤT BIẾN sau khi ghi; hoàn tiền tạo payment mới với amount âm

### 4.17. audit_logs

- `id` (PK)
- `actor_type` (system_admin | user) — KHÔNG dùng FK đa hình trực tiếp
- `actor_id` (uuid) — giá trị id của system_admins.id hoặc users.id (không có FK)
- `school_id` (FK → schools.id | null) — null với thao tác nền tảng
- `support_session_id` (FK → support_requests.id | null) — liên kết audit với phiên hỗ trợ
- `action`
- `target_type` / `target_id`
- `metadata` (json)
- `ip_address`
- `timestamp`
- LƯU Ý: PostgreSQL KHÔNG hỗ trợ polymorphic FK. Kiểm tra actor tồn tại bằng application logic / two FK columns alternative: hoặc `actor_membership_id` + `actor_system_admin_id` (một trong hai NOT NULL).
- Audit là APPEND-ONLY: DB trigger chặn UPDATE/DELETE.

## 5. Các lưu ý khi thiết kế schema

1. **Tenant Isolation (DB-level):** Xem mục 2.5. Mọi bảng nghiệp vụ nhạy cảm có `school_id` TRỰC TIẾP, không chỉ qua FK.
2. **Soft Delete:** Sử dụng `status` (active/inactive/archived) hoặc `state` (confirmed/voided). KHÔNG hard delete dữ liệu lịch sử.
3. **JSON Field:** Dùng JSON cho snapshot (`fee_snapshot`, `metadata`) — snapshot BẤT BIẾN tại thời điểm tính.
4. **Index:** Index mọi cột query thường xuyên (`school_id`, `student_id`, `class_id`, `date`, `month`) và unique tenant-scoped.
5. **Lịch sử bất biến + State Machine:** `tuition_history`, `tuition_items`, `attendance`, `health_records` có state `draft → confirmed → voided`. Sau confirmed: KHÔNG UPDATE/DELETE; sai sót tạo adjustment/void event kèm lý do + actor + thời điểm.
6. **Ràng buộc tenant:** Composite FK bảo đảm hai bản ghi liên kết cùng `school_id`. Mọi unique index tenant-scoped trừ dữ liệu thực sự toàn cục (`school_memberships`, `users.global_phone`).
7. **Nguồn sự thật membership:** `class_students` là authoritative; `students.current_class_id` (cache) và `class_history` (snapshot năm học) phải dẫn xuất từ nó, không phải ba nguồn độc lập.
8. **Nguồn sự thật teacher assignment:** `teacher_assignments` là authoritative; `classes.teacher_id` là cache cho GVC hiện tại.
9. **Nutrition naming:** Thống nhất MỘT bộ tên. Chốt dùng `food_items`, `ingredients`, `recipes`, `menus`, `menu_items`. Loại bỏ `meals`/`meal_items` gây nhập nhằng.
10. **Kitchen cost:** Thống nhất MỘT bảng chi phí vận hành bếp: `operating_costs` (điện, gas theo kỳ). Xóa `monthly_expenses` trùng lặp khỏi module docs hoặc gộp vào `operating_costs`.

## 6. Bảng bổ sung cần có (trước đây thiếu trong danh sách tổng)

`school_settings`, `class_students`, `staff_permissions`, `extra_curriculars`, `student_extra_curricular`, `school_years` đã có, `payments`, `school_memberships`. Các module docs PHẢI trỏ về đúng tên bảng ở đây; không tự đặt tên mới.
