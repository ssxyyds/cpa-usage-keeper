package dto

import "time"

type UsageWindowCostRequest struct {
	Key       string
	AuthType  string
	AuthIndex string
	StartTime time.Time
	EndTime   time.Time
}

type UsageWindowCostRecord struct {
	Key           string
	AuthType      string
	AuthIndex     string
	StartTime     time.Time
	EndTime       time.Time
	RequestCount  int64
	InputTokens   int64
	OutputTokens  int64
	CachedTokens  int64
	TotalTokens   int64
	TotalCost     float64
	CostAvailable bool
	MissingModels []string
}
