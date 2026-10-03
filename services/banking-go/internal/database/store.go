package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	CreateLoan(ctx context.Context, loan *models.LoanApplication) error
	GetLoan(ctx context.Context, id uuid.UUID) (*models.LoanApplication, error)
	GetLoansByUser(ctx context.Context, userID uuid.UUID) ([]*models.LoanApplication, error)
	UpdateLoan(ctx context.Context, loan *models.LoanApplication) error
	CreateLoanRepayments(ctx context.Context, loanID uuid.UUID, repayments []*models.LoanRepayment) error
	GetLoanRepayments(ctx context.Context, loanID uuid.UUID) ([]*models.LoanRepayment, error)
	UpdateLoanRepayment(ctx context.Context, repayment *models.LoanRepayment) error
	CreateCard(ctx context.Context, card *models.Card) error
	GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error)
	GetCardsByUser(ctx context.Context, userID uuid.UUID) ([]*models.Card, error)
	UpdateCard(ctx context.Context, card *models.Card) error
	CreateCardTransaction(ctx context.Context, tx *models.CardTransaction) error
	GetCardTransactions(ctx context.Context, cardID uuid.UUID) ([]*models.CardTransaction, error)
	CreateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error
	GetComplianceCheck(ctx context.Context, id uuid.UUID) (*models.ComplianceCheck, error)
	GetComplianceChecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceCheck, error)
	UpdateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error
	CreateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error
	GetComplianceAlert(ctx context.Context, id uuid.UUID) (*models.ComplianceAlert, error)
	GetComplianceAlertsByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceAlert, error)
	UpdateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error
	GetOpenAlertCount(ctx context.Context, userID uuid.UUID) (int, error)
	GetLoanSummary(ctx context.Context, userID uuid.UUID) (*models.LoanSummary, error)
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
