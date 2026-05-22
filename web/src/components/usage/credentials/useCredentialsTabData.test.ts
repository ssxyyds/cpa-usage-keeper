import { describe, expect, it } from 'vitest'
import { codexCurrentAuthIndexSet, quotaRefreshDisplayError } from './useCredentialsTabData'

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
})
