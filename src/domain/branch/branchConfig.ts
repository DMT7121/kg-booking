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

export const DEFAULT_RESTAURANT_BRANCHES: RestaurantBranch[] = [
  {
    id: 'branch_q1',
    code: 'KG-Q1',
    name: "KING'S GRILL — Chi Nhánh Trung Tâm",
    address: '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    phone: '0901 888 999',
    tablesCount: 35,
    zones: ['Khu VIP', 'Sảnh Trong', 'Khu A', 'Khu B'],
    isMainBranch: true
  },
  {
    id: 'branch_td',
    code: 'KG-TD',
    name: "KING'S GRILL — Chi Nhánh Sân Vườn",
    address: '456 Võ Văn Ngân, TP. Thủ Đức, TP. Hồ Chí Minh',
    phone: '0902 777 888',
    tablesCount: 50,
    zones: ['Sân Vườn Lãng Mạn', 'Phòng Lạnh', 'Chòi Gỗ VIP'],
    isMainBranch: false
  }
]

const CURRENT_BRANCH_KEY = 'kg_current_branch_id_v1'

export function getAvailableBranches(): RestaurantBranch[] {
  return DEFAULT_RESTAURANT_BRANCHES
}

export function getCurrentBranch(): RestaurantBranch {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedId = localStorage.getItem(CURRENT_BRANCH_KEY)
      if (storedId) {
        const found = DEFAULT_RESTAURANT_BRANCHES.find((b) => b.id === storedId)
        if (found) return found
      }
    }
  } catch (e) {
    console.warn('[BranchConfig] Failed to load current branch', e)
  }
  return DEFAULT_RESTAURANT_BRANCHES[0]
}

export function setCurrentBranch(branchId: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(CURRENT_BRANCH_KEY, branchId)
    }
  } catch (e) {
    console.warn('[BranchConfig] Failed to save current branch', e)
  }
}
