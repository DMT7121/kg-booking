# IMPLEMENTATION PLAN — PHASE 3: INTELLIGENT OPTIMIZATION

## 1. Scope & Impact Analysis
- **Mục tiêu**: Xây dựng Price Optimizer, Menu Budget Engine, Customer 360 và Automation Engine.
- **Vùng ảnh hưởng**:
  - `src/domain/menu/priceOptimizer.ts` (NEW): Thuật toán tối ưu giảm trừ tiền món.
  - `src/domain/menu/menuBudgetEngine.ts` (NEW): Gợi ý thực đơn theo ngân sách và nhóm món.
  - `src/domain/customer/customer360.ts` (NEW): Tổng hợp dữ liệu khách hàng 360.
  - `src/domain/automation/automationEngine.ts` (NEW): Động cơ thực thi Automation Rules.
  - `src/components/operations/PriceOptimizerModal.vue` (NEW): Modal điều chỉnh ngân sách trực quan.
  - `src/components/operations/Customer360Drawer.vue` (NEW): Drawer hồ sơ khách hàng.
- **Chiến lược an toàn**:
  - Bọc các chức năng mới trong Feature Flags (`menuPriceOptimizer`, `smartMenuBudget`, `customer360`, `automationBuilder`).

---

## 2. Technical Architecture & Steps

### Step 1: Price Adjustment Optimizer (`src/domain/menu/priceOptimizer.ts`)
- Thuật toán giải bài toán Bounded Knapsack / Subset Sum nghịch đảo trên số nguyên VND:
  - Chiến lược 1 (`CLOSEST`): Tìm tập hợp giảm trừ số lượng `deltaQty` sao cho `|totalReduction - targetReduction|` là nhỏ nhất.
  - Chiến lược 2 (`LEAST_CHANGES`): Ưu tiên giảm ít món nhất (giảm 1 món phụ đắt tiền hoặc đưa 1 món về 0).
  - Chiến lược 3 (`BALANCED`): Giảm đều mỗi nhóm món 1 phần nhỏ, không loại bỏ hoàn toàn nhóm đạm hoặc lẩu.

### Step 2: Smart Menu Budget Engine (`src/domain/menu/menuBudgetEngine.ts`)
- Chia giỏ thực đơn theo 4 nhóm chính: Khai vị, Nướng/Đạm, Lẩu/Tinh bột, Tráng miệng.
- Tính toán khẩu phần và suất ăn tương ứng với `guestCount`.

### Step 3: Customer 360 Engine (`src/domain/customer/customer360.ts`)
- Truy quét toàn bộ lịch sử booking của khách theo SĐT, tính:
  - `lifetimeValue` (Tổng chi tiêu), `averageSpendPerBooking`.
  - `totalBookings`, `completedBookings`, `cancelledBookings`, `noShowBookings`.
  - `favoriteZone` & `favoriteTables`.
  - `topOrderedDishes`.

### Step 4: No-Code Automation Engine (`src/domain/automation/automationEngine.ts`)
- Đánh giá Trigger: `ON_BOOKING_CREATE`, `ON_TIME_BEFORE_EVENT`, `ON_STATUS_CHANGE`.
- Thực thi Action: `SEND_NOTIFICATION`, `MARK_NEEDS_ATTENTION`, `ASSIGN_TAG`.
- Quản lý cooldown, timeout và ghi audit logs.

### Step 5: Departmental UI Components
- `PriceOptimizerModal.vue`: Giao diện trực quan cho nhân viên trượt chọn mức giảm và so sánh 3 phương án A/B/C.
- `Customer360Drawer.vue`: Xem nhanh lịch sử khách hàng khi bấm vào tên khách.

### Step 6: Test Suite & Hardening
- Viết bộ unit tests cho `priceOptimizer.test.ts`, `menuBudgetEngine.test.ts`, `customer360.test.ts`, `automationEngine.test.ts`.
- Chạy `npx vitest run` và `npm run build`.
