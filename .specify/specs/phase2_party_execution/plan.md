# IMPLEMENTATION PLAN — PHASE 2: PARTY EXECUTION

## 1. Scope & Impact Analysis
- **Mục tiêu**: Xây dựng Party BEO Engine, Kitchen Preparation Board, Decor Board và Deposit Reconciliation Engine.
- **Vùng ảnh hưởng**:
  - `src/domain/party/beoEngine.ts` (NEW): Khởi tạo và quản lý vòng đời BEO.
  - `src/domain/party/kitchenTicket.ts` (NEW): Điều phối món về trạm bếp và trạng thái vé bếp.
  - `src/domain/party/decorTicket.ts` (NEW): Quản lý chi tiết và trạng thái hoa tươi/decor.
  - `src/domain/deposit/reconciliationEngine.ts` (NEW): Thuật toán đối soát giao dịch ngân hàng & VietQR.
  - `src/components/operations/KitchenBoard.vue` (NEW): Giao diện dành riêng cho Bếp.
  - `src/components/operations/DecorBoard.vue` (NEW): Giao diện dành riêng cho Đội Trang Trí.
  - `src/components/operations/DepositReconciliationModal.vue` (NEW): Giao diện đối soát cọc tự động.
- **Chiến lược an toàn**:
  - Bọc các chức năng mới trong Feature Flags (`partyBEO`, `kitchenBoard`, `decorBoard`, `depositReconciliation`).

---

## 2. Technical Design & Steps

### Step 1: Party / BEO Engine (`src/domain/party/beoEngine.ts`)
- Hàm `buildBEOFromBooking(booking, previousBEO?)`: Khởi tạo và so sánh diff để gắn cờ `isUpdatedAfterDistribution`.
- Hàm `updateBEOLifecycle(beo, newStatus)`.

### Step 2: Kitchen Ticket & Station Routing (`src/domain/party/kitchenTicket.ts`)
- Thuật toán phân luồng món ăn theo từ khóa:
  - `grill`: nướng, nướng mỡ hành, nướng phô mai, bbq, quay, nướng mọi.
  - `hotpot_stir`: lẩu, lẩu riêu, xào, kho, canh, súp, tiềm, om.
  - `cold_seafood`: gỏi, nộm, sashimi, hấp, tái chanh, salad, nguội.
  - `general`: cơm, mì, miến, tráng miệng, nước, trà.

### Step 3: Decor Ticket Manager (`src/domain/party/decorTicket.ts`)
- Trích xuất toàn diện các trường trang trí: bảng welcome, gương viết, hoa tươi, bóng bay, bánh kem.

### Step 4: Deposit Reconciliation Engine (`src/domain/deposit/reconciliationEngine.ts`)
- Thuật toán so khớp đa tiêu chí: Số tiền + SĐT + Mã booking / Tên trong nội dung chuyển khoản.

### Step 5: Departmental Dispatch UI (`src/components/operations/`)
- `KitchenBoard.vue`: Giao diện KDS trực quan với các cột trạng thái (Mới -> Đã nhận -> Đang làm -> Sẵn sàng).
- `DecorBoard.vue`: Giao diện checklist trang trí tiệc theo timeline và deadline setup.
- `DepositReconciliationModal.vue`: Modal đối soát cọc với giao dịch ngân hàng.

### Step 6: Test Suite & Regression Hardening
- Viết unit tests cho `beoEngine.test.ts`, `kitchenTicket.test.ts`, `reconciliationEngine.test.ts`.
- Chạy `npx vitest run` và `npm run build`.
