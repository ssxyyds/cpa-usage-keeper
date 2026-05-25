import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildAiProviderCredentialRows,
  buildAuthFileCredentialRows,
  paginateCredentials,
  selectQuotaEligibleAuthIndexes,
  sortAuthFileCredentialRows,
  type CodexCredentialState,
  type AiProviderCredentialRow,
  type AuthFileCredentialRow,
} from './credentialViewModels'
import { useCredentialPages } from './useCredentialPages'
import { useQuotaCache } from './useQuotaCache'
import { ApiError, fetchCodexState, fetchUsageWindowCosts, refreshCodexState, updateCodexManualScore, type UsageIdentityPageSort } from '@/lib/api'
import { quotaRefreshDisplayError, useQuotaRefreshTasks } from './useQuotaRefreshTasks'
import type { CodexQuotaState, CodexStateAccount, CodexStateResponse, UsageQuotaRow, UsageWindowCostRecord, UsageWindowCostRequest } from '@/lib/types'

const CODEX_WEEKLY_WINDOW_SECONDS = 604_800

interface UseCredentialsTabDataOptions {
  enabled: boolean
  onAuthRequired?: () => void
}

export interface CredentialsTabData {
  authFileRows: AuthFileCredentialRow[]
  aiProviderRows: AiProviderCredentialRow[]
  authFileTotal: number
  aiProviderTotal: number
  authFilePageSize: number
  aiProviderPageSize: number
  authFilePage: number
  aiProviderPage: number
  authFileTotalPages: number
  aiProviderTotalPages: number
  authFileActiveOnly: boolean
  authFileSearch: string
  authFileSort: UsageIdentityPageSort
  aiProviderSort: UsageIdentityPageSort
  setAuthFilePage: (page: number) => void
  setAiProviderPage: (page: number) => void
  setAuthFilePageSize: (pageSize: number) => void
  setAiProviderPageSize: (pageSize: number) => void
  setAuthFileActiveOnly: (activeOnly: boolean) => void
  setAuthFileSearch: (search: string) => void
  setAuthFileSort: (sort: UsageIdentityPageSort) => void
  setAiProviderSort: (sort: UsageIdentityPageSort) => void
  loading: boolean
  error: string
  quotaRefreshing: boolean
  quotaRefreshError: string
  refresh: () => Promise<void>
  refreshQuotaForCurrentAuthFilePage: () => Promise<void>
  refreshQuotaForAuthIndex: (authIndex: string) => Promise<void>
  updateCodexManualScoreForAuthIndex: (authIndex: string, adjustment: number) => Promise<void>
  codexStateLoading: boolean
  codexStateError: string
}

