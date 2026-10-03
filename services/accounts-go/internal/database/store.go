package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/accounts-service/internal/models"
)

// Store is the persistence contract for the accounts service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	CreateAccount(ctx context.Context, account *models.Account) error
	GetAccount(ctx context.Context, id uuid.UUID) (*models.Account, error)
	GetUserAccounts(ctx context.Context, userID uuid.UUID) ([]*models.Account, error)
	GetUserAccountsByType(ctx context.Context, userID uuid.UUID, accountType models.AccountType) ([]*models.Account, error)
	GetKidsAccountsByParent(ctx context.Context, parentID uuid.UUID) ([]*models.Account, error)
	UpdateAccount(ctx context.Context, account *models.Account) error
	DeleteAccount(ctx context.Context, id uuid.UUID) error
	CreateInvitation(ctx context.Context, invitation *models.AccountInvitation) error
	GetInvitation(ctx context.Context, id uuid.UUID) (*models.AccountInvitation, error)
	GetInvitationsByEmail(ctx context.Context, email string) ([]*models.AccountInvitation, error)
	GetAccountInvitations(ctx context.Context, accountID uuid.UUID) ([]*models.AccountInvitation, error)
	UpdateInvitation(ctx context.Context, invitation *models.AccountInvitation) error
	CreateSpendingControl(ctx context.Context, control *models.SpendingControl) error
	GetAccountSpendingControls(ctx context.Context, accountID uuid.UUID) ([]*models.SpendingControl, error)
	UpdateSpendingControl(ctx context.Context, control *models.SpendingControl) error
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
