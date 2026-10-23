package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// DaprSubscription describes a declarative Dapr pub/sub subscription.
// Dapr calls GET /dapr/subscribe on startup and then POSTs matching
// CloudEvents to the listed route.
type DaprSubscription struct {
	PubSubName string            `json:"pubsubname"`
	Topic      string            `json:"topic"`
	Route      string            `json:"route"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// EscrowEvent is the envelope published by the Python core
// (feature_integration.publish_feature_event) via Dapr pub/sub on Kafka.
type EscrowEvent struct {
	EventType     string                 `json:"event_type"`
	AggregateID   string                 `json:"aggregate_id"`
	AggregateType string                 `json:"aggregate_type"`
	UserID        string                 `json:"user_id,omitempty"`
	Payload       map[string]interface{} `json:"payload"`
}

// CloudEvent wraps the Dapr-delivered payload (Dapr wraps the published
// JSON in a CloudEvents envelope when rawPayload is not set).
type CloudEvent struct {
	ID    string      `json:"id"`
	Type  string      `json:"type"`
	Data  EscrowEvent `json:"data"`
	Topic string      `json:"topic"`
}

type EventsHandler struct{}

func NewEventsHandler() *EventsHandler { return &EventsHandler{} }

// Subscribe returns the declarative subscription list. escrow-go consumes
// multiparty escrow lifecycle events produced by the Python core so it can
// keep its own read model and notification pipeline in sync.
func (h *EventsHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]DaprSubscription{
		{
			PubSubName: "pubsub",
			Topic:      "neobank.escrow",
			Route:      "/events/escrow",
		},
	})
}

// HandleEscrowEvent processes escrow lifecycle events. Always returns 200
// (or 204) so Dapr does not retry; permanent failures are logged and the
// event remains queryable in OpenSearch / replayable from Kafka.
func (h *EventsHandler) HandleEscrowEvent(w http.ResponseWriter, r *http.Request) {
	var env CloudEvent
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		log.Printf("events: malformed cloud event: %v", err)
		w.WriteHeader(http.StatusNoContent) // drop poison messages
		return
	}

	ev := env.Data
	switch ev.EventType {
	case "MultipartyEscrowCreated":
		log.Printf("events: multiparty escrow created id=%s amount=%v currency=%v buyers=%v sellers=%v",
			ev.AggregateID, ev.Payload["total_amount"], ev.Payload["currency"],
			ev.Payload["num_buyers"], ev.Payload["num_sellers"])
	case "EscrowContributionFunded":
		log.Printf("events: contribution funded escrow=%s party=%v amount=%v all_funded=%v",
			ev.AggregateID, ev.Payload["party_id"], ev.Payload["amount"], ev.Payload["all_funded"])
	case "EscrowFundsDistributed":
		log.Printf("events: funds distributed escrow=%s sellers=%v net=%v fees=%v",
			ev.AggregateID, ev.Payload["num_sellers"],
			ev.Payload["total_net_distributed"], ev.Payload["total_fees"])
	case "EscrowExpiredAutoRefund":
		log.Printf("events: escrow expired, auto-refund escrow=%s refunds=%v total=%v",
			ev.AggregateID, ev.Payload["refunds"], ev.Payload["total_refunded"])
	default:
		log.Printf("events: unhandled escrow event type=%s id=%s", ev.EventType, ev.AggregateID)
	}

	w.WriteHeader(http.StatusOK)
}
