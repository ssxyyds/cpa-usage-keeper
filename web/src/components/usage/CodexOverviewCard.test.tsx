import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CodexOverviewCard, formatCodexOverviewQuota, routingStrategyLabel } from './CodexOverviewCard'
import type { CodexStateResponse } from '@/lib/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => params?.value ?? key,
  }),
}))

describe('CodexOverviewCard', () => {
  it('formats pool total quota from CPA Codex state summary', () => {
    expect(formatCodexOverviewQuota({ remaining: 80, limit: 100, remaining_ratio: 0.8 })).toBe('80 / 100 (80%)')
    expect(formatCodexOverviewQuota({ remaining: 0, limit: 100, remaining_ratio: 0 })).toBe('0 / 100 (0%)')
  })

  it('renders routing strategy and total weekly/five-hour quota in overview', () => {
    const state = {
      'codex-state': [],
      routing_strategy: 'codex-quota-score',
      summary: {
        weekly: { remaining: 180, limit: 300, remaining_ratio: 0.6 },
        five_hour: { remaining: 45, limit: 60, remaining_ratio: 0.75 },
      },
    } as CodexStateResponse

    const html = renderToStaticMarkup(<CodexOverviewCard state={state} loading={false} />)

    expect(html).toContain('Codex 额度评分')
    expect(html).toContain('180 / 300 (60%)')
    expect(html).toContain('45 / 60 (75%)')
    expect(html.indexOf('45 / 60 (75%)')).toBeLessThan(html.indexOf('180 / 300 (60%)'))
    expect(html).not.toContain('codexOverviewChart')
    expect(html).toContain('codexOverviewQuotaBar')
    expect(html).toContain('--quota-percent:60%')
    expect(html).toContain('--quota-percent:75%')
    expect(html).not.toContain('usage_stats.codex_overview_chart_title')
  })

  it('localizes known routing strategies for overview display', () => {
    expect(routingStrategyLabel('codex-quota-score')).toBe('Codex 额度评分')
    expect(routingStrategyLabel('fill-first')).toBe('填充优先')
  })
})
