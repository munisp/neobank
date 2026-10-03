package database

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/bnpl-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "bnpl_service"

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
	for _, table := range []string{"limits", "merchants", "plans", "purchases"} {
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
	db.seedPlans(ctx)
	db.seedMerchants(ctx)
	return nil
}

func (db *PostgresDB) seedPlans(ctx context.Context) {

	plans := []models.BNPLPlan{
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay3,
			Name:          "Pay in 3",
			Description:   "Split your purchase into 3 interest-free payments",
			Installments:  3,
			InterestRate:  decimal.Zero,
			ProcessingFee: decimal.NewFromFloat(1.5),
			MinAmount:     decimal.NewFromInt(5000),
			MaxAmount:     decimal.NewFromInt(500000),
			Currency:      "NGN",
			FrequencyDays: 14,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay4,
			Name:          "Pay in 4",
			Description:   "Split your purchase into 4 interest-free payments",
			Installments:  4,
			InterestRate:  decimal.Zero,
			ProcessingFee: decimal.NewFromFloat(2.0),
			MinAmount:     decimal.NewFromInt(10000),
			MaxAmount:     decimal.NewFromInt(1000000),
			Currency:      "NGN",
			FrequencyDays: 14,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay6,
			Name:          "Pay in 6",
			Description:   "Split your purchase into 6 monthly payments",
			Installments:  6,
			InterestRate:  decimal.NewFromFloat(12.0),
			ProcessingFee: decimal.NewFromFloat(2.5),
			MinAmount:     decimal.NewFromInt(20000),
			MaxAmount:     decimal.NewFromInt(1500000),
			Currency:      "NGN",
			FrequencyDays: 30,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay12,
			Name:          "Pay in 12",
			Description:   "Split your purchase into 12 monthly payments",
			Installments:  12,
			InterestRate:  decimal.NewFromFloat(15.0),
			ProcessingFee: decimal.NewFromFloat(3.0),
			MinAmount:     decimal.NewFromInt(50000),
			MaxAmount:     decimal.NewFromInt(2000000),
			Currency:      "NGN",
			FrequencyDays: 30,
			IsActive:      true,
		},
	}
	
	for i := range plans {
		_ = db.upsert(ctx, "plans", plans[i].ID, &plans[i])
	}

}

func (db *PostgresDB) seedMerchants(ctx context.Context) {

	merchants := []models.BNPLMerchant{
		{ID: uuid.New(), Name: "Jumia", Category: "E-commerce", Website: "https://jumia.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Konga", Category: "E-commerce", Website: "https://konga.com", IsActive: true},
		{ID: uuid.New(), Name: "Slot", Category: "Electronics", Website: "https://slot.ng", IsActive: true},
		{ID: uuid.New(), Name: "Spar", Category: "Supermarket", Website: "https://spar.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Shoprite", Category: "Supermarket", Website: "https://shoprite.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Game", Category: "Electronics", Website: "https://game.co.za", IsActive: true},
		{ID: uuid.New(), Name: "Hubmart", Category: "Supermarket", Website: "https://hubmart.com", IsActive: true},
		{ID: uuid.New(), Name: "Payporte", Category: "Fashion", Website: "https://payporte.com", IsActive: true},
	}
	
	for i := range merchants {
		_ = db.upsert(ctx, "merchants", merchants[i].ID, &merchants[i])
	}

}

func (db *PostgresDB) GetPlans(ctx context.Context) ([]*models.BNPLPlan, error) {
	blobs_plans, err := db.list(ctx, "plans", "")
	if err != nil { return nil, err }
	allItems_plans, err := unmarshalAll[models.BNPLPlan](blobs_plans)
	if err != nil { return nil, err }

	
	var plans []*models.BNPLPlan
	for _, p := range allItems_plans {
		if p.IsActive {
			plans = append(plans, p)
		}
	}
	return plans, nil

}

func (db *PostgresDB) GetPlan(ctx context.Context, id uuid.UUID) (*models.BNPLPlan, error) {

	v, _ := pgGet[models.BNPLPlan](ctx, db, "plans", id)
	return v, nil

}

func (db *PostgresDB) GetPlanByType(ctx context.Context, planType models.BNPLPlanType) (*models.BNPLPlan, error) {
	blobs_plans, err := db.list(ctx, "plans", "")
	if err != nil { return nil, err }
	allItems_plans, err := unmarshalAll[models.BNPLPlan](blobs_plans)
	if err != nil { return nil, err }

	
	for _, p := range allItems_plans {
		if p.Type == planType && p.IsActive {
			return p, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) CreatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error {

	if err := db.upsert(ctx, "purchases", purchase.ID, purchase); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetPurchase(ctx context.Context, id uuid.UUID) (*models.BNPLPurchase, error) {

	v, _ := pgGet[models.BNPLPurchase](ctx, db, "purchases", id)
	return v, nil

}

func (db *PostgresDB) GetUserPurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error) {
	blobs_purchases, err := db.list(ctx, "purchases", "")
	if err != nil { return nil, err }
	allItems_purchases, err := unmarshalAll[models.BNPLPurchase](blobs_purchases)
	if err != nil { return nil, err }

	
	var purchases []*models.BNPLPurchase
	for _, p := range allItems_purchases {
		if p.UserID == userID {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil

}

func (db *PostgresDB) GetUserActivePurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error) {
	blobs_purchases, err := db.list(ctx, "purchases", "")
	if err != nil { return nil, err }
	allItems_purchases, err := unmarshalAll[models.BNPLPurchase](blobs_purchases)
	if err != nil { return nil, err }

	
	var purchases []*models.BNPLPurchase
	for _, p := range allItems_purchases {
		if p.UserID == userID && p.Status == models.BNPLStatusActive {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil

}

func (db *PostgresDB) UpdatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error {

	if err := db.upsert(ctx, "purchases", purchase.ID, purchase); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserLimit(ctx context.Context, userID uuid.UUID) (*models.BNPLLimit, error) {
	blobs_limits, err := db.list(ctx, "limits", "")
	if err != nil { return nil, err }
	allItems_limits, err := unmarshalAll[models.BNPLLimit](blobs_limits)
	if err != nil { return nil, err }

	
	for _, l := range allItems_limits {
		if l.UserID == userID {
			return l, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) CreateLimit(ctx context.Context, limit *models.BNPLLimit) error {

	if err := db.upsert(ctx, "limits", limit.ID, limit); err != nil { return err }
	return nil

}

func (db *PostgresDB) UpdateLimit(ctx context.Context, limit *models.BNPLLimit) error {

	if err := db.upsert(ctx, "limits", limit.ID, limit); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetMerchants(ctx context.Context) ([]*models.BNPLMerchant, error) {
	blobs_merchants, err := db.list(ctx, "merchants", "")
	if err != nil { return nil, err }
	allItems_merchants, err := unmarshalAll[models.BNPLMerchant](blobs_merchants)
	if err != nil { return nil, err }

	
	var merchants []*models.BNPLMerchant
	for _, m := range allItems_merchants {
		if m.IsActive {
			merchants = append(merchants, m)
		}
	}
	return merchants, nil

}
