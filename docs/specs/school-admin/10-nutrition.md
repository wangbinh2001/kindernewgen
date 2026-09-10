# Quản lý dinh dưỡng

## 1. Mục tiêu

Quản lý thực đơn hàng ngày cho học sinh, đảm bảo dinh dưỡng hợp lý, cân đối, và hỗ trợ lập phiếu đi chợ (grocery/market sheet) dựa trên thực đơn, sĩ số học sinh, và các chi phí vận hành bếp (tiền điện, tiền gas).

## 2. Kho dữ liệu nền tảng

### 2.1. Kho món ăn (Food Repository)

- Mục đích: Lưu trữ tất cả các món ăn mẫu để sử dụng khi tạo thực đơn.
- Phân loại:
  - Món ăn sáng
  - Món ăn trưa (món mặn + món canh)
  - Món ăn xế (ăn nhẹ buổi chiều)
- Số lượng món mẫu tối thiểu:
  - Bữa sáng: 20 món
  - Bữa trưa: 20 món mặn + 20 món canh
  - Bữa xế: 20 món
- Lưu ý: Dữ liệu món mẫu sẽ được cung cấp sẵn từ hệ thống (có thể tìm kiếm từ nguồn tham khảo). Trường có thể tự chỉnh sửa, thêm mới, hoặc xóa sau khi hệ thống đi vào vận hành.

### 2.2. Kho nguyên liệu (Ingredient Repository)

- Mục đích: Lưu trữ tất cả nguyên liệu cần thiết để nấu các món ăn.
- Thông tin lưu trữ:
  - Tên nguyên liệu
  - Đơn vị tính (gram - g, mililit - ml)
  - Giá tiền (nhập cố định trong kho, tính theo đơn vị g hoặc ml)
  - Ghi chú (tùy chọn)
- Nguồn dữ liệu: Kho nguyên liệu được cập nhật tự động từ kho món ăn (mỗi món ăn sẽ có công thức nguyên liệu kèm theo).

### 2.3. Công thức nấu ăn (Recipe)

- Mục đích: Liên kết món ăn với nguyên liệu và định lượng cho 1 suất ăn.
- Ví dụ:
  - Món "Thịt kho trứng": Cần 100g thịt heo + 1 quả trứng + 10g hành tím + 5ml nước mắm (cho 1 học sinh).
  - Món "Canh rau muống": Cần 50g rau muống + 10g thịt băm + 5ml nước mắm (cho 1 học sinh).

## 3. UX Flow

### 3.1. Quản lý thực đơn (Menu Management)

- Entry: Menu "Dinh dưỡng" → Tab "Thực đơn".
- Hiển thị: Lịch (dạng tuần hoặc tháng) với các bữa ăn đã được lên kế hoạch.
- Actions:
  - Tạo thực đơn cho một ngày/tuần.
  - Xem thực đơn theo ngày/tuần/tháng.
  - Chỉnh sửa thực đơn.
  - Xóa thực đơn.
- Form tạo thực đơn:
  - Chọn ngày (bắt buộc).
  - Chọn bữa ăn: Sáng, Trưa, Xế (có thể chọn nhiều bữa cùng lúc).
  - Chọn món ăn từ kho món ăn (có thể tìm kiếm theo tên).
  - Hệ thống tự động kiểm tra các quy tắc nghiệp vụ (không trùng, cân bằng thịt/cá...).

### 3.2. Quy tắc tạo thực đơn tự động (Business Rules)

- Quy tắc 1 - Không trùng quá 2 ngày/tháng:
  - Trong cùng 1 tháng, không được phép lặp lại cùng một thực đơn (bữa ăn hoàn chỉnh) quá 2 lần.
- Quy tắc 2 - Không liên tiếp hai tuần:
  - Các món ăn trong tuần này không được giống với các món ăn trong tuần trước. Ví dụ: Tuần này thứ 2 có món "Thịt kho trứng", tuần sau thứ 3 có món "Thịt kho trứng" là được phép (khác ngày), nhưng thứ 2 tuần sau lại có "Thịt kho trứng" là không được phép.
- Quy tắc 3 - Cân bằng thịt và cá:
  - Áp dụng cho toàn bộ các bữa trong ngày (sáng, trưa, xế).
  - Nếu ngày thứ 2 cả ngày chỉ có món thịt (không có cá), thì ngày thứ 3 bắt buộc phải có ít nhất 1 món cá trong bất kỳ bữa nào (sáng/trưa/xế).
