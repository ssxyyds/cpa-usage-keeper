import { describe, expect, it } from 'vitest'
import type { CodexStateAccount } from '@/lib/types'
import {
  currentCodexPoolAccount,
  accountTypeLabel,
  filterCodexPoolAccounts,
  formatCodexQuotaPercent,
  formatCodexRefreshTime,
  quotaPercentTone,
  resetUrgencyTone,
  routingStrategyLabel,
  sortCodexPoolAccounts,
} from './CodexPoolPanel'

const account = (authIndex: string, score?: number): CodexStateAccount => ({
  auth_index: authIndex,
  codex_computed_score: score,
}) as CodexStateAccount

describe('CodexPoolPanel view helpers', () => {
  it('sorts accounts by computed score descending with unknown scores last', () => {
    const rows = [
      account('middle', 20),
      account('unknown'),
      account('high', 99),
      account('low', -5),
    ]

    expect(sortCodexPoolAccounts(rows).map((row) => row.auth_index)).toEqual(['high', 'middle', 'low', 'unknown'])
  })

  it('pins the current on-device account above score order', () => {
    const rows = [
      account('high', 99),
      { ...account('current', 20), on_device: true },
      account('low', 1),
    ]

    expect(sortCodexPoolAccounts(rows).map((row) => row.auth_index)).toEqual(['current', 'high', 'low'])
    expect(currentCodexPoolAccount(rows)?.auth_index).toBe('current')
  })

  it('uses the last refresh timestamp instead of status text for refresh cells', () => {
    const row = {
      auth_index: 'codex-1',
      codex_quota: {
        refresh_status: 'ok',
        last_refresh_at: '2026-05-21T08:15:30Z',
      },
    } as CodexStateAccount

    const label = formatCodexRefreshTime(row)

    expect(label).not.toBe('ok')
    expect(label).toContain('2026')
  })

  it('formats quota as a remaining percentage with red-to-green tone buckets', () => {
    const row = {
      auth_index: 'codex-1',
      codex_quota: {
        weekly: { remaining: 80, limit: 100 },
      },
    } as CodexStateAccount

    expect(formatCodexQuotaPercent(row, 'weekly')).toBe('80%')
    expect(quotaPercentTone(0.8)).toBe('good')
    expect(quotaPercentTone(0.3)).toBe('warning')
    expect(quotaPercentTone(0.1)).toBe('danger')
  })

  it('marks reset time as dangerous when it is close', () => {
    const now = new Date('2026-05-21T10:00:00Z')

    expect(resetUrgencyTone('2026-05-21T10:30:00Z', now)).toBe('danger')
    expect(resetUrgencyTone('2026-05-21T16:30:00Z', now)).toBe('warning')
    expect(resetUrgencyTone('2026-05-22T16:30:00Z', now)).toBe('good')
  })

  it('filters accounts by auth index, name, email, and account type', () => {
    const rows = [
      { auth_index: 'codex-alpha', email: 'a@example.com', account_type: 'free' },
      { auth_index: 'codex-beta', name: 'Team Account', account_type: 'team' },
    ] as CodexStateAccount[]

    expect(filterCodexPoolAccounts(rows, 'team').map((row) => row.auth_index)).toEqual(['codex-beta'])
    expect(filterCodexPoolAccounts(rows, 'alpha').map((row) => row.auth_index)).toEqual(['codex-alpha'])
  })

  it('uses plan type for account badges and ignores auth method labels', () => {
    expect(accountTypeLabel({ account_type: 'oauth', plan_type: 'plus' } as CodexStateAccount)).toBe('plus')
    expect(accountTypeLabel({ account_type: 'oauth', id_token: { plan_type: 'team' } } as CodexStateAccount)).toBe('team')
    expect(accountTypeLabel({ account_type: 'oauth' } as CodexStateAccount)).toBeUndefined()
  })

  it('localizes routing strategy labels for operators', () => {
    expect(routingStrategyLabel('codex-quota-score')).toBe('Codex 额度评分')
    expect(routingStrategyLabel('fill-first')).toBe('填充优先')
  })
})
