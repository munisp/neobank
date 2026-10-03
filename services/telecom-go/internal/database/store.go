package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/telecom-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetNetworks(ctx context.Context) ([]*models.Network, error)
	GetNetworksByCountry(ctx context.Context, country string) ([]*models.Network, error)
	GetNetwork(ctx context.Context, id uuid.UUID) (*models.Network, error)
	GetNetworkByPrefix(ctx context.Context, prefix string) (*models.Network, error)
	GetDataPlans(ctx context.Context, networkID uuid.UUID) ([]*models.DataPlan, error)
	GetDataPlan(ctx context.Context, id uuid.UUID) (*models.DataPlan, error)
	GetESIMPlans(ctx context.Context) ([]*models.ESIMPlan, error)
	GetESIMPlansByRegion(ctx context.Context, region string) ([]*models.ESIMPlan, error)
	GetESIMPlan(ctx context.Context, id uuid.UUID) (*models.ESIMPlan, error)
	CreateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error
	GetUserAirtimeTransactions(ctx context.Context, userID uuid.UUID) ([]*models.AirtimeTransaction, error)
	UpdateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error
	CreateDataTransaction(ctx context.Context, txn *models.DataTransaction) error
	GetUserDataTransactions(ctx context.Context, userID uuid.UUID) ([]*models.DataTransaction, error)
	UpdateDataTransaction(ctx context.Context, txn *models.DataTransaction) error
	CreateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error
	GetESIMPurchase(ctx context.Context, id uuid.UUID) (*models.ESIMPurchase, error)
	GetUserESIMPurchases(ctx context.Context, userID uuid.UUID) ([]*models.ESIMPurchase, error)
	UpdateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error
	CreateBeneficiary(ctx context.Context, beneficiary *models.SavedBeneficiary) error
	GetUserBeneficiaries(ctx context.Context, userID uuid.UUID) ([]*models.SavedBeneficiary, error)
	DeleteBeneficiary(ctx context.Context, id uuid.UUID) error
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