- Quy tắc 4 - Đảm bảo dinh dưỡng:
  - Hệ thống sẽ có cấu hình dinh dưỡng (theo lứa tuổi) trong mục Cài đặt trường (05-settings.md). School Admin có thể nhập các tiêu chuẩn này sau.
  - Khi tạo thực đơn, hệ thống sẽ kiểm tra và cảnh báo nếu thực đơn không đáp ứng đủ dinh dưỡng theo cấu hình.

### 3.3. Lập phiếu đi chợ (Grocery Sheet)

- Entry: Menu "Dinh dưỡng" → Tab "Phiếu đi chợ".
- Form nhập:
  - Chọn khoảng thời gian (tuần hoặc tháng).
  - Hệ thống tự động lấy sĩ số tổng = Tổng số học sinh đang hoạt động trong toàn trường (không trừ học sinh nghỉ).
- Tính toán:
  - Bước 1: Lấy tất cả thực đơn trong khoảng thời gian đã chọn.
  - Bước 2: Tổng hợp nguyên liệu từ các thực đơn (dựa trên công thức nấu ăn).
  - Bước 3: Tính tổng số lượng từng nguyên liệu cần mua.
  - Bước 4: Tính Tổng tiền nguyên liệu = Tổng số lượng × Giá tiền (lấy từ kho nguyên liệu).
  - Bước 5: Tính Tổng tiền đi chợ dự kiến = Tổng tiền nguyên liệu - Tiền gas (nhập theo tháng) - Tiền điện (nhập theo tháng).
  - Bước 6: Tính Tổng tiền thu từ phụ huynh = Sĩ số tổng × (Tiền ăn sáng + Tiền ăn trưa + Tiền ăn xế).
  - Bước 7: So sánh Tổng tiền đi chợ dự kiến và Tổng tiền thu từ phụ huynh. Sai số không được vượt quá 5,000 VND trên tổng số tiền.
- Hiển thị: Phiếu đi chợ với các cột:
  - Tên nguyên liệu
  - Đơn vị tính (g/ml)
  - Số lượng cần mua (tổng hợp từ tất cả các bữa trong kỳ)
  - Giá tiền (từ kho nguyên liệu)
  - Thành tiền
  - Ghi chú
- Actions: In phiếu đi chợ, Xuất Excel.

## 4. Data Model (Mô tả dữ liệu liên quan)

food_items (Kho món ăn):

- id (PK)
- school_id (FK → schools.id)
- name (string) (VD: "Thịt kho trứng", "Canh rau muống")
- category (enum: breakfast | lunch_main | lunch_soup | snack)
- description (text | null)
- created_at (timestamp)
- updated_at (timestamp)

ingredients (Kho nguyên liệu):

- id (PK)
- school_id (FK → schools.id)
- name (string) (VD: "Thịt heo", "Rau muống", "Nước mắm")
- unit (enum: g | ml)
- price_per_unit (decimal) (Giá tiền tính theo g hoặc ml)
- created_at (timestamp)
- updated_at (timestamp)

recipes (Công thức nấu ăn - Liên kết món ăn với nguyên liệu):

- id (PK)
- food_item_id (FK → food_items.id)
- ingredient_id (FK → ingredients.id)
- quantity_per_student (decimal) (Số lượng cho 1 học sinh, tính theo đơn vị g hoặc ml)
- created_at (timestamp)

menus (Thực đơn):

- id (PK)
- school_id (FK → schools.id)
- date (date)
- meal_type (enum: breakfast | lunch | snack)
- food_item_id (FK → food_items.id)
- created_at (timestamp)

grocery_sheets (Phiếu đi chợ):

- id (PK)
- school_id (FK → schools.id)
- start_date (date)
- end_date (date)
- total_students (int) (Sĩ số tổng)
- total_food_cost (decimal) (Tổng tiền nguyên liệu)
- electricity_cost (decimal) (Tiền điện nhập theo tháng)
- gas_cost (decimal) (Tiền gas nhập theo tháng)
- estimated_total (decimal) (Tổng tiền đi chợ dự kiến)
- actual_total (decimal | null) (Tổng tiền đi chợ thực tế - nhập sau khi đi chợ)
- generated_at (timestamp)
- status (draft | confirmed)

grocery_sheet_items (Chi tiết phiếu đi chợ):

- id (PK)
- grocery_sheet_id (FK → grocery_sheets.id)
- ingredient_id (FK → ingredients.id)
- total_quantity (decimal) (Tổng số lượng cần mua)
- unit (enum: g | ml)
- total_price (decimal) (Thành tiền = total_quantity * price_per_unit)
- note (text | null)
- created_at (timestamp)

monthly_expenses (Chi phí cố định hàng tháng - Tiền điện, gas):

