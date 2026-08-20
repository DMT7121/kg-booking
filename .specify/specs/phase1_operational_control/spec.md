# SPECIFICATION — PHASE 1: OPERATIONAL CONTROL & COMMAND CENTER

## 1. Bối Cảnh & Mục Tiêu (Context & Objective)
Trong vận hành nhà hàng tiệc như KING'S GRILL, một đơn đặt bàn không thể chỉ có 1 trạng thái chung (ví dụ "Đã xác nhận") vì:
- Bàn có thể đã cọc nhưng chưa chốt món.
- Món đã chốt nhưng bếp chưa nhận đơn.
- Tiệc sinh nhật đã đặt nhưng chưa xác nhận nội dung bảng mừng hoặc tông màu hoa tươi.
- Sắp đến giờ đón khách nhưng chưa gán bàn hoặc bàn bị trùng giờ với đoàn khách trước.

**Phase 1** nâng cấp năng lực kiểm soát vận hành thông qua:
1. **Composite Booking Status System**: Phân định 7 domain status độc lập và tính toán trạng thái phái sinh (`Derived Operational Status`).
2. **Deterministic Conflict & Risk Engine**: Tự động phát hiện rủi ro (Trùng bàn, vượt sức chứa, thiếu cọc, chưa gán bàn, thiếu decor).
3. **AI Confidence Evidence & Explainability**: Cấu trúc hóa độ tin cậy từng trường kèm bằng chứng trích xuất.
4. **Booking Command Center Dashboard & Risk Alerts**: Màn hình điều hành trung tâm giúp quản lý nắm trọn tình hình nhà hàng trong 1 cái nhìn.

---

## 2. Requirements & Domain Contracts

### 2.1. Domain Status Contracts (`src/domain/booking/statusTypes.ts`)
```typescript
export type BookingDomainStatus = 'DRAFT' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type DepositDomainStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'
export type MenuDomainStatus = 'NOT_SELECTED' | 'DRAFT' | 'CONFIRMED' | 'LOCKED'
export type DecorDomainStatus = 'NOT_REQUIRED' | 'PENDING_DETAILS' | 'CONFIRMED' | 'PREPARING' | 'READY'
export type KitchenDomainStatus = 'PENDING' | 'ACKNOWLEDGED' | 'PREPARING' | 'READY' | 'SERVED'
export type TableDomainStatus = 'UNASSIGNED' | 'ASSIGNED' | 'OCCUPIED'

export type DerivedOperationalStatus = 
  | 'READY'            // Đầy đủ bàn, cọc, món/decor sẵn sàng phục vụ
  | 'NEEDS_ATTENTION'  // Có cảnh báo cần xử lý (thiếu cọc, thiếu bảng tên, chưa chốt món)
  | 'BLOCKED'          // Có xung đột nghiêm trọng (trùng bàn, quá sức chứa)
  | 'IN_SERVICE'       // Khách đang ngồi tại bàn
  | 'COMPLETED'        // Đã thanh toán & kết thúc tiệc
  | 'CANCELLED'        // Khách hủy hoặc No-show
```

### 2.2. Conflict & Risk Engine (`src/domain/booking/conflictEngine.ts`)
- **Nguyên tắc**: 100% Deterministic logic (không gọi LLM).
- **Các loại kiểm tra rủi ro (Risk Codes)**:
  - `TABLE_OVERLAP`: 2 booking trùng bàn trong khoảng thời gian đệm (<120 phút).
  - `CAPACITY_EXCEEDED`: Số khách vượt quá sức chứa tối đa của bàn/khu vực.
  - `UNASSIGNED_TABLE_NEAR_EVENT`: Booking trong vòng 4 tiếng nhưng chưa xếp bàn.
  - `DEPOSIT_MISSING_NEAR_EVENT`: Tiệc đông khách (>=10 người) chưa cọc trong vòng 24h.
  - `DECOR_DETAILS_MISSING`: Tiệc sinh nhật/thôi nôi chưa có nội dung bảng tên hoặc tông màu.
  - `MENU_UNACKNOWLEDGED_BY_KITCHEN`: Khách đã chốt món nhưng bếp chưa nhận đơn trước giờ tiệc.
- **Mức độ nghiêm trọng (Severity)**: `INFO` | `WARNING` | `HIGH` | `CRITICAL`
- **Output**:
  ```typescript
  export interface OperationalRiskIssue {
    code: string
    severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'
    message: string
    bookingId: string
    suggestedResolution?: string
  }
  ```

### 2.3. AI Confidence Evidence Model (`src/domain/ai/types.ts`)
- Mở rộng kết quả AI trả về:
  ```typescript
  export interface FieldEvidence<T> {
    value: T
    confidence: number
    sourceEvidence?: string
    extractionMethod: 'exact_rule' | 'fuzzy_rule' | 'ai_llm' | 'hybrid' | 'fallback'
    validationState: 'valid' | 'needs_review' | 'conflict'
  }
  ```

---

## 3. Acceptance Criteria
1. Hàm `calculateCompositeStatus(booking)` tính toán chính xác `derivedStatus` theo quy tắc nghiệp vụ.
2. Hàm `detectBookingConflicts(booking, allBookings, tableDefinitions)` phát hiện chính xác 100% các xung đột trùng bàn, vượt sức chứa.
3. Feature Flags `compositeBookingStatus`, `operationalRiskCenter`, `bookingConflictEngine`, `commandCenterV2` điều khiển bật/tắt an toàn.
4. Đạt 100% pass trên test suite mở rộng (>= 223 tests).