export function useCredentialsTabData({ enabled, onAuthRequired }: UseCredentialsTabDataOptions): CredentialsTabData {
  // 页面 hook 只编排分页、缓存和刷新任务三层数据，不直接发散 API 调用。
  const credentialPages = useCredentialPages({ enabled, onAuthRequired })
  const [codexCredentialStates, setCodexCredentialStates] = useState<Record<string, CodexCredentialState>>({})
  const [codexStateLoading, setCodexStateLoading] = useState(false)
  const [codexStateError, setCodexStateError] = useState('')
  const codexStateRequestControllerRef = useRef<AbortController | null>(null)

  const refreshCodexCredentialStates = useCallback(async () => {
    codexStateRequestControllerRef.current?.abort()
    const controller = new AbortController()
    codexStateRequestControllerRef.current = controller
    setCodexStateLoading(true)
    setCodexStateError('')
    try {
      const response = await fetchCodexState(controller.signal)
      if (codexStateRequestControllerRef.current !== controller) {
        return
      }
      const accounts = response['codex-state'] ?? []
      const currentAuthIndexes = codexCurrentAuthIndexSet(response)
      const weeklyCostWindows = await loadCodexWeeklyUsageWindowCosts(accounts, controller.signal)
      if (codexStateRequestControllerRef.current !== controller) {
        return
      }
      const nextStates: Record<string, CodexCredentialState> = {}
      for (const account of accounts) {
        const authIndex = account.auth_index?.trim()
        if (!authIndex) {
          continue
        }
        const state = codexCredentialStateFromAccount(account, currentAuthIndexes)
        const windowCost = weeklyCostWindows.get(authIndex)
        if (windowCost) {
          state.usageWindowCosts = [windowCost]
        }
        nextStates[authIndex] = state
      }
      setCodexCredentialStates(nextStates)
    } catch (nextError) {
      if (controller.signal.aborted) {
        return
      }
      if (nextError instanceof ApiError && nextError.status === 401) {
        onAuthRequired?.()
        return
      }
      setCodexStateError(nextError instanceof Error ? nextError.message : 'Failed to load Codex state')
    } finally {
      if (codexStateRequestControllerRef.current === controller) {
        setCodexStateLoading(false)
        codexStateRequestControllerRef.current = null
      }
    }
  }, [onAuthRequired])

  useEffect(() => {
    if (!enabled) {
      codexStateRequestControllerRef.current?.abort()
      codexStateRequestControllerRef.current = null
      setCodexStateLoading(false)
      return
    }
    void refreshCodexCredentialStates()
    const intervalId = window.setInterval(() => {
      void refreshCodexCredentialStates()
    }, 15_000)
    return () => {
      window.clearInterval(intervalId)
      codexStateRequestControllerRef.current?.abort()
      codexStateRequestControllerRef.current = null
    }
  }, [enabled, refreshCodexCredentialStates])

  const codexStatesByAuthIndex = useMemo(() => new Map(Object.entries(codexCredentialStates)), [codexCredentialStates])
  const pagedAuthFileIdentities = useMemo(() => {
    if (!credentialPages.authFileClientPaging) {
      return credentialPages.authFileIdentities
    }
    const sortedRows = sortAuthFileCredentialRows(
      buildAuthFileCredentialRows(credentialPages.authFileIdentities, new Map(), new Map(), codexStatesByAuthIndex),
      credentialPages.authFileSort,
    )
    return paginateCredentials(sortedRows, credentialPages.authFilePage, credentialPages.authFilePageSize).items.map((row) => row.identity)
  }, [codexStatesByAuthIndex, credentialPages.authFileClientPaging, credentialPages.authFileIdentities, credentialPages.authFilePage, credentialPages.authFilePageSize, credentialPages.authFileSort])
  const currentAuthIndexes = useMemo(
    // quota 只对当前 Auth Files 页生效，AI Provider 不参与缓存读取和刷新。
    () => selectQuotaEligibleAuthIndexes(pagedAuthFileIdentities),
    [pagedAuthFileIdentities],
  )
  const { quotaByAuthIndex, setQuotaByAuthIndex } = useQuotaCache({
    enabled,
    authIndexes: currentAuthIndexes,
    onAuthRequired,
  })
  const quotaRefreshTasks = useQuotaRefreshTasks({
    enabled,
    currentAuthIndexes,
    setQuotaByAuthIndex,
    onAuthRequired,
  })

  // 把对象状态转成 Map 后交给纯 view model，组件层只消费已组合好的行数据。
  const quotaRowsByAuthIndex = useMemo(() => new Map(Object.entries(quotaByAuthIndex)), [quotaByAuthIndex])
  const quotaStates = useMemo(() => new Map(Object.entries(quotaRefreshTasks.quotaStateByAuthIndex).map(([authIndex, state]) => [authIndex, {
    quotaLoading: state.loading ?? false,
    quotaError: state.error,
    refreshTaskId: state.refreshTaskId,
    refreshStatus: state.refreshStatus,
  }])), [quotaRefreshTasks.quotaStateByAuthIndex])

  const allAuthFileRows = useMemo(
    () => sortAuthFileCredentialRows(
      buildAuthFileCredentialRows(credentialPages.authFileClientPaging ? pagedAuthFileIdentities : credentialPages.authFileIdentities, quotaRowsByAuthIndex, quotaStates, codexStatesByAuthIndex),
      credentialPages.authFileSort,
    ),
    [codexStatesByAuthIndex, credentialPages.authFileClientPaging, credentialPages.authFileIdentities, credentialPages.authFileSort, pagedAuthFileIdentities, quotaRowsByAuthIndex, quotaStates],
  )
  const authFileRows = useMemo(() => {
    return allAuthFileRows
  }, [allAuthFileRows])
  const aiProviderRows = useMemo(
    () => buildAiProviderCredentialRows(credentialPages.aiProviderIdentities),
    [credentialPages.aiProviderIdentities],
  )
  const refreshQuotaForCurrentAuthFilePage = useCallback(async () => {
    await quotaRefreshTasks.refreshQuotaForCurrentAuthFilePage()
    await refreshCodexState(currentAuthIndexes)
    await refreshCodexCredentialStates()
  }, [currentAuthIndexes, quotaRefreshTasks, refreshCodexCredentialStates])
  const refreshQuotaForAuthIndex = useCallback(async (authIndex: string) => {
    await quotaRefreshTasks.refreshQuotaForAuthIndex(authIndex)
    await refreshCodexState([authIndex])
    await refreshCodexCredentialStates()
  }, [quotaRefreshTasks, refreshCodexCredentialStates])
  const updateCodexManualScoreForAuthIndex = useCallback(async (authIndex: string, adjustment: number) => {
    const response = await updateCodexManualScore(authIndex, adjustment)
    setCodexCredentialStates((current) => mergeCodexManualScoreUpdate(current, authIndex, adjustment, response))
    await refreshCodexCredentialStates()
  }, [refreshCodexCredentialStates])
  const refresh = useCallback(async () => {
    await Promise.all([credentialPages.refresh(), refreshCodexCredentialStates()])
  }, [credentialPages, refreshCodexCredentialStates])

  return {
    authFileRows,
    aiProviderRows,
    authFileTotal: credentialPages.authFileTotal,
    aiProviderTotal: credentialPages.aiProviderTotal,
    authFilePageSize: credentialPages.authFilePageSize,
    aiProviderPageSize: credentialPages.aiProviderPageSize,
    authFilePage: credentialPages.authFilePage,
    aiProviderPage: credentialPages.aiProviderPage,
    authFileTotalPages: credentialPages.authFileTotalPages,
    aiProviderTotalPages: credentialPages.aiProviderTotalPages,
    authFileActiveOnly: credentialPages.authFileActiveOnly,
    authFileSearch: credentialPages.authFileSearch,
    authFileSort: credentialPages.authFileSort,
    aiProviderSort: credentialPages.aiProviderSort,
    setAuthFilePage: credentialPages.setAuthFilePage,
    setAiProviderPage: credentialPages.setAiProviderPage,
    setAuthFilePageSize: credentialPages.setAuthFilePageSize,
    setAiProviderPageSize: credentialPages.setAiProviderPageSize,
    setAuthFileActiveOnly: credentialPages.setAuthFileActiveOnly,
    setAuthFileSearch: credentialPages.setAuthFileSearch,
    setAuthFileSort: credentialPages.setAuthFileSort,
    setAiProviderSort: credentialPages.setAiProviderSort,
    loading: credentialPages.loading,
    error: credentialPages.error,
    quotaRefreshing: quotaRefreshTasks.quotaRefreshing,
    quotaRefreshError: quotaRefreshTasks.quotaRefreshError,
    refresh,
    refreshQuotaForCurrentAuthFilePage,
    refreshQuotaForAuthIndex,
    updateCodexManualScoreForAuthIndex,
    codexStateLoading,
    codexStateError,
  }
}

