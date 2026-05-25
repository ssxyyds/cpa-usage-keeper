import { useTranslation } from 'react-i18next'
import { useState, type KeyboardEvent } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { IconRefreshCw } from '@/components/ui/icons'
import styles from './CredentialSections.module.scss'
import type { AuthFileCredentialRow, DisplayQuota, PlanTypeTone } from './credentialViewModels'
import type { UsageIdentityPageSort } from '@/lib/api'
import { CredentialBadge, CredentialRowShell, CredentialSectionShell, CredentialsPagination, MetricPill, RequestMetric, TonePercent, cacheRateTone, capitalize, credentialToneClassName, formatCredentialNumber, successRateTone } from './CredentialSectionShell'

interface AuthFileCredentialsSectionProps {
  rows: AuthFileCredentialRow[]
  total: number
  page: number
  totalPages: number
  pageSize: number
  activeOnly: boolean
  search: string
  sort: UsageIdentityPageSort
  loading: boolean
  quotaRefreshing: boolean
  quotaRefreshError: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onActiveOnlyChange: (activeOnly: boolean) => void
  onSearchChange: (search: string) => void
  onSortChange: (sort: UsageIdentityPageSort) => void
  onRefreshQuota: () => Promise<void>
  onRefreshQuotaForAuthIndex: (authIndex: string) => Promise<void>
  onUpdateCodexManualScore: (authIndex: string, adjustment: number) => Promise<void>
}

