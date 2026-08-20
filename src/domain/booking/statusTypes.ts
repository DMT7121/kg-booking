export type BookingDomainStatus = 'DRAFT' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export type DepositDomainStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'

export type MenuDomainStatus = 'NOT_SELECTED' | 'DRAFT' | 'CONFIRMED' | 'LOCKED'

export type DecorDomainStatus = 'NOT_REQUIRED' | 'PENDING_DETAILS' | 'CONFIRMED' | 'PREPARING' | 'READY'

export type KitchenDomainStatus = 'PENDING' | 'ACKNOWLEDGED' | 'PREPARING' | 'READY' | 'SERVED'

export type TableDomainStatus = 'UNASSIGNED' | 'ASSIGNED' | 'OCCUPIED'

export type PaymentDomainStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'

export type DerivedOperationalStatus =
  | 'READY'            // Sẵn sàng phục vụ (Đầy đủ bàn, cọc, món/decor)
  | 'NEEDS_ATTENTION'  // Cần chú ý (Thiếu cọc, thiếu thông tin decor, chưa chốt món)
  | 'BLOCKED'          // Bị tắc nghẽn (Trùng bàn, vượt sức chứa)
  | 'IN_SERVICE'       // Khách đang ngồi tại bàn
  | 'COMPLETED'        // Đã thanh toán và kết thúc
  | 'CANCELLED'        // Đã hủy hoặc vắng mặt

export interface CompositeStatusSummary {
  booking: BookingDomainStatus
  deposit: DepositDomainStatus
  menu: MenuDomainStatus
  decor: DecorDomainStatus
  kitchen: KitchenDomainStatus
  table: TableDomainStatus
  payment: PaymentDomainStatus
  derived: DerivedOperationalStatus
  attentionReasons: string[]
  blockingReasons: string[]
}
