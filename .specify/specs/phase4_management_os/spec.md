# SPECIFICATION — PHASE 4: MANAGEMENT OS & OPERATIONS ANALYTICS

## 1. Bối Cảnh & Mục Tiêu (Context & Objective)
Là giai đoạn hoàn thiện để đưa hệ thống đạt chuẩn **KING'S GRILL RESTAURANT OPERATIONS OS**, **Phase 4** tập trung vào công tác **Quản Trị, Đo Lường và Giám Sát Toàn Hệ Thống**:
- **Operations Analytics & Revenue Forecasting**: Đo lường chính xác các chỉ số vận hành cốt lõi (Doanh thu dự kiến, Tỷ lệ quay bàn, Tỷ lệ lấp đầy, Tỷ lệ hủy/no-show, Món bán chạy nhất).
- **AI Operations Center & Human Correction Tracker**: Giám sát hiệu năng đường ống AI (Request latency p50/p95, Tỷ lệ cache hit, Tỷ lệ lỗi 429/Circuit Breaker) và **Tỷ lệ nhân viên phải chỉnh sửa dữ liệu AI (Human Correction Rate)** theo từng trường.
- **Multi-Branch Management Model**: Hỗ trợ cấu hình quản lý đa chi nhánh trong chuỗi nhà hàng.

---

## 2. Requirements & Domain Contracts

### 2.1. Operations Analytics Engine (`src/domain/analytics/operationsAnalytics.ts`)
```typescript
export interface OperationsDailyKPI {
  date: string
  totalBookings: number
  totalGuests: number
  projectedRevenue: number
  depositReceived: number
  depositOutstanding: number
  tableOccupancyRate: number
  turnoverRate: number
  readyBookingsCount: number
  attentionBookingsCount: number
  completedBookingsCount: number
  cancelledBookingsCount: number
  averageSpendPerGuest: number
}

export interface OperationsTrendMetrics {
  totalPeriodBookings: number
  cancellationRate: number
  noShowRate: number
  averagePartySize: number
  topDishes: Array<{ name: string; quantity: number; revenue: number }>
  peakArrivalHours: Array<{ hour: string; count: number }>
}
```

### 2.2. AI Operations Telemetry Model (`src/domain/ai/aiOperations.ts`)
```typescript
export interface AiFieldCorrectionRecord {
  field: string
  originalAiValue: any
  correctedHumanValue: any
  confidence: number
  provider: string
  timestamp: number
}

export interface AiTelemetryReport {
  totalRequests: number
  cacheHitRate: number
  averageLatencyMs: number
  fallbackCount: number
  circuitBreakerTrips: number
  fieldCorrectionRates: Record<string, { totalExtractions: number; corrections: number; errorRate: number }>
}
```

### 2.3. Multi-Branch Architecture (`src/domain/branch/branchConfig.ts`)
```typescript
export interface RestaurantBranch {
  id: string
  code: string
  name: string
  address: string
  phone: string
  tablesCount: number
  zones: string[]
  isMainBranch: boolean
}
```

---

## 3. Acceptance Criteria
1. Hàm `calculateDailyOperationsKPI(date, allBookings)` tính toán chính xác doanh thu, cọc, tỷ lệ lấp đầy bàn.
2. Hàm `computeAiTelemetryReport(logs, correctionHistory)` xuất báo cáo hiệu năng và tỷ lệ con người sửa dữ liệu AI.
3. Đạt 100% test suite pass (>= 251 tests baseline).