export function AuthFileCredentialsSection({ rows, total, page, totalPages, pageSize, activeOnly, search, sort, loading, quotaRefreshing, quotaRefreshError, onPageChange, onPageSizeChange, onActiveOnlyChange, onSearchChange, onSortChange, onRefreshQuota, onRefreshQuotaForAuthIndex, onUpdateCodexManualScore }: AuthFileCredentialsSectionProps) {
  const { t } = useTranslation()
  const canRefresh = rows.some((row) => !isRowRefreshing(row) && !row.identity.is_deleted) && !quotaRefreshing

  return (
    <CredentialSectionShell
      eyebrow={t('usage_stats.credentials_auth_files_eyebrow')}
      title={t('usage_stats.credentials_auth_files_title')}
      subtitle={t('usage_stats.credentials_auth_files_subtitle')}
      countLabel={t('usage_stats.credentials_count', { count: total })}
      titleExtra={(
        <label className={styles.credentialActiveOnlySwitch}>
          <input type="checkbox" checked={activeOnly} onChange={(event) => onActiveOnlyChange(event.target.checked)} />
          <span>{t('usage_stats.credentials_auth_files_active_only')}</span>
        </label>
      )}
      subtitleExtra={(
        <div className={styles.credentialSearchBar}>
          <label className={styles.credentialSearchControl}>
            <span>{t('usage_stats.credentials_search_label')}</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('usage_stats.credentials_search_placeholder')}
            />
          </label>
        </div>
      )}
      actions={(
        <div className={styles.credentialRefreshSwitcher}>
          <button
            type="button"
            className={`${styles.credentialRefreshButton} ${styles.credentialRefreshButtonActive} ${quotaRefreshing ? styles.credentialRefreshButtonLoading : ''}`.trim()}
            onClick={() => void onRefreshQuota()}
            disabled={!canRefresh}
            aria-busy={quotaRefreshing}
          >
            <span className={styles.credentialRefreshButtonInner}>
              {quotaRefreshing ? <LoadingSpinner size={12} className={styles.credentialRefreshSpinner} /> : <IconRefreshCw size={12} />}
              <span>{quotaRefreshing ? t('usage_stats.credentials_quota_refreshing') : t('usage_stats.credentials_quota_refresh_current_page')}</span>
            </span>
          </button>
        </div>
      )}
    >
      {/* 批量刷新失败显示在区块顶部，单行任务失败显示在对应限额位置。 */}
      {quotaRefreshError && <div className={styles.credentialInlineError}>{quotaRefreshError}</div>}
      {loading && rows.length === 0 && <div className={styles.credentialEmptyState}>{t('common.loading')}</div>}
      {!loading && rows.length === 0 && <div className={styles.credentialEmptyState}>{t('usage_stats.credentials_auth_files_empty')}</div>}
      {rows.map((row) => {
        const rowRefreshing = isRowRefreshing(row)
        return (
          <CredentialRowShell
            key={row.identity.id || row.identity.identity}
            title={row.displayName}
            subtitle={(
              <span className={styles.credentialIdentityBadges}>
                <CredentialBadge>{row.typeLabel}</CredentialBadge>
                {row.planTypeLabel && <CredentialPlanBadge tone={row.planTypeTone}>{row.planTypeLabel}</CredentialPlanBadge>}
                {row.remainingDaysLabel && <span className={styles.credentialRemainingDaysBadge}>{row.remainingDaysLabel}</span>}
              </span>
            )}
            badges={row.isCodexCurrent ? <span className={styles.credentialCurrentBadge}>{t('usage_stats.codex_pool_current_badge')}</span> : null}
            metrics={(
              <>
                {row.totalRequests > 0 && <MetricPill label={t('usage_stats.total_requests')} value={<RequestMetric total={row.totalRequests} success={row.successCount} failure={row.failureCount} />} />}
                {row.successRate !== null && <MetricPill label={t('usage_stats.success_rate')} value={<TonePercent value={row.successRate} tone={successRateTone(row.successRate)} />} />}
                {row.totalTokens > 0 && (
                  <MetricPill
                    label={t('usage_stats.total_tokens')}
                    value={<CredentialTokenMetric row={row} />}
                  />
                )}
                {row.cacheRate !== null && <MetricPill label={t('usage_stats.cache_rate')} value={<TonePercent value={row.cacheRate} tone={cacheRateTone(row.cacheRate)} />} />}
                {(row.codexScore !== undefined || isCodexCredentialRow(row)) && (
                  <MetricPill
                    className={styles.credentialCodexScorePill}
                    label={t('usage_stats.codex_pool_score')}
                    value={(
                      <CodexScoreMetric row={row} onUpdateCodexManualScore={onUpdateCodexManualScore} />
                    )}
                  />
                )}
              </>
            )}
            rowClassName={`${styles.authFileCredentialRow} ${row.isCodexCurrent ? styles.credentialRowCurrent : ''}`.trim()}
            side={(
              <div className={styles.credentialQuotaSideWithAction}>
                <AuthFileQuotaPanel row={row} />
                <button
                  type="button"
                  className={`${styles.credentialRowRefreshButton} ${rowRefreshing ? styles.credentialRowRefreshButtonLoading : ''}`.trim()}
                  onClick={() => void onRefreshQuotaForAuthIndex(row.identity.identity)}
                  disabled={row.identity.is_deleted || rowRefreshing}
                  aria-label={t('usage_stats.credentials_refresh_single', { name: row.displayName })}
                  aria-busy={rowRefreshing}
                >
                  {rowRefreshing ? <LoadingSpinner size={13} /> : <IconRefreshCw size={13} />}
                </button>
              </div>
            )}
          />
        )
      })}
      <CredentialsPagination
        page={page}
        total={total}
        totalPages={totalPages}
        pageSize={pageSize}
        sortValue={sort}
        sortLabel={t('usage_stats.credentials_sort_label')}
        sortOptions={[
          { value: 'priority', label: t('usage_stats.credentials_sort_priority') },
          { value: 'codex_score_desc', label: t('usage_stats.credentials_sort_codex_score_desc') },
          { value: 'codex_score_asc', label: t('usage_stats.credentials_sort_codex_score_asc') },
          { value: 'total_requests', label: t('usage_stats.credentials_sort_total_requests') },
          { value: 'total_tokens', label: t('usage_stats.credentials_sort_total_tokens') },
        ]}
        previousLabel={t('usage_stats.previous_page')}
        nextLabel={t('usage_stats.next_page')}
        rowsPerPageLabel={t('usage_stats.rows_per_page')}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onSortChange={(nextSort) => onSortChange(nextSort as UsageIdentityPageSort)}
      />
    </CredentialSectionShell>
  )
}

function isCodexCredentialRow(row: AuthFileCredentialRow): boolean {
  return [row.identity.provider, row.identity.type, row.providerLabel, row.typeLabel]
    .some((value) => String(value ?? '').trim().toLowerCase().includes('codex'))
}

