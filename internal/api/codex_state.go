package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"cpa-usage-keeper/internal/codexpool"
	"github.com/gin-gonic/gin"
)

type codexStateRefreshRequest struct {
	AuthIndexes []string `json:"auth_indexes"`
}

func registerCodexStateRoutes(router gin.IRoutes, provider CodexStateProvider) {
	router.GET("/codex-state", func(c *gin.Context) {
		if provider == nil {
			writeInternalError(c, "codex state provider is not configured", nil)
			return
		}
		payload, err := provider.FetchCodexState(c.Request.Context())
		if err != nil {
			writeInternalError(c, "codex state lookup failed", err)
			return
		}
		writeRawJSON(c, payload)
	})

	router.POST("/codex-state/refresh", func(c *gin.Context) {
		if provider == nil {
			writeInternalError(c, "codex state provider is not configured", nil)
			return
		}
		var request codexStateRefreshRequest
		if c.Request.Body != nil {
			_ = c.ShouldBindJSON(&request)
		}
		payload, err := provider.RefreshCodexState(c.Request.Context(), request.AuthIndexes)
		if err != nil {
			writeInternalError(c, "codex state refresh failed", err)
			return
		}
		writeRawJSON(c, payload)
	})

	router.POST("/codex-state/recalc", func(c *gin.Context) {
		if provider == nil {
			writeInternalError(c, "codex state provider is not configured", nil)
			return
		}
		payload, err := provider.RecalculateCodexState(c.Request.Context())
		if err != nil {
			writeInternalError(c, "codex state recalculation failed", err)
			return
		}
		writeRawJSON(c, payload)
	})

	router.PATCH("/codex-state/manual-score", func(c *gin.Context) {
		if provider == nil {
			writeInternalError(c, "codex state provider is not configured", nil)
			return
		}
		var request codexpool.ManualScoreRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "auth_index and adjustment are required"})
			return
		}
		if strings.TrimSpace(request.AuthIndex) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "auth_index is required"})
			return
		}
		payload, err := provider.UpdateCodexManualScore(c.Request.Context(), request)
		if err != nil {
			writeInternalError(c, "codex manual score update failed", err)
			return
		}
		writeRawJSON(c, payload)
	})
}

func writeRawJSON(c *gin.Context, payload json.RawMessage) {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
}
