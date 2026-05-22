# Codex Enhancement Integration

This branch keeps the stats project fork-friendly while integrating the Codex-specific CPA enhancements from `CLIProxyAPI` branch `codex-enhancement`.

## Branch

- Stats project branch: `codex-enhancement`
- CPA backend dependency: `CLIProxyAPI` branch `codex-enhancement`
- Main local dashboard entry: `Usage -> Credentials -> Auth Files`
- Pool-level Codex summary entry: `Usage -> Overview`
- `Codex Pool` is hidden from the main navigation and kept only as a diagnostic/deprecated component while the branch settles.

## CPA API Dependency

The dashboard reads Codex pool state through the stats server, not directly from the browser. The stats server uses the configured CPA base URL and management key, then proxies these enhanced CPA endpoints:

- `GET /v0/management/codex-state`
- `POST /v0/management/codex-state/refresh`
- `POST /v0/management/codex-state/recalc`
- `PATCH /v0/management/codex-state/manual-score`

Expected state payload:

```json
{
  "codex-state": [
    {
      "auth_index": "codex-auth-1",
      "name": "Codex Primary",
      "email": "user@example.com",
      "account_type": "team",
      "plan_type": "team",
      "status": "active",
      "disabled": false,
      "unavailable": false,
      "on_device": true,
      "codex_quota": {
        "five_hour": { "remaining": 10, "limit": 40, "reset_at": "2026-05-21T10:00:00Z" },
        "weekly": { "remaining": 122, "limit": 300, "reset_at": "2026-05-25T00:00:00Z" },
        "last_refresh_at": "2026-05-21T06:30:00Z",
        "refresh_status": "ok",
        "probe_status": "verified"
      },
      "codex_manual_score_adjustment": 0,
      "codex_computed_score": 12.3
    }
  ],
  "summary": {
    "accounts": { "total": 100, "active": 95, "cooldown": 5, "unavailable": 5, "disabled": 0 },
    "weekly": { "known": 92, "limit": 9200, "remaining": 7310, "remaining_ratio": 0.7945 },
    "five_hour": { "known": 88, "limit": 3520, "remaining": 870, "remaining_ratio": 0.2471 },
    "last_refresh_at": "2026-05-21T06:30:00Z"
  },
  "current_selections": [
    {
      "model": "gpt-5.4",
      "id": "auth-id",
      "auth_index": "codex-auth-1",
      "name": "Codex Primary",
      "email": "user@example.com",
      "account": "user@example.com"
    }
  ],
  "routing_strategy": "codex-quota-score"
}
```

CPA is the source of truth for Codex quota refresh/probe, score calculation, current model-account selection, plan type hints, reset times, and routing strategy. The stats project should consume CPA state and avoid duplicating Codex refresh logic in the browser.

## Codex Quota Sync Flow

Codex quota data in the Credentials page is intentionally driven by CPA state, not by an independent browser-side Codex quota implementation.

There are two refresh paths:

- **CPA background inspection path:** CPA periodically inspects Codex accounts and writes the resulting `five_hour` and `weekly` buckets into each account's `codex_quota`. The dashboard polls `GET /api/v1/codex-state` while the Credentials tab is active, merges `codex_quota` into matching Auth File rows, and refreshes the displayed 5h/Weekly bars, computed score, and current-account highlight automatically. No user action is required after CPA inspection finishes.
- **Manual dashboard refresh path:** Clicking `Update Quotas` or a row refresh button still starts the usage-keeper quota refresh task through `/api/v1/quota/refresh` for the selected Auth Files. For Codex accounts, the dashboard also calls `POST /api/v1/codex-state/refresh` for the same auth indexes and then reloads `GET /api/v1/codex-state`.

For Codex Auth File rows, `codex_quota` from CPA state has display priority over usage-keeper's local quota cache. This prevents stale local quota cache data from hiding fresher CPA inspection results. The local quota cache remains useful for non-Codex providers and as a manual-refresh task result, but Codex scheduling-relevant quota should be read from CPA state.

The frontend currently polls Codex state every 15 seconds while the Credentials tab data hook is enabled. This keeps the page aligned with CPA account switching, including automatic changes to `current_selections` and `on_device`.

## Local Stats API

The stats server exposes protected local endpoints for the frontend:

- `GET /api/v1/codex-state`
- `POST /api/v1/codex-state/refresh`
- `POST /api/v1/codex-state/recalc`
- `PATCH /api/v1/codex-state/manual-score`

Manual score request:

```json
{
  "auth_index": "codex-auth-1",
  "adjustment": 25
}
```

The intended adjustment range is `-100` to `100`; CPA remains the authority that validates and stores the value.

After a successful manual score save, CPA recalculates the current sticky selection immediately. The dashboard refreshes Codex state after saving so a deliberately boosted account can become visible without waiting for the next 15 minute巡检.

## Overview Integration

`Usage -> Overview` shows pool-level Codex state:

- Current CPA Codex routing strategy, localized for operators.
- Weekly remaining quota total from `summary.weekly.remaining`.
- Five-hour remaining quota total from `summary.five_hour.remaining`.

The CPA巡检更新时间 is intentionally not shown in account rows because it is pool-level operational state and usually changes in batches.

## Credentials Integration

`Usage -> Credentials -> Auth Files` is the primary Codex operator list:

- Codex quota bars prefer CPA `codex_quota` from `GET /api/v1/codex-state`; the local quota cache is only a fallback for Codex and remains the normal path for other providers.
- CPA background inspection updates are picked up automatically by the frontend Codex state poller, so operators do not need to click `Update Quotas` after CPA finishes巡检.
- Refreshing the current page or a single row updates the local quota cache and also asks CPA to refresh Codex state for those auth indexes.
- Codex-specific row additions are intentionally compact: final score, manual adjustment input, and save action.
- Auth Files default to Codex score descending. If CPA marks an account through `on_device` or `current_selections`, that current account is pinned and highlighted above score order.
- Rows do not show pool totals, current strategy, or CPA巡检更新时间.

## Codex Pool Integration

`Codex Pool` is no longer the main operator view. Keep the component code available for diagnostics while the project transitions, but do not export it as a main Usage tab.

Historical behavior in this component:

- The account table is sorted by computed score descending by default, with unknown scores last.
- If CPA marks an account as `on_device`, the table pins and highlights that current account above the score order.
- The header displays CPA's current routing strategy, localized for Chinese operators.
- The table has a quick search input for account id, auth index, email, name, and account type.
- Account status is displayed under the account identity, alongside plan/package badges such as `free`, `team`, or `plus`; auth method labels such as `oauth` are not shown as plan badges.
- Weekly and five-hour quota values are displayed as remaining percentages with red/yellow/green pills.
- Quota reset timestamps are displayed with urgency coloring; near reset is red.
- The `Recent Refresh` column displays `codex_quota.last_refresh_at`; `refresh_status` remains available in the payload but is not used as the timestamp label.
- `Score` uses `codex_computed_score` when present and falls back to live `codex_score_explanation.computed_score_live`.
- `Manual adjust` is an additive score adjustment, not an independent routing weight.
- Summary cards show active/total accounts, weekly quota, five-hour quota, disabled/cooldown counts, and the latest summary refresh time.
- Manual score edits use `PATCH /api/v1/codex-state/manual-score`.
- UI labels are localized through `usage_stats.codex_pool_*` keys.

New development should prefer `Overview` for pool-level information and `Credentials/Auth Files` for per-account actions.

## Local Docker Verification

Use Docker to verify page changes against the complete usage-keeper service instead of running a separate Vite-only frontend.

Recommended local shape:

- CPA tunnel on the host: `http://127.0.0.1:8318`
- usage-keeper container: `http://127.0.0.1:18082`
- Container CPA base URL: `http://host.docker.internal:8318`
- Auth disabled for local verification: `AUTH_ENABLED=false`

When using a host HTTP proxy for Docker image pulls, do not proxy traffic from the container back to the host CPA tunnel. Set both `NO_PROXY` and `no_proxy` to include `host.docker.internal,127.0.0.1,localhost`; otherwise Codex state calls can be routed through the proxy and return `502`.

Open `http://127.0.0.1:18082` to test the full page and API together. Rebuild the image after frontend changes because the Dockerfile embeds `web/dist` into the server image.

## Model Pricing Defaults

The pricing UI and pricing repository include default USD-per-1M-token settings for Codex-focused models:

- `gpt-5.5`: input `5`, output `30`, cached input `0.5`
- `gpt-5.4`: input `2.5`, output `15`, cached input `0.25`
- `gpt-5.4-mini`: input `0.75`, output `4.5`, cached input `0.075`

Database rows still override these defaults when an operator saves custom values.

## Files To Preserve When Syncing Upstream

Backend:

- `internal/api/codex_state.go`
- `internal/api/codex_state_test.go`
- `internal/codexpool/types.go`
- `internal/cpa/codex_state.go`
- `internal/cpa/codex_state_test.go`
- Codex provider wiring in `internal/api/router.go`
- Codex provider wiring in `internal/app/app.go`
- Codex endpoint constants in `internal/cpa/endpoints.go`
- PATCH helper in `internal/cpa/client.go`

Frontend:

- `web/src/components/usage/CodexOverviewCard.tsx`
- `web/src/components/usage/CodexOverviewCard.test.tsx`
- `web/src/components/usage/codex/*` for diagnostic/deprecated Codex Pool code
- Codex state merge in `web/src/components/usage/credentials/*`
- Codex state types in `web/src/lib/types.ts`
- Codex state API functions in `web/src/lib/api.ts`
- API test coverage in `web/src/lib/api.test.ts`
- Usage tab wiring in `web/src/pages/UsagePage.tsx`
- Overview/Credentials Codex translations in `web/src/i18n/index.ts`

## Verification

Useful focused checks:

```powershell
$env:GOROOT='D:\Apps\dev\go'
$env:GOPATH='D:\Apps\dev\gopath'
$env:GOMODCACHE='D:\Apps\dev\gopath\pkg\mod'
$env:GOPROXY='https://goproxy.cn,direct'
$env:PATH='D:\Apps\dev\go\bin;D:\Apps\dev\gopath\bin;' + $env:PATH
$env:GIN_MODE='release'
go test ./internal/cpa ./internal/codexpool ./internal/api -run 'Codex|TestFetchCodexState|TestRefreshCodexState|TestUpdateCodexManualScore'

cd web
npm ci
npm test -- --run src/lib/api.test.ts
npm run typecheck
npm run build
```

Full Go tests on Windows require a working C compiler because this project uses `github.com/mattn/go-sqlite3`. Without GCC or another CGO-compatible compiler, SQLite-backed tests fail with `go-sqlite3 requires cgo to work`.
