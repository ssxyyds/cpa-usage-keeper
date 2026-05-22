import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, fetchCodexState, recalculateCodexState, refreshCodexState, updateCodexManualScore } from '@/lib/api';
import type { CodexCurrentSelection, CodexPoolSummaryBucket, CodexStateAccount, CodexStateResponse } from '@/lib/types';
import { IconRefreshCw } from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import styles from './CodexPoolPanel.module.scss';

const formatNumber = (value: number | undefined) => Number.isFinite(value) ? new Intl.NumberFormat().format(value ?? 0) : '-';

const formatRatio = (value: number | undefined) => Number.isFinite(value) ? `${Math.round((value ?? 0) * 100)}%` : '-';

const formatDateTime = (value: string | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const bucketValue = (bucket: CodexPoolSummaryBucket | undefined) => `${formatNumber(bucket?.remaining)} / ${formatNumber(bucket?.limit)}`;

const accountKey = (account: CodexStateAccount) => account.auth_index || account.id || account.email || account.name || 'unknown';

type Tone = 'good' | 'warning' | 'danger' | 'unknown';

function quotaRatio(account: CodexStateAccount, window: 'weekly' | 'five_hour') {
  const quota = account.codex_quota?.[window];
  if (!Number.isFinite(quota?.remaining) || !Number.isFinite(quota?.limit) || !quota?.limit || quota.limit <= 0) return undefined;
  return Math.max(0, Math.min(1, (quota.remaining ?? 0) / quota.limit));
}

export function quotaPercentTone(ratio: number | undefined): Tone {
  if (!Number.isFinite(ratio)) return 'unknown';
  if ((ratio ?? 0) >= 0.6) return 'good';
  if ((ratio ?? 0) >= 0.25) return 'warning';
  return 'danger';
}

export function formatCodexQuotaPercent(account: CodexStateAccount, window: 'weekly' | 'five_hour') {
  const ratio = quotaRatio(account, window);
  if (!Number.isFinite(ratio)) return '-';
  return `${Math.round((ratio ?? 0) * 100)}%`;
}

function finiteScore(account: CodexStateAccount) {
  const score = account.codex_computed_score ?? account.codex_score_explanation?.computed_score_live;
  return Number.isFinite(score) ? score : undefined;
}

export function sortCodexPoolAccounts(accounts: CodexStateAccount[]): CodexStateAccount[] {
  return [...accounts].sort((left, right) => {
    if (Boolean(left.on_device) !== Boolean(right.on_device)) return left.on_device ? -1 : 1;
    const leftScore = finiteScore(left);
    const rightScore = finiteScore(right);
    if (leftScore === undefined && rightScore === undefined) return accountKey(left).localeCompare(accountKey(right));
    if (leftScore === undefined) return 1;
    if (rightScore === undefined) return -1;
    if (leftScore === rightScore) return accountKey(left).localeCompare(accountKey(right));
    return rightScore - leftScore;
  });
}

export function currentCodexPoolAccount(accounts: CodexStateAccount[]): CodexStateAccount | undefined {
  return accounts.find((account) => account.on_device);
}

export function currentCodexPoolSelections(state: CodexStateResponse | null): CodexCurrentSelection[] {
  const selections = state?.current_selections?.filter((selection) => selection.id || selection.auth_index || selection.name || selection.email) ?? [];
  if (selections.length > 0) return selections;
  const currentAccount = currentCodexPoolAccount(state?.['codex-state'] ?? []);
  if (!currentAccount) return [];
  return [{
    model: '',
    id: currentAccount.id,
    auth_index: currentAccount.auth_index,
    name: currentAccount.name,
    email: currentAccount.email,
    account: currentAccount.account,
  }];
}

function currentSelectionLabel(selection: CodexCurrentSelection): string {
  return selection.name || selection.email || selection.auth_index || selection.id || '-';
}

function selectionMatchesAccount(selection: CodexCurrentSelection, account: CodexStateAccount): boolean {
  return Boolean(
    (selection.id && account.id && selection.id === account.id)
    || (selection.auth_index && account.auth_index && selection.auth_index === account.auth_index),
  );
}

export function formatCodexRefreshTime(account: CodexStateAccount): string {
  return formatDateTime(account.codex_quota?.last_refresh_at);
}

function nextQuotaResetTime(account: CodexStateAccount): string | undefined {
  const candidates = [account.codex_quota?.five_hour?.reset_at, account.codex_quota?.weekly?.reset_at]
    .flatMap((value) => {
      if (!value) return [];
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? [date] : [];
    })
    .sort((left, right) => left.getTime() - right.getTime());
  return candidates[0]?.toISOString();
}

export function resetUrgencyTone(value: string | undefined, now: Date = new Date()): Tone {
  if (!value) return 'unknown';
  const resetAt = new Date(value);
  const resetMs = resetAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs)) return 'unknown';
  const hours = (resetMs - nowMs) / 3_600_000;
  if (hours <= 1) return 'danger';
  if (hours <= 12) return 'warning';
  return 'good';
}

