package database

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/models"
	"github.com/shopspring/decimal"
)

// InMemoryDB provides an in-memory database for development/testing
type InMemoryDB struct {
	mu                sync.RWMutex
	loans             map[uuid.UUID]*models.LoanApplication
	loanRepayments    map[uuid.UUID][]*models.LoanRepayment
	cards             map[uuid.UUID]*models.Card
	cardTransactions  map[uuid.UUID][]*models.CardTransaction
	complianceChecks  map[uuid.UUID]*models.ComplianceCheck
	complianceAlerts  map[uuid.UUID]*models.ComplianceAlert
	transactionMonitoring map[uuid.UUID]*models.TransactionMonitoring
}

// NewInMemoryDB creates a new in-memory database
func NewInMemoryDB() *InMemoryDB {
	return &InMemoryDB{
		loans:             make(map[uuid.UUID]*models.LoanApplication),
		loanRepayments:    make(map[uuid.UUID][]*models.LoanRepayment),
		cards:             make(map[uuid.UUID]*models.Card),
		cardTransactions:  make(map[uuid.UUID][]*models.CardTransaction),
		complianceChecks:  make(map[uuid.UUID]*models.ComplianceCheck),
		complianceAlerts:  make(map[uuid.UUID]*models.ComplianceAlert),
		transactionMonitoring: make(map[uuid.UUID]*models.TransactionMonitoring),
	}
}

// Loan operations

func (db *InMemoryDB) CreateLoan(ctx context.Context, loan *models.LoanApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	loan.ID = uuid.New()
	loan.CreatedAt = time.Now()
	loan.UpdatedAt = time.Now()
	db.loans[loan.ID] = loan
	return nil
}

func (db *InMemoryDB) GetLoan(ctx context.Context, id uuid.UUID) (*models.LoanApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if loan, ok := db.loans[id]; ok {
		return loan, nil
	}
	return nil, ErrNotFound
}

func (db *InMemoryDB) GetLoansByUser(ctx context.Context, userID uuid.UUID) ([]*models.LoanApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var loans []*models.LoanApplication
	for _, loan := range db.loans {
		if loan.UserID == userID {
			loans = append(loans, loan)
		}
	}
	return loans, nil
}

func (db *InMemoryDB) UpdateLoan(ctx context.Context, loan *models.LoanApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.loans[loan.ID]; !ok {
		return ErrNotFound
	}
	loan.UpdatedAt = time.Now()
	db.loans[loan.ID] = loan
	return nil
}

func (db *InMemoryDB) CreateLoanRepayments(ctx context.Context, loanID uuid.UUID, repayments []*models.LoanRepayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	db.loanRepayments[loanID] = repayments
	return nil
}

func (db *InMemoryDB) GetLoanRepayments(ctx context.Context, loanID uuid.UUID) ([]*models.LoanRepayment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if repayments, ok := db.loanRepayments[loanID]; ok {
		return repayments, nil
	}
	return []*models.LoanRepayment{}, nil
}

func (db *InMemoryDB) UpdateLoanRepayment(ctx context.Context, repayment *models.LoanRepayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	repayments, ok := db.loanRepayments[repayment.LoanID]
	if !ok {
		return ErrNotFound
	}

	for i, r := range repayments {
		if r.ID == repayment.ID {
			repayments[i] = repayment
			return nil
		}
	}
	return ErrNotFound
}

// Card operations

func (db *InMemoryDB) CreateCard(ctx context.Context, card *models.Card) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	card.ID = uuid.New()
	card.CreatedAt = time.Now()
	card.UpdatedAt = time.Now()
	db.cards[card.ID] = card
	return nil
}

func (db *InMemoryDB) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if card, ok := db.cards[id]; ok {
		return card, nil
	}
	return nil, ErrNotFound
}

func (db *InMemoryDB) GetCardsByUser(ctx context.Context, userID uuid.UUID) ([]*models.Card, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var cards []*models.Card
	for _, card := range db.cards {
		if card.UserID == userID {
			cards = append(cards, card)
		}
	}
	return cards, nil
}

