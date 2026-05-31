# 🔥 KING'S GRILL OmniBooking AI v2.0.0

> Hệ thống quản lý đặt bàn thông minh đột phá tích hợp AI Core v6.0, Sơ đồ bàn 2D tương tác trực quan, Cổng thông tin khách hàng E-Portal & cơ chế đồng bộ Offline-First.

---

## ⚡ Tính Năng Nổi Bật (Key Features)

### 1. 🧠 AI Core v6.0 (Multi-Layer Pipeline)
- **Waterfall Routing:** Định tuyến linh hoạt qua các mô hình ngôn ngữ lớn (Gemini, GPT, DeepSeek, Llama).
- **Auto-Extraction:** Tự động phân tách thông tin khách hàng, số điện thoại, ngày giờ, số lượng bàn, danh sách món từ văn bản thô hoặc giọng nói.
- **Smart Warnings:** Cảnh báo thông minh khi dữ liệu đặt bàn thiếu hoặc không nhất quán.

### 2. 🗺️ Sơ Đồ Bàn 2D Tương Tác (Interactive Floor Plan)
- Thiết kế trực quan chia theo các phân khu từ **Khu A đến Khu E**.
- Trạng thái bàn cập nhật thời gian thực (Trống, Đã đặt, Đang sử dụng).
- Thao tác nhanh: Chọn bàn trực tiếp từ sơ đồ để điền nhanh thông tin đặt bàn.

### 3. 🎫 Customer E-Portal (Cổng Thông Tin Khách Hàng)
- **Vòng Quay May Mắn (Lucky Wheel):** Mini-game SVG mượt mà kích thích tương tác nhận quà.
- **Thẻ Thành Viên (Loyalty Card):** Tích điểm thông minh và hiển thị hạng thành viên.
- **Hóa Đơn Răng Cưa (Serrated Ticket):** Giao diện hóa đơn phong cách vintage cổ điển bắt mắt.
- **Stamps Trạng Thái:** Đóng dấu trực quan trạng thái đặt cọc (Đã cọc, Chờ cọc) với phông chữ nghệ thuật.

### 4. 📊 Analytics Dashboard & KPIs Leaderboard
- Biểu đồ xu hướng doanh thu 7 ngày vẽ bằng CSS thuần tối ưu hiệu năng.
- Bảng xếp hạng doanh số nhân viên (Gamification Leaderboard) tạo động lực làm việc.
- Thống kê top món ăn bán chạy nhất theo thời gian thực.

### 5. ⚙️ Settings Hub & Admin Security
- Giao diện cài đặt dạng **Split-View** hiện đại trên Desktop và tối ưu cuộn trên Mobile.
- **Centralized Admin Session:** Bảo mật thông tin cấu hình qua mã PIN Admin với cơ chế tự động đăng xuất sau 30 phút không hoạt động.
- Cấu hình linh hoạt: Quản lý danh sách nhân viên, thông tin tài khoản ngân hàng VietQR, cấu hình Webhook thông báo.

### 6. 🔌 Offline-First & Background Sync
- Tích hợp **Service Worker** và cơ chế lưu trữ đệm **IndexedDB** cho phép ứng dụng hoạt động mượt mà khi mất mạng.
- **Offline Queue:** Tự động xếp hàng các yêu cầu tạo/sửa đơn khi mất kết nối và tự động đồng bộ lên Google Sheets ngay khi có mạng trở lại.

---

## ⚡ Tech Stack

- **Frontend**: Vue 3 (Composition API) + Vite + Tailwind CSS
- **State Management**: Pinia (Modular stores: app, ui, form, config)
- **Database/Backend**: Google Apps Script (GAS) đóng vai trò Gateway kết nối Google Sheets & Google Drive
- **Storage**: Cloudflare R2 Bucket (quản lý hình ảnh thực đơn và món ăn)
- **Deploy**: Cloudflare Pages / GitHub Pages

---

## 🚀 Quick Start

### Cài đặt dependencies
```bash
npm install
```

### Chạy môi trường Development
```bash
npm run dev      # Dev server chạy tại http://localhost:3000
```

### Build Production
```bash
npm run build    # Đóng gói sản phẩm vào thư mục dist/
```

### Xem trước bản Build
```bash
npm run preview  # Chạy thử bản build production cục bộ
```

---

## 📁 Cấu Trúc Dự Án (Project Structure)

```
kg-booking/
├── src/
│   ├── components/
│   │   ├── core/        # AppLayout, LeftPanel, BillPreview
│   │   ├── forms/       # AIInput, CustomerForm, DepositManager, MenuEditor
│   │   ├── history/     # HistoryList, HistoryTimeline
│   │   ├── modals/      # StaffModal, BankConfigModal, WebhookConfigModal...
│   │   └── plan/        # FloorPlan (Sơ đồ bàn 2D)
│   ├── composables/     # useAI, useForm, useBillRender, useGestures
│   ├── stores/          # Pinia stores (useAppStore, useUIStore)
│   ├── services/        # GAS API client & cache/offline manager
│   ├── utils/           # Helper functions, constants
│   └── styles/          # Tailwind setup + custom CSS rules
├── gas/
│   ├── Backend.gs       # GAS backend kết nối Sheets, Drive, Webhook
│   └── MenuSeeder.gs    # Seeder khởi tạo dữ liệu thực đơn
└── worker/
    ├── src/index.js     # Cloudflare Worker xử lý upload ảnh lên R2 Bucket
    └── wrangler.toml    # Cấu hình Cloudflare R2 bucket binding
```

---

## 🔑 Cấu Hình Biến Môi Trường (Environment Variables)

Tạo file `.env` tại thư mục gốc dự án:

```env
VITE_GAS_URL=https://script.google.com/macros/s/.../exec
```

---

## 📄 Bản Quyền & Giấy Phép

Bản quyền thuộc về **King's Grill © 2025-2026**. Nghiêm cấm mọi hành vi sao chép và phát tán trái phép.
