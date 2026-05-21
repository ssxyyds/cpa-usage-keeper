import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function CodexPoolPanel({ onAuthRequired }: { onAuthRequired?: () => void }) {
  const [state, setState] = useState<CodexStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const requestRef = useRef<AbortController | null>(null);

  const accounts = useMemo(() => state?.['codex-state'] ?? [], [state]);
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
      setError(err instanceof Error ? err.message : 'Unable to load Codex pool state');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
      setLoading(false);
    }
  }, [onAuthRequired]);

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
      setError(err instanceof Error ? err.message : 'Codex pool action failed');
    } finally {
      setActionLoading(false);
    }
  }, [loadState, onAuthRequired]);

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
          <h2 className={styles.title}>Codex Pool</h2>
          <p className={styles.subtitle}>Quota, score, reset, and manual routing weight from the enhanced CPA Codex state API.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={() => void loadState()} disabled={loading || actionLoading}>
            {loading ? <LoadingSpinner size={12} /> : <IconRefreshCw size={14} />}
            <span>Reload</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => void runAction(() => refreshCodexState())} disabled={loading || actionLoading}>
            <span>{actionLoading ? 'Working' : 'Refresh Quota'}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => void runAction(() => recalculateCodexState())} disabled={loading || actionLoading}>
            <span>Recalculate</span>
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Accounts</div>
          <div className={styles.summaryValue}>{formatNumber(summary?.accounts?.active)} / {formatNumber(summary?.accounts?.total)}</div>
          <div className={styles.summaryHint}>unavailable {formatNumber(summary?.accounts?.unavailable)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Weekly Remaining</div>
          <div className={styles.summaryValue}>{bucketValue(summary?.weekly)}</div>
          <div className={styles.summaryHint}>{formatRatio(summary?.weekly?.remaining_ratio)} known {formatNumber(summary?.weekly?.known)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>5h Remaining</div>
          <div className={styles.summaryValue}>{bucketValue(summary?.five_hour)}</div>
          <div className={styles.summaryHint}>{formatRatio(summary?.five_hour?.remaining_ratio)} known {formatNumber(summary?.five_hour?.known)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Disabled</div>
          <div className={styles.summaryValue}>{formatNumber(summary?.accounts?.disabled)}</div>
          <div className={styles.summaryHint}>cooldown {formatNumber(summary?.accounts?.cooldown)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Last Refresh</div>
          <div className={styles.summaryValue}>{summary?.last_refresh_at ? 'Ready' : '-'}</div>
          <div className={styles.summaryHint}>{formatDateTime(summary?.last_refresh_at)}</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Status</th>
              <th>Weekly</th>
              <th>5h</th>
              <th>Score</th>
              <th>Manual</th>
              <th>Weekly Reset</th>
              <th>Refresh</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const key = accountKey(account);
              return (
                <tr key={key}>
                  <td>
                    <div className={styles.identity}>
                      <span className={styles.identityName}>{account.name || account.email || account.auth_index || account.id || '-'}</span>
                      <span className={styles.identityMeta}>{account.auth_index || account.id || '-'}</span>
                    </div>
                  </td>
                  <td><span className={styles.statusBadge}>{account.disabled ? 'disabled' : account.unavailable ? 'unavailable' : account.status || 'active'}</span></td>
                  <td><span className={styles.number}>{quotaValue(account, 'weekly')}</span></td>
                  <td><span className={styles.number}>{quotaValue(account, 'five_hour')}</span></td>
                  <td><span className={styles.number}>{formatNumber(account.codex_computed_score)}</span></td>
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
                      <button type="button" className={styles.actionButton} onClick={() => void saveManualScore(account)} disabled={actionLoading || !account.auth_index}>Save</button>
                    </span>
                  </td>
                  <td>{formatDateTime(account.codex_quota?.weekly?.reset_at)}</td>
                  <td>{account.codex_quota?.refresh_status || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && accounts.length === 0 && !error && <div className={styles.empty}>No Codex account state yet.</div>}
    </section>
  );
}