func (db *InMemoryDB) UpdateCard(ctx context.Context, card *models.Card) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.cards[card.ID]; !ok {
		return ErrNotFound
	}
	card.UpdatedAt = time.Now()
	db.cards[card.ID] = card
	return nil
}

func (db *InMemoryDB) CreateCardTransaction(ctx context.Context, tx *models.CardTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	tx.ID = uuid.New()
	tx.CreatedAt = time.Now()
	db.cardTransactions[tx.CardID] = append(db.cardTransactions[tx.CardID], tx)
	return nil
}

func (db *InMemoryDB) GetCardTransactions(ctx context.Context, cardID uuid.UUID) ([]*models.CardTransaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if txs, ok := db.cardTransactions[cardID]; ok {
		return txs, nil
	}
	return []*models.CardTransaction{}, nil
}

// Compliance operations

func (db *InMemoryDB) CreateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	check.ID = uuid.New()
	check.CreatedAt = time.Now()
	check.UpdatedAt = time.Now()
	db.complianceChecks[check.ID] = check
	return nil
}

func (db *InMemoryDB) GetComplianceCheck(ctx context.Context, id uuid.UUID) (*models.ComplianceCheck, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if check, ok := db.complianceChecks[id]; ok {
		return check, nil
	}
	return nil, ErrNotFound
}

func (db *InMemoryDB) GetComplianceChecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceCheck, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var checks []*models.ComplianceCheck
	for _, check := range db.complianceChecks {
		if check.UserID == userID {
			checks = append(checks, check)
		}
	}
	return checks, nil
}

func (db *InMemoryDB) UpdateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.complianceChecks[check.ID]; !ok {
		return ErrNotFound
	}
	check.UpdatedAt = time.Now()
	db.complianceChecks[check.ID] = check
	return nil
}

func (db *InMemoryDB) CreateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	alert.ID = uuid.New()
	alert.CreatedAt = time.Now()
	alert.UpdatedAt = time.Now()
	db.complianceAlerts[alert.ID] = alert
	return nil
}

func (db *InMemoryDB) GetComplianceAlert(ctx context.Context, id uuid.UUID) (*models.ComplianceAlert, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if alert, ok := db.complianceAlerts[id]; ok {
		return alert, nil
	}
	return nil, ErrNotFound
}

func (db *InMemoryDB) GetComplianceAlertsByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceAlert, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var alerts []*models.ComplianceAlert
	for _, alert := range db.complianceAlerts {
		if alert.UserID == userID {
			alerts = append(alerts, alert)
		}
	}
	return alerts, nil
}

func (db *InMemoryDB) UpdateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.complianceAlerts[alert.ID]; !ok {
		return ErrNotFound
	}
	alert.UpdatedAt = time.Now()
	db.complianceAlerts[alert.ID] = alert
	return nil
}

func (db *InMemoryDB) GetOpenAlertCount(ctx context.Context, userID uuid.UUID) (int, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	count := 0
	for _, alert := range db.complianceAlerts {
		if alert.UserID == userID && alert.Status == "open" {
			count++
		}
	}
	return count, nil
}

// GetLoanSummary returns a summary of user's loans
func (db *InMemoryDB) GetLoanSummary(ctx context.Context, userID uuid.UUID) (*models.LoanSummary, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	summary := &models.LoanSummary{
		TotalBorrowed:    decimal.Zero,
		TotalOutstanding: decimal.Zero,
		TotalPaid:        decimal.Zero,
		OverdueAmount:    decimal.Zero,
	}

	for _, loan := range db.loans {
		if loan.UserID == userID {
			summary.TotalLoans++
			if loan.Status == models.LoanStatusActive || loan.Status == models.LoanStatusDisbursed {
				summary.ActiveLoans++
				summary.TotalBorrowed = summary.TotalBorrowed.Add(loan.ApprovedAmount)
			}
		}
	}

	return summary, nil
}

// Error definitions
var ErrNotFound = &NotFoundError{Message: "record not found"}

type NotFoundError struct {
	Message string
}

func (e *NotFoundError) Error() string {
	return e.Message
}
