package database

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/analytics-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	CreateTransaction(ctx context.Context, tx *models.Transaction) error
	GetUserTransactions(ctx context.Context, userID uuid.UUID, startDate, endDate time.Time) ([]*models.Transaction, error)
	GetUserTransactionsByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory, startDate, endDate time.Time) ([]*models.Transaction, error)
	CreateBudget(ctx context.Context, budget *models.Budget) error
	GetBudget(ctx context.Context, id uuid.UUID) (*models.Budget, error)
	GetUserBudgets(ctx context.Context, userID uuid.UUID) ([]*models.Budget, error)
	GetUserBudgetByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory) (*models.Budget, error)
	UpdateBudget(ctx context.Context, budget *models.Budget) error
	DeleteBudget(ctx context.Context, id uuid.UUID) error
	CreateAlert(ctx context.Context, alert *models.BudgetAlert) error
	GetUserAlerts(ctx context.Context, userID uuid.UUID) ([]*models.BudgetAlert, error)
	MarkAlertRead(ctx context.Context, id uuid.UUID) error
	CreateInsight(ctx context.Context, insight *models.Insight) error
	GetUserInsights(ctx context.Context, userID uuid.UUID) ([]*models.Insight, error)
	MarkInsightRead(ctx context.Context, id uuid.UUID) error
	CreateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error
	GetUserRecurringTransactions(ctx context.Context, userID uuid.UUID) ([]*models.RecurringTransaction, error)
	UpdateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error
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
