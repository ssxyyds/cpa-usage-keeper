package cpa

import (
	"context"
	"encoding/json"

	"cpa-usage-keeper/internal/codexpool"
)

func (c *Client) FetchCodexState(ctx context.Context) (json.RawMessage, error) {
	var raw json.RawMessage
	_, _, err := c.doManagementJSONRequest(ctx, cpaManagementCodexStateEndpoint, &raw, "codex state")
	return raw, err
}

func (c *Client) RefreshCodexState(ctx context.Context, authIndexes []string) (json.RawMessage, error) {
	var raw json.RawMessage
	body := map[string][]string{"auth_indexes": authIndexes}
	_, _, err := c.doManagementJSONPostRequest(ctx, cpaManagementCodexStateRefreshEndpoint, body, &raw, "codex state refresh")
	return raw, err
}

func (c *Client) RecalculateCodexState(ctx context.Context) (json.RawMessage, error) {
	var raw json.RawMessage
	_, _, err := c.doManagementJSONPostRequest(ctx, cpaManagementCodexStateRecalcEndpoint, map[string]any{}, &raw, "codex state recalc")
	return raw, err
}

func (c *Client) UpdateCodexManualScore(ctx context.Context, request codexpool.ManualScoreRequest) (json.RawMessage, error) {
	var raw json.RawMessage
	_, _, err := c.doManagementJSONPatchRequest(ctx, cpaManagementCodexManualScoreEndpoint, request, &raw, "codex manual score")
	return raw, err
}
