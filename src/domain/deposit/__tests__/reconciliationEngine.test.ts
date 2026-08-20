import { describe, it, expect } from 'vitest'
import { matchBookingDeposit, BankTransactionRecord } from '../reconciliationEngine'

describe('Deposit Reconciliation Engine Tests', () => {
  const sampleTransactions: BankTransactionRecord[] = [
    {
      transactionId: 'TX_101',
      amount: 500000,
      content: 'KG 0901234567 COC TIEC',
      transactionTime: '2026-08-20T10:00:00Z'
    },
    {
      transactionId: 'TX_102',
      amount: 1000000,
      content: 'NGUYEN VAN B CHUYEN TIEN SINH NHAT',
      transactionTime: '2026-08-20T11:00:00Z'
    },
    {
      transactionId: 'TX_103',
      amount: 200000,
      content: 'ANH CUONG CHUYEN KHOAN',
      transactionTime: '2026-08-20T12:00:00Z'
    }
  ]

  it('should MATCH transaction with exact amount and phone number in content', () => {
    const booking = {
      id: 'BK_01',
      customer: { name: 'Anh Nam', phone: '0901234567' },
      deposit: { amount: 500000 }
    }

    const match = matchBookingDeposit(booking, sampleTransactions)
    expect(match).not.toBeNull()
    expect(match?.status).toBe('MATCHED')
    expect(match?.transactionId).toBe('TX_101')
    expect(match?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('should return PROBABLE_MATCH or AMBIGUOUS when partial details match', () => {
    const booking = {
      id: 'BK_02',
      customer: { name: 'Nguyễn Văn B', phone: '0988888888' },
      deposit: { amount: 1000000 }
    }

    const match = matchBookingDeposit(booking, sampleTransactions)
    expect(match).not.toBeNull()
    expect(match?.status).toBe('PROBABLE_MATCH')
    expect(match?.transactionId).toBe('TX_102')
  })

  it('should return UNMATCHED when no transactions correspond', () => {
    const booking = {
      id: 'BK_03',
      customer: { name: 'Chị Mai', phone: '0977777777' },
      deposit: { amount: 3000000 }
    }

    const match = matchBookingDeposit(booking, sampleTransactions)
    expect(match?.status).toBe('UNMATCHED')
  })
})
