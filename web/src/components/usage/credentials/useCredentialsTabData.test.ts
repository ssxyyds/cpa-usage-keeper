import { describe, expect, it, vi } from 'vitest'
import { buildCodexWeeklyUsageWindowRequests, buildManualQuotaRefreshTargets, codexCredentialStateFromAccount, codexCurrentAuthIndexSet, codexQuotaToRows, mergeCodexManualScoreUpdate, quotaRefreshDisplayError } from './useCredentialsTabData'

describe('quotaRefreshDisplayError', () => {
  it('turns refresh rejection codes into friendly messages', () => {
    expect(quotaRefreshDisplayError('duplicate')).toBe('Quota refresh is already running for this credential.')
    expect(quotaRefreshDisplayError('not_auth_file')).toBe('Quota refresh only supports local auth files.')
    expect(quotaRefreshDisplayError('unsupported')).toBe('Quota refresh is not supported for this credential type.')
  })

  it('keeps backend friendly refresh failures displayable', () => {
    expect(quotaRefreshDisplayError('Quota refresh timed out. Please try again later.')).toBe('Quota refresh timed out. Please try again later.')
  })
})

describe('codexCurrentAuthIndexSet', () => {
  it('accepts current selection auth index field variants from CPA state', () => {
    const current = codexCurrentAuthIndexSet({
      'codex-state': [
        { auth_index: 'on-device-auth', on_device: true },
        { auth_index: 'selected-auth' },
        { auth_index: 'camel-auth' },
      ],
      summary: {},
      current_selections: [
        { auth_index: 'selected-auth' },
        { authIndex: 'camel-auth' },
      ],
    })

    expect([...current].sort()).toEqual(['camel-auth', 'on-device-auth', 'selected-auth'])
  })

  it('resolves current selections by account id when CPA omits auth_index', () => {
    const current = codexCurrentAuthIndexSet({
      'codex-state': [
        { id: 'auth-id-1', auth_index: 'auth-index-1' },
        { id: 'auth-id-2', auth_index: 'auth-index-2' },
      ],
      summary: {},
      current_selections: [
        { id: 'auth-id-2' },
      ],
    })

    expect([...current]).toEqual(['auth-index-2'])
  })
})

