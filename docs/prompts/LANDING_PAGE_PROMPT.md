# NHIỆM VỤ: SCAFFOLD FRONTEND VÀ TRIỂN KHAI LANDING PAGE (KINDERNEWGENZ)

## 1. Bối cảnh & Yêu cầu Kỹ thuật
- Tạo ứng dụng Frontend độc lập trong thư mục `frontend/`.
- **Tech Stack**:
  - Vite + React 19 + TypeScript
  - Tailwind CSS (cấu hình màu Navy `#023664`, Accent Gold `#FAD105`, font `Plus Jakarta Sans`)
  - Motion (`motion/react` - Framer Motion) cho animation mượt mà
  - `@phosphor-icons/react` hoặc `lucide-react` cho iconography
- **Chế độ thiết kế**: `Persuade` mode theo chuẩn **Taste Skill** & **Impeccable Design**.
- **Luật thép Anti-Slop**:
  - Tuyệt đối CẤM dấu gạch ngang dài (`—` em-dash) ở mọi nơi.
  - CẤM màu xám chết `#000000`/`#888888` (dùng slate/navy tinted neutrals).
  - Chiều cao Hero dùng `min-h-[100dvh]`, CẤM `h-screen`.
  - Tiêu đề Hero tối đa 2 dòng, subtext tối đa 20 từ, CTA label tối đa 3 từ không rớt dòng.

---

## 2. Chi tiết các Section của Landing Page

### A. Navigation Bar (Sticky Glassmorphism)
- Logo KinderNewGenz + thương hiệu.
- Menu điều hướng nhanh: Tính năng, Giải pháp, Bảng giá, Đánh giá.
- Nút "Đăng nhập" (outline) và nút "Dùng thử miễn phí" (Gold `#FAD105`).

### B. Hero Section (Mở đầu cuốn hút)
- Headline H1 ngắn gọn (2 dòng, màu Navy `#023664`).
- Subtext dưới 20 từ về giải pháp quản trị mầm non kết nối nhà trường và phụ huynh.
- 2 Nút CTA nổi bật (Dùng thử ngay + Xem video giới thiệu).
- Mockup giao diện app mầm non kết hợp hiệu ứng minh họa 3D/vector cute (em bé đeo balo lơ lửng - floating animation 2.5s lặp nhẹ).

### C. Interactive Role Tabs (Khu vực Tab trượt lướt mượt mà)
- 3 Tab phân vai:
  1. **Hiệu trưởng**: Quản trị học sinh, chuyển lớp năm học mới, tự động hóa học phí.
  2. **Giáo viên**: Điểm danh 1 chạm, nhật ký đón trả, sổ liên lạc điện tử.
  3. **Phụ huynh**: Nhận tin tức tức thì, xem thực đơn dinh dưỡng, theo dõi hoạt động của con.
- Sử dụng `layoutId="activeTab"` của Framer Motion để thanh highlight Gold trượt lướt êm ái khi click chuyển tab. Nội dung chuyển đổi dạng slide fade in.

### D. Bento Grid Features (Lưới tính năng thông minh)
- Lưới bento khít 100% (dùng `grid-flow-dense`), đa dạng phong cách hiển thị:
  - Ô 1: Điểm danh & Bán trú thông minh.
  - Ô 2: Thực đơn dinh dưỡng mỗi ngày (có icon hoạt hình cute).
  - Ô 3: Cảnh báo dị ứng & sức khỏe học sinh.
  - Ô 4: Báo cáo tài chính & biên lai thu học phí.

### E. Social Proof & Final CTA
- Thống kê ấn tượng (50+ cơ sở, 15.000+ phụ huynh tin cậy).
- Banner kêu gọi hành động cuối trang màu Navy `#023664`, form nhập nhanh SĐT nhận tư vấn trong 5 phút.
- Footer chuẩn mực với chính sách bảo mật trẻ em.

---

## 3. Quy trình thực hiện
1. Khởi tạo dự án Vite React TS trong thư mục `frontend/`.
2. Cài đặt các thư viện cần thiết (`motion`, `clsx`, `tailwind-merge`, icon library).
3. Thiết lập theme Tailwind (màu sắc, font chữ).
4. Code toàn bộ các component của Landing Page theo đúng cấu trúc trên.
5. Kiểm tra chạy thử dev server đảm bảo không lỗi TypeScript hay lỗi build.
