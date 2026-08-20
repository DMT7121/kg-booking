import { roundVND, safeMultiplyMoney } from '@/utils/money'

export type BudgetTier = 'ECONOMY' | 'BALANCED' | 'PREMIUM'

export interface SuggestedMenuItem {
  id: string
  name: string
  quantity: number
  portion?: string
  unitPrice: number
  totalPrice: number
  category: 'starter' | 'main_grill' | 'hotpot_carb' | 'dessert'
}

export interface SuggestedMenuPackage {
  tier: BudgetTier
  title: string
  description: string
  pricePerGuest: number
  guestCount: number
  totalPrice: number
  dishes: SuggestedMenuItem[]
}

export const STANDARD_MENU_PRESETS: Record<BudgetTier, Array<{ name: string; unitPrice: number; category: 'starter' | 'main_grill' | 'hotpot_carb' | 'dessert'; portion?: string }>> = {
  ECONOMY: [
    { name: 'Gỏi củ hủ dừa tôm thịt', unitPrice: 150000, category: 'starter' },
    { name: 'Chả giò hải sản King', unitPrice: 135000, category: 'starter' },
    { name: 'Gà ta nướng muối ớt (1/2 con)', unitPrice: 195000, category: 'main_grill', portion: '1/2 con' },
    { name: 'Hàu nướng mỡ hành (5 con)', unitPrice: 125000, category: 'main_grill', portion: '5 con' },
    { name: 'Lẩu Riêu Cua Bắp Bò', unitPrice: 350000, category: 'hotpot_carb' },
    { name: 'Trái cây theo mùa', unitPrice: 65000, category: 'dessert' }
  ],
  BALANCED: [
    { name: 'Gỏi bò bóp thấu bánh phồng', unitPrice: 175000, category: 'starter' },
    { name: 'Hàu nướng phô mai (10 con)', unitPrice: 260000, category: 'main_grill', portion: '10 con' },
    { name: 'Sườn cọng nướng sốt BBQ', unitPrice: 285000, category: 'main_grill' },
    { name: 'Tôm sú hấp nước dừa (0.5kg)', unitPrice: 320000, category: 'main_grill', portion: '0.5kg' },
    { name: 'Lẩu Hải Sản Tomyum', unitPrice: 390000, category: 'hotpot_carb' },
    { name: 'Mì xào hải sản giòn', unitPrice: 165000, category: 'hotpot_carb' },
    { name: 'Chè hạt sen long nhãn', unitPrice: 95000, category: 'dessert' }
  ],
  PREMIUM: [
    { name: 'Sashimi cá hồi & trích ép trứng', unitPrice: 320000, category: 'starter' },
    { name: 'Gỏi bưởi tôm thịt đặc biệt', unitPrice: 220000, category: 'starter' },
    { name: 'Bò Wagyu nướng đá muối', unitPrice: 480000, category: 'main_grill' },
    { name: 'Hàu nướng phô mai & trứng muối (10 con)', unitPrice: 320000, category: 'main_grill', portion: '10 con' },
    { name: 'Tôm càng xanh nướng mọi (1kg)', unitPrice: 580000, category: 'main_grill', portion: '1kg' },
    { name: 'Lẩu Cua Đồng Cua Cà Mau', unitPrice: 550000, category: 'hotpot_carb' },
    { name: 'Cơm chiên bào ngư hoàng kim', unitPrice: 260000, category: 'hotpot_carb' },
    { name: 'Panna Cotta dâu tây', unitPrice: 120000, category: 'dessert' }
  ]
}

/**
 * Generates 3 tiered menu suggestions based on guest count and target budget.
 */
export function generateMenuBudgetSuggestions(
  guestCountInput: number,
  targetBudgetTotal?: number
): SuggestedMenuPackage[] {
  const guestCount = Math.max(2, Math.round(guestCountInput || 10))
  // Calculate table portion multiplier: ~1 set for every 5-6 guests
  const tablePortionMultiplier = Math.max(1, Math.ceil(guestCount / 5))

  const packages: SuggestedMenuPackage[] = []

  const tiers: BudgetTier[] = ['ECONOMY', 'BALANCED', 'PREMIUM']
  const tierTitles: Record<BudgetTier, { title: string; desc: string }> = {
    ECONOMY: {
      title: 'Gói Tiết Kiệm — Sum Vầy',
      desc: 'Tối ưu chi phí, đầy đủ khai vị, món nướng thơm lừng và lẩu riêu cua truyền thống no bụng.'
    },
    BALANCED: {
      title: 'Gói Cân Bằng — Bán Chạy Nhất',
      desc: 'Cân đối hoàn hảo giữa thịt nướng, hải sản tươi sống và lẩu thái tomyum đậm đà chuẩn vị.'
    },
    PREMIUM: {
      title: 'Gói Thịnh Soạn — Thượng Hạng',
      desc: 'Trải nghiệm ẩm thực cao cấp với Bò Wagyu, Tôm càng xanh, Hàu thượng hạng và Lẩu Cua Cà Mau.'
    }
  }

  for (const tier of tiers) {
    const preset = STANDARD_MENU_PRESETS[tier]
    const dishes: SuggestedMenuItem[] = preset.map((p, idx) => {
      const qty = p.category === 'dessert' ? 1 * tablePortionMultiplier : tablePortionMultiplier
      const totalPrice = safeMultiplyMoney(p.unitPrice, qty)
      return {
        id: `sug_${tier.toLowerCase()}_${idx}`,
        name: p.name,
        quantity: qty,
        portion: p.portion,
        unitPrice: p.unitPrice,
        totalPrice,
        category: p.category
      }
    })

    const totalPrice = dishes.reduce((sum, d) => sum + d.totalPrice, 0)
    const pricePerGuest = roundVND(totalPrice / guestCount)

    packages.push({
      tier,
      title: tierTitles[tier].title,
      description: tierTitles[tier].desc,
      guestCount,
      pricePerGuest,
      totalPrice,
      dishes
    })
  }

  return packages
}