export function accountTypeLabel(account: CodexStateAccount): string | undefined {
  const raw = account.plan_type || account.id_token?.plan_type || account.account_type;
  if (!raw) return 'free';
  const normalized = String(raw).trim().toLowerCase();
  if (normalized.includes('team')) return 'team';
  if (normalized.includes('plus')) return 'plus';
  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('free')) return 'free';
  return 'free';
}

export function filterCodexPoolAccounts(accounts: CodexStateAccount[], query: string): CodexStateAccount[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return accounts;
  return accounts.filter((account) => [
    account.auth_index,
    account.id,
    account.name,
    account.email,
    account.account,
    accountTypeLabel(account),
  ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery)));
}

export function routingStrategyLabel(strategy: string | undefined) {
  switch ((strategy ?? '').trim().toLowerCase()) {
    case 'codex-quota-score':
      return 'Codex 额度评分';
    case 'fill-first':
      return '填充优先';
    case 'round-robin':
      return '轮询';
    default:
      return strategy?.trim() || '-';
  }
}

function scoreTitle(account: CodexStateAccount) {
  const explanation = account.codex_score_explanation;
  if (explanation?.score_available && explanation.formula_label) return explanation.formula_label;
  return explanation?.disqualifier_reason || account.codex_score_reason || account.codex_last_selection_reason || undefined;
}

