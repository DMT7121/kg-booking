# TASKS — PHASE 4: MANAGEMENT OS

## Task List & Execution Status

- [x] **TASK-P4-001**: Implement Operations Analytics Engine & Daily KPIs
  - **Files**: `src/domain/analytics/operationsAnalytics.ts`
  - **Tests**: `src/domain/analytics/__tests__/operationsAnalytics.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Tính toán chính xác doanh thu dự kiến, tiền cọc, tỷ lệ bàn, khung giờ đón khách cao điểm, món bán chạy nhất.

- [x] **TASK-P4-002**: Implement AI Operations Telemetry & Human Correction Tracker
  - **Files**: `src/domain/ai/aiOperations.ts`
  - **Tests**: `src/domain/ai/__tests__/aiOperations.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Ghi nhận và báo cáo tỷ lệ sai sót/chỉnh sửa của con người theo từng trường dữ liệu AI.

- [x] **TASK-P4-003**: Implement Multi-Branch Configuration Manager
  - **Files**: `src/domain/branch/branchConfig.ts`
  - **Tests**: `src/domain/branch/__tests__/branchConfig.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Quản lý danh sách chi nhánh, bảng giá và sơ đồ bàn của chuỗi nhà hàng.

- [x] **TASK-P4-004**: Build Management Dashboard Modals (OperationsAnalyticsModal.vue, AiOperationsModal.vue)
  - **Files**: `src/components/operations/OperationsAnalyticsModal.vue`, `src/components/operations/AiOperationsModal.vue`
  - **Acceptance Criteria**: Giao diện báo cáo quản trị tổng quan và trung tâm giám sát vận hành AI.

- [x] **TASK-P4-005**: Regression Verification & Build Hardening
  - **Commands**: `npx vitest run`, `npm run build`
  - **Acceptance Criteria**: Toàn bộ unit tests (257/257 passing tests, bảo toàn baseline 206 ban đầu) pass 100%, build Vite production sạch không lỗi.
