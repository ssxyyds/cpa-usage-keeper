import { describe, expect, it } from 'vitest'
import type { CodexStateAccount } from '@/lib/types'
import {
  currentCodexPoolSelections,
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

  it('uses model-level current selections when the CPA API provides them', () => {
    const state = {
      'codex-state': [
        { id: 'auth-1', auth_index: 'codex-1', on_device: true },
      ],
      summary: {},
      current_selections: [
        { model: 'gpt-5.4', id: 'auth-1', auth_index: 'codex-1' },
        { model: 'gpt-5.4-mini', id: 'auth-2', auth_index: 'codex-2' },
      ],
    }

    expect(currentCodexPoolSelections(state).map((selection) => selection.model)).toEqual(['gpt-5.4', 'gpt-5.4-mini'])
  })

  it('falls back to the legacy on-device account for older CPA APIs', () => {
    const state = {
      'codex-state': [
        { id: 'auth-1', auth_index: 'codex-1' },
        { id: 'auth-2', auth_index: 'codex-2', on_device: true },
      ],
      summary: {},
    }

    expect(currentCodexPoolSelections(state)).toEqual([
      { model: '', id: 'auth-2', auth_index: 'codex-2', name: undefined, email: undefined, account: undefined },
    ])
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

  it('uses plan type for account badges and defaults non-plan values to free', () => {
    expect(accountTypeLabel({ account_type: 'oauth', plan_type: 'plus' } as CodexStateAccount)).toBe('plus')
    expect(accountTypeLabel({ account_type: 'oauth', id_token: { plan_type: 'team' } } as CodexStateAccount)).toBe('team')
    expect(accountTypeLabel({ account_type: 'oauth' } as CodexStateAccount)).toBe('free')
    expect(accountTypeLabel({ account_type: '73sy6yihvf@ssxyykx.asia' } as CodexStateAccount)).toBe('free')
    expect(accountTypeLabel({} as CodexStateAccount)).toBe('free')
  })

  it('localizes routing strategy labels for operators', () => {
    expect(routingStrategyLabel('codex-quota-score')).toBe('Codex 额度评分')
    expect(routingStrategyLabel('fill-first')).toBe('填充优先')
  })
})