function CodexScoreMetric({ row, onUpdateCodexManualScore }: { row: AuthFileCredentialRow; onUpdateCodexManualScore: (authIndex: string, adjustment: number) => Promise<void> }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draftAdjustment, setDraftAdjustment] = useState(() => String(row.codexManualScoreAdjustment ?? 0))
  const [saving, setSaving] = useState(false)
  const saveManualScore = async () => {
    const adjustment = Number(draftAdjustment)
    if (!Number.isFinite(adjustment)) {
      return
    }
    setSaving(true)
    try {
      await onUpdateCodexManualScore(row.identity.identity, adjustment)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }
  const startEditing = () => {
    setDraftAdjustment(String(row.codexManualScoreAdjustment ?? 0))
    setEditing(true)
  }
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveManualScore()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={styles.credentialCodexScoreReadonly}
        onClick={startEditing}
        disabled={row.identity.is_deleted}
        aria-label={t('usage_stats.credentials_codex_score_edit')}
        title={row.codexScoreReason || t('usage_stats.codex_pool_score_tip')}
      >
        <span className={styles.credentialCodexScoreValue}>{formatCodexScore(row.codexScore)}</span>
      </button>
    )
  }

  return (
    <span className={styles.credentialCodexScoreControl} title={row.codexScoreReason}>
      <span className={styles.credentialCodexScoreValue}>{formatCodexScore(row.codexScore)}</span>
      <input
        className={styles.credentialCodexScoreInput}
        type="number"
        min="-100"
        max="100"
        value={draftAdjustment}
        onChange={(event) => setDraftAdjustment(event.target.value)}
        onKeyDown={handleInputKeyDown}
        aria-label={t('usage_stats.codex_pool_manual')}
      />
      <button type="button" className={styles.credentialCodexScoreSave} onClick={() => void saveManualScore()} disabled={row.identity.is_deleted || saving}>{saving ? t('common.loading') : t('common.save')}</button>
    </span>
  )
}

function isRowRefreshing(row: AuthFileCredentialRow): boolean {
  return row.refreshStatus === 'queued' || row.refreshStatus === 'running'
}

function CredentialTokenMetric({ row }: { row: AuthFileCredentialRow }) {
  const { t } = useTranslation()
  return (
    <span className={styles.credentialMetricStack}>
      <strong>{formatCredentialNumber(row.totalTokens)}</strong>
      {row.costAvailable ? (
        <span>{formatCredentialCurrency(row.totalCost)}</span>
      ) : (
        <span>{t('usage_stats.cost_need_price')}</span>
      )}
    </span>
  )
}

