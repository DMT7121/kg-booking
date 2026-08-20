# SPECIFICATION — PHASE 2: PARTY EXECUTION & DEPARTMENTAL DISPATCH

## 1. Bối Cảnh & Mục Tiêu (Context & Objective)
Một đơn đặt bàn sau khi tiếp nhận từ AI hoặc Lễ tân không kết thúc ở việc "lưu dữ liệu", mà phải được chuyển đổi thành **Kế Hoạch Điều Hành Tiệc (Banquet Event Order - BEO)** để điều phối xuống các bộ phận tác nghiệp:
- **Bếp (Kitchen)**: Cần biết chính xác giờ lên món, khẩu phần (`5 con`, `1/2 con`, `1kg`), các dặn dò đặc biệt (không cay, ít ngọt, lên món cùng lúc).
- **Trang Trí (Decor)**: Cần theo dõi tiến độ cắm hoa tươi, thổi bóng bay, in/viết bảng welcome mừng sinh nhật, viết gương chào khách, chuẩn bị bánh kem.
- **Thu Ngân (Cashier)**: Cần đối soát tiền cọc ngân hàng chuyển khoản qua VietQR tự động (`Reconciliation`).

---

## 2. Requirements & Domain Contracts

### 2.1. Party / BEO Engine (`src/domain/party/beoEngine.ts`)
```typescript
export type BEOLifecycleStatus = 'DRAFT' | 'REVIEW' | 'CONFIRMED' | 'DISTRIBUTED' | 'IN_EXECUTION' | 'COMPLETED'

export interface BEOItem {
  id: string
  bookingId: string
  version: number
  status: BEOLifecycleStatus
  general: {
    eventDate: string
    eventTime: string
    guestCount: number
    tableNumber: string
    partyType: string
    customerName: string
    phone: string
    partyOwnerName?: string
  }
  menu: {
    items: Array<{
      name: string
      quantity: number
      portion?: string
      kitchenNotes?: string
      station?: 'grill' | 'hotpot_stir' | 'cold_seafood' | 'general'
    }>
    specialServiceInstructions?: string
    cakeServingTime?: string
  }
  decoration: {
    themeColor?: string
    displayBoardText?: string
    mirrorBoardText?: string
    freshFlowers?: string
    balloons?: string
    backdrop?: string
    setupDeadline?: string
    notes?: string
  }
  deposit: {
    amount: number
    status: string
    reconciled: boolean
  }
  isUpdatedAfterDistribution?: boolean
  updatedAt: number
}
```

### 2.2. Kitchen Board Module (`src/domain/party/kitchenTicket.ts`)
- **Ticket States**: `NEW` | `ACKNOWLEDGED` | `PREPARING` | `READY` | `SERVED`
- **Station Router**: Phân loại món tự động về trạm nấu:
  - `grill`: Nướng, BBQ, hàu nướng phô mai/mỡ hành, bò nướng.
  - `hotpot_stir`: Lẩu riêu cua, lẩu gà, lẩu thái, món xào, món súp.
  - `cold_seafood`: Gỏi, sashimi, hải sản hấp, khai vị nguội.
  - `general`: Món tráng miệng, cơm chiên, mì xào.

### 2.3. Decor Board Module (`src/domain/party/decorTicket.ts`)
- **Decor Statuses**: `NOT_REQUIRED` | `WAITING_CONFIRMATION` | `CONFIRMED` | `PREPARING` | `READY` | `COMPLETED`
- Theo dõi toàn bộ các hạng mục hoa tươi, bóng bay, bảng tên, gương viết và giờ thắp nến bánh kem.

### 2.4. Deposit Reconciliation Engine (`src/domain/deposit/reconciliationEngine.ts`)
- **Matching Criteria**:
  - Đối chiếu số tiền cọc (`amount == requiredDeposit`)
  - Đối chiếu số điện thoại khách (`phone` xuất hiện trong nội dung chuyển khoản)
  - Đối chiếu cú pháp mã hóa (`KG [phone] [date]` hoặc `KG [order_id]`)
  - Đối chiếu khoảng cách thời gian giao dịch.
- **Match Status**: `MATCHED` | `PROBABLE_MATCH` | `AMBIGUOUS` | `UNMATCHED` kèm giải trình lý do cụ thể (Deterministic explanation).

---

## 3. Acceptance Criteria
1. Hàm `generateBEOFromBooking(booking)` tạo ra phiếu BEO hoàn chỉnh với đầy đủ các phân khu (General, Menu, Decor, Deposit).
2. Khi BEO đã `DISTRIBUTED` mà có sửa đổi về món ăn hoặc số khách, hệ thống tự động gắn cờ `isUpdatedAfterDistribution = true`.
3. Bộ điều phối bếp `routeDishToStation(dishName)` tự động phân loại đúng trạm nướng, lẩu, xào, khai vị.
4. Thuật toán `reconcileDeposit(booking, bankTransactions)` tự động phân loại chuẩn xác giao dịch chuyển khoản.
5. Bảo toàn 100% test suite hiện tại (234/234 passing tests) và mở rộng tests mới.
