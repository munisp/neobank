// Package batcher aggregates individual transfer requests into TigerBeetle
// protocol batches (up to 8189 per request), amortising round-trips.
//
// Why: a single TB client request carries a fixed network + syscall cost.
// Submitting transfers one-by-one caps a single client at ~5-10k TPS;
// batching at 10ms windows pushes the same client to 100k+ TPS.
package batcher

import (
	"context"
	"sync"
	"time"

	tb "github.com/tigerbeetle/tigerbeetle-go"
	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

type request struct {
	transfer tb_types.Transfer
	resultCh chan result
}

type result struct {
	index  uint32
	errMsg string
}

// Batcher collects transfers and flushes them on size or time triggers.
type Batcher struct {
	client     tb.Client
	window     time.Duration
	maxBatch   int
	mu         sync.Mutex
	pending    []request
	timer      *time.Timer
	flushCount uint64
}

func New(client tb.Client, window time.Duration, maxBatch int) *Batcher {
	if maxBatch <= 0 || maxBatch > 8189 {
		maxBatch = 8189 // TigerBeetle protocol maximum
	}
	return &Batcher{client: client, window: window, maxBatch: maxBatch}
}

// Submit enqueues a transfer and blocks until its batch completes.
func (b *Batcher) Submit(ctx context.Context, t tb_types.Transfer) (uint32, error) {
	req := request{transfer: t, resultCh: make(chan result, 1)}

	b.mu.Lock()
	b.pending = append(b.pending, req)
	full := len(b.pending) >= b.maxBatch
	if len(b.pending) == 1 && !full {
		b.timer = time.AfterFunc(b.window, b.flush)
	}
	if full {
		if b.timer != nil {
			b.timer.Stop()
		}
		go b.flush()
	}
	b.mu.Unlock()

	select {
	case r := <-req.resultCh:
		if r.errMsg != "" {
			return r.index, &TransferError{Msg: r.errMsg}
		}
		return r.index, nil
	case <-ctx.Done():
		return 0, ctx.Err()
	}
}

// TransferError reports a per-transfer TigerBeetle result code.
type TransferError struct{ Msg string }

func (e *TransferError) Error() string { return e.Msg }

func (b *Batcher) flush() {
	b.mu.Lock()
	batch := b.pending
	b.pending = nil
	b.mu.Unlock()
	if len(batch) == 0 {
		return
	}

	transfers := make([]tb_types.Transfer, len(batch))
	for i, r := range batch {
		transfers[i] = r.transfer
	}

	results, err := b.client.CreateTransfers(transfers)
	if err != nil {
		for _, r := range batch {
			r.resultCh <- result{errMsg: err.Error()}
		}
		return
	}
	// TigerBeetle returns only the FAILED entries (index + result code).
	failed := make(map[uint32]string, len(results))
	for _, res := range results {
		failed[res.Index] = res.Result.String()
	}
	for i, r := range batch {
		idx := uint32(i)
		if msg, bad := failed[idx]; bad {
			r.resultCh <- result{index: idx, errMsg: msg}
		} else {
			r.resultCh <- result{index: idx}
		}
	}
	b.flushCount++
}

// Close flushes and stops the batcher.
func (b *Batcher) Close() {
	if b.timer != nil {
		b.timer.Stop()
	}
	b.flush()
}
