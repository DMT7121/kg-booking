# TASKS — PHASE 3: INTELLIGENT OPTIMIZATION

## Task List & Execution Status

- [x] **TASK-P3-001**: Implement Deterministic Price Adjustment Optimizer
  - **Files**: `src/domain/menu/priceOptimizer.ts`
  - **Tests**: `src/domain/menu/__tests__/priceOptimizer.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Tính toán 3 phương án giảm trừ ngân sách (`CLOSEST`, `LEAST_CHANGES`, `BALANCED`) bằng số nguyên VND, bảo vệ các món `isProtected`, không lỗi float.

- [x] **TASK-P3-002**: Implement Smart Menu Budget Engine
  - **Files**: `src/domain/menu/menuBudgetEngine.ts`
  - **Tests**: `src/domain/menu/__tests__/menuBudgetEngine.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Đề xuất 3 menu 3 phân khúc (`ECONOMY`, `BALANCED`, `PREMIUM`) cân đối đủ 4 nhóm món chính theo ngân sách khách yêu cầu.

- [x] **TASK-P3-003**: Implement Customer 360 Aggregation Engine
  - **Files**: `src/domain/customer/customer360.ts`
  - **Tests**: `src/domain/customer/__tests__/customer360.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Tổng hợp toàn diện lịch sử chi tiêu, tỷ lệ hủy, khu vực và món ăn yêu thích của khách hàng theo SĐT.

- [x] **TASK-P3-004**: Implement No-Code Automation Rule Engine
  - **Files**: `src/domain/automation/automationEngine.ts`
  - **Tests**: `src/domain/automation/__tests__/automationEngine.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Thực thi quy tắc `Trigger -> Condition -> Action`, chặn loop vô hạn, có lịch sử thực thi và chế độ giả lập dry-run.

- [x] **TASK-P3-005**: Build UI Modals (PriceOptimizerModal.vue, Customer360Drawer.vue)
  - **Files**: `src/components/operations/PriceOptimizerModal.vue`, `src/components/operations/Customer360Drawer.vue`
  - **Acceptance Criteria**: Giao diện chọn phương án tối ưu tiền món và drawer xem thông tin khách 360.

- [x] **TASK-P3-006**: Regression Verification & Build Hardening
  - **Commands**: `npx vitest run`, `npm run build`
  - **Acceptance Criteria**: Toàn bộ unit tests (251/251 passing tests, bảo toàn baseline 206 ban đầu) pass 100%, build Vite production sạch không lỗi.
