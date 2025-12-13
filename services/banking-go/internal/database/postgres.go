package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/neobank/banking-service/internal/models"
	"github.com/shopspring/decimal"
)

// PostgresDB provides PostgreSQL database operations for production
type PostgresDB struct {
	db *sql.DB
}

// PostgresConfig holds database configuration
type PostgresConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	Database        string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// NewPostgresDB creates a new PostgreSQL database connection
func NewPostgresDB(cfg PostgresConfig) (*PostgresDB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &PostgresDB{db: db}, nil
}

// Close closes the database connection
func (p *PostgresDB) Close() error {
	return p.db.Close()
}

// RunMigrations creates the necessary tables
func (p *PostgresDB) RunMigrations(ctx context.Context) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS loan_applications (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			loan_type VARCHAR(50) NOT NULL,
			amount DECIMAL(20,2) NOT NULL,
			currency VARCHAR(10) DEFAULT 'NGN',
			term_months INTEGER NOT NULL,
			interest_rate DECIMAL(10,4) NOT NULL,
			purpose TEXT,
			status VARCHAR(50) NOT NULL DEFAULT 'pending',
			approved_amount DECIMAL(20,2),
			monthly_payment DECIMAL(20,2),
			total_interest DECIMAL(20,2),
			total_repayment DECIMAL(20,2),
			collateral_type VARCHAR(100),
			collateral_value DECIMAL(20,2),
			employment_status VARCHAR(50),
			monthly_income DECIMAL(20,2),
			existing_debts DECIMAL(20,2),
			debt_to_income_ratio DECIMAL(10,4),
			risk_score DECIMAL(10,4),
			rejection_reason TEXT,
			review_notes TEXT,
			disbursement_date TIMESTAMP,
			first_payment_date TIMESTAMP,
			maturity_date TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_loan_applications_user_id ON loan_applications(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON loan_applications(status)`,

		`CREATE TABLE IF NOT EXISTS loan_repayments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			loan_id UUID NOT NULL REFERENCES loan_applications(id),
			payment_number INTEGER NOT NULL,
			due_date TIMESTAMP NOT NULL,
			principal_due DECIMAL(20,2) NOT NULL,
			interest_due DECIMAL(20,2) NOT NULL,
			total_due DECIMAL(20,2) NOT NULL,
			principal_paid DECIMAL(20,2) DEFAULT 0,
			interest_paid DECIMAL(20,2) DEFAULT 0,
			total_paid DECIMAL(20,2) DEFAULT 0,
			status VARCHAR(50) DEFAULT 'pending',
			paid_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan_id ON loan_repayments(loan_id)`,

		`CREATE TABLE IF NOT EXISTS cards (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			account_id UUID,
			card_type VARCHAR(50) NOT NULL,
			card_network VARCHAR(50) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'pending',
			masked_pan VARCHAR(20) NOT NULL,
			last_four_digits VARCHAR(4) NOT NULL,
			expiry_month INTEGER NOT NULL,
			expiry_year INTEGER NOT NULL,
			cardholder_name VARCHAR(255) NOT NULL,
			billing_address TEXT,
			daily_limit DECIMAL(20,2) DEFAULT 500000,
			monthly_limit DECIMAL(20,2) DEFAULT 5000000,
			transaction_limit DECIMAL(20,2) DEFAULT 200000,
			daily_spent DECIMAL(20,2) DEFAULT 0,
			monthly_spent DECIMAL(20,2) DEFAULT 0,
			is_contactless BOOLEAN DEFAULT TRUE,
			is_online_enabled BOOLEAN DEFAULT TRUE,
			is_atm_enabled BOOLEAN DEFAULT TRUE,
			is_pos_enabled BOOLEAN DEFAULT TRUE,
			pin VARCHAR(255),
			cvv VARCHAR(255),
			activated_at TIMESTAMP,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id)`,

		`CREATE TABLE IF NOT EXISTS card_transactions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			card_id UUID NOT NULL REFERENCES cards(id),
			transaction_type VARCHAR(50) NOT NULL,
			amount DECIMAL(20,2) NOT NULL,
			currency VARCHAR(10) DEFAULT 'NGN',
			merchant_name VARCHAR(255),
			merchant_category VARCHAR(100),
			status VARCHAR(50) NOT NULL,
			reference VARCHAR(255),
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_card_transactions_card_id ON card_transactions(card_id)`,

		`CREATE TABLE IF NOT EXISTS compliance_checks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			check_type VARCHAR(100) NOT NULL,
			status VARCHAR(50) NOT NULL,
			risk_score DECIMAL(10,4),
			risk_level VARCHAR(50),
			findings JSONB,
			notes TEXT,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_compliance_checks_user_id ON compliance_checks(user_id)`,

		`CREATE TABLE IF NOT EXISTS compliance_alerts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			alert_type VARCHAR(100) NOT NULL,
			severity VARCHAR(50) NOT NULL,
			status VARCHAR(50) DEFAULT 'open',
			description TEXT,
			details JSONB,
			resolved_at TIMESTAMP,
			resolved_by UUID,
			resolution_notes TEXT,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_compliance_alerts_user_id ON compliance_alerts(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_compliance_alerts_status ON compliance_alerts(status)`,

		`CREATE TABLE IF NOT EXISTS two_factor_secrets (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL UNIQUE,
			secret VARCHAR(255) NOT NULL,
			is_enabled BOOLEAN DEFAULT FALSE,
			backup_codes TEXT[],
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_two_factor_secrets_user_id ON two_factor_secrets(user_id)`,
	}

	for _, migration := range migrations {
		if _, err := p.db.ExecContext(ctx, migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}

// Loan operations

func (p *PostgresDB) CreateLoan(ctx context.Context, loan *models.LoanApplication) error {
	loan.ID = uuid.New()
	loan.CreatedAt = time.Now()
	loan.UpdatedAt = time.Now()

	query := `
		INSERT INTO loan_applications (
			id, user_id, loan_type, amount, currency, term_months, interest_rate,
			purpose, status, collateral_type, collateral_value, employment_status,
			monthly_income, existing_debts, debt_to_income_ratio, risk_score,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
	`

	_, err := p.db.ExecContext(ctx, query,
		loan.ID, loan.UserID, loan.LoanType, loan.Amount, loan.Currency,
		loan.TermMonths, loan.InterestRate, loan.Purpose, loan.Status,
		loan.CollateralType, loan.CollateralValue, loan.EmploymentStatus,
		loan.MonthlyIncome, loan.ExistingDebts, loan.DebtToIncomeRatio,
		loan.RiskScore, loan.CreatedAt, loan.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetLoan(ctx context.Context, id uuid.UUID) (*models.LoanApplication, error) {
	query := `
		SELECT id, user_id, loan_type, amount, currency, term_months, interest_rate,
			purpose, status, approved_amount, monthly_payment, total_interest,
			total_repayment, collateral_type, collateral_value, employment_status,
			monthly_income, existing_debts, debt_to_income_ratio, risk_score,
			rejection_reason, review_notes, disbursement_date, first_payment_date,
			maturity_date, created_at, updated_at
		FROM loan_applications WHERE id = $1
	`

	loan := &models.LoanApplication{}
	var approvedAmount, monthlyPayment, totalInterest, totalRepayment sql.NullFloat64
	var disbursementDate, firstPaymentDate, maturityDate sql.NullTime
	var rejectionReason, reviewNotes sql.NullString

	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&loan.ID, &loan.UserID, &loan.LoanType, &loan.Amount, &loan.Currency,
		&loan.TermMonths, &loan.InterestRate, &loan.Purpose, &loan.Status,
		&approvedAmount, &monthlyPayment, &totalInterest, &totalRepayment,
		&loan.CollateralType, &loan.CollateralValue, &loan.EmploymentStatus,
		&loan.MonthlyIncome, &loan.ExistingDebts, &loan.DebtToIncomeRatio,
		&loan.RiskScore, &rejectionReason, &reviewNotes, &disbursementDate,
		&firstPaymentDate, &maturityDate, &loan.CreatedAt, &loan.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if approvedAmount.Valid {
		loan.ApprovedAmount = decimal.NewFromFloat(approvedAmount.Float64)
	}
	if monthlyPayment.Valid {
		loan.MonthlyPayment = decimal.NewFromFloat(monthlyPayment.Float64)
	}
	if totalInterest.Valid {
		loan.TotalInterest = decimal.NewFromFloat(totalInterest.Float64)
	}
	if totalRepayment.Valid {
		loan.TotalRepayment = decimal.NewFromFloat(totalRepayment.Float64)
	}
	if disbursementDate.Valid {
		loan.DisbursementDate = &disbursementDate.Time
	}
	if firstPaymentDate.Valid {
		loan.FirstPaymentDate = &firstPaymentDate.Time
	}
	if maturityDate.Valid {
		loan.MaturityDate = &maturityDate.Time
	}
	if rejectionReason.Valid {
		loan.RejectionReason = rejectionReason.String
	}
	if reviewNotes.Valid {
		loan.ReviewNotes = reviewNotes.String
	}

	return loan, nil
}

func (p *PostgresDB) GetLoansByUser(ctx context.Context, userID uuid.UUID) ([]*models.LoanApplication, error) {
	query := `
		SELECT id, user_id, loan_type, amount, currency, term_months, interest_rate,
			purpose, status, approved_amount, monthly_payment, total_interest,
			total_repayment, created_at, updated_at
		FROM loan_applications WHERE user_id = $1 ORDER BY created_at DESC
	`

	rows, err := p.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var loans []*models.LoanApplication
	for rows.Next() {
		loan := &models.LoanApplication{}
		var approvedAmount, monthlyPayment, totalInterest, totalRepayment sql.NullFloat64

		err := rows.Scan(
			&loan.ID, &loan.UserID, &loan.LoanType, &loan.Amount, &loan.Currency,
			&loan.TermMonths, &loan.InterestRate, &loan.Purpose, &loan.Status,
			&approvedAmount, &monthlyPayment, &totalInterest, &totalRepayment,
			&loan.CreatedAt, &loan.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if approvedAmount.Valid {
			loan.ApprovedAmount = decimal.NewFromFloat(approvedAmount.Float64)
		}
		if monthlyPayment.Valid {
			loan.MonthlyPayment = decimal.NewFromFloat(monthlyPayment.Float64)
		}
		if totalInterest.Valid {
			loan.TotalInterest = decimal.NewFromFloat(totalInterest.Float64)
		}
		if totalRepayment.Valid {
			loan.TotalRepayment = decimal.NewFromFloat(totalRepayment.Float64)
		}

		loans = append(loans, loan)
	}

	return loans, nil
}

func (p *PostgresDB) UpdateLoan(ctx context.Context, loan *models.LoanApplication) error {
	loan.UpdatedAt = time.Now()

	query := `
		UPDATE loan_applications SET
			status = $2, approved_amount = $3, monthly_payment = $4,
			total_interest = $5, total_repayment = $6, risk_score = $7,
			rejection_reason = $8, review_notes = $9, disbursement_date = $10,
			first_payment_date = $11, maturity_date = $12, updated_at = $13
		WHERE id = $1
	`

	result, err := p.db.ExecContext(ctx, query,
		loan.ID, loan.Status, loan.ApprovedAmount, loan.MonthlyPayment,
		loan.TotalInterest, loan.TotalRepayment, loan.RiskScore,
		loan.RejectionReason, loan.ReviewNotes, loan.DisbursementDate,
		loan.FirstPaymentDate, loan.MaturityDate, loan.UpdatedAt,
	)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func (p *PostgresDB) CreateLoanRepayments(ctx context.Context, loanID uuid.UUID, repayments []*models.LoanRepayment) error {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `
		INSERT INTO loan_repayments (
			id, loan_id, payment_number, due_date, principal_due, interest_due,
			total_due, status, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	for _, r := range repayments {
		_, err := tx.ExecContext(ctx, query,
			r.ID, loanID, r.PaymentNumber, r.DueDate, r.PrincipalDue,
			r.InterestDue, r.TotalDue, r.Status, r.CreatedAt,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (p *PostgresDB) GetLoanRepayments(ctx context.Context, loanID uuid.UUID) ([]*models.LoanRepayment, error) {
	query := `
		SELECT id, loan_id, payment_number, due_date, principal_due, interest_due,
			total_due, principal_paid, interest_paid, total_paid, status, paid_at, created_at
		FROM loan_repayments WHERE loan_id = $1 ORDER BY payment_number
	`

	rows, err := p.db.QueryContext(ctx, query, loanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var repayments []*models.LoanRepayment
	for rows.Next() {
		r := &models.LoanRepayment{}
		var paidAt sql.NullTime

		err := rows.Scan(
			&r.ID, &r.LoanID, &r.PaymentNumber, &r.DueDate, &r.PrincipalDue,
			&r.InterestDue, &r.TotalDue, &r.PrincipalPaid, &r.InterestPaid,
			&r.TotalPaid, &r.Status, &paidAt, &r.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		if paidAt.Valid {
			r.PaidAt = &paidAt.Time
		}

		repayments = append(repayments, r)
	}

	return repayments, nil
}

func (p *PostgresDB) UpdateLoanRepayment(ctx context.Context, repayment *models.LoanRepayment) error {
	query := `
		UPDATE loan_repayments SET
			principal_paid = $2, interest_paid = $3, total_paid = $4,
			status = $5, paid_at = $6
		WHERE id = $1
	`

	result, err := p.db.ExecContext(ctx, query,
		repayment.ID, repayment.PrincipalPaid, repayment.InterestPaid,
		repayment.TotalPaid, repayment.Status, repayment.PaidAt,
	)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// Card operations

func (p *PostgresDB) CreateCard(ctx context.Context, card *models.Card) error {
	card.ID = uuid.New()
	card.CreatedAt = time.Now()
	card.UpdatedAt = time.Now()

	query := `
		INSERT INTO cards (
			id, user_id, account_id, card_type, card_network, status, masked_pan,
			last_four_digits, expiry_month, expiry_year, cardholder_name,
			billing_address, daily_limit, monthly_limit, transaction_limit,
			daily_spent, monthly_spent, is_contactless, is_online_enabled,
			is_atm_enabled, is_pos_enabled, pin, cvv, expires_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
	`

	_, err := p.db.ExecContext(ctx, query,
		card.ID, card.UserID, card.AccountID, card.CardType, card.CardNetwork,
		card.Status, card.MaskedPAN, card.LastFourDigits, card.ExpiryMonth,
		card.ExpiryYear, card.CardholderName, card.BillingAddress, card.DailyLimit,
		card.MonthlyLimit, card.TransactionLimit, card.DailySpent, card.MonthlySpent,
		card.IsContactless, card.IsOnlineEnabled, card.IsATMEnabled, card.IsPOSEnabled,
		card.PIN, card.CVV, card.ExpiresAt, card.CreatedAt, card.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {
	query := `
		SELECT id, user_id, account_id, card_type, card_network, status, masked_pan,
			last_four_digits, expiry_month, expiry_year, cardholder_name,
			billing_address, daily_limit, monthly_limit, transaction_limit,
			daily_spent, monthly_spent, is_contactless, is_online_enabled,
			is_atm_enabled, is_pos_enabled, pin, cvv, activated_at, expires_at,
			created_at, updated_at
		FROM cards WHERE id = $1
	`

	card := &models.Card{}
	var activatedAt sql.NullTime
	var accountID uuid.NullUUID

	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&card.ID, &card.UserID, &accountID, &card.CardType, &card.CardNetwork,
		&card.Status, &card.MaskedPAN, &card.LastFourDigits, &card.ExpiryMonth,
		&card.ExpiryYear, &card.CardholderName, &card.BillingAddress, &card.DailyLimit,
		&card.MonthlyLimit, &card.TransactionLimit, &card.DailySpent, &card.MonthlySpent,
		&card.IsContactless, &card.IsOnlineEnabled, &card.IsATMEnabled, &card.IsPOSEnabled,
		&card.PIN, &card.CVV, &activatedAt, &card.ExpiresAt, &card.CreatedAt, &card.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if activatedAt.Valid {
		card.ActivatedAt = &activatedAt.Time
	}
	if accountID.Valid {
		card.AccountID = accountID.UUID
	}

	return card, nil
}

func (p *PostgresDB) GetCardsByUser(ctx context.Context, userID uuid.UUID) ([]*models.Card, error) {
	query := `
		SELECT id, user_id, card_type, card_network, status, masked_pan,
			last_four_digits, expiry_month, expiry_year, cardholder_name,
			daily_limit, monthly_limit, created_at
		FROM cards WHERE user_id = $1 ORDER BY created_at DESC
	`

	rows, err := p.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []*models.Card
	for rows.Next() {
		card := &models.Card{}
		err := rows.Scan(
			&card.ID, &card.UserID, &card.CardType, &card.CardNetwork,
			&card.Status, &card.MaskedPAN, &card.LastFourDigits, &card.ExpiryMonth,
			&card.ExpiryYear, &card.CardholderName, &card.DailyLimit,
			&card.MonthlyLimit, &card.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		cards = append(cards, card)
	}

	return cards, nil
}

func (p *PostgresDB) UpdateCard(ctx context.Context, card *models.Card) error {
	card.UpdatedAt = time.Now()

	query := `
		UPDATE cards SET
			status = $2, daily_limit = $3, monthly_limit = $4, transaction_limit = $5,
			daily_spent = $6, monthly_spent = $7, is_contactless = $8,
			is_online_enabled = $9, is_atm_enabled = $10, is_pos_enabled = $11,
			pin = $12, activated_at = $13, updated_at = $14
		WHERE id = $1
	`

	result, err := p.db.ExecContext(ctx, query,
		card.ID, card.Status, card.DailyLimit, card.MonthlyLimit, card.TransactionLimit,
		card.DailySpent, card.MonthlySpent, card.IsContactless, card.IsOnlineEnabled,
		card.IsATMEnabled, card.IsPOSEnabled, card.PIN, card.ActivatedAt, card.UpdatedAt,
	)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func (p *PostgresDB) CreateCardTransaction(ctx context.Context, tx *models.CardTransaction) error {
	tx.ID = uuid.New()
	tx.CreatedAt = time.Now()

	query := `
		INSERT INTO card_transactions (
			id, card_id, transaction_type, amount, currency, merchant_name,
			merchant_category, status, reference, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := p.db.ExecContext(ctx, query,
		tx.ID, tx.CardID, tx.TransactionType, tx.Amount, tx.Currency,
		tx.MerchantName, tx.MerchantCategory, tx.Status, tx.Reference, tx.CreatedAt,
	)

	return err
}

func (p *PostgresDB) GetCardTransactions(ctx context.Context, cardID uuid.UUID) ([]*models.CardTransaction, error) {
	query := `
		SELECT id, card_id, transaction_type, amount, currency, merchant_name,
			merchant_category, status, reference, created_at
		FROM card_transactions WHERE card_id = $1 ORDER BY created_at DESC LIMIT 100
	`

	rows, err := p.db.QueryContext(ctx, query, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*models.CardTransaction
	for rows.Next() {
		tx := &models.CardTransaction{}
		err := rows.Scan(
			&tx.ID, &tx.CardID, &tx.TransactionType, &tx.Amount, &tx.Currency,
			&tx.MerchantName, &tx.MerchantCategory, &tx.Status, &tx.Reference, &tx.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, tx)
	}

	return transactions, nil
}

// Compliance operations

func (p *PostgresDB) CreateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {
	check.ID = uuid.New()
	check.CreatedAt = time.Now()
	check.UpdatedAt = time.Now()

	query := `
		INSERT INTO compliance_checks (
			id, user_id, check_type, status, risk_score, risk_level, notes, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	_, err := p.db.ExecContext(ctx, query,
		check.ID, check.UserID, check.CheckType, check.Status, check.RiskScore,
		check.RiskLevel, check.Notes, check.CreatedAt, check.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetComplianceCheck(ctx context.Context, id uuid.UUID) (*models.ComplianceCheck, error) {
	query := `
		SELECT id, user_id, check_type, status, risk_score, risk_level, notes, created_at, updated_at
		FROM compliance_checks WHERE id = $1
	`

	check := &models.ComplianceCheck{}
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&check.ID, &check.UserID, &check.CheckType, &check.Status, &check.RiskScore,
		&check.RiskLevel, &check.Notes, &check.CreatedAt, &check.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return check, err
}

func (p *PostgresDB) GetComplianceChecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceCheck, error) {
	query := `
		SELECT id, user_id, check_type, status, risk_score, risk_level, notes, created_at, updated_at
		FROM compliance_checks WHERE user_id = $1 ORDER BY created_at DESC
	`

	rows, err := p.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var checks []*models.ComplianceCheck
	for rows.Next() {
		check := &models.ComplianceCheck{}
		err := rows.Scan(
			&check.ID, &check.UserID, &check.CheckType, &check.Status, &check.RiskScore,
			&check.RiskLevel, &check.Notes, &check.CreatedAt, &check.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		checks = append(checks, check)
	}

	return checks, nil
}

func (p *PostgresDB) UpdateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {
	check.UpdatedAt = time.Now()

	query := `
		UPDATE compliance_checks SET
			status = $2, risk_score = $3, risk_level = $4, notes = $5, updated_at = $6
		WHERE id = $1
	`

	result, err := p.db.ExecContext(ctx, query,
		check.ID, check.Status, check.RiskScore, check.RiskLevel, check.Notes, check.UpdatedAt,
	)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func (p *PostgresDB) CreateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {
	alert.ID = uuid.New()
	alert.CreatedAt = time.Now()
	alert.UpdatedAt = time.Now()

	query := `
		INSERT INTO compliance_alerts (
			id, user_id, alert_type, severity, status, description, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err := p.db.ExecContext(ctx, query,
		alert.ID, alert.UserID, alert.AlertType, alert.Severity, alert.Status,
		alert.Description, alert.CreatedAt, alert.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetComplianceAlert(ctx context.Context, id uuid.UUID) (*models.ComplianceAlert, error) {
	query := `
		SELECT id, user_id, alert_type, severity, status, description, created_at, updated_at
		FROM compliance_alerts WHERE id = $1
	`

	alert := &models.ComplianceAlert{}
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&alert.ID, &alert.UserID, &alert.AlertType, &alert.Severity, &alert.Status,
		&alert.Description, &alert.CreatedAt, &alert.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return alert, err
}

func (p *PostgresDB) GetComplianceAlertsByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceAlert, error) {
	query := `
		SELECT id, user_id, alert_type, severity, status, description, created_at, updated_at
		FROM compliance_alerts WHERE user_id = $1 ORDER BY created_at DESC
	`

	rows, err := p.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []*models.ComplianceAlert
	for rows.Next() {
		alert := &models.ComplianceAlert{}
		err := rows.Scan(
			&alert.ID, &alert.UserID, &alert.AlertType, &alert.Severity, &alert.Status,
			&alert.Description, &alert.CreatedAt, &alert.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		alerts = append(alerts, alert)
	}

	return alerts, nil
}

func (p *PostgresDB) UpdateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {
	alert.UpdatedAt = time.Now()

	query := `
		UPDATE compliance_alerts SET
			status = $2, description = $3, updated_at = $4
		WHERE id = $1
	`

	result, err := p.db.ExecContext(ctx, query,
		alert.ID, alert.Status, alert.Description, alert.UpdatedAt,
	)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func (p *PostgresDB) GetOpenAlertCount(ctx context.Context, userID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM compliance_alerts WHERE user_id = $1 AND status = 'open'`

	var count int
	err := p.db.QueryRowContext(ctx, query, userID).Scan(&count)
	return count, err
}

func (p *PostgresDB) GetLoanSummary(ctx context.Context, userID uuid.UUID) (*models.LoanSummary, error) {
	query := `
		SELECT 
			COUNT(*) as total_loans,
			COUNT(*) FILTER (WHERE status IN ('active', 'disbursed')) as active_loans,
			COALESCE(SUM(approved_amount) FILTER (WHERE status IN ('active', 'disbursed')), 0) as total_borrowed,
			COALESCE(SUM(approved_amount) FILTER (WHERE status IN ('active', 'disbursed')), 0) as total_outstanding
		FROM loan_applications WHERE user_id = $1
	`

	summary := &models.LoanSummary{}
	err := p.db.QueryRowContext(ctx, query, userID).Scan(
		&summary.TotalLoans, &summary.ActiveLoans, &summary.TotalBorrowed, &summary.TotalOutstanding,
	)

	if err != nil {
		return nil, err
	}

	summary.TotalPaid = decimal.Zero
	summary.OverdueAmount = decimal.Zero

	return summary, nil
}

// Two-factor authentication operations

func (p *PostgresDB) SaveTwoFactorSecret(ctx context.Context, userID uuid.UUID, secret string) error {
	query := `
		INSERT INTO two_factor_secrets (id, user_id, secret, is_enabled, created_at, updated_at)
		VALUES ($1, $2, $3, FALSE, NOW(), NOW())
		ON CONFLICT (user_id) DO UPDATE SET secret = $3, updated_at = NOW()
	`

	_, err := p.db.ExecContext(ctx, query, uuid.New(), userID, secret)
	return err
}

func (p *PostgresDB) GetTwoFactorSecret(ctx context.Context, userID uuid.UUID) (string, error) {
	query := `SELECT secret FROM two_factor_secrets WHERE user_id = $1 AND is_enabled = TRUE`

	var secret string
	err := p.db.QueryRowContext(ctx, query, userID).Scan(&secret)
	if err == sql.ErrNoRows {
		return "", ErrNotFound
	}
	return secret, err
}

func (p *PostgresDB) EnableTwoFactor(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE two_factor_secrets SET is_enabled = TRUE, updated_at = NOW() WHERE user_id = $1`

	result, err := p.db.ExecContext(ctx, query, userID)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func (p *PostgresDB) DisableTwoFactor(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE two_factor_secrets SET is_enabled = FALSE, updated_at = NOW() WHERE user_id = $1`

	_, err := p.db.ExecContext(ctx, query, userID)
	return err
}
