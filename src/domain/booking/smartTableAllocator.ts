import { parseTimeToMinutes } from '@/utils/time'

export interface TableOption {
  code: string        // e.g. "A5", "B12"
  zone: string        // "A", "B", "C", "D", "E"
  number: number      // 5
  capacity: number    // default 6 guests per table
  isVIP?: boolean
  isOutdoor?: boolean
}

export interface TableAllocationRequest {
  guestCount: number
  preferredZone?: string
  bookingTime: string
  existingBookings?: Array<{
    tables: string[]
    bookingTime: string
    status: string
  }>
}

export interface TableAllocationResult {
  recommendedTables: string[]
  zone: string
  score: number
  reason: string
  alternativeTables: string[]
}

const ALL_ZONES = ['A', 'B', 'C', 'D', 'E']
const TABLES_PER_ZONE = 10
const TABLE_CAPACITY = 6

export function allocateSmartTables(req: TableAllocationRequest): TableAllocationResult {
  const { guestCount, preferredZone = 'A', bookingTime, existingBookings = [] } = req

  // 1. Calculate how many tables are needed (e.g., 10 guests = 2 tables)
  const neededTablesCount = Math.ceil(Math.max(1, guestCount) / TABLE_CAPACITY)

  // 2. Identify currently occupied tables around the requested time (+/- 1.5 hours)
  const occupiedTables = new Set<string>()
  const reqMinutes = parseTimeToMinutes(bookingTime)

  for (const b of existingBookings) {
    if (b.status === 'cancelled') continue
    const bMinutes = parseTimeToMinutes(b.bookingTime)

    // 90 minutes buffer window
    if (Math.abs(reqMinutes - bMinutes) < 90) {
      b.tables.forEach(t => occupiedTables.add(t.toUpperCase()))
    }
  }

  // 3. Find contiguous free tables in preferred zone first, then secondary zones
  const candidateZones = [
    preferredZone.toUpperCase(),
    ...ALL_ZONES.filter(z => z !== preferredZone.toUpperCase())
  ]

  for (const zone of candidateZones) {
    const freeTablesInZone: string[] = []

    for (let i = 1; i <= TABLES_PER_ZONE; i++) {
      const code = `${zone}${i}`
      if (!occupiedTables.has(code)) {
        freeTablesInZone.push(code)
      }
    }

    if (freeTablesInZone.length >= neededTablesCount) {
      const recommended = freeTablesInZone.slice(0, neededTablesCount)
      const alternatives = freeTablesInZone.slice(neededTablesCount, neededTablesCount + 3)

      return {
        recommendedTables: recommended,
        zone,
        score: zone === preferredZone.toUpperCase() ? 0.98 : 0.85,
        reason: `Đề xuất ${neededTablesCount} bàn (${recommended.join(', ')}) tại Khu ${zone} dựa trên ${guestCount} khách.`,
        alternativeTables: alternatives
      }
    }
  }

  // Fallback if no full zone has enough contiguous free tables
  const allFreeTables: string[] = []
  for (const zone of ALL_ZONES) {
    for (let i = 1; i <= TABLES_PER_ZONE; i++) {
      const code = `${zone}${i}`
      if (!occupiedTables.has(code)) {
        allFreeTables.push(code)
      }
    }
  }

  const fallbackRecommended = allFreeTables.slice(0, neededTablesCount)
  return {
    recommendedTables: fallbackRecommended,
    zone: fallbackRecommended[0]?.[0] || 'A',
    score: 0.70,
    reason: `Sơ đồ cao điểm: Ghép ${neededTablesCount} bàn khả dụng từ các khu vực (${fallbackRecommended.join(', ')}).`,
    alternativeTables: allFreeTables.slice(neededTablesCount, neededTablesCount + 3)
  }
}

