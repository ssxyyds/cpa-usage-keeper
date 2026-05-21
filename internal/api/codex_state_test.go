package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cpa-usage-keeper/internal/codexpool"
)

type codexStateProviderStub struct {
	refreshAuthIndexes []string
	manualScoreRequest codexpool.ManualScoreRequest
	payload            json.RawMessage
	err                error
}

func (s *codexStateProviderStub) FetchCodexState(context.Context) (json.RawMessage, error) {
	return s.payload, s.err
}

func (s *codexStateProviderStub) RefreshCodexState(_ context.Context, authIndexes []string) (json.RawMessage, error) {
	s.refreshAuthIndexes = authIndexes
	return s.payload, s.err
}

func (s *codexStateProviderStub) RecalculateCodexState(context.Context) (json.RawMessage, error) {
	return s.payload, s.err
}

func (s *codexStateProviderStub) UpdateCodexManualScore(_ context.Context, request codexpool.ManualScoreRequest) (json.RawMessage, error) {
	s.manualScoreRequest = request
	return s.payload, s.err
}

func TestCodexStateReturnsRawManagementPayload(t *testing.T) {
	provider := &codexStateProviderStub{payload: json.RawMessage(`{"codex-state":[{"auth_index":"codex-1"}],"summary":{"weekly":{"remaining":42}}}`)}
	router := NewRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", OptionalProviders{CodexState: provider})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/codex-state", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	if !contains(resp.Body.String(), `"codex-state"`) || !contains(resp.Body.String(), `"remaining":42`) {
		t.Fatalf("unexpected response body: %s", resp.Body.String())
	}
}

func TestCodexStateRefreshForwardsOptionalAuthIndexes(t *testing.T) {
	provider := &codexStateProviderStub{payload: json.RawMessage(`{"accepted":2}`)}
	router := NewRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", OptionalProviders{CodexState: provider})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/codex-state/refresh", strings.NewReader(`{"auth_indexes":["codex-1","codex-2"]}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	if got := strings.Join(provider.refreshAuthIndexes, ","); got != "codex-1,codex-2" {
		t.Fatalf("expected auth indexes to be forwarded, got %+v", provider.refreshAuthIndexes)
	}
}

func TestCodexManualScoreRequiresAuthIndexAndForwardsAdjustment(t *testing.T) {
	provider := &codexStateProviderStub{payload: json.RawMessage(`{"ok":true}`)}
	router := NewRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", OptionalProviders{CodexState: provider})

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/codex-state/manual-score", strings.NewReader(`{"auth_index":"codex-1","adjustment":25}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	if provider.manualScoreRequest.AuthIndex != "codex-1" || provider.manualScoreRequest.Adjustment != 25 {
		t.Fatalf("unexpected manual score request: %+v", provider.manualScoreRequest)
	}
}
