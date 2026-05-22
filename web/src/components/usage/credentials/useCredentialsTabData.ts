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
import { ApiError, fetchCodexState, refreshCodexState, updateCodexManualScore, type UsageIdentityPageSort } from '@/lib/api'
import { quotaRefreshDisplayError, useQuotaRefreshTasks } from './useQuotaRefreshTasks'
import type { CodexQuotaState, CodexStateResponse, UsageQuotaRow } from '@/lib/types'

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
      const currentAuthIndexes = codexCurrentAuthIndexSet(response)
      const nextStates: Record<string, CodexCredentialState> = {}
      for (const account of response['codex-state'] ?? []) {
        const authIndex = account.auth_index?.trim()
        if (!authIndex) {
          continue
        }
        nextStates[authIndex] = {
          score: account.codex_computed_score ?? account.codex_score_explanation?.computed_score_live,
          manualAdjustment: account.codex_manual_score_adjustment ?? account.codex_score_explanation?.manual_adjustment,
          scoreReason: account.codex_score_reason ?? account.codex_last_selection_reason,
          current: account.on_device === true || currentAuthIndexes.has(authIndex),
          quota: codexQuotaToRows(account.codex_quota),
        }
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
    await updateCodexManualScore(authIndex, adjustment)
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

export function codexQuotaToRows(quota: CodexQuotaState | undefined): UsageQuotaRow[] | undefined {
  if (!quota) {
    return undefined
  }
  const rows = [
    codexQuotaWindowToRow('codex_quota.five_hour', '5h', quota.five_hour, 18_000),
    codexQuotaWindowToRow('codex_quota.weekly', 'Weekly', quota.weekly, 604_800),
  ].filter((row): row is UsageQuotaRow => Boolean(row))
  return rows.length > 0 ? rows : undefined
}

function codexQuotaWindowToRow(key: string, label: string, window: CodexQuotaState['five_hour'], seconds: number): UsageQuotaRow | undefined {
  if (!window || !Number.isFinite(window.remaining) || !Number.isFinite(window.limit) || (window.limit ?? 0) <= 0) {
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
    resetAt: codexQuotaResetAt(window),
    window: { seconds },
  }
}

function codexQuotaResetAt(window: CodexQuotaState['five_hour']): string | undefined {
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
    return new Date(Date.now() + resetAfterSeconds * 1000).toISOString()
  }
  return undefined
}
