package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/neobank/savings-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetInterestTiers() []models.InterestTier
	GetInterestRateForBalance(balance decimal.Decimal) decimal.Decimal
	CreateVault(ctx context.Context, vault *models.Vault) error
	GetVault(ctx context.Context, id uuid.UUID) (*models.Vault, error)
	GetUserVaults(ctx context.Context, userID uuid.UUID) ([]*models.Vault, error)
	GetUserVaultsByType(ctx context.Context, userID uuid.UUID, vaultType models.VaultType) ([]*models.Vault, error)
	UpdateVault(ctx context.Context, vault *models.Vault) error
	DeleteVault(ctx context.Context, id uuid.UUID) error
	CreateVaultTransaction(ctx context.Context, txn *models.VaultTransaction) error
	GetVaultTransactions(ctx context.Context, vaultID uuid.UUID) ([]*models.VaultTransaction, error)
	CreateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error
	GetFlexibleSavings(ctx context.Context, id uuid.UUID) (*models.FlexibleSavings, error)
	GetUserFlexibleSavings(ctx context.Context, userID uuid.UUID) (*models.FlexibleSavings, error)
	UpdateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error
	CreateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error
	GetFixedDeposit(ctx context.Context, id uuid.UUID) (*models.FixedDeposit, error)
	GetUserFixedDeposits(ctx context.Context, userID uuid.UUID) ([]*models.FixedDeposit, error)
	UpdateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error
	CreateGroupSavings(ctx context.Context, group *models.GroupSavings) error
	GetGroupSavings(ctx context.Context, id uuid.UUID) (*models.GroupSavings, error)
	GetAllGroupSavings(ctx context.Context) ([]*models.GroupSavings, error)
	GetUserGroupSavings(ctx context.Context, userID uuid.UUID) ([]*models.GroupSavings, error)
	UpdateGroupSavings(ctx context.Context, group *models.GroupSavings) error
	CreateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error
	GetSalaryAdvance(ctx context.Context, id uuid.UUID) (*models.SalaryAdvance, error)
	GetUserSalaryAdvances(ctx context.Context, userID uuid.UUID) ([]*models.SalaryAdvance, error)
	GetUserActiveSalaryAdvance(ctx context.Context, userID uuid.UUID) (*models.SalaryAdvance, error)
	UpdateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error
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
