import { describe, expect, it, vi } from 'vitest'
import { codexCurrentAuthIndexSet, codexQuotaToRows, quotaRefreshDisplayError } from './useCredentialsTabData'

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
})
