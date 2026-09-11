import { DEFAULT_TABLE_DEFINITIONS } from '../conflictEngine'
import type { BookingState } from '@/domain/ai/v2/dialogueStateReducer'

export type ConstraintSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL' | 'BLOCK'

export interface ConstraintViolation {
  code: string
  severity: ConstraintSeverity
  title: string
  message: string
  slot: string
  expected?: any
  actual?: any
  suggestedResolution?: string
}

/**
 * Deterministic Operational Constraint Engine.
 * Enforces business rules, guest safety, allergy protection, and capacity bounds.
 */
export function evaluateBookingConstraints(
  state: BookingState,
  options?: {
    tableDefinitions?: typeof DEFAULT_TABLE_DEFINITIONS
  }
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const tableDefs = options?.tableDefinitions || DEFAULT_TABLE_DEFINITIONS

  const guestCount = state.booking.guest_count || 0
  const tableCode = state.booking.table_code || ''

  // 1. CAPACITY_EXCEEDED Check
  if (guestCount > 0 && tableCode) {
    const tables = tableCode.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
    let totalMaxCapacity = 0

    for (const t of tables) {
      const def = tableDefs[t]
      if (def) {
        totalMaxCapacity += def.maxCapacity
      } else {
        totalMaxCapacity += 6
      }
    }

    if (guestCount > totalMaxCapacity) {
      violations.push({
        code: 'CAPACITY_EXCEEDED',
        severity: 'CRITICAL',
        title: 'Vượt sức chứa bàn',
        message: `Số khách (${guestCount}) vượt quá sức chứa tối đa (${totalMaxCapacity} chỗ) của bàn ${tables.join('+')}.`,
        slot: 'table_code',
        expected: { maxCapacity: totalMaxCapacity },
        actual: { guestCount },
        suggestedResolution: 'Ghép thêm bàn liền kề hoặc chuyển sang phòng VIP lớn hơn.'
      })
    }
  }

  // 2. CHILDREN_IN_SMOKING_AREA Check
  const hasChildren = (state.booking.children && state.booking.children > 0) ||
    state.party.baby_chairs > 0 ||
    /bé|be|nhỏ|nho|trẻ em|tre em/i.test(state.party.owner_name) ||
    /bé|be|nhỏ|nho|trẻ em|tre em/i.test(state.party.special_request)

  if (state.party.smoking_area && hasChildren) {
    violations.push({
      code: 'CHILDREN_IN_SMOKING_AREA',
      severity: 'HIGH',
      title: 'Trẻ em trong khu vực hút thuốc',
      message: 'Khách yêu cầu khu vực hút thuốc nhưng đoàn tiệc có trẻ em / ghế em bé (Nguy cơ ảnh hưởng sức khỏe).',
      slot: 'smoking_preference',
      expected: { smokingAreaAllowed: false },
      actual: { smokingAreaRequested: true, hasChildren: true },
      suggestedResolution: 'Tư vấn khách chuyển sang khu vực phòng lạnh hoặc bàn không hút thuốc gần lối ra.'
    })
  }

  // 3. ALLERGY_CONFLICT Check (CRITICAL F&B SAFETY)
  if (state.party.allergens && state.party.allergens.length > 0) {
    const allergenList = state.party.allergens.map(a => a.toLowerCase())
    const hasSeafoodAllergy = allergenList.some(a => a.includes('hải sản') || a.includes('hai san') || a.includes('tôm') || a.includes('cua'))

    if (hasSeafoodAllergy) {
      const hasSeafoodItem = state.menu.items.some(item => {
        const iName = item.name.toLowerCase()
        return iName.includes('lẩu thái') || iName.includes('hải sản') || iName.includes('tôm') || iName.includes('cua') || iName.includes('hàu')
      })

      if (hasSeafoodItem) {
        violations.push({
          code: 'ALLERGY_CONFLICT',
          severity: 'CRITICAL',
          title: 'Cảnh báo dị ứng thực phẩm nghiêm trọng',
          message: 'Đoàn tiệc có khách dị ứng hải sản nhưng thực đơn có món hải sản / lẩu hải sản (Nguy cơ sốc phản vệ).',
          slot: 'dietary_notes',
          expected: { menuContainsAllergen: false },
          actual: { allergen: 'hải sản', menuContainsAllergen: true },
          suggestedResolution: 'Bếp cần nấu riêng biệt dụng cụ và phục vụ đĩa riêng có đánh dấu dị ứng.'
        })
      }
    }
  }

  // 4. LARGE_PARTY_DEPOSIT Check
  if (guestCount >= 8 && state.deposit.amount <= 0 && state.deposit.status !== 'đã cọc') {
    violations.push({
      code: 'MISSING_DEPOSIT_LARGE_PARTY',
      severity: 'HIGH',
      title: 'Tiệc đông chưa cọc giữ chỗ',
      message: `Đoàn ${guestCount} khách chưa cọc giữ chỗ theo quy định của nhà hàng.`,
      slot: 'deposit_amount',
      expected: { depositRequired: true },
      actual: { depositAmount: 0 },
      suggestedResolution: 'Tạo mã VietQR gửi khách chuyển khoản cọc tối thiểu 500.000đ.'
    })
  }

  // 5. BIRTHDAY_DECOR_DETAILS Check
  const isBirthdayOrAnniv = /sinh nhật|thôi nôi|kỉ niệm|anniversary/i.test(state.party.type) || /sinh nhật|thôi nôi/i.test(state.booking.need)
  if (isBirthdayOrAnniv) {
    if (!state.party.decor_color && !state.party.display_board_text && !state.party.special_request) {
      violations.push({
        code: 'DECOR_DETAILS_MISSING',
        severity: 'WARNING',
        title: 'Thiếu thông tin trang trí tiệc',
        message: 'Tiệc sinh nhật chưa có thông tin bảng chữ mừng hoặc tông màu chủ đạo.',
        slot: 'decor_special',
        suggestedResolution: 'Liên hệ khách để chốt tên ghi trên bảng và tông màu bóng bay.'
      })
    }
  }

  return violations
}