export function CodexPoolPanel({ onAuthRequired }: { onAuthRequired?: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CodexStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const sortedAccounts = useMemo(() => sortCodexPoolAccounts(state?.['codex-state'] ?? []), [state]);
  const accounts = useMemo(() => filterCodexPoolAccounts(sortedAccounts, search), [search, sortedAccounts]);
  const currentSelections = useMemo(() => currentCodexPoolSelections(state), [state]);
  const currentAuthIDs = useMemo(() => new Set(currentSelections.flatMap((selection) => [selection.id, selection.auth_index].filter(Boolean) as string[])), [currentSelections]);
  const summary = state?.summary;

  const loadState = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetchCodexState(controller.signal);
      setState(response);
      const nextDrafts: Record<string, string> = {};
      for (const account of response['codex-state'] ?? []) {
        nextDrafts[accountKey(account)] = String(account.codex_manual_score_adjustment ?? 0);
      }
      setScoreDrafts(nextDrafts);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiError && err.status === 401) {
        onAuthRequired?.();
        return;
      }
      setError(err instanceof Error ? err.message : t('usage_stats.codex_pool_load_failed'));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
      setLoading(false);
    }
  }, [onAuthRequired, t]);

  useEffect(() => {
    void loadState();
    return () => requestRef.current?.abort();
  }, [loadState]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setActionLoading(true);
    setError('');
    try {
      await action();
      await loadState();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthRequired?.();
        return;
      }
      setError(err instanceof Error ? err.message : t('usage_stats.codex_pool_action_failed'));
    } finally {
      setActionLoading(false);
    }
  }, [loadState, onAuthRequired, t]);

  const saveManualScore = useCallback(async (account: CodexStateAccount) => {
    const key = accountKey(account);
    const authIndex = account.auth_index?.trim();
    if (!authIndex) return;
    const adjustment = Number(scoreDrafts[key]);
    if (!Number.isFinite(adjustment)) return;
    await runAction(() => updateCodexManualScore(authIndex, adjustment));
  }, [runAction, scoreDrafts]);

  return (
    <section className={styles.codexPanel}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Codex</p>
          <h2 className={styles.title}>{t('usage_stats.codex_pool_title')}</h2>
          <p className={styles.subtitle}>{t('usage_stats.codex_pool_subtitle')}</p>
          <div className={styles.strategyLine}>
            <span>{t('usage_stats.codex_pool_routing_strategy')}</span>
            <strong>{routingStrategyLabel(state?.routing_strategy)}</strong>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={() => void loadState()} disabled={loading || actionLoading}>
            {loading ? <LoadingSpinner size={12} /> : <IconRefreshCw size={14} />}
            <span>{t('usage_stats.codex_pool_reload')}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => void runAction(() => refreshCodexState())} disabled={loading || actionLoading}>
            <span>{actionLoading ? t('usage_stats.codex_pool_working') : t('usage_stats.codex_pool_refresh_quota')}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => void runAction(() => recalculateCodexState())} disabled={loading || actionLoading}>
            <span>{t('usage_stats.codex_pool_recalculate')}</span>
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.helpStrip}>
        <span>{t('usage_stats.codex_pool_score_tip')}</span>
        <span>{t('usage_stats.codex_pool_manual_tip')}</span>
      </div>

      {currentSelections.length > 0 && (
        <div className={styles.currentAccountBanner}>
          <span className={styles.currentAccountLabel}>{t('usage_stats.codex_pool_current_account_by_model')}</span>
          <div className={styles.currentSelectionList}>
            {currentSelections.map((selection) => (
              <span key={`${selection.model || 'default'}:${selection.id || selection.auth_index || currentSelectionLabel(selection)}`} className={styles.currentSelectionItem}>
                <span className={styles.currentSelectionModel}>{selection.model || t('usage_stats.codex_pool_default_model')}</span>
                <strong>{currentSelectionLabel(selection)}</strong>
                <span>{selection.auth_index || selection.id || '-'}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>{t('usage_stats.codex_pool_accounts')}</div>
          <div className={styles.summaryValue}>{formatNumber(summary?.accounts?.active)} / {formatNumber(summary?.accounts?.total)}</div>
          <div className={styles.summaryHint}>{t('usage_stats.codex_pool_unavailable', { count: formatNumber(summary?.accounts?.unavailable) })}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>{t('usage_stats.codex_pool_weekly_remaining')}</div>
          <div className={styles.summaryValue}>{bucketValue(summary?.weekly)}</div>
          <div className={styles.summaryHint}>{t('usage_stats.codex_pool_known_ratio', { ratio: formatRatio(summary?.weekly?.remaining_ratio), count: formatNumber(summary?.weekly?.known) })}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>{t('usage_stats.codex_pool_five_hour_remaining')}</div>
          <div className={styles.summaryValue}>{bucketValue(summary?.five_hour)}</div>
          <div className={styles.summaryHint}>{t('usage_stats.codex_pool_known_ratio', { ratio: formatRatio(summary?.five_hour?.remaining_ratio), count: formatNumber(summary?.five_hour?.known) })}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>{t('usage_stats.codex_pool_disabled')}</div>
          <div className={styles.summaryValue}>{formatNumber(summary?.accounts?.disabled)}</div>
          <div className={styles.summaryHint}>{t('usage_stats.codex_pool_cooldown', { count: formatNumber(summary?.accounts?.cooldown) })}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>{t('usage_stats.codex_pool_last_refresh')}</div>
          <div className={styles.summaryValue}>{summary?.last_refresh_at ? t('status_bar.success_short') : '-'}</div>
          <div className={styles.summaryHint}>{formatDateTime(summary?.last_refresh_at)}</div>
        </div>
      </div>

      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          type="search"
          value={search}
          placeholder={t('usage_stats.codex_pool_search_placeholder')}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span>{t('usage_stats.codex_pool_search_count', { count: formatNumber(accounts.length) })}</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('usage_stats.codex_pool_account')}</th>
              <th>{t('usage_stats.codex_pool_weekly')}</th>
              <th>{t('usage_stats.codex_pool_five_hour')}</th>
              <th>{t('usage_stats.codex_pool_score')}</th>
              <th>{t('usage_stats.codex_pool_manual')}</th>
              <th>{t('usage_stats.codex_pool_quota_reset')}</th>
              <th>{t('usage_stats.codex_pool_recent_refresh')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const key = accountKey(account);
              const score = finiteScore(account);
              const typeLabel = accountTypeLabel(account);
              const resetTime = nextQuotaResetTime(account);
              const isCurrent = account.on_device || currentAuthIDs.has(account.id ?? '') || currentAuthIDs.has(account.auth_index ?? '') || currentSelections.some((selection) => selectionMatchesAccount(selection, account));
              return (
                <tr key={key} className={isCurrent ? styles.currentRow : undefined}>
                  <td>
                    <div className={styles.identity}>
                      <div className={styles.identityName}>
                        {account.name || account.email || account.auth_index || account.id || '-'}
                      </div>
                      <div className={styles.identityBadges}>
                        <span className={`${styles.statusBadge} ${account.disabled || account.unavailable ? styles.statusBadgeMuted : styles.statusBadgeActive}`.trim()}>{account.disabled ? t('usage_stats.codex_pool_status_disabled') : account.unavailable ? t('usage_stats.codex_pool_status_unavailable') : account.status || t('usage_stats.codex_pool_status_active')}</span>
                        {typeLabel && <span className={styles.typeBadge}>{typeLabel}</span>}
                        {isCurrent && <span className={styles.currentBadge}>{t('usage_stats.codex_pool_current_badge')}</span>}
                      </div>
                    </div>
                  </td>
                  <td><span className={`${styles.quotaPill} ${styles[`tone${quotaPercentTone(quotaRatio(account, 'weekly'))}`]}`}>{formatCodexQuotaPercent(account, 'weekly')}</span></td>
                  <td><span className={`${styles.quotaPill} ${styles[`tone${quotaPercentTone(quotaRatio(account, 'five_hour'))}`]}`}>{formatCodexQuotaPercent(account, 'five_hour')}</span></td>
                  <td><span className={score === undefined ? styles.scoreBadgeMuted : styles.scoreBadge} title={scoreTitle(account)}>{formatNumber(score)}</span></td>
                  <td>
                    <span className={styles.scoreControl}>
                      <input
                        className={styles.scoreInput}
                        type="number"
                        min="-100"
                        max="100"
                        value={scoreDrafts[key] ?? '0'}
                        onChange={(event) => setScoreDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      />
                      <button type="button" className={styles.actionButton} onClick={() => void saveManualScore(account)} disabled={actionLoading || !account.auth_index}>{t('common.save')}</button>
                    </span>
                  </td>
                  <td><span className={`${styles.resetPill} ${styles[`tone${resetUrgencyTone(resetTime)}`]}`}>{formatDateTime(resetTime)}</span></td>
                  <td>{formatCodexRefreshTime(account)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && accounts.length === 0 && !error && <div className={styles.empty}>{t('usage_stats.codex_pool_empty')}</div>}
    </section>
  );
}
