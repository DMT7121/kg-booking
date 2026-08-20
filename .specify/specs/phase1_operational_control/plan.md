# IMPLEMENTATION PLAN — PHASE 1: OPERATIONAL CONTROL

## 1. Scope & Impact Analysis
- **Mục tiêu**: Xây dựng Composite Status, Conflict & Risk Engine, AI Confidence Evidence và Booking Command Center.
- **Vùng ảnh hưởng**:
  - `src/domain/booking/statusTypes.ts` (NEW): Định nghĩa kiểu trạng thái đa chiều.
  - `src/domain/booking/statusCalculator.ts` (NEW): Hàm tính toán trạng thái phái sinh và chuyển đổi trạng thái.
  - `src/domain/booking/conflictEngine.ts` (NEW): Thuật toán phát hiện xung đột bàn và rủi ro vận hành.
  - `src/domain/ai/types.ts` (NEW / EXTEND): Chuẩn hóa cấu trúc AI Field Evidence.
  - `src/components/operations/CommandCenter.vue` (NEW): Màn hình điều hành trung tâm.
  - `src/components/operations/RiskCenter.vue` (NEW): Bảng danh sách cảnh báo cần xử lý.
  - `src/stores/useAppStore.ts`: Kết nối Composite Status & Risk Engine dưới cờ Feature Flag.
- **Chiến lược kiểm soát rủi ro**:
  - Toàn bộ tính năng mới được bọc sau Feature Flags (`compositeBookingStatus`, `operationalRiskCenter`, `commandCenterV2`).
  - Khi cờ tắt, hệ thống hoạt động 100% như phiên bản hiện tại.

---

## 2. Technical Architecture & Steps

### Step 1: Composite Status Module (`src/domain/booking/statusTypes.ts`, `statusCalculator.ts`)
- Triển khai logic tính `DerivedOperationalStatus` dựa trên các trường:
  - Nếu `status === 'cancelled'` -> `CANCELLED`.
  - Nếu có xung đột nghiêm trọng (`hasCriticalConflict`) -> `BLOCKED`.
  - Nếu có cảnh báo (`hasWarnings`, `missingDeposit`, `missingTable`, `missingDecor`) -> `NEEDS_ATTENTION`.
  - Nếu khách đã check-in / đang ngồi -> `IN_SERVICE`.
  - Nếu đã thanh toán & hoàn tất -> `COMPLETED`.
  - Nếu mọi điều kiện sẵn sàng -> `READY`.

### Step 2: Conflict & Risk Engine (`src/domain/booking/conflictEngine.ts`)
- Viết thuật toán kiểm tra:
  - `checkTableOverlap(booking, allBookings, bufferMinutes = 120)`
  - `checkCapacityLimit(booking, tableDefinitions)`
  - `checkOperationalRisks(booking, allBookings, tableDefinitions)`

### Step 3: AI Field Evidence & Confidence Disambiguation (`src/domain/ai/evidenceModel.ts`)
- Chuẩn hóa đầu ra trích xuất từng trường kèm mức độ tin cậy, nguồn bằng chứng trích xuất từ tin nhắn.

### Step 4: UI Components (`src/components/operations/`)
- `CommandCenterCard.vue`: Thẻ booking trực quan hiển thị badge từng domain status (Cọc, Món, Decor, Bếp, Bàn).
- `OperationalRiskWidget.vue`: Widget hiển thị danh sách các booking cần xử lý ngay lập tức.

### Step 5: Test Automation & Regression Verification
- Viết bộ unit tests chuyên sâu cho `statusCalculator.test.ts`, `conflictEngine.test.ts`, `evidenceModel.test.ts`.
- Chạy `npx vitest run` và `npm run build`.
