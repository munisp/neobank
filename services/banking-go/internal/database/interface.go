package database

import (
	"context"

	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/models"
)

// Database defines the interface for database operations
// Both InMemoryDB (for testing) and PostgresDB (for production) implement this interface
type Database interface {
	// Loan operations
	CreateLoan(ctx context.Context, loan *models.LoanApplication) error
	GetLoan(ctx context.Context, id uuid.UUID) (*models.LoanApplication, error)
	GetLoansByUser(ctx context.Context, userID uuid.UUID) ([]*models.LoanApplication, error)
	UpdateLoan(ctx context.Context, loan *models.LoanApplication) error
	CreateLoanRepayments(ctx context.Context, loanID uuid.UUID, repayments []*models.LoanRepayment) error
	GetLoanRepayments(ctx context.Context, loanID uuid.UUID) ([]*models.LoanRepayment, error)
	UpdateLoanRepayment(ctx context.Context, repayment *models.LoanRepayment) error
	GetLoanSummary(ctx context.Context, userID uuid.UUID) (*models.LoanSummary, error)

	// Card operations
	CreateCard(ctx context.Context, card *models.Card) error
	GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error)
	GetCardsByUser(ctx context.Context, userID uuid.UUID) ([]*models.Card, error)
	UpdateCard(ctx context.Context, card *models.Card) error
	CreateCardTransaction(ctx context.Context, tx *models.CardTransaction) error
	GetCardTransactions(ctx context.Context, cardID uuid.UUID) ([]*models.CardTransaction, error)

	// Compliance operations
	CreateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error
	GetComplianceCheck(ctx context.Context, id uuid.UUID) (*models.ComplianceCheck, error)
	GetComplianceChecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceCheck, error)
	UpdateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error
	CreateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error
	GetComplianceAlert(ctx context.Context, id uuid.UUID) (*models.ComplianceAlert, error)
	GetComplianceAlertsByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceAlert, error)
	UpdateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error
	GetOpenAlertCount(ctx context.Context, userID uuid.UUID) (int, error)
}

// TwoFactorDatabase extends Database with 2FA operations
type TwoFactorDatabase interface {
	Database
	SaveTwoFactorSecret(ctx context.Context, userID uuid.UUID, secret string) error
	GetTwoFactorSecret(ctx context.Context, userID uuid.UUID) (string, error)
	EnableTwoFactor(ctx context.Context, userID uuid.UUID) error
	DisableTwoFactor(ctx context.Context, userID uuid.UUID) error
}
