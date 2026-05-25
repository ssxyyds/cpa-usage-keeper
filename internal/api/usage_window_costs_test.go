package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	repodto "cpa-usage-keeper/internal/repository/dto"
	servicedto "cpa-usage-keeper/internal/service/dto"
)

type usageWindowCostsStub struct {
	requests []servicedto.UsageWindowCostRequest
}

func (s *usageWindowCostsStub) GetUsageWithFilter(context.Context, servicedto.UsageFilter) (*repodto.StatisticsSnapshot, error) {
	return nil, nil
}

func (s *usageWindowCostsStub) GetUsageOverview(context.Context, servicedto.UsageFilter) (*servicedto.UsageOverviewSnapshot, error) {
	return nil, nil
}

func (s *usageWindowCostsStub) ListUsageEvents(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventsPage, error) {
	return nil, nil
}

func (s *usageWindowCostsStub) ListUsageEventFilterOptions(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventFilterOptions, error) {
	return nil, nil
}

func (s *usageWindowCostsStub) GetAnalysis(context.Context, servicedto.UsageFilter) (*servicedto.AnalysisSnapshot, error) {
	return nil, nil
}

func (s *usageWindowCostsStub) AggregateUsageWindowCosts(_ context.Context, requests []servicedto.UsageWindowCostRequest) ([]servicedto.UsageWindowCostRecord, error) {
	s.requests = requests
	return []servicedto.UsageWindowCostRecord{{
		Key:           requests[0].Key,
		AuthType:      requests[0].AuthType,
		AuthIndex:     requests[0].AuthIndex,
		StartTime:     requests[0].StartTime,
		EndTime:       requests[0].EndTime,
		RequestCount:  1,
		InputTokens:   1_000_000,
		OutputTokens:  200_000,
		CachedTokens:  100_000,
		TotalTokens:   1_200_000,
		TotalCost:     3.85,
		CostAvailable: true,
	}}, nil
}

func TestUsageWindowCostsRouteParsesWindowsAndReturnsAggregates(t *testing.T) {
	provider := &usageWindowCostsStub{}
	router := NewRouter(nil, nil, provider, nil, AuthConfig{}, nil, "")
	body := `{"windows":[{"key":"weekly","auth_type":"oauth","auth_index":"codex-1","start_time":"2026-05-18T00:00:00Z","end_time":"2026-05-25T00:00:00Z"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/usage/window-costs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", resp.Code, resp.Body.String())
	}
	if len(provider.requests) != 1 {
		t.Fatalf("requests = %+v, want one window", provider.requests)
	}
	if provider.requests[0].Key != "weekly" || provider.requests[0].AuthType != "oauth" || provider.requests[0].AuthIndex != "codex-1" {
		t.Fatalf("unexpected parsed request: %+v", provider.requests[0])
	}
	expectedStart := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, 5, 25, 0, 0, 0, 0, time.UTC)
	if !provider.requests[0].StartTime.Equal(expectedStart) || !provider.requests[0].EndTime.Equal(expectedEnd) {
		t.Fatalf("unexpected parsed times: %+v", provider.requests[0])
	}

	var payload struct {
		Windows []map[string]any `json:"windows"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Windows) != 1 || payload.Windows[0]["total_cost"] != 3.85 || payload.Windows[0]["cost_available"] != true {
		t.Fatalf("unexpected response body: %s", resp.Body.String())
	}
}
