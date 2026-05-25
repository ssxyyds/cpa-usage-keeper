package repository

import (
	"context"
	"math"
	"path/filepath"
	"testing"
	"time"

	"cpa-usage-keeper/internal/config"
	"cpa-usage-keeper/internal/entities"
	"cpa-usage-keeper/internal/repository/dto"
)

func TestAggregateUsageWindowCostsGroupsByAuthWindowAndCurrentPricing(t *testing.T) {
	db, err := OpenDatabase(config.Config{SQLitePath: filepath.Join(t.TempDir(), "usage-window-costs.db")})
	if err != nil {
		t.Fatalf("OpenDatabase returned error: %v", err)
	}
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err != nil {
			t.Fatalf("load sql db: %v", err)
		}
		if err := sqlDB.Close(); err != nil {
			t.Fatalf("close sql db: %v", err)
		}
	})
	if _, err := UpsertModelPriceSetting(db, dto.ModelPriceSettingInput{
		Model:                "priced-model",
		PromptPricePer1M:     2,
		CompletionPricePer1M: 10,
		CachePricePer1M:      0.5,
	}); err != nil {
		t.Fatalf("UpsertModelPriceSetting returned error: %v", err)
	}

	start := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)
	events := []entities.UsageEvent{
		{EventKey: "inside-priced", AuthType: "oauth", AuthIndex: "codex-1", Model: "priced-model", Timestamp: start.Add(time.Hour), InputTokens: 1_000_000, CachedTokens: 100_000, OutputTokens: 200_000, TotalTokens: 1_200_000},
		{EventKey: "before-window", AuthType: "oauth", AuthIndex: "codex-1", Model: "priced-model", Timestamp: start.Add(-time.Nanosecond), InputTokens: 1_000_000, TotalTokens: 1_000_000},
		{EventKey: "after-window", AuthType: "oauth", AuthIndex: "codex-1", Model: "priced-model", Timestamp: end.Add(time.Nanosecond), InputTokens: 1_000_000, TotalTokens: 1_000_000},
		{EventKey: "other-auth", AuthType: "oauth", AuthIndex: "codex-other", Model: "priced-model", Timestamp: start.Add(2 * time.Hour), InputTokens: 1_000_000, TotalTokens: 1_000_000},
		{EventKey: "inside-unpriced", AuthType: "oauth", AuthIndex: "codex-2", Model: "unpriced-model", Timestamp: start.Add(3 * time.Hour), InputTokens: 10_000, TotalTokens: 10_000},
	}
	if _, _, err := InsertUsageEvents(db, events); err != nil {
		t.Fatalf("InsertUsageEvents returned error: %v", err)
	}

	result, err := AggregateUsageWindowCosts(context.Background(), db, []dto.UsageWindowCostRequest{
		{Key: "weekly", AuthType: "oauth", AuthIndex: "codex-1", StartTime: start, EndTime: end},
		{Key: "weekly", AuthType: "oauth", AuthIndex: "codex-2", StartTime: start, EndTime: end},
	})
	if err != nil {
		t.Fatalf("AggregateUsageWindowCosts returned error: %v", err)
	}

	codex1 := result["weekly\x00oauth\x00codex-1"]
	if codex1.RequestCount != 1 || codex1.InputTokens != 1_000_000 || codex1.OutputTokens != 200_000 || codex1.CachedTokens != 100_000 || codex1.TotalTokens != 1_200_000 {
		t.Fatalf("unexpected codex-1 aggregate: %+v", codex1)
	}
	if math.Abs(codex1.TotalCost-3.85) > 0.000000001 {
		t.Fatalf("codex-1 TotalCost = %f, want 3.85", codex1.TotalCost)
	}
	if !codex1.CostAvailable || len(codex1.MissingModels) != 0 {
		t.Fatalf("codex-1 cost availability = %v missing=%v, want available with no missing models", codex1.CostAvailable, codex1.MissingModels)
	}

	codex2 := result["weekly\x00oauth\x00codex-2"]
	if codex2.RequestCount != 1 || codex2.InputTokens != 10_000 || codex2.TotalCost != 0 {
		t.Fatalf("unexpected codex-2 aggregate: %+v", codex2)
	}
	if codex2.CostAvailable || len(codex2.MissingModels) != 1 || codex2.MissingModels[0] != "unpriced-model" {
		t.Fatalf("codex-2 availability = %v missing=%v, want unavailable for unpriced-model", codex2.CostAvailable, codex2.MissingModels)
	}
}