export { quotaRefreshDisplayError }

async function loadCodexWeeklyUsageWindowCosts(accounts: CodexStateAccount[], signal: AbortSignal): Promise<Map<string, UsageWindowCostRecord>> {
  const windows = buildCodexWeeklyUsageWindowRequests(accounts)
  if (windows.length === 0) {
    return new Map()
  }
  const response = await fetchUsageWindowCosts(windows, signal)
  const records = new Map<string, UsageWindowCostRecord>()
  for (const record of response.windows ?? []) {
    const authIndex = record.auth_index?.trim()
    if (authIndex && (record.key === 'weekly' || record.key === 'codex_quota.weekly')) {
      records.set(authIndex, record)
    }
  }
  return records
}

export function buildCodexWeeklyUsageWindowRequests(accounts: CodexStateAccount[], now = new Date()): UsageWindowCostRequest[] {
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) {
    return []
  }
  const windows: UsageWindowCostRequest[] = []
  for (const account of accounts) {
    const authIndex = account.auth_index?.trim()
    const weekly = account.codex_quota?.weekly
    if (!authIndex || !weekly || !Number.isFinite(weekly.remaining) || !Number.isFinite(weekly.limit) || (weekly.limit ?? 0) <= 0) {
      continue
    }
    const resetAt = codexQuotaResetAt(weekly, now)
    const resetMs = resetAt ? Date.parse(resetAt) : Number.NaN
    if (!Number.isFinite(resetMs)) {
      continue
    }
    const startMs = resetMs - CODEX_WEEKLY_WINDOW_SECONDS * 1000
    const latestEndMs = Math.min(resetMs, nowMs)
    const observedMs = parseTimestampMs(account.codex_quota?.last_refresh_at)
    const rawEndMs = observedMs ?? latestEndMs
    const endMs = Math.min(Math.max(rawEndMs, startMs), latestEndMs)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue
    }
    windows.push({
      key: 'weekly',
      auth_type: 'oauth',
      auth_index: authIndex,
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
    })
  }
  return windows
}

