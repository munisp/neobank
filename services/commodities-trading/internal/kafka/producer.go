package kafka

import (
	"context"
	"encoding/json"
	"os"
	"time"

	"github.com/segmentio/kafka-go"
)

// Producer handles Kafka message publishing for commodities events
type Producer struct {
	writer *kafka.Writer
}

// CommodityEvent represents an event to be published
type CommodityEvent struct {
	EventType   string      `json:"event_type"`
	Timestamp   time.Time   `json:"timestamp"`
	UserID      string      `json:"user_id,omitempty"`
	Symbol      string      `json:"symbol"`
	Data        interface{} `json:"data"`
}

// NewProducer creates a new Kafka producer
func NewProducer() *Producer {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokers),
		Topic:        "commodities-events",
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}

	return &Producer{writer: writer}
}

// PublishPriceUpdate publishes a price update event
func (p *Producer) PublishPriceUpdate(symbol string, price float64, change float64) error {
	event := CommodityEvent{
		EventType: "price_update",
		Timestamp: time.Now(),
		Symbol:    symbol,
		Data: map[string]interface{}{
			"price":  price,
			"change": change,
		},
	}
	return p.publish(event)
}

// PublishOrderCreated publishes an order created event
func (p *Producer) PublishOrderCreated(userID, orderID, symbol, side string, quantity, price float64) error {
	event := CommodityEvent{
		EventType: "order_created",
		Timestamp: time.Now(),
		UserID:    userID,
		Symbol:    symbol,
		Data: map[string]interface{}{
			"order_id": orderID,
			"side":     side,
			"quantity": quantity,
			"price":    price,
		},
	}
	return p.publish(event)
}

// PublishOrderFilled publishes an order filled event
func (p *Producer) PublishOrderFilled(userID, orderID, symbol string, quantity, fillPrice float64) error {
	event := CommodityEvent{
		EventType: "order_filled",
		Timestamp: time.Now(),
		UserID:    userID,
		Symbol:    symbol,
		Data: map[string]interface{}{
			"order_id":   orderID,
			"quantity":   quantity,
			"fill_price": fillPrice,
		},
	}
	return p.publish(event)
}

// PublishTradeSettled publishes a blockchain trade settlement event
func (p *Producer) PublishTradeSettled(userID, symbol, txHash string, amount float64) error {
	event := CommodityEvent{
		EventType: "trade_settled",
		Timestamp: time.Now(),
		UserID:    userID,
		Symbol:    symbol,
		Data: map[string]interface{}{
			"transaction_hash": txHash,
			"amount":           amount,
			"network":          "solana",
		},
	}
	return p.publish(event)
}

func (p *Producer) publish(event CommodityEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return p.writer.WriteMessages(context.Background(),
		kafka.Message{
			Key:   []byte(event.Symbol),
			Value: data,
		},
	)
}

// Close closes the Kafka writer
func (p *Producer) Close() error {
	return p.writer.Close()
}