describe('codexQuotaToRows', () => {
  it('keeps weekly reset text when CPA only provides reset_after_seconds', () => {
    vi.setSystemTime(new Date('2026-05-10T10:00:00Z'))
    try {
      const rows = codexQuotaToRows({
        weekly: {
          remaining: 88,
          limit: 100,
          reset_after_seconds: 3600,
        },
      })

      expect(rows?.[0]).toMatchObject({
        key: 'codex_quota.weekly',
        label: 'Weekly',
        resetAt: '2026-05-10T11:00:00.000Z',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops impossible five-hour quota resets while keeping weekly quota', () => {
    vi.setSystemTime(new Date('2026-05-25T10:00:00Z'))
    try {
      const rows = codexQuotaToRows({
        five_hour: {
          remaining: 81,
          limit: 100,
          reset_at: '2026-05-27T09:11:18Z',
        },
        weekly: {
          remaining: 100,
          limit: 100,
        },
      })

      expect(rows?.map((row) => row.key)).toEqual(['codex_quota.weekly'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('buildCodexWeeklyUsageWindowRequests', () => {
  it('uses weekly reset minus seven days and quota last refresh as the cost window', () => {
    const windows = buildCodexWeeklyUsageWindowRequests([
      {
        auth_index: 'codex-1',
        codex_quota: {
          last_refresh_at: '2026-05-24T12:00:00Z',
          weekly: {
            remaining: 80,
            limit: 100,
            reset_at: '2026-05-25T00:00:00Z',
          },
        },
      },
    ], new Date('2026-05-24T13:00:00Z'))

    expect(windows).toEqual([{
      key: 'weekly',
      auth_type: 'oauth',
      auth_index: 'codex-1',
      start_time: '2026-05-18T00:00:00.000Z',
      end_time: '2026-05-24T12:00:00.000Z',
    }])
  })

  it('skips Codex weekly cost windows when reset time is unavailable', () => {
    const windows = buildCodexWeeklyUsageWindowRequests([
      {
        auth_index: 'codex-1',
        codex_quota: {
          weekly: {
            remaining: 80,
            limit: 100,
          },
        },
      },
    ], new Date('2026-05-24T13:00:00Z'))

    expect(windows).toEqual([])
  })
})

describe('buildManualQuotaRefreshTargets', () => {
  it('routes Codex auth indexes to CPA refresh and keeps non-Codex indexes on local quota refresh', () => {
    const targets = buildManualQuotaRefreshTargets(
      ['codex-1', 'claude-1', 'codex-2'],
      new Map([
        ['codex-1', {}],
        ['codex-2', {}],
      ]),
    )

    expect(targets).toEqual({
      codexAuthIndexes: ['codex-1', 'codex-2'],
      localQuotaAuthIndexes: ['claude-1'],
    })
  })
})

describe('codexCredentialStateFromAccount', () => {
  it('uses manual adjustment as the visible score fallback when CPA cannot compute a final score yet', () => {
    const state = codexCredentialStateFromAccount({
      auth_index: 'codex-1',
      codex_manual_score_adjustment: 99,
      codex_score_explanation: {
        score_available: false,
        manual_adjustment: 99,
        disqualifier_reason: 'missing_quota_reset',
      },
    }, new Set())

    expect(state.score).toBe(99)
    expect(state.manualAdjustment).toBe(99)
    expect(state.scoreReason).toBe('missing_quota_reset')
  })

  it('prefers CPA computed score over manual adjustment when final score is available', () => {
    const state = codexCredentialStateFromAccount({
      auth_index: 'codex-1',
      codex_computed_score: 12.5,
      codex_manual_score_adjustment: 99,
      codex_score_explanation: {
        computed_score_live: 13,
        manual_adjustment: 99,
      },
    }, new Set())

    expect(state.score).toBe(12.5)
    expect(state.manualAdjustment).toBe(99)
  })

  it('keeps CPA plan type for Codex account badge display', () => {
    const state = codexCredentialStateFromAccount({
      auth_index: 'codex-1',
      plan_type: 'free',
      codex_quota: {
        weekly: {
          remaining: 90,
          limit: 100,
        },
      },
    }, new Set())

    expect(state.planType).toBe('free')
    expect(state.quota?.[0].planType).toBe('free')
  })

  it('keeps CPA unavailable and refresh error reasons for row status labels', () => {
    const state = codexCredentialStateFromAccount({
      auth_index: 'codex-1',
      status: 'error',
      unavailable: true,
      status_message: 'unauthorized',
      last_error: {
        http_status: 401,
        message: 'request returned 401',
      },
      unavailable_reason: '401 unauthorized',
      codex_quota: {
        refresh_status: 'error',
        refresh_error: 'codex quota refresh: usage returned 403',
      },
    }, new Set())

    expect(state.status).toBe('error')
    expect(state.unavailable).toBe(true)
    expect(state.unavailableReason).toBe('401 unauthorized')
    expect(state.quotaRefreshStatus).toBe('error')
    expect(state.quotaRefreshError).toBe('codex quota refresh: usage returned 403')
  })
})

describe('mergeCodexManualScoreUpdate', () => {
  it('optimistically updates visible score from the manual score save response', () => {
    const states = mergeCodexManualScoreUpdate({
      'codex-1': {
        current: true,
        quota: [{ key: 'codex_quota.weekly', label: 'Weekly' }],
      },
    }, 'codex-1', 99, {
      auth_index: 'codex-1',
      codex_manual_score_adjustment: 99,
      status: 'ok',
    })

    expect(states['codex-1']).toMatchObject({
      score: 99,
      manualAdjustment: 99,
      current: true,
      quota: [{ key: 'codex_quota.weekly', label: 'Weekly' }],
    })
  })
})
