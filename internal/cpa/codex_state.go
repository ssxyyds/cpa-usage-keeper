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
	var body any
	if len(authIndexes) == 0 {
		body = map[string]bool{"all": true}
	} else {
		body = map[string][]string{"auth_indexes": authIndexes}
	}
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
	body := struct {
		AuthIndex string  `json:"auth_index"`
		Value     float64 `json:"value"`
	}{
		AuthIndex: request.AuthIndex,
		Value:     request.Adjustment,
	}
	_, _, err := c.doManagementJSONPatchRequest(ctx, cpaManagementCodexManualScoreEndpoint, body, &raw, "codex manual score")
	return raw, err
}
