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
	"github.com/neobank/bills-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "bills_service"

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
	if err := db.seedReferenceData(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("seed reference data: %w", err)
	}
	return db, nil
}

func (db *PostgresDB) ensureSchema(ctx context.Context) error {
	stmts := []string{
		fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schemaName),
	}
	for _, table := range []string{"billers", "payments", "saved_billers", "scheduled", "subscriptions"} {
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

func (db *PostgresDB) seedReferenceData(ctx context.Context) error {
	db.seedBillers(ctx)
	return nil
}

func (db *PostgresDB) seedBillers(ctx context.Context) {

	now := time.Now()
	billers := []models.Biller{
		// Electricity
		{
			ID:             uuid.New(),
			Name:           "Ikeja Electric",
			Category:       models.BillCategoryElectricity,
			Code:           "IKEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Eko Electricity",
			Category:       models.BillCategoryElectricity,
			Code:           "EKEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Abuja Electricity",
			Category:       models.BillCategoryElectricity,
			Code:           "AEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// TV
		{
			ID:             uuid.New(),
			Name:           "DSTV",
			Category:       models.BillCategoryTV,
			Code:           "DSTV",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "GOtv",
			Category:       models.BillCategoryTV,
			Code:           "GOTV",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Startimes",
			Category:       models.BillCategoryTV,
			Code:           "STARTIMES",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(50),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Internet
		{
			ID:             uuid.New(),
			Name:           "Spectranet",
			Category:       models.BillCategoryInternet,
			Code:           "SPECTRANET",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Smile",
			Category:       models.BillCategoryInternet,
			Code:           "SMILE",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Water
		{
			ID:             uuid.New(),
			Name:           "Lagos Water Corporation",
			Category:       models.BillCategoryWater,
			Code:           "LWC",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(50),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Government
		{
			ID:             uuid.New(),
			Name:           "FIRS - Federal Inland Revenue",
			Category:       models.BillCategoryGovernment,
			Code:           "FIRS",
			Country:        "NG",
			RequiredFields: []string{"tin"},
			ServiceFee:     decimal.NewFromFloat(0),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "LIRS - Lagos State Revenue",
			Category:       models.BillCategoryGovernment,
			Code:           "LIRS",
			Country:        "NG",
			RequiredFields: []string{"tin"},
			ServiceFee:     decimal.NewFromFloat(0),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Education
		{
			ID:             uuid.New(),
			Name:           "WAEC",
			Category:       models.BillCategoryEducation,
			Code:           "WAEC",
			Country:        "NG",
			RequiredFields: []string{"registration_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "JAMB",
			Category:       models.BillCategoryEducation,
			Code:           "JAMB",
			Country:        "NG",
			RequiredFields: []string{"registration_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
	}
	
	for i := range billers {
		_ = db.upsert(ctx, "billers", billers[i].ID, &billers[i])
	}

}

func (db *PostgresDB) GetBillers(ctx context.Context) ([]*models.Biller, error) {
	blobs_billers, err := db.list(ctx, "billers", "")
	if err != nil { return nil, err }
	allItems_billers, err := unmarshalAll[models.Biller](blobs_billers)
	if err != nil { return nil, err }

	
	var billers []*models.Biller
	for _, b := range allItems_billers {
		if b.IsActive {
			billers = append(billers, b)
		}
	}
	return billers, nil

}

func (db *PostgresDB) GetBillersByCategory(ctx context.Context, category models.BillCategory) ([]*models.Biller, error) {
	blobs_billers, err := db.list(ctx, "billers", "")
	if err != nil { return nil, err }
	allItems_billers, err := unmarshalAll[models.Biller](blobs_billers)
	if err != nil { return nil, err }

	
	var billers []*models.Biller
	for _, b := range allItems_billers {
		if b.IsActive && b.Category == category {
			billers = append(billers, b)
		}
	}
	return billers, nil

}

func (db *PostgresDB) GetBiller(ctx context.Context, id uuid.UUID) (*models.Biller, error) {

	v, _ := pgGet[models.Biller](ctx, db, "billers", id)
	return v, nil

}

func (db *PostgresDB) CreatePayment(ctx context.Context, payment *models.BillPayment) error {

	if err := db.upsert(ctx, "payments", payment.ID, payment); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetPayment(ctx context.Context, id uuid.UUID) (*models.BillPayment, error) {

	v, _ := pgGet[models.BillPayment](ctx, db, "payments", id)
	return v, nil

}

func (db *PostgresDB) GetUserPayments(ctx context.Context, userID uuid.UUID) ([]*models.BillPayment, error) {
	blobs_payments, err := db.list(ctx, "payments", "")
	if err != nil { return nil, err }
	allItems_payments, err := unmarshalAll[models.BillPayment](blobs_payments)
	if err != nil { return nil, err }

	
	var payments []*models.BillPayment
	for _, p := range allItems_payments {
		if p.UserID == userID {
			payments = append(payments, p)
		}
	}
	return payments, nil

}

func (db *PostgresDB) UpdatePayment(ctx context.Context, payment *models.BillPayment) error {

	if err := db.upsert(ctx, "payments", payment.ID, payment); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateSubscription(ctx context.Context, subscription *models.Subscription) error {

	if err := db.upsert(ctx, "subscriptions", subscription.ID, subscription); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetSubscription(ctx context.Context, id uuid.UUID) (*models.Subscription, error) {

	v, _ := pgGet[models.Subscription](ctx, db, "subscriptions", id)
	return v, nil

}

func (db *PostgresDB) GetUserSubscriptions(ctx context.Context, userID uuid.UUID) ([]*models.Subscription, error) {
	blobs_subscriptions, err := db.list(ctx, "subscriptions", "")
	if err != nil { return nil, err }
	allItems_subscriptions, err := unmarshalAll[models.Subscription](blobs_subscriptions)
	if err != nil { return nil, err }

	
	var subscriptions []*models.Subscription
	for _, s := range allItems_subscriptions {
		if s.UserID == userID {
			subscriptions = append(subscriptions, s)
		}
	}
	return subscriptions, nil

}

func (db *PostgresDB) UpdateSubscription(ctx context.Context, subscription *models.Subscription) error {

	if err := db.upsert(ctx, "subscriptions", subscription.ID, subscription); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteSubscription(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.subscriptions WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateSavedBiller(ctx context.Context, savedBiller *models.SavedBiller) error {

	if err := db.upsert(ctx, "saved_billers", savedBiller.ID, savedBiller); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserSavedBillers(ctx context.Context, userID uuid.UUID) ([]*models.SavedBiller, error) {
	blobs_savedBillers, err := db.list(ctx, "saved_billers", "")
	if err != nil { return nil, err }
	allItems_savedBillers, err := unmarshalAll[models.SavedBiller](blobs_savedBillers)
	if err != nil { return nil, err }

	
	var savedBillers []*models.SavedBiller
	for _, sb := range allItems_savedBillers {
		if sb.UserID == userID {
			savedBillers = append(savedBillers, sb)
		}
	}
	return savedBillers, nil

}

func (db *PostgresDB) DeleteSavedBiller(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.saved_billers WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error {

	if err := db.upsert(ctx, "scheduled", scheduled.ID, scheduled); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetScheduledPayment(ctx context.Context, id uuid.UUID) (*models.ScheduledPayment, error) {

	v, _ := pgGet[models.ScheduledPayment](ctx, db, "scheduled", id)
	return v, nil

}

func (db *PostgresDB) GetUserScheduledPayments(ctx context.Context, userID uuid.UUID) ([]*models.ScheduledPayment, error) {
	blobs_scheduled, err := db.list(ctx, "scheduled", "")
	if err != nil { return nil, err }
	allItems_scheduled, err := unmarshalAll[models.ScheduledPayment](blobs_scheduled)
	if err != nil { return nil, err }

	
	var scheduled []*models.ScheduledPayment
	for _, s := range allItems_scheduled {
		if s.UserID == userID {
			scheduled = append(scheduled, s)
		}
	}
	return scheduled, nil

}

func (db *PostgresDB) UpdateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error {

	if err := db.upsert(ctx, "scheduled", scheduled.ID, scheduled); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteScheduledPayment(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.scheduled WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}
