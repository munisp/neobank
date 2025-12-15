package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/segmentio/kafka-go"
)

type EventPublisher struct {
	writer  *kafka.Writer
	brokers []string
	enabled bool
}

type LakehouseEvent struct {
	EventType string                 `json:"event_type"`
	Timestamp time.Time              `json:"timestamp"`
	Payload   map[string]interface{} `json:"payload"`
}

var (
	defaultPublisher *EventPublisher
)

func NewEventPublisher(brokers []string) *EventPublisher {
	if len(brokers) == 0 {
		brokers = []string{os.Getenv("KAFKA_BROKERS")}
		if brokers[0] == "" {
			brokers = []string{"localhost:9092"}
		}
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}

	return &EventPublisher{
		writer:  writer,
		brokers: brokers,
		enabled: os.Getenv("KAFKA_ENABLED") != "false",
	}
}

func GetPublisher() *EventPublisher {
	if defaultPublisher == nil {
		defaultPublisher = NewEventPublisher(nil)
	}
	return defaultPublisher
}

func (p *EventPublisher) Close() error {
	if p.writer != nil {
		return p.writer.Close()
	}
	return nil
}

func (p *EventPublisher) publish(ctx context.Context, topic string, event LakehouseEvent) error {
	if !p.enabled {
		log.Printf("Kafka disabled, skipping event: %s", topic)
		return nil
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Value: data,
		Time:  time.Now(),
	}

	err = p.writer.WriteMessages(ctx, msg)
	if err != nil {
		log.Printf("Failed to publish to %s: %v", topic, err)
		return err
	}

	log.Printf("Published event to %s", topic)
	return nil
}

func (p *EventPublisher) PublishTransaction(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "transaction",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.transactions", event)
}

func (p *EventPublisher) PublishLoan(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "loan",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.loans", event)
}

func (p *EventPublisher) PublishCard(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "card",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.cards", event)
}

func (p *EventPublisher) PublishInvestment(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "investment",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.investments", event)
}

func (p *EventPublisher) PublishKYC(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "kyc",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.kyc", event)
}

func (p *EventPublisher) PublishInsurance(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "insurance",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.insurance", event)
}

func (p *EventPublisher) PublishSavings(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "savings",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.savings", event)
}

func (p *EventPublisher) PublishBill(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "bill",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.bills", event)
}

func (p *EventPublisher) PublishBNPL(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "bnpl",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.bnpl", event)
}

func (p *EventPublisher) PublishReward(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "reward",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.rewards", event)
}

func (p *EventPublisher) PublishTelecom(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "telecom",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.telecom", event)
}

func (p *EventPublisher) PublishFraud(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "fraud",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.fraud_events", event)
}

func (p *EventPublisher) PublishAccount(ctx context.Context, data map[string]interface{}) error {
	event := LakehouseEvent{
		EventType: "account",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"after": data,
		},
	}
	return p.publish(ctx, "postgres.neobank.accounts", event)
}
