package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/bnpl-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetPlans(ctx context.Context) ([]*models.BNPLPlan, error)
	GetPlan(ctx context.Context, id uuid.UUID) (*models.BNPLPlan, error)
	GetPlanByType(ctx context.Context, planType models.BNPLPlanType) (*models.BNPLPlan, error)
	CreatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error
	GetPurchase(ctx context.Context, id uuid.UUID) (*models.BNPLPurchase, error)
	GetUserPurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error)
	GetUserActivePurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error)
	UpdatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error
	GetUserLimit(ctx context.Context, userID uuid.UUID) (*models.BNPLLimit, error)
	CreateLimit(ctx context.Context, limit *models.BNPLLimit) error
	UpdateLimit(ctx context.Context, limit *models.BNPLLimit) error
	GetMerchants(ctx context.Context) ([]*models.BNPLMerchant, error)
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
