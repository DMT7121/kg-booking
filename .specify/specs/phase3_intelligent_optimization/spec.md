# SPECIFICATION — PHASE 3: INTELLIGENT OPTIMIZATION & CUSTOMER 360

## 1. Bối Cảnh & Mục Tiêu (Context & Objective)
Trong thực tế kinh doanh nhà hàng tiệc, 2 nhu cầu tư vấn thường xuyên nhất của khách hàng là:
1. *"Tôi có ngân sách 15 triệu cho 20 người, nhà hàng gợi ý giúp menu phù hợp."*
2. *"Tổng bill hiện tại là 21.377.680đ, tôi muốn giảm bớt món để về đúng tầm 19.300.000đ mà không làm hỏng bữa tiệc."*

Nhân viên thường mất 15-30 phút cộng trừ bằng tay, dễ tính nhầm hoặc làm mất cân đối thực đơn (ví dụ xóa hết món khai vị hoặc giảm nhầm món chính đã khóa).

**Phase 3** giải quyết triệt để bài toán này bằng:
1. **Deterministic Price Adjustment Optimizer**: Thuật toán quy hoạch động (Dynamic Programming / Subset Sum) tối ưu giảm trừ tiền món chính xác từng đồng VND, đưa ra 3 phương án lựa chọn (`Closest`, `Least Changes`, `Balanced`).
2. **Smart Menu Budget Engine**: Tự động gợi ý thực đơn 3 phân khúc (`Tiết kiệm`, `Cân bằng`, `Thịnh soạn`) cân đối đầy đủ Khai vị - Đạm - Hải sản - Lẩu - Tinh bột - Tráng miệng theo ngân sách/khách.
3. **Customer 360 Profile**: Tổng hợp toàn diện lịch sử chi tiêu, tần suất đặt bàn, tỷ lệ hủy/no-show, sở thích khu vực ngồi và món ăn yêu thích theo số điện thoại khách.
4. **No-Code Automation Rule Engine**: Động cơ tự động hóa `Trigger -> Condition -> Action` có cơ chế chống loop vô hạn và hỗ trợ chế độ giả lập (Dry-run).

---

## 2. Requirements & Domain Contracts

### 2.1. Price Adjustment Optimizer Contract (`src/domain/menu/priceOptimizer.ts`)
```typescript
export interface PriceOptimizationInput {
  currentTotal: number
  targetTotal?: number
  reductionTarget?: number
  items: Array<{
    id: string
    name: string
    quantity: number
    unitPrice: number
    category?: string
    isProtected?: boolean // Không được giảm
    minQuantity?: number
  }>
  options?: {
    allowFullItemRemoval?: boolean
    maxReductionPercent?: number
  }
}

export interface OptimizationItemDelta {
  id: string
  name: string
  beforeQuantity: number
  afterQuantity: number
  unitPrice: number
  reductionAmount: number
}

export interface OptimizationOption {
  strategy: 'CLOSEST' | 'LEAST_CHANGES' | 'BALANCED'
  title: string
  description: string
  newTotal: number
  actualReduction: number
  differenceFromTarget: number
  deltas: OptimizationItemDelta[]
}
```

### 2.2. Smart Menu Budget Engine (`src/domain/menu/menuBudgetEngine.ts`)
- **Tiers**:
  - `ECONOMY`: Tối ưu chi phí, tập trung các món no bụng, lẩu truyền thống.
  - `BALANCED`: Cân bằng đạm nướng, lẩu, hải sản signature.
  - `PREMIUM`: Nâng cấp hải sản tươi sống (hàu phô mai, tôm sú, bò nướng thượng hạng).
- Cân đối tỷ lệ các nhóm món: Khai vị (20%), Đạm & Nướng (35%), Lẩu & Tinh bột (35%), Tráng miệng (10%).

### 2.3. Customer 360 Model (`src/domain/customer/customer360.ts`)
- Định danh khách theo số điện thoại chuẩn hóa (Normalized Phone).
- Phân loại thông tin: `FACT` (Số liệu thực tế) vs `INFERRED` (Hệ thống gợi ý) vs `MANUAL_NOTE` (Ghi chú nhân viên).

---

## 3. Acceptance Criteria
1. Thuật toán `optimizePriceReduction` chạy bằng 100% deterministic arithmetic (không dùng floating-point, không gọi LLM), bảo toàn các món `isProtected`.
2. Hàm `generateMenuBudgetOptions(guestCount, budgetPerGuest, menuCatalog)` đưa ra 3 menu cân đối danh mục.
3. Hàm `aggregateCustomer360Profile(phone, allBookings)` tính toán chính xác tổng chi tiêu, tỷ lệ hủy, bàn yêu thích.
4. Đạt 100% test pass trên bộ test mở rộng.
