import { roundVND, safeSubtractMoney, safeMultiplyMoney } from '@/utils/money'

export interface OptimizationItemInput {
  id: string
  name: string
  quantity: number
  unitPrice: number
  category?: string
  isProtected?: boolean // Món không được phép giảm/xóa
  minQuantity?: number
}

export interface PriceOptimizationInput {
  currentTotal: number
  targetTotal?: number
  reductionTarget?: number
  items: OptimizationItemInput[]
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

/**
 * Deterministically calculates 3 optimal price reduction strategies.
 */
export function optimizePriceReduction(input: PriceOptimizationInput): OptimizationOption[] {
  const currentTotal = roundVND(input.currentTotal)
  let targetReduction = 0

  if (input.reductionTarget !== undefined && input.reductionTarget > 0) {
    targetReduction = roundVND(input.reductionTarget)
  } else if (input.targetTotal !== undefined && input.targetTotal < currentTotal) {
    targetReduction = safeSubtractMoney(currentTotal, input.targetTotal)
  }

  if (targetReduction <= 0 || !Array.isArray(input.items) || input.items.length === 0) {
    return []
  }

  const editableItems = input.items.filter(
    (it) => !it.isProtected && it.quantity > (it.minQuantity || 0) && it.unitPrice > 0
  )

  if (editableItems.length === 0) {
    return []
  }

  // --- Strategy 1: CLOSEST (Tìm phương án sát mức giảm mục tiêu nhất) ---
  const closestOption = calculateClosestStrategy(currentTotal, targetReduction, input.items)

  // --- Strategy 2: LEAST_CHANGES (Thay đổi ít món nhất) ---
  const leastChangesOption = calculateLeastChangesStrategy(currentTotal, targetReduction, input.items)

  // --- Strategy 3: BALANCED (Giảm đều các món, giữ cân bằng thực đơn) ---
  const balancedOption = calculateBalancedStrategy(currentTotal, targetReduction, input.items)

  return [closestOption, leastChangesOption, balancedOption]
}

function calculateClosestStrategy(
  currentTotal: number,
  targetReduction: number,
  allItems: OptimizationItemInput[]
): OptimizationOption {
  const deltas: OptimizationItemDelta[] = []
  let remainingReductionNeeded = targetReduction

  // Sort editable items by unitPrice descending
  const sorted = [...allItems]
    .filter((it) => !it.isProtected && it.quantity > (it.minQuantity || 0))
    .sort((a, b) => b.unitPrice - a.unitPrice)

  const qtyMap = new Map<string, number>()
  allItems.forEach((it) => qtyMap.set(it.id, it.quantity))

  for (const it of sorted) {
    if (remainingReductionNeeded <= 0) break
    const minQty = it.minQuantity || 0
    const maxReductionQty = it.quantity - minQty
    if (maxReductionQty <= 0) continue

    const unitPrice = roundVND(it.unitPrice)
    const qtyToReduce = Math.min(maxReductionQty, Math.ceil(remainingReductionNeeded / unitPrice))
    
    if (qtyToReduce > 0) {
      const reducedAmount = safeMultiplyMoney(unitPrice, qtyToReduce)
      qtyMap.set(it.id, it.quantity - qtyToReduce)
      remainingReductionNeeded -= reducedAmount

      deltas.push({
        id: it.id,
        name: it.name,
        beforeQuantity: it.quantity,
        afterQuantity: it.quantity - qtyToReduce,
        unitPrice,
        reductionAmount: reducedAmount
      })
    }
  }

  const actualReduction = deltas.reduce((s, d) => s + d.reductionAmount, 0)
  const newTotal = safeSubtractMoney(currentTotal, actualReduction)

  return {
    strategy: 'CLOSEST',
    title: 'Phương án A — Sát ngân sách nhất',
    description: 'Giảm sát với số tiền mục tiêu nhất bằng cách ưu tiên điều chỉnh các món có đơn giá phù hợp.',
    newTotal,
    actualReduction,
    differenceFromTarget: Math.abs(actualReduction - targetReduction),
    deltas
  }
}

function calculateLeastChangesStrategy(
  currentTotal: number,
  targetReduction: number,
  allItems: OptimizationItemInput[]
): OptimizationOption {
  const deltas: OptimizationItemDelta[] = []
  
  // Find single or dual items that can cover the reduction with minimum item mutations
  const candidates = [...allItems]
    .filter((it) => !it.isProtected && it.quantity > (it.minQuantity || 0))
    .sort((a, b) => {
      const totalA = safeMultiplyMoney(a.unitPrice, a.quantity - (a.minQuantity || 0))
      const totalB = safeMultiplyMoney(b.unitPrice, b.quantity - (b.minQuantity || 0))
      return Math.abs(totalA - targetReduction) - Math.abs(totalB - targetReduction)
    })

  let remaining = targetReduction
  for (const it of candidates) {
    if (remaining <= 0) break
    const minQty = it.minQuantity || 0
    const maxReductionQty = it.quantity - minQty
    const unitPrice = roundVND(it.unitPrice)
    const totalItemValue = safeMultiplyMoney(unitPrice, maxReductionQty)

    const qtyToReduce = totalItemValue >= remaining
      ? Math.ceil(remaining / unitPrice)
      : maxReductionQty

    if (qtyToReduce > 0) {
      const reducedAmount = safeMultiplyMoney(unitPrice, qtyToReduce)
      remaining -= reducedAmount

      deltas.push({
        id: it.id,
        name: it.name,
        beforeQuantity: it.quantity,
        afterQuantity: it.quantity - qtyToReduce,
        unitPrice,
        reductionAmount: reducedAmount
      })
    }
  }

  const actualReduction = deltas.reduce((s, d) => s + d.reductionAmount, 0)
  const newTotal = safeSubtractMoney(currentTotal, actualReduction)

  return {
    strategy: 'LEAST_CHANGES',
    title: 'Phương án B — Ít đổi món nhất',
    description: 'Tập trung giảm số lượng trên 1-2 món để hạn chế tối đa việc xáo trộn thực đơn đã chọn.',
    newTotal,
    actualReduction,
    differenceFromTarget: Math.abs(actualReduction - targetReduction),
    deltas
  }
}

function calculateBalancedStrategy(
  currentTotal: number,
  targetReduction: number,
  allItems: OptimizationItemInput[]
): OptimizationOption {
  const deltas: OptimizationItemDelta[] = []
  const editableItems = allItems.filter((it) => !it.isProtected && it.quantity > (it.minQuantity || 0))

  if (editableItems.length === 0) {
    return {
      strategy: 'BALANCED',
      title: 'Phương án C — Cân đối thực đơn',
      description: 'Giữ nguyên cơ cấu các món chính, chỉ giảm nhẹ 1 phần trên mỗi món phụ.',
      newTotal: currentTotal,
      actualReduction: 0,
      differenceFromTarget: targetReduction,
      deltas: []
    }
  }

  let remaining = targetReduction
  // Reduce 1 qty from each eligible item sequentially to spread the reduction evenly
  for (const it of editableItems) {
    if (remaining <= 0) break
    const minQty = it.minQuantity || 0
    if (it.quantity > minQty && it.quantity > 1) {
      const unitPrice = roundVND(it.unitPrice)
      const reducedAmount = unitPrice
      remaining -= reducedAmount

      deltas.push({
        id: it.id,
        name: it.name,
        beforeQuantity: it.quantity,
        afterQuantity: it.quantity - 1,
        unitPrice,
        reductionAmount: reducedAmount
      })
    }
  }

  const actualReduction = deltas.reduce((s, d) => s + d.reductionAmount, 0)
  const newTotal = safeSubtractMoney(currentTotal, actualReduction)

  return {
    strategy: 'BALANCED',
    title: 'Phương án C — Cân đối thực đơn',
    description: 'Giảm đều mỗi món 1 phần nhỏ để bảo toàn trọn vẹn số lượng món ăn trên bàn tiệc.',
    newTotal,
    actualReduction,
    differenceFromTarget: Math.abs(actualReduction - targetReduction),
    deltas
  }
}
