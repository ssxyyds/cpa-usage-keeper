package api

import (
	"net/http"
	"strings"
	"time"

	"cpa-usage-keeper/internal/service"
	servicedto "cpa-usage-keeper/internal/service/dto"
	"github.com/gin-gonic/gin"
)

const maxUsageWindowCostWindows = 500

type usageWindowCostsRequest struct {
	Windows []usageWindowCostRequest `json:"windows"`
}

type usageWindowCostRequest struct {
	Key       string    `json:"key"`
	AuthType  string    `json:"auth_type"`
	AuthIndex string    `json:"auth_index"`
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
}

type usageWindowCostsResponse struct {
	Windows []usageWindowCostResponse `json:"windows"`
}

type usageWindowCostResponse struct {
	Key           string    `json:"key"`
	AuthType      string    `json:"auth_type"`
	AuthIndex     string    `json:"auth_index"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	RequestCount  int64     `json:"request_count"`
	InputTokens   int64     `json:"input_tokens"`
	OutputTokens  int64     `json:"output_tokens"`
	CachedTokens  int64     `json:"cached_tokens"`
	TotalTokens   int64     `json:"total_tokens"`
	TotalCost     float64   `json:"total_cost"`
	CostAvailable bool      `json:"cost_available"`
	MissingModels []string  `json:"missing_models"`
}

func registerUsageWindowCostRoutes(router gin.IRoutes, usageProvider service.UsageProvider) {
	router.POST("/usage/window-costs", func(c *gin.Context) {
		if usageProvider == nil {
			c.JSON(http.StatusOK, usageWindowCostsResponse{Windows: []usageWindowCostResponse{}})
			return
		}
		var request usageWindowCostsRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid usage window costs request"})
			return
		}
		windows, ok := parseUsageWindowCostRequests(c, request.Windows)
		if !ok {
			return
		}
		records, err := usageProvider.AggregateUsageWindowCosts(c.Request.Context(), windows)
		if err != nil {
			writeInternalError(c, "aggregate usage window costs failed", err)
			return
		}
		response := make([]usageWindowCostResponse, 0, len(records))
		for _, record := range records {
			response = append(response, mapUsageWindowCostResponse(record))
		}
		c.JSON(http.StatusOK, usageWindowCostsResponse{Windows: response})
	})
}

func parseUsageWindowCostRequests(c *gin.Context, windows []usageWindowCostRequest) ([]servicedto.UsageWindowCostRequest, bool) {
	if len(windows) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "windows are required"})
		return nil, false
	}
	if len(windows) > maxUsageWindowCostWindows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many windows"})
		return nil, false
	}
	result := make([]servicedto.UsageWindowCostRequest, 0, len(windows))
	for _, window := range windows {
		key := strings.TrimSpace(window.Key)
		authType := strings.ToLower(strings.TrimSpace(window.AuthType))
		authIndex := strings.TrimSpace(window.AuthIndex)
		if key == "" || authType == "" || authIndex == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "window key, auth_type, and auth_index are required"})
			return nil, false
		}
		if window.StartTime.IsZero() || window.EndTime.IsZero() || window.EndTime.Before(window.StartTime) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "window start_time must be before end_time"})
			return nil, false
		}
		result = append(result, servicedto.UsageWindowCostRequest{
			Key:       key,
			AuthType:  authType,
			AuthIndex: authIndex,
			StartTime: window.StartTime,
			EndTime:   window.EndTime,
		})
	}
	return result, true
}

func mapUsageWindowCostResponse(record servicedto.UsageWindowCostRecord) usageWindowCostResponse {
	missingModels := record.MissingModels
	if missingModels == nil {
		missingModels = []string{}
	}
	return usageWindowCostResponse{
		Key:           record.Key,
		AuthType:      record.AuthType,
		AuthIndex:     record.AuthIndex,
		StartTime:     record.StartTime,
		EndTime:       record.EndTime,
		RequestCount:  record.RequestCount,
		InputTokens:   record.InputTokens,
		OutputTokens:  record.OutputTokens,
		CachedTokens:  record.CachedTokens,
		TotalTokens:   record.TotalTokens,
		TotalCost:     record.TotalCost,
		CostAvailable: record.CostAvailable,
		MissingModels: missingModels,
	}
}
