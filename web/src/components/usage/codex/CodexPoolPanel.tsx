import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, fetchCodexState, recalculateCodexState, refreshCodexState, updateCodexManualScore } from '@/lib/api';
import type { CodexPoolSummaryBucket, CodexStateAccount, CodexStateResponse } from '@/lib/types';
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

function quotaValue(account: CodexStateAccount, window: 'weekly' | 'five_hour') {
  const quota = account.codex_quota?.[window];
  return `${formatNumber(quota?.remaining)} / ${formatNumber(quota?.limit)}`;
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

export function formatCodexRefreshTime(account: CodexStateAccount): string {
  return formatDateTime(account.codex_quota?.last_refresh_at);
}

export function formatCodexNextRefreshTime(account: CodexStateAccount): string {
  const refreshedAt = account.codex_quota?.last_refresh_at;
  if (!refreshedAt) return '-';
  const date = new Date(refreshedAt);
  const refreshMs = date.getTime();
  if (!Number.isFinite(refreshMs)) return '-';
  const intervalMs = 15 * 60 * 1000;
  const nextBoundary = Math.floor(refreshMs / intervalMs) * intervalMs + intervalMs;
  return formatDateTime(new Date(nextBoundary).toISOString());
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
  const requestRef = useRef<AbortController | null>(null);

  const accounts = useMemo(() => sortCodexPoolAccounts(state?.['codex-state'] ?? []), [state]);
  const currentAccount = useMemo(() => currentCodexPoolAccount(accounts), [accounts]);
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

      {currentAccount && (
        <div className={styles.currentAccountBanner}>
          <span className={styles.currentAccountLabel}>{t('usage_stats.codex_pool_current_account')}</span>
          <strong>{currentAccount.name || currentAccount.email || currentAccount.auth_index || currentAccount.id || '-'}</strong>
          <span>{currentAccount.auth_index || currentAccount.id || '-'}</span>
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

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('usage_stats.codex_pool_account')}</th>
              <th>{t('usage_stats.codex_pool_status')}</th>
              <th>{t('usage_stats.codex_pool_weekly')}</th>
              <th>{t('usage_stats.codex_pool_five_hour')}</th>
              <th>{t('usage_stats.codex_pool_score')}</th>
              <th>{t('usage_stats.codex_pool_manual')}</th>
              <th>{t('usage_stats.codex_pool_quota_reset')}</th>
              <th>{t('usage_stats.codex_pool_next_refresh')}</th>
              <th>{t('usage_stats.codex_pool_recent_refresh')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const key = accountKey(account);
              const score = finiteScore(account);
              return (
                <tr key={key} className={account.on_device ? styles.currentRow : undefined}>
                  <td>
                    <div className={styles.identity}>
                      <span className={styles.identityName}>
                        {account.name || account.email || account.auth_index || account.id || '-'}
                        {account.on_device && <span className={styles.currentBadge}>{t('usage_stats.codex_pool_current_badge')}</span>}
                      </span>
                      <span className={styles.identityMeta}>{account.auth_index || account.id || '-'}</span>
                    </div>
                  </td>
                  <td><span className={`${styles.statusBadge} ${account.disabled || account.unavailable ? styles.statusBadgeMuted : styles.statusBadgeActive}`.trim()}>{account.disabled ? t('usage_stats.codex_pool_status_disabled') : account.unavailable ? t('usage_stats.codex_pool_status_unavailable') : account.status || t('usage_stats.codex_pool_status_active')}</span></td>
                  <td><span className={styles.number}>{quotaValue(account, 'weekly')}</span></td>
                  <td><span className={styles.number}>{quotaValue(account, 'five_hour')}</span></td>
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
                  <td><span className={styles.timeCell}>{formatDateTime(nextQuotaResetTime(account))}</span></td>
                  <td><span className={styles.timeCell}>{formatCodexNextRefreshTime(account)}</span></td>
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