function parseTimestampMs(value: string | undefined): number | undefined {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

export function codexCurrentAuthIndexSet(response: CodexStateResponse): Set<string> {
  const currentAuthIndexes = new Set<string>()
  const authIndexByID = new Map<string, string>()
  for (const account of response['codex-state'] ?? []) {
    const id = account.id?.trim()
    const authIndex = account.auth_index?.trim()
    if (id && authIndex) {
      authIndexByID.set(id, authIndex)
    }
  }
  for (const selection of response.current_selections ?? []) {
    const rawSelection = selection as typeof selection & { authIndex?: string }
    const authIndex = (selection.auth_index ?? rawSelection.authIndex)?.trim()
    if (authIndex) {
      currentAuthIndexes.add(authIndex)
      continue
    }
    const selectedId = selection.id?.trim()
    if (!selectedId) {
      continue
    }
    const matchingAuthIndex = authIndexByID.get(selectedId)
    if (matchingAuthIndex) {
      currentAuthIndexes.add(matchingAuthIndex)
    }
  }
  for (const account of response['codex-state'] ?? []) {
    const authIndex = account.auth_index?.trim()
    if (authIndex && account.on_device === true) {
      currentAuthIndexes.add(authIndex)
    }
  }
  return currentAuthIndexes
}

export function codexCredentialStateFromAccount(account: CodexStateAccount, currentAuthIndexes: Set<string>): CodexCredentialState {
  const computedScore = finiteNumber(account.codex_computed_score) ?? finiteNumber(account.codex_score_explanation?.computed_score_live)
  const manualAdjustment = finiteNumber(account.codex_manual_score_adjustment) ?? finiteNumber(account.codex_score_explanation?.manual_adjustment)
  const authIndex = account.auth_index?.trim()
  const planType = codexAccountPlanType(account)
  return {
    score: computedScore ?? manualAdjustment,
    manualAdjustment,
    scoreReason: account.codex_score_reason ?? account.codex_last_selection_reason ?? account.codex_score_explanation?.disqualifier_reason,
    current: account.on_device === true || (authIndex ? currentAuthIndexes.has(authIndex) : false),
    planType,
    quota: codexQuotaToRows(account.codex_quota, planType),
    status: account.status?.trim(),
    statusMessage: account.status_message?.trim(),
    unavailable: account.unavailable === true,
    unavailableReason: account.unavailable_reason?.trim() || codexLastErrorReason(account),
    lastError: account.last_error,
    quotaRefreshStatus: account.codex_quota?.refresh_status?.trim(),
    quotaRefreshError: account.codex_quota?.refresh_error?.trim(),
  }
}

export function mergeCodexManualScoreUpdate(current: Record<string, CodexCredentialState>, authIndex: string, adjustment: number, response: unknown): Record<string, CodexCredentialState> {
  const account = isCodexStateAccountLike(response) ? response : {}
  const key = account.auth_index?.trim() || authIndex
  if (!key) {
    return current
  }
  const existing = current[key]
  const computedScore = finiteNumber(account.codex_computed_score) ?? finiteNumber(account.codex_score_explanation?.computed_score_live)
  const manualAdjustment = finiteNumber(account.codex_manual_score_adjustment) ?? finiteNumber(account.codex_score_explanation?.manual_adjustment) ?? adjustment
  return {
    ...current,
    [key]: {
      ...existing,
      score: computedScore ?? manualAdjustment,
      manualAdjustment,
      scoreReason: account.codex_score_reason ?? account.codex_last_selection_reason ?? account.codex_score_explanation?.disqualifier_reason ?? existing?.scoreReason,
      current: existing?.current,
      quota: existing?.quota,
    },
  }
}

function isCodexStateAccountLike(value: unknown): value is CodexStateAccount {
  return typeof value === 'object' && value !== null
}

export function codexQuotaToRows(quota: CodexQuotaState | undefined, planType?: string): UsageQuotaRow[] | undefined {
  if (!quota) {
    return undefined
  }
  const rows = [
    codexQuotaWindowToRow('codex_quota.five_hour', '5h', quota.five_hour, 18_000, planType),
    codexQuotaWindowToRow('codex_quota.weekly', 'Weekly', quota.weekly, 604_800, planType),
  ].filter((row): row is UsageQuotaRow => Boolean(row))
  return rows.length > 0 ? rows : undefined
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function codexQuotaWindowToRow(key: string, label: string, window: CodexQuotaState['five_hour'], seconds: number, planType?: string): UsageQuotaRow | undefined {
  if (!window || !Number.isFinite(window.remaining) || !Number.isFinite(window.limit) || (window.limit ?? 0) <= 0) {
    return undefined
  }
  const resetAt = codexQuotaResetAt(window)
  if (seconds === 18_000 && isImpossibleFiveHourReset(resetAt)) {
    return undefined
  }
  const remaining = Number(window.remaining)
  const limit = Number(window.limit)
  return {
    key,
    label,
    remaining,
    limit,
    remainingFraction: remaining / limit,
    resetAt,
    window: { seconds },
    planType,
  }
}

function codexAccountPlanType(account: CodexStateAccount): string | undefined {
  return firstNonEmpty(account.plan_type, account.id_token?.plan_type, account.account_type)
}

function codexLastErrorReason(account: CodexStateAccount): string | undefined {
  const error = account.last_error
  if (!error) {
    return undefined
  }
  const detail = error.code?.trim() || account.status_message?.trim() || error.message?.trim()
  if (Number.isFinite(error.http_status)) {
    return detail ? `${error.http_status} ${detail}` : String(error.http_status)
  }
  return detail || undefined
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return undefined
}

function isImpossibleFiveHourReset(resetAt: string | undefined): boolean {
  if (!resetAt) {
    return false
  }
  const resetMs = Date.parse(resetAt)
  if (!Number.isFinite(resetMs)) {
    return false
  }
  return resetMs - Date.now() > 6 * 60 * 60 * 1000
}

function codexQuotaResetAt(window: CodexQuotaState['five_hour'], now = new Date()): string | undefined {
  if (!window) {
    return undefined
  }
  const rawResetAt = window.reset_at ?? window.resetAt
  if (typeof rawResetAt === 'string' && rawResetAt.trim()) {
    return rawResetAt.trim()
  }
  if (typeof rawResetAt === 'number' && Number.isFinite(rawResetAt) && rawResetAt > 0) {
    return new Date(rawResetAt * 1000).toISOString()
  }
  const resetAfterSeconds = window.reset_after_seconds ?? window.resetAfterSeconds
  if (typeof resetAfterSeconds === 'number' && Number.isFinite(resetAfterSeconds) && resetAfterSeconds > 0) {
    return new Date(now.getTime() + resetAfterSeconds * 1000).toISOString()
  }
  return undefined
}
