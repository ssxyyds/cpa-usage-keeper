package cpa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cpa-usage-keeper/internal/codexpool"
)

func TestFetchCodexStateUsesManagementEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != cpaManagementCodexStateEndpoint {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer management-secret" {
			t.Fatalf("expected management Authorization header, got %q", got)
		}
		_, _ = w.Write([]byte(`{"summary":{"weekly":{"remaining":42}}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "management-secret", 2*time.Second, false)
	payload, err := client.FetchCodexState(context.Background())
	if err != nil {
		t.Fatalf("FetchCodexState returned error: %v", err)
	}
	if string(payload) != `{"summary":{"weekly":{"remaining":42}}}` {
		t.Fatalf("unexpected codex state payload: %s", payload)
	}
}

func TestRefreshCodexStatePostsAuthIndexes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != cpaManagementCodexStateRefreshEndpoint {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body map[string][]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if got := body["auth_indexes"]; len(got) != 2 || got[0] != "codex-1" || got[1] != "codex-2" {
			t.Fatalf("unexpected refresh body: %#v", body)
		}
		_, _ = w.Write([]byte(`{"accepted":2}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "management-secret", 2*time.Second, false)
	payload, err := client.RefreshCodexState(context.Background(), []string{"codex-1", "codex-2"})
	if err != nil {
		t.Fatalf("RefreshCodexState returned error: %v", err)
	}
	if string(payload) != `{"accepted":2}` {
		t.Fatalf("unexpected refresh payload: %s", payload)
	}
}

func TestRefreshCodexStatePostsAllWhenAuthIndexesEmpty(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != cpaManagementCodexStateRefreshEndpoint {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body map[string]bool
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if !body["all"] {
			t.Fatalf("expected all refresh body, got %#v", body)
		}
		_, _ = w.Write([]byte(`{"accepted":true}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "management-secret", 2*time.Second, false)
	payload, err := client.RefreshCodexState(context.Background(), nil)
	if err != nil {
		t.Fatalf("RefreshCodexState returned error: %v", err)
	}
	if string(payload) != `{"accepted":true}` {
		t.Fatalf("unexpected refresh payload: %s", payload)
	}
}

func TestUpdateCodexManualScoreUsesPatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.Path != cpaManagementCodexManualScoreEndpoint {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body codexpool.ManualScoreRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body.AuthIndex != "codex-1" || body.Adjustment != 15 {
			t.Fatalf("unexpected manual score body: %+v", body)
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "management-secret", 2*time.Second, false)
	payload, err := client.UpdateCodexManualScore(context.Background(), codexpool.ManualScoreRequest{AuthIndex: "codex-1", Adjustment: 15})
	if err != nil {
		t.Fatalf("UpdateCodexManualScore returned error: %v", err)
	}
	if string(payload) != `{"ok":true}` {
		t.Fatalf("unexpected manual score payload: %s", payload)
	}
}
