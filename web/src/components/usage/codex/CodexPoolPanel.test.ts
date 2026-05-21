import { describe, expect, it } from 'vitest'
import type { CodexStateAccount } from '@/lib/types'
import { currentCodexPoolAccount, formatCodexNextRefreshTime, formatCodexRefreshTime, sortCodexPoolAccounts } from './CodexPoolPanel'

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

  it('derives the next quota refresh from the next 15-minute boundary', () => {
    const row = {
      auth_index: 'codex-1',
      codex_quota: {
        last_refresh_at: '2026-05-21T09:49:48Z',
      },
    } as CodexStateAccount

    const label = formatCodexNextRefreshTime(row)

    expect(label).toContain('2026')
    expect(label).not.toBe('-')
  })
})
