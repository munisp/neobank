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
	"github.com/neobank/insurance-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "insurance_service"

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
	for _, table := range []string{"claims", "policies", "products"} {
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
	db.seedProducts(ctx)
	return nil
}

func (db *PostgresDB) seedProducts(ctx context.Context) {

	products := []models.InsuranceProduct{
		// Travel Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeTravel,
			Name:           "Travel Basic",
			Description:    "Essential travel coverage for domestic and international trips",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(1000000),
			Deductible:     decimal.NewFromInt(5000),
			PremiumMonthly: decimal.NewFromFloat(2500),
			PremiumAnnual:  decimal.NewFromFloat(25000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Medical Expenses", Description: "Emergency medical treatment abroad", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Trip Cancellation", Description: "Reimbursement for cancelled trips", Limit: decimal.NewFromInt(200000), Covered: true},
				{Name: "Baggage Loss", Description: "Lost or delayed baggage", Limit: decimal.NewFromInt(100000), Covered: true},
				{Name: "Flight Delay", Description: "Compensation for flight delays", Limit: decimal.NewFromInt(50000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions", "Extreme sports", "War zones"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeTravel,
			Name:           "Travel Premium",
			Description:    "Comprehensive travel coverage with higher limits",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(5000000),
			Deductible:     decimal.NewFromInt(2500),
			PremiumMonthly: decimal.NewFromFloat(7500),
			PremiumAnnual:  decimal.NewFromFloat(75000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Medical Expenses", Description: "Emergency medical treatment abroad", Limit: decimal.NewFromInt(3000000), Covered: true},
				{Name: "Trip Cancellation", Description: "Reimbursement for cancelled trips", Limit: decimal.NewFromInt(1000000), Covered: true},
				{Name: "Baggage Loss", Description: "Lost or delayed baggage", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Flight Delay", Description: "Compensation for flight delays", Limit: decimal.NewFromInt(200000), Covered: true},
				{Name: "Emergency Evacuation", Description: "Medical evacuation", Limit: decimal.NewFromInt(2000000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions", "War zones"},
		},
		// Device Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeDevice,
			Name:           "Device Protect Basic",
			Description:    "Protection for smartphones and tablets",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(500000),
			Deductible:     decimal.NewFromInt(10000),
			PremiumMonthly: decimal.NewFromFloat(1500),
			PremiumAnnual:  decimal.NewFromFloat(15000),
			Currency:       "NGN",
			WaitingPeriod:  14,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Accidental Damage", Description: "Drops, spills, and cracks", Limit: decimal.NewFromInt(300000), Covered: true},
				{Name: "Screen Damage", Description: "Cracked or broken screens", Limit: decimal.NewFromInt(150000), Covered: true},
				{Name: "Theft", Description: "Stolen devices", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Cosmetic damage", "Software issues", "Devices over 2 years old"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeDevice,
			Name:           "Device Protect Premium",
			Description:    "Comprehensive protection for all devices",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(1500000),
			Deductible:     decimal.NewFromInt(5000),
			PremiumMonthly: decimal.NewFromFloat(3500),
			PremiumAnnual:  decimal.NewFromFloat(35000),
			Currency:       "NGN",
			WaitingPeriod:  7,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Accidental Damage", Description: "Drops, spills, and cracks", Limit: decimal.NewFromInt(1000000), Covered: true},
				{Name: "Screen Damage", Description: "Cracked or broken screens", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Theft", Description: "Stolen devices", Limit: decimal.NewFromInt(1500000), Covered: true},
				{Name: "Water Damage", Description: "Liquid damage", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Worldwide Coverage", Description: "Protection anywhere in the world", Limit: decimal.NewFromInt(1500000), Covered: true},
			},
			Exclusions: []string{"Cosmetic damage", "Software issues"},
		},
		// Life Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeLife,
			Name:           "Term Life Basic",
			Description:    "Affordable term life insurance",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(10000000),
			Deductible:     decimal.Zero,
			PremiumMonthly: decimal.NewFromFloat(5000),
			PremiumAnnual:  decimal.NewFromFloat(50000),
			Currency:       "NGN",
			MinAge:         18,
			MaxAge:         60,
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Death Benefit", Description: "Payout to beneficiaries", Limit: decimal.NewFromInt(10000000), Covered: true},
				{Name: "Accidental Death", Description: "Additional payout for accidental death", Limit: decimal.NewFromInt(5000000), Covered: true},
			},
			Exclusions: []string{"Suicide within first 2 years", "Death from illegal activities"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeLife,
			Name:           "Term Life Premium",
			Description:    "Comprehensive life insurance with critical illness",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(50000000),
			Deductible:     decimal.Zero,
			PremiumMonthly: decimal.NewFromFloat(15000),
			PremiumAnnual:  decimal.NewFromFloat(150000),
			Currency:       "NGN",
			MinAge:         18,
			MaxAge:         65,
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Death Benefit", Description: "Payout to beneficiaries", Limit: decimal.NewFromInt(50000000), Covered: true},
				{Name: "Accidental Death", Description: "Additional payout for accidental death", Limit: decimal.NewFromInt(25000000), Covered: true},
				{Name: "Critical Illness", Description: "Payout on diagnosis of critical illness", Limit: decimal.NewFromInt(25000000), Covered: true},
				{Name: "Disability", Description: "Payout for permanent disability", Limit: decimal.NewFromInt(25000000), Covered: true},
			},
			Exclusions: []string{"Suicide within first 2 years"},
		},
		// Health Insurance
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeHealth,
			Name:           "Health Basic",
			Description:    "Essential health coverage",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(5000000),
			Deductible:     decimal.NewFromInt(25000),
			PremiumMonthly: decimal.NewFromFloat(10000),
			PremiumAnnual:  decimal.NewFromFloat(100000),
			Currency:       "NGN",
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Hospitalization", Description: "Inpatient treatment", Limit: decimal.NewFromInt(3000000), Covered: true},
				{Name: "Outpatient", Description: "Doctor visits and tests", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Surgery", Description: "Surgical procedures", Limit: decimal.NewFromInt(2000000), Covered: true},
				{Name: "Maternity", Description: "Pregnancy and childbirth", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions (first 12 months)", "Cosmetic surgery"},
		},
		// Purchase Protection
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypePurchase,
			Name:           "Purchase Protection",
			Description:    "Protection for your purchases",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(500000),
			Deductible:     decimal.NewFromInt(2500),
			PremiumMonthly: decimal.NewFromFloat(500),
			PremiumAnnual:  decimal.NewFromFloat(5000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Damage Protection", Description: "Accidental damage to purchases", Limit: decimal.NewFromInt(250000), Covered: true},
				{Name: "Theft Protection", Description: "Stolen items", Limit: decimal.NewFromInt(250000), Covered: true},
				{Name: "Extended Warranty", Description: "Extended manufacturer warranty", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Items over 90 days old", "Used items"},
		},
	}
	
	for i := range products {
		products[i].CreatedAt = time.Now()
		_ = db.upsert(ctx, "products", products[i].ID, &products[i])
	}

}

func (db *PostgresDB) GetProducts(ctx context.Context, insuranceType models.InsuranceType) ([]*models.InsuranceProduct, error) {
	blobs_products, err := db.list(ctx, "products", "")
	if err != nil { return nil, err }
	allItems_products, err := unmarshalAll[models.InsuranceProduct](blobs_products)
	if err != nil { return nil, err }

	
	var products []*models.InsuranceProduct
	for _, p := range allItems_products {
		if p.IsActive && (insuranceType == "" || p.Type == insuranceType) {
			products = append(products, p)
		}
	}
	return products, nil

}

func (db *PostgresDB) GetProduct(ctx context.Context, id uuid.UUID) (*models.InsuranceProduct, error) {

	v, _ := pgGet[models.InsuranceProduct](ctx, db, "products", id)
	return v, nil

}

func (db *PostgresDB) CreatePolicy(ctx context.Context, policy *models.InsurancePolicy) error {

	if err := db.upsert(ctx, "policies", policy.ID, policy); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetPolicy(ctx context.Context, id uuid.UUID) (*models.InsurancePolicy, error) {

	v, _ := pgGet[models.InsurancePolicy](ctx, db, "policies", id)
	return v, nil

}

func (db *PostgresDB) GetUserPolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error) {
	blobs_policies, err := db.list(ctx, "policies", "")
	if err != nil { return nil, err }
	allItems_policies, err := unmarshalAll[models.InsurancePolicy](blobs_policies)
	if err != nil { return nil, err }

	
	var policies []*models.InsurancePolicy
	for _, p := range allItems_policies {
		if p.UserID == userID {
			policies = append(policies, p)
		}
	}
	return policies, nil

}

func (db *PostgresDB) GetUserActivePolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error) {
	blobs_policies, err := db.list(ctx, "policies", "")
	if err != nil { return nil, err }
	allItems_policies, err := unmarshalAll[models.InsurancePolicy](blobs_policies)
	if err != nil { return nil, err }

	
	var policies []*models.InsurancePolicy
	for _, p := range allItems_policies {
		if p.UserID == userID && p.Status == models.PolicyStatusActive {
			policies = append(policies, p)
		}
	}
	return policies, nil

}

func (db *PostgresDB) UpdatePolicy(ctx context.Context, policy *models.InsurancePolicy) error {

	if err := db.upsert(ctx, "policies", policy.ID, policy); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateClaim(ctx context.Context, claim *models.InsuranceClaim) error {

	if err := db.upsert(ctx, "claims", claim.ID, claim); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetClaim(ctx context.Context, id uuid.UUID) (*models.InsuranceClaim, error) {

	v, _ := pgGet[models.InsuranceClaim](ctx, db, "claims", id)
	return v, nil

}

func (db *PostgresDB) GetUserClaims(ctx context.Context, userID uuid.UUID) ([]*models.InsuranceClaim, error) {
	blobs_claims, err := db.list(ctx, "claims", "")
	if err != nil { return nil, err }
	allItems_claims, err := unmarshalAll[models.InsuranceClaim](blobs_claims)
	if err != nil { return nil, err }

	
	var claims []*models.InsuranceClaim
	for _, c := range allItems_claims {
		if c.UserID == userID {
			claims = append(claims, c)
		}
	}
	return claims, nil

}

func (db *PostgresDB) GetPolicyClaims(ctx context.Context, policyID uuid.UUID) ([]*models.InsuranceClaim, error) {
	blobs_claims, err := db.list(ctx, "claims", "")
	if err != nil { return nil, err }
	allItems_claims, err := unmarshalAll[models.InsuranceClaim](blobs_claims)
	if err != nil { return nil, err }

	
	var claims []*models.InsuranceClaim
	for _, c := range allItems_claims {
		if c.PolicyID == policyID {
			claims = append(claims, c)
		}
	}
	return claims, nil

}

func (db *PostgresDB) UpdateClaim(ctx context.Context, claim *models.InsuranceClaim) error {

	if err := db.upsert(ctx, "claims", claim.ID, claim); err != nil { return err }
	return nil

}
