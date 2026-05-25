import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuthFileCredentialsSection } from './AuthFileCredentialsSection'
import type { AuthFileCredentialRow } from './credentialViewModels'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => (key === 'usage_stats.credentials_count' ? `${params?.count ?? 0}` : key),
  }),
}))

describe('AuthFileCredentialsSection', () => {
  it('shows token cost estimated quota amount and unavailable reason for Codex auth files', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-1',
        type: 'codex',
        provider: 'codex',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 1_200_000,
        total_cost: 3.85,
        cost_available: true,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Account',
      maskedIdentity: 'codex-1',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 1_200_000,
      totalCost: 3.85,
      costAvailable: true,
      cacheRate: null,
      quota: [],
      quotaLoading: false,
      codexStatus: 'error',
      codexUnavailable: true,
      codexUnavailableReason: '401 unauthorized',
      quotaTotalAmount: 20,
      extraQuota: [],
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="priority"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('$3.85')
    expect(html).toContain('usage_stats.credentials_quota_amount')
    expect(html).toContain('≈US$20.00')
    expect(html).toContain('401 unauthorized')
  })

  it('shows Codex final score without expanding manual adjustment controls by default', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-1',
        type: 'codex',
        provider: 'codex',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Account',
      maskedIdentity: 'codex-1',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 0,
      cacheRate: null,
      quota: [],
      quotaLoading: false,
      extraQuota: [],
      codexScore: 88.5,
      codexManualScoreAdjustment: 12,
      codexScoreReason: 'weekly remaining',
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="priority"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('usage_stats.codex_pool_score')
    expect(html).toContain('88.5')
    expect(html).toContain('aria-label="usage_stats.credentials_codex_score_edit"')
    expect(html).not.toContain('common.edit')
    expect(html).not.toContain('value="12"')
    expect(html).not.toContain('usage_stats.codex_pool_weekly_remaining')
    expect(html).not.toContain('usage_stats.codex_pool_five_hour_remaining')
  })

  it('keeps a score metric visible for Codex auth file rows before CPA returns a score', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-1',
        type: 'codex',
        provider: 'codex',
        total_requests: 21,
        success_count: 20,
        failure_count: 1,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 2_200_000,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Account',
      maskedIdentity: 'codex-1',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 21,
      successCount: 20,
      failureCount: 1,
      successRate: 95.24,
      totalTokens: 2_200_000,
      cacheRate: 93.66,
      quota: [],
      quotaLoading: false,
      extraQuota: [],
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="codex_score_desc"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('usage_stats.codex_pool_score')
    expect(html).toContain('>-</span>')
  })

  it('marks the current CPA-selected Codex account in the credential list', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-current',
        type: 'codex',
        provider: 'codex',
        total_requests: 1,
        success_count: 1,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Current',
      maskedIdentity: 'codex-current',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 1,
      successCount: 1,
      failureCount: 0,
      successRate: 100,
      totalTokens: 0,
      cacheRate: null,
      quota: [],
      quotaLoading: false,
      extraQuota: [],
      codexScore: 3,
      isCodexCurrent: true,
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="codex_score_desc"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('usage_stats.codex_pool_current_badge')
    expect(html.indexOf('Codex Current')).toBeLessThan(html.indexOf('usage_stats.codex_pool_current_badge'))
    expect(html.indexOf('usage_stats.codex_pool_current_badge')).toBeLessThan(html.indexOf('usage_stats.codex_pool_score'))
  })

  it('renders account search in the auth file section', () => {
    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[]}
        total={0}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search="alpha"
        sort="codex_score_desc"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('usage_stats.credentials_search_label')
    expect(html).toContain('value="alpha"')
    expect(html.indexOf('usage_stats.credentials_auth_files_subtitle')).toBeLessThan(html.indexOf('usage_stats.credentials_search_label'))
    expect(html.indexOf('usage_stats.credentials_search_label')).toBeLessThan(html.indexOf('usage_stats.credentials_auth_files_empty'))
  })

  it('keeps Weekly quota in the right slot when 5h quota is unavailable', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-1',
        type: 'codex',
        provider: 'codex',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Account',
      maskedIdentity: 'codex-1',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 0,
      cacheRate: null,
      quota: [],
      quotaLoading: false,
      primaryQuota: undefined,
      secondaryQuota: {
        key: 'codex_quota.weekly',
        label: 'Weekly',
        percent: 100,
        barPercent: 100,
        percentKind: 'remaining',
        status: 'ok',
        resetText: '2026-05-14T12:00:00Z',
      },
      extraQuota: [],
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="codex_score_desc"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('data-quota-slot="five-hour"')
    expect(html).toContain('data-quota-slot="weekly"')
    expect(html.indexOf('data-quota-slot="five-hour"')).toBeLessThan(html.indexOf('data-quota-slot="weekly"'))
    expect(html.indexOf('>5h<')).toBeLessThan(html.indexOf('>Weekly<'))
  })

  it('shows a reset placeholder when a quota bucket has no reset timestamp', () => {
    const row = {
      identity: {
        id: '1',
        name: 'Codex Account',
        auth_type: 1,
        auth_type_name: 'auth file',
        identity: 'codex-1',
        type: 'codex',
        provider: 'codex',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'Codex Account',
      maskedIdentity: 'codex-1',
      providerLabel: 'codex',
      typeLabel: 'codex',
      authTypeLabel: 'auth file',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 0,
      cacheRate: null,
      quota: [],
      quotaLoading: false,
      primaryQuota: {
        key: 'codex_quota.five_hour',
        label: '5h',
        percent: 60,
        barPercent: 60,
        percentKind: 'remaining',
        status: 'ok',
        resetText: '2026-05-24T02:19:52Z',
      },
      secondaryQuota: {
        key: 'codex_quota.weekly',
        label: 'Weekly',
        percent: 100,
        barPercent: 100,
        percentKind: 'remaining',
        status: 'ok',
      },
      extraQuota: [],
    } as AuthFileCredentialRow

    const html = renderToStaticMarkup(
      <AuthFileCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        activeOnly={false}
        search=""
        sort="codex_score_desc"
        loading={false}
        quotaRefreshing={false}
        quotaRefreshError=""
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onActiveOnlyChange={() => undefined}
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onRefreshQuota={async () => undefined}
        onRefreshQuotaForAuthIndex={async () => undefined}
        onUpdateCodexManualScore={async () => undefined}
      />,
    )

    expect(html).toContain('data-quota-slot="weekly"')
    expect(html).toContain('<span>-</span>')
  })
})
