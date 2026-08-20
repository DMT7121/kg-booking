# SPECIFICATION — PHASE 0: FOUNDATION SAFETY & BASELINE HARDENING

## 1. Mục Đích & Bối Cảnh
Trước khi đưa vào các module vận hành phức tạp của Restaurant Operations OS (Command Center, BEO, Kitchen Board, Price Optimizer), hệ thống cần một nền tảng an toàn tuyệt đối (Safety Harness). 

Phase 0 thiết lập:
1. **Feature Flag Manager**: Cho phép bật/tắt tính năng theo cờ runtime (`OFF`, `BETA`, `100%`) mà không cần redeploy.
2. **Audit Logging & Domain Event Dispatcher**: Ghi nhận toàn bộ biến động dữ liệu (`entityType`, `entityId`, `action`, `actorId`, `actorType`, `before`, `after`, `source`).
3. **Currency & Timezone Safety Engine**: Xử lý tiền tệ an toàn bằng integer-safe arithmetic và chuẩn hóa múi giờ nhà hàng (Asia/Ho_Chi_Minh).
4. **Structured Observability**: Chuẩn hóa structured logging kèm `correlationId`.

---

## 2. Requirements & Acceptance Criteria

### Requirement 1: Feature Flag Management System
- **Mã module**: `src/services/featureFlags/featureFlagService.ts` & `src/stores/useConfigStore.ts`
- **Mô tả**: Hỗ trợ danh sách feature flags:
  - `commandCenterV2`: false
  - `compositeBookingStatus`: false
  - `operationalRiskCenter`: false
  - `bookingConflictEngine`: false
  - `aiConfidenceReview`: false
  - `bookingVersionHistory`: false
  - `syncConflictCenter`: false
  - `depositReconciliation`: false
  - `partyBEO`: false
  - `kitchenBoard`: false
  - `decorBoard`: false
  - `menuPriceOptimizer`: false
  - `customer360`: false
  - `automationBuilder`: false
- **Tiêu chí chấp nhận**:
  - `isFeatureEnabled(flagName)` trả về boolean đúng theo cấu hình.
  - Lưu cấu hình cờ trong localStorage và đồng bộ reactive với UI.

### Requirement 2: Audit Log Infrastructure
- **Mã module**: `src/services/audit/auditService.ts`
- **Mô tả**: Ghi vết thay đổi dữ liệu của `booking`, `deposit`, `menu_item`.
- **Cấu trúc dữ liệu Audit Log**:
  ```typescript
  export interface AuditLogEntry {
    id: string
    entityType: 'booking' | 'deposit' | 'menu_item' | 'customer'
    entityId: string
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'RECONCILE'
    actorId: string
    actorType: 'USER' | 'AI' | 'SYNC' | 'SYSTEM' | 'AUTOMATION'
    timestamp: number
    beforeState: any
    afterState: any
    source: string
    correlationId?: string
  }
  ```
- **Tiêu chí chấp nhận**:
  - Khi một booking được tạo hoặc sửa đổi, `auditService.recordLog()` được kích hoạt và lưu vào IndexedDB cục bộ (`audit_logs_local`).
  - Hỗ trợ hàm truy xuất `getAuditHistory(entityId)` trả về danh sách lịch sử theo thứ tự thời gian.

### Requirement 3: Currency & Timezone Safety Utilities
- **Mã module**: `src/utils/money.ts` & `src/utils/time.ts`
- **Mô tả**: 
  - `money.ts`: Các hàm cộng, trừ, nhân, tính chiết khấu tiền tệ an toàn (tránh lỗi float `0.1 + 0.2`).
  - `time.ts`: Cố định timezone nhà hàng `Asia/Ho_Chi_Minh` (GMT+7) khi tính toán ngày tiệc.
- **Tiêu chí chấp nhận**:
  - `safeAddMoney(a, b)`, `safeSubtractMoney(a, b)`, `safeMultiplyMoney(amount, factor)`, `safeCalculateDiscount(amount, percent)`.
  - Không bao giờ trả về số lẻ thập phân hoặc NaN.

### Requirement 4: Test Suite & Regression Baseline
- Tất cả các module mới trong Phase 0 phải có 100% unit test coverage.
- Toàn bộ 206 test case hiện hành phải pass tuyệt đối.
