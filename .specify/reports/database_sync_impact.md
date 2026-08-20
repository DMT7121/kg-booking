# DATABASE & SYNC IMPACT MAP

## 1. Supabase PostgreSQL Schema Overview

### Core Tables
- `bookings`: Lưu trữ đơn đặt bàn chính (`id`, `order_id`, `customer_name`, `phone`, `date`, `time`, `guest_count`, `table_number`, `status`, `deposit_amount`, `notes`, `metadata`, `created_at`, `updated_at`).
- `menu_items`: Danh mục món ăn (`id`, `name`, `price`, `category`, `unit`, `is_available`).
- `audit_logs` (Planned Phase 0): Ghi vết thay đổi (`id`, `entity_type`, `entity_id`, `action`, `actor_id`, `actor_type`, `before_state`, `after_state`, `source`, `created_at`).
- `booking_conflicts` (Planned Phase 1): Quản lý xung đột phân bổ và sync (`id`, `booking_id`, `conflict_type`, `severity`, `status`, `resolved_by`).

### Row Level Security (RLS)
- Phân quyền theo role: `admin`, `manager`, `cashier`, `receptionist`, `kitchen`.
- Tránh việc bypass RLS bằng service role key ở client.

---

## 2. IndexedDB Schema (Client Storage)

### Object Stores
- `bookings_store`: Bản sao cục bộ của tất cả bookings để render tức thì (<10ms).
- `outbox_store`: Hàng đợi các action offline (`CREATE_BOOKING`, `UPDATE_BOOKING`, `DELETE_BOOKING`, `CONFIRM_DEPOSIT`).
- `ai_cache_store`: Bộ nhớ đệm ngữ nghĩa Semantic Cache (Key hash -> Kết quả trích xuất JSON).
- `audit_logs_local`: Lưu vết audit cục bộ trước khi đẩy lên máy chủ.

---

## 3. Sync & Conflict Matrix

```
                      [ User Action (UI / Form / Timeline) ]
                                        │
                                        ▼
                      [ Local Mutation in IndexedDB ]  ──► UI cập nhật ngay (<10ms)
                                        │
                         [ Online / Network Available? ]
                                   /         \
                              YES /           \ NO
                                 ▼             ▼
                      [ Dual-Write Repos ]   [ Enqueue to Outbox ]
                      • Supabase PG               • IndexedDB Outbox Store
                      • Google Sheets Sync        • Retry with Exponential Backoff
                                 │                         │
                                 │                   (Khi có mạng)
                                 │                         │
                                 └───────────┬─────────────┘
                                             ▼
                             [ Conflict Detection Check ]
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
            [ No Conflict ]                                     [ Conflict Detected ]
       Commit & Version Bump                               • Flag in Conflict Center
                                                           • Keep Local / Server / Merge
```

## 4. Schema Migration Guidelines
1. Mọi migration phải viết dưới dạng file SQL có versioning trong `supabase/migrations/` (vd: `004_audit_and_composite_status.sql`).
2. Migration chỉ **ADD** cột/bảng mới, có giá trị default hợp lệ để tương thích với code cũ.
3. Không thực hiện DROP / RENAME trực tiếp trên database production.
