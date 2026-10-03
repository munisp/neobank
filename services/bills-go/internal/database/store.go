package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/bills-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetBillers(ctx context.Context) ([]*models.Biller, error)
	GetBillersByCategory(ctx context.Context, category models.BillCategory) ([]*models.Biller, error)
	GetBiller(ctx context.Context, id uuid.UUID) (*models.Biller, error)
	CreatePayment(ctx context.Context, payment *models.BillPayment) error
	GetPayment(ctx context.Context, id uuid.UUID) (*models.BillPayment, error)
	GetUserPayments(ctx context.Context, userID uuid.UUID) ([]*models.BillPayment, error)
	UpdatePayment(ctx context.Context, payment *models.BillPayment) error
	CreateSubscription(ctx context.Context, subscription *models.Subscription) error
	GetSubscription(ctx context.Context, id uuid.UUID) (*models.Subscription, error)
	GetUserSubscriptions(ctx context.Context, userID uuid.UUID) ([]*models.Subscription, error)
	UpdateSubscription(ctx context.Context, subscription *models.Subscription) error
	DeleteSubscription(ctx context.Context, id uuid.UUID) error
	CreateSavedBiller(ctx context.Context, savedBiller *models.SavedBiller) error
	GetUserSavedBillers(ctx context.Context, userID uuid.UUID) ([]*models.SavedBiller, error)
	DeleteSavedBiller(ctx context.Context, id uuid.UUID) error
	CreateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error
	GetScheduledPayment(ctx context.Context, id uuid.UUID) (*models.ScheduledPayment, error)
	GetUserScheduledPayments(ctx context.Context, userID uuid.UUID) ([]*models.ScheduledPayment, error)
	UpdateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error
	DeleteScheduledPayment(ctx context.Context, id uuid.UUID) error
	Close(ctx context.Context) error
}

// Compile-time conformance assertions.
var (
	_ Store = (*InMemoryDB)(nil)
	_ Store = (*PostgresDB)(nil)
)

// Close is a no-op for the in-memory store.
func (db *InMemoryDB) Close(ctx context.Context) error { return nil }

// NewStore selects the persistence backend. An empty databaseURL yields the
// in-memory store (dev/test only) plus an explanatory error for logging.
func NewStore(ctx context.Context, databaseURL string) (Store, error) {
	if databaseURL == "" {
		log.Println("WARNING: DATABASE_URL not set — using in-memory store; data will NOT persist")
		return NewInMemoryDB(), errors.New("DATABASE_URL not configured; using non-persistent in-memory store")
	}
	return NewPostgresDB(ctx, databaseURL)
}