function formatCodexScore(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function CredentialPlanBadge({ children, tone = 'neutral' }: { children: string; tone?: PlanTypeTone }) {
  return <span className={`${styles.credentialPlanBadge} ${styles[`credentialPlanBadge${capitalize(tone)}`]}`.trim()}>{children}</span>
}

function AuthFileQuotaPanel({ row }: { row: AuthFileCredentialRow }) {
  const { t } = useTranslation()
  const statusReason = codexStatusReason(row)

  // 限额区域按加载、错误、刷新中、无缓存、可展示数据的顺序降级。
  if (row.quotaLoading) {
    return <div className={styles.credentialQuotaState}>{t('usage_stats.credentials_quota_loading')}</div>
  }
  if (row.quotaError) {
    return <div className={styles.credentialQuotaStateError}>{row.quotaError}</div>
  }
  if (row.refreshStatus === 'queued' || row.refreshStatus === 'running') {
    return <div className={styles.credentialQuotaRefreshStatus}>{t(`usage_stats.credentials_refresh_status_${row.refreshStatus}`)}</div>
  }
  if (!row.primaryQuota && !row.secondaryQuota && row.extraQuota.length === 0 && row.quotaTotalAmount === undefined) {
    return <div className={statusReason ? styles.credentialQuotaStateError : styles.credentialQuotaState}>{statusReason || t('usage_stats.credentials_quota_unavailable')}</div>
  }

  return (
    <div className={styles.credentialQuotaPanel}>
      {statusReason && <div className={styles.credentialQuotaNotice}>{statusReason}</div>}
      {row.quotaTotalAmount !== undefined && (
        <div className={styles.credentialQuotaAmount}>
          <span>{t('usage_stats.credentials_quota_amount')}</span>
          <strong>{formatCredentialCurrency(row.quotaTotalAmount)}</strong>
        </div>
      )}
      {(row.primaryQuota || row.secondaryQuota) && (
        <div className={styles.credentialQuotaBars}>
          {/* 5h/Weekly 使用固定槽位，避免只有 Weekly 时滑到左侧造成误读。 */}
          <QuotaSlot slot="five-hour" label="5h" quota={row.primaryQuota} />
          <QuotaSlot slot="weekly" label="Weekly" quota={row.secondaryQuota} />
        </div>
      )}
      {row.extraQuota.length > 0 && (
        <div className={styles.credentialQuotaChips}>
          {row.extraQuota.map((quota) => (
            <span key={quota.key} className={styles.credentialQuotaChip}>
              <span>{quota.label}</span>
              {quota.remaining !== undefined && <strong>{formatCredentialNumber(quota.remaining)}</strong>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function codexStatusReason(row: AuthFileCredentialRow): string {
  if (row.codexUnavailableReason) {
    return row.codexUnavailableReason
  }
  if (row.codexStatusMessage && (row.codexUnavailable || row.codexStatus === 'error')) {
    return row.codexStatusMessage
  }
  if (row.codexQuotaRefreshStatus === 'error' && row.codexQuotaRefreshError) {
    return row.codexQuotaRefreshError
  }
  return ''
}

function QuotaSlot({ slot, label, quota }: { slot: 'five-hour' | 'weekly'; label: string; quota?: DisplayQuota }) {
  if (quota) {
    return <QuotaBar quota={quota} slot={slot} />
  }
  return (
    <div className={`${styles.credentialQuotaBarBlock} ${styles.credentialQuotaBarPlaceholder}`.trim()} data-quota-slot={slot}>
      <div className={styles.credentialQuotaBarHeader}>
        <span className={styles.credentialQuotaLabelGroup}>
          <span>{label}</span>
        </span>
        <span className={styles.credentialQuotaValueGroup}>
          <strong>-</strong>
        </span>
      </div>
      <div className={styles.credentialQuotaTrack}>
        <span className={styles.credentialQuotaFill} style={{ width: '0%' }} />
      </div>
      <div className={styles.credentialQuotaMeta}>
        <span>-</span>
      </div>
    </div>
  )
}

export function formatQuotaResetLabel(resetAt: string): string {
  const resetTime = new Date(resetAt)
  const resetMs = resetTime.getTime()
  if (!Number.isFinite(resetMs)) {
    return ''
  }
  const remainingMinutes = Math.max(0, Math.ceil((resetMs - Date.now()) / 60_000))
  const days = Math.floor(remainingMinutes / 1_440)
  const hours = Math.floor((remainingMinutes % 1_440) / 60)
  const minutes = remainingMinutes % 60
  const month = String(resetTime.getMonth() + 1).padStart(2, '0')
  const day = String(resetTime.getDate()).padStart(2, '0')
  const hour = String(resetTime.getHours()).padStart(2, '0')
  const minute = String(resetTime.getMinutes()).padStart(2, '0')
  const duration = days > 0 ? `${days}d${hours}h${minutes}m` : `${hours}h${minutes}m`
  return `${duration} (${month}/${day} ${hour}:${minute})`
}

function QuotaBar({ quota, slot }: { quota: DisplayQuota; slot?: 'five-hour' | 'weekly' }) {
  // 条宽使用剩余额度百分比，颜色跟随剩余风险状态从绿到黄到红。
  const { t } = useTranslation()
  const percent = quota.barPercent ?? 0
  const width = `${Math.max(0, Math.min(100, percent))}%`
  const percentLabel = quota.barPercent === null ? '' : t('usage_stats.credentials_quota_percent_remaining', { percent: `${Math.round(quota.barPercent)}%` })
  const resetLabel = quota.resetText ? formatQuotaResetLabel(quota.resetText) : ''

  return (
    <div className={styles.credentialQuotaBarBlock} data-quota-slot={slot}>
      <div className={styles.credentialQuotaBarHeader}>
        <span className={styles.credentialQuotaLabelGroup}>
          <span>{quota.label}</span>
        </span>
        {percentLabel && (
          <span className={styles.credentialQuotaValueGroup}>
            <strong>{percentLabel}</strong>
          </span>
        )}
      </div>
      <div className={styles.credentialQuotaTrack}>
        <span className={`${styles.credentialQuotaFill} ${credentialToneClassName('credentialQuotaFill', quota.status)}`.trim()} style={{ width }} />
      </div>
      <div className={styles.credentialQuotaMeta}>
        <span>{resetLabel || '-'}</span>
      </div>
    </div>
  )
}

function formatCredentialCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}