- id (PK)
- school_id (FK → schools.id)
- month (date) (VD: 2024-09-01)
- electricity_cost (decimal) (Tiền điện tháng này, có thể để 0 nếu trường tự nhập)
- gas_cost (decimal) (Tiền gas tháng này, có thể để 0 nếu trường tự nhập)
- note (text | null)
- created_at (timestamp)

## 5. API Contracts

- GET /api/v1/school/food-items - Lấy danh sách món ăn trong kho
- POST /api/v1/school/food-items - Tạo món ăn mới
- PUT /api/v1/school/food-items/:id - Cập nhật món ăn
- DELETE /api/v1/school/food-items/:id - Xóa món ăn
- GET /api/v1/school/ingredients - Lấy danh sách nguyên liệu
- POST /api/v1/school/ingredients - Tạo nguyên liệu mới
- PUT /api/v1/school/ingredients/:id - Cập nhật nguyên liệu
- DELETE /api/v1/school/ingredients/:id - Xóa nguyên liệu
- POST /api/v1/school/recipes - Tạo công thức (liên kết món ăn với nguyên liệu)
- PUT /api/v1/school/recipes/:id - Cập nhật công thức
- GET /api/v1/school/menus - Lấy thực đơn theo ngày hoặc khoảng thời gian
- POST /api/v1/school/menus - Tạo thực đơn cho một ngày
- POST /api/v1/school/menus/generate-week - Tạo thực đơn tự động cho cả tuần (dựa trên các quy tắc)
- DELETE /api/v1/school/menus/:id - Xóa thực đơn
- POST /api/v1/school/grocery-sheets/generate - Tạo phiếu đi chợ
- GET /api/v1/school/grocery-sheets - Lấy danh sách phiếu đi chợ đã tạo
- GET /api/v1/school/grocery-sheets/:id - Lấy chi tiết phiếu đi chợ
- PUT /api/v1/school/grocery-sheets/:id - Cập nhật phiếu đi chợ (điều chỉnh số lượng hoặc giá tiền)
- PATCH /api/v1/school/grocery-sheets/:id/confirm - Xác nhận phiếu đi chợ

## 6. Permissions (Phân quyền)

- School Admin: Full access (quản lý kho, thực đơn, phiếu đi chợ).
- Kitchen Staff: Full access (quản lý kho, thực đơn, phiếu đi chợ).
- Teacher: Chỉ xem thực đơn (không được sửa).
- Parent: Chỉ xem thực đơn (qua API Parent).

## 7. UI Design (Tham khảo)

- Kho món ăn: Bảng danh sách các món ăn, có nút Thêm, Sửa, Xóa. Có tìm kiếm và lọc theo danh mục.
- Kho nguyên liệu: Bảng danh sách nguyên liệu, có nút Thêm, Sửa, Xóa. Có tìm kiếm.
- Thực đơn: Dạng lịch (Calendar) hoặc bảng tuần, hiển thị các bữa ăn cho từng ngày. Có nút "Tạo thực đơn tuần" (tự động).
- Phiếu đi chợ: Bảng tổng hợp nguyên liệu, có cột "Số lượng", "Đơn vị", "Giá tiền", "Thành tiền". Có hiển thị "Tổng tiền nguyên liệu", "Tiền điện", "Tiền gas", "Tổng tiền đi chợ dự kiến". Có nút "In" và "Xuất Excel".

## 8. Các lưu ý khi triển khai

1. Dữ liệu món mẫu: Hệ thống sẽ cung cấp sẵn kho món ăn và nguyên liệu (tối thiểu 20 món/bữa) để trường có thể sử dụng ngay. Trường có thể tự chỉnh sửa sau.
2. Quy tắc tạo thực đơn: Hệ thống tự động kiểm tra các quy tắc (không trùng, cân bằng thịt/cá) khi tạo thực đơn tự động. Nếu vi phạm, sẽ hiển thị cảnh báo và yêu cầu điều chỉnh.
3. Tính toán phiếu đi chợ: Sĩ số tổng là tổng số học sinh đang hoạt động (không trừ học sinh nghỉ). Tiền điện và tiền gas được nhập theo từng tháng hoặc cố định (tùy chọn).
4. Sai số 5,000 VND: Khi đi chợ thực tế, số tiền chi ra không được vượt quá 5,000 VND so với dự toán. Nếu vượt quá, hệ thống sẽ hiển thị cảnh báo và yêu cầu nhập lý do.
5. Cấu hình dinh dưỡng: Chức năng này sẽ được phát triển trong giai đoạn sau. School Admin có thể nhập tiêu chuẩn dinh dưỡng trong mục Cài đặt trường (05-settings.md).
