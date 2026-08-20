export type FeatureFlagKey =
  | 'commandCenterV2'
  | 'compositeBookingStatus'
  | 'operationalRiskCenter'
  | 'bookingConflictEngine'
  | 'aiConfidenceReview'
  | 'bookingVersionHistory'
  | 'syncConflictCenter'
  | 'depositReconciliation'
  | 'partyBEO'
  | 'kitchenBoard'
  | 'decorBoard'
  | 'smartMenuBudget'
  | 'menuPriceOptimizer'
  | 'customer360'
  | 'automationBuilder'
  | 'auditLogSystem'

export interface FeatureFlagConfig {
  key: FeatureFlagKey
  name: string
  description: string
  enabled: boolean
  category: 'core' | 'operations' | 'party' | 'intelligence' | 'admin'
}

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, FeatureFlagConfig> = {
  auditLogSystem: {
    key: 'auditLogSystem',
    name: 'Hệ thống Audit Log',
    description: 'Lưu vết lịch sử chỉnh sửa và biến động dữ liệu đặt bàn',
    enabled: true, // Enabled by default in Phase 0
    category: 'core'
  },
  commandCenterV2: {
    key: 'commandCenterV2',
    name: 'Booking Command Center',
    description: 'Màn hình điều hành trung tâm trực quan hóa toàn bộ booking hôm nay',
    enabled: false,
    category: 'operations'
  },
  compositeBookingStatus: {
    key: 'compositeBookingStatus',
    name: 'Trạng thái Đặt bàn Đa chiều',
    description: 'Tách biệt trạng thái Đặt, Cọc, Món, Decor, Bếp, Bàn',
    enabled: false,
    category: 'operations'
  },
  operationalRiskCenter: {
    key: 'operationalRiskCenter',
    name: 'Trung tâm Quản trị Rủi ro',
    description: 'Tự động phát hiện booking thiếu cọc, chưa xếp bàn, quá giờ',
    enabled: false,
    category: 'operations'
  },
  bookingConflictEngine: {
    key: 'bookingConflictEngine',
    name: 'Bộ Kiểm tra Xung đột Bàn',
    description: 'Phát hiện trùng bàn, vượt sức chứa, thiếu thời gian quay bàn',
    enabled: false,
    category: 'operations'
  },
  aiConfidenceReview: {
    key: 'aiConfidenceReview',
    name: 'Bảng Đánh giá Độ tin cậy AI',
    description: 'Hiển thị bằng chứng trích xuất và cho phép con người duyệt từng trường',
    enabled: false,
    category: 'intelligence'
  },
  bookingVersionHistory: {
    key: 'bookingVersionHistory',
    name: 'Lịch sử Phiên bản Đặt bàn',
    description: 'Theo dõi chi tiết ai sửa trường gì theo dòng thời gian',
    enabled: false,
    category: 'core'
  },
  syncConflictCenter: {
    key: 'syncConflictCenter',
    name: 'Trung tâm Xử lý Xung đột Đồng bộ',
    description: 'Giải quyết xung đột dữ liệu giữa Local và Server (3-Way Merge)',
    enabled: false,
    category: 'core'
  },
  depositReconciliation: {
    key: 'depositReconciliation',
    name: 'Trung tâm Đối soát Cọc',
    description: 'Tự động khớp giao dịch ngân hàng & biên lai chuyển khoản',
    enabled: false,
    category: 'operations'
  },
  partyBEO: {
    key: 'partyBEO',
    name: 'Kế hoạch Điều hành Tiệc (BEO)',
    description: 'Chuyển booking thành phiếu điều phối tiệc chuẩn chuyên nghiệp',
    enabled: false,
    category: 'party'
  },
  kitchenBoard: {
    key: 'kitchenBoard',
    name: 'Bảng Điều phối Bếp',
    description: 'Giao diện riêng biệt cho Bếp theo ca, món và trạm nấu',
    enabled: false,
    category: 'party'
  },
  decorBoard: {
    key: 'decorBoard',
    name: 'Bảng Theo dõi Trang trí',
    description: 'Quản lý tiến độ hoa tươi, bóng bay, bảng tên, gương viết',
    enabled: false,
    category: 'party'
  },
  smartMenuBudget: {
    key: 'smartMenuBudget',
    name: 'Gợi ý Thực đơn theo Ngân sách',
    description: 'Đề xuất combo món cân bằng dinh dưỡng theo chi phí khách yêu cầu',
    enabled: false,
    category: 'intelligence'
  },
  menuPriceOptimizer: {
    key: 'menuPriceOptimizer',
    name: 'Bộ Tối ưu Giảm trừ Ngân sách',
    description: 'Thuật toán tối ưu giảm trừ tiền món chính xác từng đồng',
    enabled: false,
    category: 'intelligence'
  },
  customer360: {
    key: 'customer360',
    name: 'Hồ sơ Khách hàng 360',
    description: 'Xem lịch sử đặt bàn, chi tiêu và sở thích món ăn của khách',
    enabled: false,
    category: 'intelligence'
  },
  automationBuilder: {
    key: 'automationBuilder',
    name: 'Tự động hóa Quy trình (No-Code)',
    description: 'Thiết lập quy tắc Trigger -> Condition -> Action tự động',
    enabled: false,
    category: 'admin'
  }
}
