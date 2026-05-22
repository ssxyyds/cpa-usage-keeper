# AGENTS.md

Local-first usage dashboard for CLIProxyAPI. This workspace is maintained on branch `codex-enhancement` for ssxyyds Codex operations.

## Local Codex Enhancement Guide
- Before changing Codex dashboard behavior, read `docs/codex-enhancement.md`.
- CPA / CLIProxyAPI is the Codex authority. usage-keeper should consume CPA state and avoid duplicating Codex quota refresh, probe, score calculation, or routing decisions.
- Main operator flow is `Usage -> Credentials -> Auth Files`; keep Codex row additions compact.
- Put pool-level Codex data in `Usage -> Overview`, including routing strategy, weekly remaining total, and five-hour remaining total.
- `Codex Pool` is diagnostic/deprecated in this branch. Do not make it the primary navigation entry unless the product direction changes again.

## Docker Verification
- Verify page changes through the complete Docker service, not a separate Vite-only frontend.
- Expected local entry: `http://127.0.0.1:18082`.
- Expected CPA tunnel on host: `http://127.0.0.1:8318`.
- Container CPA URL should use `http://host.docker.internal:8318`.
- If Docker image pulls use a host proxy such as `http://127.0.0.1:7899`, set `NO_PROXY` and `no_proxy` to include `host.docker.internal,127.0.0.1,localhost` so CPA tunnel calls are not proxied.
- Rebuild the Docker image after frontend changes because `web/dist` is embedded into the server image.

## Commands
```bash
go test ./internal/cpa ./internal/api -run 'Codex|TestFetchCodexState|TestRefreshCodexState|TestUpdateCodexManualScore'
cd web && npm test -- --run src/lib/api.test.ts
cd web && npm run typecheck
cd web && npm run build
```

## Development Notes
- Keep fork changes small and sympathetic to upstream syncs.
- Prefer existing API clients, hooks, i18n keys, and component patterns over new parallel systems.
- Do not commit this `AGENTS.md`; it is local workspace guidance.
