package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/insurance-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetProducts(ctx context.Context, insuranceType models.InsuranceType) ([]*models.InsuranceProduct, error)
	GetProduct(ctx context.Context, id uuid.UUID) (*models.InsuranceProduct, error)
	CreatePolicy(ctx context.Context, policy *models.InsurancePolicy) error
	GetPolicy(ctx context.Context, id uuid.UUID) (*models.InsurancePolicy, error)
	GetUserPolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error)
	GetUserActivePolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error)
	UpdatePolicy(ctx context.Context, policy *models.InsurancePolicy) error
	CreateClaim(ctx context.Context, claim *models.InsuranceClaim) error
	GetClaim(ctx context.Context, id uuid.UUID) (*models.InsuranceClaim, error)
	GetUserClaims(ctx context.Context, userID uuid.UUID) ([]*models.InsuranceClaim, error)
	GetPolicyClaims(ctx context.Context, policyID uuid.UUID) ([]*models.InsuranceClaim, error)
	UpdateClaim(ctx context.Context, claim *models.InsuranceClaim) error
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
