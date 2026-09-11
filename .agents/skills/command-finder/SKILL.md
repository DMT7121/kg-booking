---
name: command-finder
description: >-
  Tra cứu, tìm kiếm và gợi ý các câu lệnh slash, skills, phím tắt IDE và công cụ có sẵn trong Antigravity. Kích hoạt khi người dùng gõ /commands, /skills, /help hoặc hỏi về danh sách các lệnh, cách tìm lệnh, hoặc muốn biết Antigravity làm được những gì.
---

# Antigravity Command & Skill Finder (/commands, /skills)

Tiện ích tra cứu danh mục đầy đủ các câu lệnh và kỹ năng của Antigravity.

## Bảng Tra Cứu Nhanh Theo Nhu Cầu

### 1. Nhóm Kỹ Năng Master UI/UX & Architecture
- `/ui-audit`: Quét lỗi visual, layout, UX friction, responsive (xuất báo cáo P0-P3, không sửa code).
- `/ui-upgrade`: Nâng cấp giao diện 8 bước toàn diện mà không phá vỡ logic nghiệp vụ.
- `/ui-polish`: Căn chỉnh vi mô 1-2px, cân bằng quang học icon, hover/focus states, 9 component states.
- `/ux-optimize`: Cắt giảm click dư thừa, smart defaults, progressive disclosure, form ergonomics.
- `/safe-refactor`: Tái cấu trúc code an toàn, phân tách component, bảo toàn 100% API và DB logic.
- `/design-system`: Xây dựng Design Tokens (màu semantic, typography, spacing 4-64px) và UI Primitives.
- `/responsive`: Tối ưu mọi kích thước màn hình (320px đến 1920px), touch targets 44x44px, safe areas.
- `/desktop-ux`: Tối ưu ứng dụng desktop, mật độ thông tin cao, DataGrid sticky, phím tắt, Command Palette.
- `/final-polish`: Lượt kiểm tra khắt khe trước khi ship (bắt lỗi chữ rớt dòng lẻ, lệch baseline, CLS).
- `/master-uiux`: Tổng chỉ huy đại tu toàn diện ứng dụng theo chuẩn SaaS/Enterprise quốc tế.

### 2. Nhóm Lệnh Slash Mặc Định
- `/goal`: Chạy tác vụ dài hạn (chạy qua đêm) tự động lặp kiểm tra cho đến khi đạt mục tiêu 100%.
- `/schedule`: Hẹn giờ nhắc nhở một lần hoặc lập cron job định kỳ chạy ngầm.
- `/grill-me`: Phỏng vấn tương tác với AI để làm rõ các quyết định thiết kế và edge cases trước khi code.
- `/learn`: Dạy cho Antigravity ghi nhớ thói quen, cách sửa lỗi hoặc cấu hình mới cho các tác vụ sau.

### 3. Nhóm Phím Tắt IDE
- `Ctrl + I` (`Cmd + I`): Inline Command - Bôi đen đoạn code để sửa trực tiếp tại chỗ.
- `Tab`: Antigravity Tab - Chấp nhận gợi ý code, tự động nhảy con trỏ, tự import thư viện.
- `Ctrl + K`: Mở Command Palette điều hướng nhanh trong IDE.
- `Code Lenses`: Nút bấm nhanh trên đầu hàm ("Refactor", "Write Tests", "Explain").

### 4. Tiện Ích Ngoài Terminal Máy Tính
- `agy-find`: Tìm nhanh lệnh ngay trong terminal hoặc gõ `agy-find --ui` để mở Web Hub.
- `agy-uiux`: Tự động tạo thư mục `.agents/` và `GEMINI.md` cho bất kỳ dự án mới nào trong 1 giây.
