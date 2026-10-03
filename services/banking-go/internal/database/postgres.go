package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/banking-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "banking_service"

func NewPostgresDB(ctx context.Context, databaseURL string) (*PostgresDB, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	db := &PostgresDB{pool: pool}
	if err := db.ensureSchema(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return db, nil
}

func (db *PostgresDB) ensureSchema(ctx context.Context) error {
	stmts := []string{
		fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schemaName),
	}
	for _, table := range []string{"card_transactions", "cards", "compliance_alerts", "compliance_checks", "loan_repayments", "loans", "transaction_monitoring"} {
		stmts = append(stmts,
			fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.%s (
				id UUID PRIMARY KEY,
				data JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`, schemaName, table),
			fmt.Sprintf(`CREATE INDEX IF NOT EXISTS %s_data_gin ON %s.%s USING GIN (data)`, table, schemaName, table),
		)
	}
	for _, s := range stmts {
		if _, err := db.pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("ensure schema: %w", err)
		}
	}
	return nil
}

func (db *PostgresDB) Close(ctx context.Context) error {
	db.pool.Close()
	return nil
}

// -- generic helpers ---------------------------------------------------------

func (db *PostgresDB) upsert(ctx context.Context, table string, id uuid.UUID, doc any) error {
	b, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	_, err = db.pool.Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s.%s (id, data, created_at, updated_at)
			VALUES ($1, $2, now(), now())
			ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, schemaName, table),
		id, b)
	return err
}

func (db *PostgresDB) get(ctx context.Context, table string, id uuid.UUID, out any) (bool, error) {
	var b []byte
	err := db.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT data FROM %s.%s WHERE id = $1`, schemaName, table), id).Scan(&b)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(b, out)
}

// pgGet mirrors the `v, ok := m[k]` map-read idiom.
func pgGet[T any](ctx context.Context, db *PostgresDB, table string, id uuid.UUID) (*T, bool) {
	var v T
	found, err := db.get(ctx, table, id, &v)
	if err != nil || !found {
		return nil, false
	}
	return &v, true
}

func (db *PostgresDB) list(ctx context.Context, table, where string, args ...any) ([][]byte, error) {
	q := fmt.Sprintf(`SELECT data FROM %s.%s`, schemaName, table)
	if where != "" {
		q += " WHERE " + where
	}
	rows, err := db.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out [][]byte
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func unmarshalAll[T any](blobs [][]byte) ([]*T, error) {
	out := make([]*T, 0, len(blobs))
	for _, b := range blobs {
		var v T
		if err := json.Unmarshal(b, &v); err != nil {
			return nil, err
		}
		out = append(out, &v)
	}
	return out, nil
}

func (db *PostgresDB) CreateLoan(ctx context.Context, loan *models.LoanApplication) error {


	loan.ID = uuid.New()
	loan.CreatedAt = time.Now()
	loan.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "loans", loan.ID, loan); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetLoan(ctx context.Context, id uuid.UUID) (*models.LoanApplication, error) {


	if loan, ok := pgGet[models.LoanApplication](ctx, db, "loans", id); ok {
		return loan, nil
	}
	return nil, ErrNotFound

}

func (db *PostgresDB) GetLoansByUser(ctx context.Context, userID uuid.UUID) ([]*models.LoanApplication, error) {
	blobs_loans, err := db.list(ctx, "loans", "")
	if err != nil { return nil, err }
	allItems_loans, err := unmarshalAll[models.LoanApplication](blobs_loans)
	if err != nil { return nil, err }


	var loans []*models.LoanApplication
	for _, loan := range allItems_loans {
		if loan.UserID == userID {
			loans = append(loans, loan)
		}
	}
	return loans, nil

}

func (db *PostgresDB) UpdateLoan(ctx context.Context, loan *models.LoanApplication) error {


	if _, ok := pgGet[models.LoanApplication](ctx, db, "loans", loan.ID); !ok {
		return ErrNotFound
	}
	loan.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "loans", loan.ID, loan); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateLoanRepayments(ctx context.Context, loanID uuid.UUID, repayments []*models.LoanRepayment) error {
	for _, r := range repayments {
		if r.ID == uuid.Nil {
			r.ID = uuid.New()
		}
		if err := db.upsert(ctx, "loan_repayments", r.ID, r); err != nil {
			return err
		}
	}
	return nil
}

func (db *PostgresDB) GetLoanRepayments(ctx context.Context, loanID uuid.UUID) ([]*models.LoanRepayment, error) {
	blobs, err := db.list(ctx, "loan_repayments", "data->>'loan_id' = $1", loanID.String())
	if err != nil {
		return nil, err
	}
	repayments, err := unmarshalAll[models.LoanRepayment](blobs)
	if err != nil {
		return nil, err
	}
	if repayments == nil {
		repayments = []*models.LoanRepayment{}
	}
	return repayments, nil
}

func (db *PostgresDB) UpdateLoanRepayment(ctx context.Context, repayment *models.LoanRepayment) error {
	if _, ok := pgGet[models.LoanRepayment](ctx, db, "loan_repayments", repayment.ID); !ok {
		return ErrNotFound
	}
	return db.upsert(ctx, "loan_repayments", repayment.ID, repayment)
}

func (db *PostgresDB) CreateCard(ctx context.Context, card *models.Card) error {


	card.ID = uuid.New()
	card.CreatedAt = time.Now()
	card.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "cards", card.ID, card); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {


	if card, ok := pgGet[models.Card](ctx, db, "cards", id); ok {
		return card, nil
	}
	return nil, ErrNotFound

}

func (db *PostgresDB) GetCardsByUser(ctx context.Context, userID uuid.UUID) ([]*models.Card, error) {
	blobs_cards, err := db.list(ctx, "cards", "")
	if err != nil { return nil, err }
	allItems_cards, err := unmarshalAll[models.Card](blobs_cards)
	if err != nil { return nil, err }


	var cards []*models.Card
	for _, card := range allItems_cards {
		if card.UserID == userID {
			cards = append(cards, card)
		}
	}
	return cards, nil

}

func (db *PostgresDB) UpdateCard(ctx context.Context, card *models.Card) error {


	if _, ok := pgGet[models.Card](ctx, db, "cards", card.ID); !ok {
		return ErrNotFound
	}
	card.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "cards", card.ID, card); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateCardTransaction(ctx context.Context, tx *models.CardTransaction) error {


	tx.ID = uuid.New()
	tx.CreatedAt = time.Now()
	if err := db.upsert(ctx, "card_transactions", tx.ID, tx); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetCardTransactions(ctx context.Context, cardID uuid.UUID) ([]*models.CardTransaction, error) {
	blobs, err := db.list(ctx, "card_transactions", "data->>'card_id' = $1", cardID.String())
	if err != nil {
		return nil, err
	}
	txs, err := unmarshalAll[models.CardTransaction](blobs)
	if err != nil {
		return nil, err
	}
	if txs == nil {
		txs = []*models.CardTransaction{}
	}
	return txs, nil
}

func (db *PostgresDB) CreateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {


	check.ID = uuid.New()
	check.CreatedAt = time.Now()
	check.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "compliance_checks", check.ID, check); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetComplianceCheck(ctx context.Context, id uuid.UUID) (*models.ComplianceCheck, error) {


	if check, ok := pgGet[models.ComplianceCheck](ctx, db, "compliance_checks", id); ok {
		return check, nil
	}
	return nil, ErrNotFound

}

func (db *PostgresDB) GetComplianceChecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceCheck, error) {
	blobs_complianceChecks, err := db.list(ctx, "compliance_checks", "")
	if err != nil { return nil, err }
	allItems_complianceChecks, err := unmarshalAll[models.ComplianceCheck](blobs_complianceChecks)
	if err != nil { return nil, err }


	var checks []*models.ComplianceCheck
	for _, check := range allItems_complianceChecks {
		if check.UserID == userID {
			checks = append(checks, check)
		}
	}
	return checks, nil

}

func (db *PostgresDB) UpdateComplianceCheck(ctx context.Context, check *models.ComplianceCheck) error {


	if _, ok := pgGet[models.ComplianceCheck](ctx, db, "compliance_checks", check.ID); !ok {
		return ErrNotFound
	}
	check.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "compliance_checks", check.ID, check); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {


	alert.ID = uuid.New()
	alert.CreatedAt = time.Now()
	alert.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "compliance_alerts", alert.ID, alert); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetComplianceAlert(ctx context.Context, id uuid.UUID) (*models.ComplianceAlert, error) {


	if alert, ok := pgGet[models.ComplianceAlert](ctx, db, "compliance_alerts", id); ok {
		return alert, nil
	}
	return nil, ErrNotFound

}

func (db *PostgresDB) GetComplianceAlertsByUser(ctx context.Context, userID uuid.UUID) ([]*models.ComplianceAlert, error) {
	blobs_complianceAlerts, err := db.list(ctx, "compliance_alerts", "")
	if err != nil { return nil, err }
	allItems_complianceAlerts, err := unmarshalAll[models.ComplianceAlert](blobs_complianceAlerts)
	if err != nil { return nil, err }


	var alerts []*models.ComplianceAlert
	for _, alert := range allItems_complianceAlerts {
		if alert.UserID == userID {
			alerts = append(alerts, alert)
		}
	}
	return alerts, nil

}

func (db *PostgresDB) UpdateComplianceAlert(ctx context.Context, alert *models.ComplianceAlert) error {


	if _, ok := pgGet[models.ComplianceAlert](ctx, db, "compliance_alerts", alert.ID); !ok {
		return ErrNotFound
	}
	alert.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "compliance_alerts", alert.ID, alert); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetOpenAlertCount(ctx context.Context, userID uuid.UUID) (int, error) {
	blobs_complianceAlerts, err := db.list(ctx, "compliance_alerts", "")
	if err != nil { return 0, err }
	allItems_complianceAlerts, err := unmarshalAll[models.ComplianceAlert](blobs_complianceAlerts)
	if err != nil { return 0, err }


	count := 0
	for _, alert := range allItems_complianceAlerts {
		if alert.UserID == userID && alert.Status == "open" {
			count++
		}
	}
	return count, nil

}

func (db *PostgresDB) GetLoanSummary(ctx context.Context, userID uuid.UUID) (*models.LoanSummary, error) {
	blobs_loans, err := db.list(ctx, "loans", "")
	if err != nil { return nil, err }
	allItems_loans, err := unmarshalAll[models.LoanApplication](blobs_loans)
	if err != nil { return nil, err }


	summary := &models.LoanSummary{
		TotalBorrowed:    decimal.Zero,
		TotalOutstanding: decimal.Zero,
		TotalPaid:        decimal.Zero,
		OverdueAmount:    decimal.Zero,
	}

	for _, loan := range allItems_loans {
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
