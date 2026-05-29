package repository

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"cpa-usage-keeper/internal/entities"
	"cpa-usage-keeper/internal/helper"
	"cpa-usage-keeper/internal/repository/dto"
	"cpa-usage-keeper/internal/timeutil"
	"gorm.io/gorm"
)

func AggregateUsageWindowCosts(ctx context.Context, db *gorm.DB, requests []dto.UsageWindowCostRequest) (map[string]dto.UsageWindowCostRecord, error) {
	if db == nil {
		return nil, fmt.Errorf("database is nil")
	}
	normalized := normalizeUsageWindowCostRequests(requests)
	result := make(map[string]dto.UsageWindowCostRecord, len(normalized))
	if len(normalized) == 0 {
		return result, nil
	}
	for _, request := range normalized {
		result[usageWindowCostKey(request.Key, request.AuthType, request.AuthIndex)] = dto.UsageWindowCostRecord{
			Key:           request.Key,
			AuthType:      request.AuthType,
			AuthIndex:     request.AuthIndex,
			StartTime:     request.StartTime,
			EndTime:       request.EndTime,
			CostAvailable: true,
		}
	}

	pricingByModel, err := loadPriceSettingsByModel(db.WithContext(ctx))
	if err != nil {
		return nil, fmt.Errorf("load usage window pricing: %w", err)
	}
	events, err := loadUsageWindowCostEvents(ctx, db, normalized)
	if err != nil {
		return nil, err
	}

	missingModelsByKey := map[string]map[string]struct{}{}
	for _, event := range events {
		eventTime := timeutil.NormalizeStorageTime(event.Timestamp)
		for _, request := range normalized {
			if event.AuthType != request.AuthType || event.AuthIndex != request.AuthIndex {
				continue
			}
			if eventTime.Before(request.StartTime) || eventTime.After(request.EndTime) {
				continue
			}
			key := usageWindowCostKey(request.Key, request.AuthType, request.AuthIndex)
			record := result[key]
			record.RequestCount++
			record.InputTokens += event.InputTokens
			record.OutputTokens += event.OutputTokens
			record.CachedTokens += event.CachedTokens
			record.TotalTokens += event.TotalTokens
			model := strings.TrimSpace(event.Model)
			pricing, ok := pricingByModel[model]
			if !ok && helper.UsageEventRequiresPricing(event) {
				record.CostAvailable = false
				if _, exists := missingModelsByKey[key]; !exists {
					missingModelsByKey[key] = map[string]struct{}{}
				}
				missingModelsByKey[key][model] = struct{}{}
			} else {
				record.TotalCost += helper.CalculateUsageEventCost(event, pricing)
			}
			result[key] = record
		}
	}
	for key, models := range missingModelsByKey {
		record := result[key]
		record.MissingModels = sortedUsageWindowMissingModels(models)
		result[key] = record
	}
	return result, nil
}

func normalizeUsageWindowCostRequests(requests []dto.UsageWindowCostRequest) []dto.UsageWindowCostRequest {
	seen := map[string]struct{}{}
	normalized := make([]dto.UsageWindowCostRequest, 0, len(requests))
	for _, request := range requests {
		request.Key = strings.TrimSpace(request.Key)
		request.AuthType = strings.ToLower(strings.TrimSpace(request.AuthType))
		request.AuthIndex = strings.TrimSpace(request.AuthIndex)
		request.StartTime = timeutil.NormalizeStorageTime(request.StartTime)
		request.EndTime = timeutil.NormalizeStorageTime(request.EndTime)
		if request.Key == "" || request.AuthType == "" || request.AuthIndex == "" || request.StartTime.IsZero() || request.EndTime.IsZero() || request.EndTime.Before(request.StartTime) {
			continue
		}
		key := usageWindowCostKey(request.Key, request.AuthType, request.AuthIndex)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, request)
	}
	return normalized
}

func loadUsageWindowCostEvents(ctx context.Context, db *gorm.DB, requests []dto.UsageWindowCostRequest) ([]entities.UsageEvent, error) {
	authTypes := make([]string, 0, len(requests))
	authIndexes := make([]string, 0, len(requests))
	authTypeSeen := map[string]struct{}{}
	authIndexSeen := map[string]struct{}{}
	minStart := requests[0].StartTime
	maxEnd := requests[0].EndTime
	for _, request := range requests {
		if request.StartTime.Before(minStart) {
			minStart = request.StartTime
		}
		if request.EndTime.After(maxEnd) {
			maxEnd = request.EndTime
		}
		if _, exists := authTypeSeen[request.AuthType]; !exists {
			authTypeSeen[request.AuthType] = struct{}{}
			authTypes = append(authTypes, request.AuthType)
		}
		if _, exists := authIndexSeen[request.AuthIndex]; !exists {
			authIndexSeen[request.AuthIndex] = struct{}{}
			authIndexes = append(authIndexes, request.AuthIndex)
		}
	}

	var rows []usageEventProjection
	if err := db.WithContext(ctx).Model(&entities.UsageEvent{}).
		Select(usageEventProjectionColumns).
		Where("timestamp >= ? AND timestamp <= ?", timeutil.FormatStorageTime(minStart), timeutil.FormatStorageTime(maxEnd)).
		Where("auth_type IN ? AND auth_index IN ?", authTypes, authIndexes).
		Order("timestamp asc").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("load usage window cost events: %w", err)
	}
	events := make([]entities.UsageEvent, 0, len(rows))
	for _, row := range rows {
		events = append(events, usageEventProjectionToEntity(row))
	}
	return events, nil
}

func sortedUsageWindowMissingModels(models map[string]struct{}) []string {
	result := make([]string, 0, len(models))
	for model := range models {
		if strings.TrimSpace(model) == "" {
			continue
		}
		result = append(result, model)
	}
	sort.Strings(result)
	return result
}

func usageWindowCostKey(key, authType, authIndex string) string {
	return strings.TrimSpace(key) + "\x00" + strings.ToLower(strings.TrimSpace(authType)) + "\x00" + strings.TrimSpace(authIndex)
}
