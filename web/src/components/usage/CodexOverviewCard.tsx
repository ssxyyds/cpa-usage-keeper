import { type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconBot, IconChartLine, IconTimer } from '@/components/ui/icons'
import type { CodexPoolSummaryBucket, CodexStateResponse } from '@/lib/types'
import styles from '@/pages/UsagePage.module.scss'

const formatNumber = (value: number | undefined) => Number.isFinite(value) ? new Intl.NumberFormat().format(value ?? 0) : '-'
const formatPercent = (value: number | undefined) => Number.isFinite(value) ? `${Math.round((value ?? 0) * 100)}%` : '-'

export function routingStrategyLabel(strategy: string | undefined) {
  switch ((strategy ?? '').trim().toLowerCase()) {
    case 'codex-quota-score':
      return 'Codex 额度评分'
    case 'fill-first':
      return '填充优先'
    case 'round-robin':
      return '轮询'
    default:
      return strategy?.trim() || '-'
  }
}

export function formatCodexOverviewQuota(bucket: CodexPoolSummaryBucket | undefined): string {
  if (!bucket) return '-'
  const base = `${formatNumber(bucket.remaining)} / ${formatNumber(bucket.limit)}`
  if (!Number.isFinite(bucket.remaining_ratio)) return base
  return `${base} (${Math.round((bucket.remaining_ratio ?? 0) * 100)}%)`
}

function quotaRatio(bucket: CodexPoolSummaryBucket | undefined): number {
  if (Number.isFinite(bucket?.remaining_ratio)) {
    return Math.max(0, Math.min(1, bucket?.remaining_ratio ?? 0))
  }
  if (!Number.isFinite(bucket?.remaining) || !Number.isFinite(bucket?.limit) || !bucket?.limit || bucket.limit <= 0) {
    return 0
  }
  return Math.max(0, Math.min(1, (bucket.remaining ?? 0) / bucket.limit))
}

export function CodexOverviewCard({ state, loading }: { state: CodexStateResponse | null; loading: boolean }) {
  const { t } = useTranslation()
  const items = [
    {
      label: t('usage_stats.codex_overview_strategy'),
      value: loading ? '-' : routingStrategyLabel(state?.routing_strategy),
      hint: t('usage_stats.codex_overview_strategy_hint'),
      icon: <IconBot size={16} />,
      accent: '#2563eb',
      accentSoft: 'rgba(37, 99, 235, 0.16)',
      accentBorder: 'rgba(37, 99, 235, 0.32)',
    },
    {
      label: t('usage_stats.codex_overview_five_hour_total'),
      value: loading ? '-' : formatCodexOverviewQuota(state?.summary?.five_hour),
      hint: t('usage_stats.codex_overview_known_count', { value: formatNumber(state?.summary?.five_hour?.known) }),
      icon: <IconTimer size={16} />,
      accent: '#d97706',
      accentSoft: 'rgba(217, 119, 6, 0.16)',
      accentBorder: 'rgba(217, 119, 6, 0.32)',
      quotaPercent: loading ? undefined : formatPercent(quotaRatio(state?.summary?.five_hour)),
    },
    {
      label: t('usage_stats.codex_overview_weekly_total'),
      value: loading ? '-' : formatCodexOverviewQuota(state?.summary?.weekly),
      hint: t('usage_stats.codex_overview_known_count', { value: formatNumber(state?.summary?.weekly?.known) }),
      icon: <IconChartLine size={16} />,
      accent: '#16a34a',
      accentSoft: 'rgba(22, 163, 74, 0.16)',
      accentBorder: 'rgba(22, 163, 74, 0.32)',
      quotaPercent: loading ? undefined : formatPercent(quotaRatio(state?.summary?.weekly)),
    },
  ] satisfies Array<{
    label: string
    value: string
    hint: string
    icon: ReactNode
    accent: string
    accentSoft: string
    accentBorder: string
    quotaPercent?: string
  }>

  return (
    <section className={styles.codexOverviewCard}>
      <div className={styles.codexOverviewHeader}>
        <div>
          <span className={styles.codexOverviewEyebrow}>Codex</span>
          <h3>{t('usage_stats.codex_overview_title')}</h3>
        </div>
        <span className={styles.codexOverviewSource}>{t('usage_stats.codex_overview_source')}</span>
      </div>
      <div className={styles.codexOverviewGrid}>
        {items.map((item) => (
          <div
            key={item.label}
            className={`${styles.statCard} ${styles.codexOverviewItem}`.trim()}
            style={{
              '--accent': item.accent,
              '--accent-soft': item.accentSoft,
              '--accent-border': item.accentBorder,
            } as CSSProperties}
          >
            <div className={styles.statCardHeader}>
              <div className={styles.statLabelGroup}>
                <span className={styles.statLabel}>{item.label}</span>
              </div>
              <span className={styles.statIconBadge}>{item.icon}</span>
            </div>
            <div className={styles.statValue}>{item.value}</div>
            {item.quotaPercent && (
              <div className={styles.codexOverviewQuotaBar} style={{ '--quota-percent': item.quotaPercent } as CSSProperties}>
                <span />
              </div>
            )}
            <div className={styles.statMetaRow}>
              <span className={styles.statMetaItem}>{item.hint}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
