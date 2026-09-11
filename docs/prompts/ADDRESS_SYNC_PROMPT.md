# NHIỆM VỤ: ĐỒNG BỘ DANH MỤC ĐỊA CHỈ VIỆT NAM SAU SÁP NHẬP

## 1. Bối cảnh
- Dự án: KinderNewGenz (Bun + Hono + Drizzle ORM + PostgreSQL + Zod).
- Tệp đính kèm: `tableConvert.com_tc3thk.csv` (danh mục địa chỉ hành chính mới gồm Tỉnh/Thành phố và Xã/Phường sau sáp nhập).
- Định hướng kiến trúc: **Không dùng mã hành chính (code)**. Chỉ lưu trữ, validate và truyền **Tên (text)** của Tỉnh/Thành phố và Xã/Phường để giữ nguyên schema đơn giản, không làm vỡ logic hiện tại.

## 2. Yêu cầu chi tiết

### A. Chuẩn hóa dữ liệu tĩnh
- Parse file CSV `tableConvert.com_tc3thk.csv` (bỏ qua 2 dòng tiêu đề đầu, lấy từ dòng thứ 3).
- Trim toàn bộ khoảng trắng thừa ở đầu/cuối của Tên Tỉnh và Tên Xã/Phường.
- Trích xuất thành một nguồn dữ liệu tĩnh duy nhất (ví dụ: `src/constants/vietnam-addresses.ts` hoặc `.json`), cấu trúc dạng:
  ```json
  {
    "Thành phố Hà Nội": [
      "Phường Ba Đình",
      "Phường Bạch Mai",
      "Phường Bồ Đề"
    ],
    "Thành phố Hồ Chí Minh": [
      "Xã Xuân Thới Sơn",
      "Xã Hóc Môn"
    ]
  }
  ```
- Không lưu mã số vào dữ liệu ứng dụng.

### B. Cung cấp API Danh mục (Master Data)
- Tạo route phục vụ việc lấy danh sách dropdown cho frontend:
  - `GET /api/v1/master-data/addresses/provinces`: Trả về mảng danh sách tên các Tỉnh/Thành phố (sorted).
  - `GET /api/v1/master-data/addresses/wards?province=<tên tỉnh>`: Trả về danh sách tên các Xã/Phường thuộc Tỉnh đó.
- Không truy vấn PostgreSQL cho phần này vì là dữ liệu tĩnh trong bộ nhớ (In-memory/Cache).

### C. Validation Backend (Zod)
- Xây dựng helper validation:
  - Kiểm tra xem Tỉnh có nằm trong danh mục không.
  - Kiểm tra xem Xã/Phường có thuộc đúng Tỉnh đã chọn không.
- Áp dụng vào schema validation của các route thêm/sửa học sinh, phụ huynh và thông tin trường.

### D. Tương thích Import CSV Học sinh
- Chuẩn bị validator này để khi import file CSV học sinh 82 cột, hệ thống có thể tự động đối chiếu các cột địa chỉ (Thường trú, Chỗ ở hiện nay, Quê quán, Nơi sinh) xem có khớp với danh mục Tỉnh/Xã sau sáp nhập hay không.

### E. Kiểm thử (Tests)
- Viết test kiểm tra:
  - Tải danh sách tỉnh, xã thành công.
  - Từ chối khi nhập Tỉnh không tồn tại hoặc Xã không thuộc Tỉnh đã chọn.
- Chạy `bun test` đảm bảo 100% test pass.
