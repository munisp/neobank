package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/analytics-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "analytics_service"

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
	for _, table := range []string{"alerts", "budgets", "insights", "recurring", "transactions"} {
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

func (db *PostgresDB) CreateTransaction(ctx context.Context, tx *models.Transaction) error {

	if err := db.upsert(ctx, "transactions", tx.ID, tx); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserTransactions(ctx context.Context, userID uuid.UUID, startDate, endDate time.Time) ([]*models.Transaction, error) {
	blobs_transactions, err := db.list(ctx, "transactions", "")
	if err != nil { return nil, err }
	allItems_transactions, err := unmarshalAll[models.Transaction](blobs_transactions)
	if err != nil { return nil, err }

	
	var transactions []*models.Transaction
	for _, tx := range allItems_transactions {
		if tx.UserID == userID {
			if !tx.TransactionDate.Before(startDate) && !tx.TransactionDate.After(endDate) {
				transactions = append(transactions, tx)
			}
		}
	}
	return transactions, nil

}

func (db *PostgresDB) GetUserTransactionsByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory, startDate, endDate time.Time) ([]*models.Transaction, error) {
	blobs_transactions, err := db.list(ctx, "transactions", "")
	if err != nil { return nil, err }
	allItems_transactions, err := unmarshalAll[models.Transaction](blobs_transactions)
	if err != nil { return nil, err }

	
	var transactions []*models.Transaction
	for _, tx := range allItems_transactions {
		if tx.UserID == userID && tx.Category == category {
			if !tx.TransactionDate.Before(startDate) && !tx.TransactionDate.After(endDate) {
				transactions = append(transactions, tx)
			}
		}
	}
	return transactions, nil

}

func (db *PostgresDB) CreateBudget(ctx context.Context, budget *models.Budget) error {

	if err := db.upsert(ctx, "budgets", budget.ID, budget); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetBudget(ctx context.Context, id uuid.UUID) (*models.Budget, error) {

	v, _ := pgGet[models.Budget](ctx, db, "budgets", id)
	return v, nil

}

func (db *PostgresDB) GetUserBudgets(ctx context.Context, userID uuid.UUID) ([]*models.Budget, error) {
	blobs_budgets, err := db.list(ctx, "budgets", "")
	if err != nil { return nil, err }
	allItems_budgets, err := unmarshalAll[models.Budget](blobs_budgets)
	if err != nil { return nil, err }

	
	var budgets []*models.Budget
	for _, b := range allItems_budgets {
		if b.UserID == userID && b.IsActive {
			budgets = append(budgets, b)
		}
	}
	return budgets, nil

}

func (db *PostgresDB) GetUserBudgetByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory) (*models.Budget, error) {
	blobs_budgets, err := db.list(ctx, "budgets", "")
	if err != nil { return nil, err }
	allItems_budgets, err := unmarshalAll[models.Budget](blobs_budgets)
	if err != nil { return nil, err }

	
	for _, b := range allItems_budgets {
		if b.UserID == userID && b.Category == category && b.IsActive {
			return b, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) UpdateBudget(ctx context.Context, budget *models.Budget) error {

	if err := db.upsert(ctx, "budgets", budget.ID, budget); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteBudget(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.budgets WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateAlert(ctx context.Context, alert *models.BudgetAlert) error {

	if err := db.upsert(ctx, "alerts", alert.ID, alert); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserAlerts(ctx context.Context, userID uuid.UUID) ([]*models.BudgetAlert, error) {
	blobs_alerts, err := db.list(ctx, "alerts", "")
	if err != nil { return nil, err }
	allItems_alerts, err := unmarshalAll[models.BudgetAlert](blobs_alerts)
	if err != nil { return nil, err }

	
	var alerts []*models.BudgetAlert
	for _, a := range allItems_alerts {
		if a.UserID == userID {
			alerts = append(alerts, a)
		}
	}
	return alerts, nil

}

func (db *PostgresDB) MarkAlertRead(ctx context.Context, id uuid.UUID) error {

	
	if alert, ok := pgGet[models.BudgetAlert](ctx, db, "alerts", id); ok {
		alert.IsRead = true
	}
	return nil

}

func (db *PostgresDB) CreateInsight(ctx context.Context, insight *models.Insight) error {

	if err := db.upsert(ctx, "insights", insight.ID, insight); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserInsights(ctx context.Context, userID uuid.UUID) ([]*models.Insight, error) {
	blobs_insights, err := db.list(ctx, "insights", "")
	if err != nil { return nil, err }
	allItems_insights, err := unmarshalAll[models.Insight](blobs_insights)
	if err != nil { return nil, err }

	
	var insights []*models.Insight
	for _, i := range allItems_insights {
		if i.UserID == userID {
			insights = append(insights, i)
		}
	}
	return insights, nil

}

func (db *PostgresDB) MarkInsightRead(ctx context.Context, id uuid.UUID) error {

	
	if insight, ok := pgGet[models.Insight](ctx, db, "insights", id); ok {
		insight.IsRead = true
	}
	return nil

}

func (db *PostgresDB) CreateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error {

	if err := db.upsert(ctx, "recurring", recurring.ID, recurring); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserRecurringTransactions(ctx context.Context, userID uuid.UUID) ([]*models.RecurringTransaction, error) {
	blobs_recurring, err := db.list(ctx, "recurring", "")
	if err != nil { return nil, err }
	allItems_recurring, err := unmarshalAll[models.RecurringTransaction](blobs_recurring)
	if err != nil { return nil, err }

	
	var recurring []*models.RecurringTransaction
	for _, r := range allItems_recurring {
		if r.UserID == userID {
			recurring = append(recurring, r)
		}
	}
	return recurring, nil

}

func (db *PostgresDB) UpdateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error {

	if err := db.upsert(ctx, "recurring", recurring.ID, recurring); err != nil { return err }
	return nil

}
