# IMPLEMENTATION PLAN — PHASE 0: FOUNDATION SAFETY

## 1. Scope & Impact Analysis
- **Mục tiêu**: Xây dựng nền tảng Safety & Infrastructure cho KG-Booking Restaurant Operations OS.
- **Vùng ảnh hưởng**:
  - `src/services/featureFlags/`: Feature Flag Service.
  - `src/services/audit/`: Audit Logging Service + IndexedDB audit store.
  - `src/utils/money.ts`: Currency-safe math utilities.
  - `src/utils/time.ts`: Timezone & Date normalization utilities.
  - `src/stores/useConfigStore.ts`: Tích hợp feature flags.
  - `src/domain/booking/`: Bổ sung audit tracking hooks.
- **Rủi ro hồi quy**: Rất thấp (Các module mới hoàn toàn bổ trợ và không làm thay đổi luồng nghiệp vụ hiện tại nếu feature flags đang ở trạng thái mặc định).

---

## 2. Technical Design

### Step 1: Currency & Timezone Safety (`src/utils/money.ts`, `src/utils/time.ts`)
- Triển khai các hàm toán học tiền tệ trên số nguyên (Integer Cents / Dong-safe):
  - `roundVND(amount: number): number`
  - `safeAddMoney(...amounts: number[]): number`
  - `safeSubtractMoney(base: number, deduction: number): number`
  - `safeCalculateTotal(items: Array<{ price: number; qty: number }>): number`
  - `getRestaurantNow(): Date`
  - `formatRestaurantDate(date: Date | string): string`

### Step 2: Feature Flag System (`src/services/featureFlags/featureFlagService.ts`)
- Quản lý trạng thái các cờ tính năng lưu trong memory + localStorage.
- Hỗ trợ hàm `isFeatureEnabled(flagName: string): boolean`, `setFeatureFlag(flagName, value)`, `getAllFeatureFlags()`.
- Tích hợp vào `useConfigStore.ts`.

### Step 3: Audit Logging & Event Dispatcher (`src/services/audit/auditService.ts`)
- Tạo schema và repository cho `audit_logs` trên IndexedDB (`audit_logs_local`).
- Cung cấp API `recordAuditLog({ entityType, entityId, action, actorId, actorType, beforeState, afterState, source })`.
- Cung cấp API `getAuditLogsForEntity(entityType, entityId)`.

### Step 4: Unit Test Suite & Validation
- Viết bộ unit tests cho:
  - `src/utils/__tests__/money.test.ts`
  - `src/services/featureFlags/__tests__/featureFlagService.test.ts`
  - `src/services/audit/__tests__/auditService.test.ts`
- Chạy toàn bộ Vitest suite và kiểm tra build `npm run build`.
