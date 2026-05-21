# Codex Enhancement Integration

This branch keeps the stats project fork-friendly while integrating the Codex-specific CPA enhancements from `CLIProxyAPI` branch `codex-enhancement`.

## Branch

- Stats project branch: `codex-enhancement`
- CPA backend dependency: `CLIProxyAPI` branch `codex-enhancement`
- Main local dashboard entry: Usage page tab `Codex Pool`

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
  }
}
```

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

## Credentials Integration

`Usage -> Credentials -> Auth Files` also consumes Codex state:

- Quota bars still use the existing quota cache/refresh task flow.
- Refreshing the current page or a single row updates the local quota cache and also asks CPA to refresh Codex state for those auth indexes.
- Codex auth file rows show `Codex Score` with the computed score and editable manual adjustment.
- Manual score edits call `PATCH /api/v1/codex-state/manual-score`, then reload Codex state.
- Sort options include:
  - `codex_score_desc`: highest score first
  - `codex_score_asc`: lowest score first

When sorting by Codex score, the frontend loads all auth file identities and performs local sorting/pagination after merging `codex-state`. This avoids sorting only the current server page when the pool has more than one page of accounts.

## Codex Pool Integration

`Usage -> Codex Pool` is the Codex-specific operator view:

- The account table is sorted by computed score descending by default, with unknown scores last.
- If CPA marks an account as `on_device`, the table pins and highlights that current account above the score order.
- The `Recent Refresh` column displays `codex_quota.last_refresh_at`; `refresh_status` remains available in the payload but is not used as the timestamp label.
- Summary cards show active/total accounts, weekly quota, five-hour quota, disabled/cooldown counts, and the latest summary refresh time.
- Manual score edits use the same `PATCH /api/v1/codex-state/manual-score` endpoint as the Credentials view.
- UI labels are localized through `usage_stats.codex_pool_*` keys.

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

- `web/src/components/usage/codex/*`
- Codex state merge and score sort in `web/src/components/usage/credentials/*`
- Codex state types in `web/src/lib/types.ts`
- Codex state API functions in `web/src/lib/api.ts`
- API test coverage in `web/src/lib/api.test.ts`
- Usage tab wiring in `web/src/pages/UsagePage.tsx`
- `usage_stats.tab_codex_pool` translations in `web/src/i18n/index.ts`

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
