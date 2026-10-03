// ledger-gateway: high-throughput HTTP front for TigerBeetle.
//
// Accepts single or batched transfer requests over HTTP/JSON, aggregates
// them into TigerBeetle protocol batches (10ms window / 8189 max), and
// returns per-transfer results. This is the service that lets the Python
// backend reach 100k+ ledger TPS without each request paying a full
// TigerBeetle round-trip.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	tb "github.com/tigerbeetle/tigerbeetle-go"
	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"

	"github.com/munisp/neobank/ledger-gateway/internal/batcher"
)

type transferIn struct {
	ID              string `json:"id"` // hex uint128; empty = server generates
	DebitAccountID  string `json:"debit_account_id"`
	CreditAccountID string `json:"credit_account_id"`
	Amount          uint64 `json:"amount"`
	Ledger          uint32 `json:"ledger"`
	Code            uint16 `json:"code"`
	UserData64      uint64 `json:"user_data_64"`
}

type batchRequest struct {
	Transfers []transferIn `json:"transfers"`
}

type transferOut struct {
	Index int    `json:"index"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

var batch *batcher.Batcher

func parseUint128(s string) (tb_types.Uint128, error) {
	if s == "" {
		return tb_types.ID(), nil
	}
	return tb_types.HexStringToUint128(s)
}

func handleTransfers(w http.ResponseWriter, r *http.Request) {
	var req batchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
		return
	}
	if len(req.Transfers) == 0 || len(req.Transfers) > 8189 {
		http.Error(w, `{"error":"batch size 1..8189"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	outs := make([]transferOut, len(req.Transfers))
	type pendingRes struct {
		idx int
		id  tb_types.Uint128
	}
	for i, t := range req.Transfers {
		id, err := parseUint128(t.ID)
		if err != nil {
			outs[i] = transferOut{Index: i, Error: "bad id"}
			continue
		}
		debit, err1 := parseUint128(t.DebitAccountID)
		credit, err2 := parseUint128(t.CreditAccountID)
		if err1 != nil || err2 != nil {
			outs[i] = transferOut{Index: i, Error: "bad account id"}
			continue
		}
		_, err = batch.Submit(ctx, tb_types.Transfer{
			ID:              id,
			DebitAccountID:  debit,
			CreditAccountID: credit,
			Amount:          tb_types.ToUint128(t.Amount),
			Ledger:          t.Ledger,
			Code:            t.Code,
			UserData64:      t.UserData64,
		})
		if err != nil {
			outs[i] = transferOut{Index: i, Error: err.Error()}
		} else {
			outs[i] = transferOut{Index: i, OK: true}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"results": outs})
}

func main() {
	clusterID := tb_types.ToUint128(0)
	if v := os.Getenv("TB_CLUSTER_ID"); v != "" {
		if parsed, err := tb_types.HexStringToUint128(v); err == nil {
			clusterID = parsed
		}
	}
	addresses := []string{getEnv("TB_ADDRESSES", "127.0.0.1:3000")}

	client, err := tb.NewClient(clusterID, addresses)
	if err != nil {
		log.Fatalf("tigerbeetle connect: %v", err)
	}
	defer client.Close()

	batch = batcher.New(client, 10*time.Millisecond, 8189)
	defer batch.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/transfers", handleTransfers)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{
		Addr:              ":" + getEnv("PORT", "8090"),
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}
	log.Printf("ledger-gateway listening on %s (batch window 10ms, max 8189)", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}

func getEnv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
