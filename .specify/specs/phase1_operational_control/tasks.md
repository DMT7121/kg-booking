# TASKS — PHASE 1: OPERATIONAL CONTROL

## Task List & Execution Status

- [x] **TASK-P1-001**: Implement Composite Booking Status & Transition Validator
  - **Files**: `src/domain/booking/statusTypes.ts`, `src/domain/booking/statusCalculator.ts`
  - **Tests**: `src/domain/booking/__tests__/statusCalculator.test.ts` (4 tests passed)
  - **Acceptance Criteria**: Tính toán chính xác 6 trạng thái phái sinh (`READY`, `NEEDS_ATTENTION`, `BLOCKED`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`) từ các domain fields độc lập.

- [x] **TASK-P1-002**: Implement Deterministic Conflict & Operational Risk Engine
  - **Files**: `src/domain/booking/conflictEngine.ts`
  - **Tests**: `src/domain/booking/__tests__/conflictEngine.test.ts` (4 tests passed)
  - **Acceptance Criteria**: Phát hiện 100% các xung đột trùng bàn (Buffer 120p), vượt sức chứa, thiếu cọc sát giờ tiệc, thiếu thông tin decor tiệc sinh nhật.

- [x] **TASK-P1-003**: Implement AI Field Confidence & Evidence Disambiguation Model
  - **Files**: `src/domain/ai/evidenceModel.ts`
  - **Tests**: `src/domain/ai/__tests__/evidenceModel.test.ts` (3 tests passed)
  - **Acceptance Criteria**: Cung cấp cấu trúc dữ liệu `FieldEvidence` cho từng trường kèm trạng thái xác thực.

- [x] **TASK-P1-004**: Build Operational Command Center & Risk Center UI Components
  - **Files**: `src/components/operations/CommandCenterCard.vue`, `src/components/operations/OperationalRiskWidget.vue`, `src/components/operations/BookingCommandCenter.vue`
  - **Acceptance Criteria**: Hiển thị thẻ booking trực quan đa trạng thái, quick actions, danh sách cảnh báo ưu tiên theo mức độ nghiêm trọng và thời gian còn lại.

- [x] **TASK-P1-005**: Regression Verification & Build Hardening
  - **Commands**: `npx vitest run`, `npm run build`
  - **Acceptance Criteria**: Đạt 100% test pass (234/234 passing tests, bảo toàn baseline 206 ban đầu), build Vite production sạch không lỗi.
