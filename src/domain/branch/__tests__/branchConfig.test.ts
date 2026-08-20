import { describe, it, expect, beforeEach } from 'vitest'
import { getAvailableBranches, getCurrentBranch, setCurrentBranch } from '../branchConfig'

describe('Multi-Branch Configuration Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should list available branches with primary branch default', () => {
    const branches = getAvailableBranches()
    expect(branches.length).toBeGreaterThanOrEqual(2)

    const current = getCurrentBranch()
    expect(current.isMainBranch).toBe(true)
  })

  it('should allow switching current branch and persist', () => {
    setCurrentBranch('branch_td')
    const current = getCurrentBranch()
    expect(current.id).toBe('branch_td')
    expect(current.name).toContain('Sân Vườn')
  })
})
