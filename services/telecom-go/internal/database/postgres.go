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
	"github.com/neobank/telecom-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "telecom_service"

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
	for _, table := range []string{"airtime_txns", "beneficiaries", "data_plans", "data_txns", "esim_plans", "esim_purchases", "networks"} {
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
	db.seedNetworks(ctx)
	db.seedESIMPlans(ctx)
	db.seedDataPlans(ctx)
	return nil
}

func (db *PostgresDB) seedNetworks(ctx context.Context) {

	now := time.Now()
	networks := []models.Network{
		{
			ID:              uuid.New(),
			Name:            "MTN Nigeria",
			Code:            "MTN",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0803", "0806", "0813", "0816", "0703", "0706", "0903", "0906"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Airtel Nigeria",
			Code:            "AIRTEL",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0802", "0808", "0812", "0701", "0708", "0902", "0907", "0901"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Glo Nigeria",
			Code:            "GLO",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    false,
			PhonePrefix:     []string{"0805", "0807", "0811", "0815", "0705", "0905"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "9mobile Nigeria",
			Code:            "9MOBILE",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    false,
			PhonePrefix:     []string{"0809", "0817", "0818", "0908", "0909"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Safaricom Kenya",
			Code:            "SAFARICOM",
			Country:         "KE",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0700", "0701", "0702", "0703", "0704", "0705", "0706", "0707", "0708", "0709", "0710", "0711", "0712"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Vodacom South Africa",
			Code:            "VODACOM",
			Country:         "ZA",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"072", "073", "082", "083"},
			IsActive:        true,
			CreatedAt:       now,
		},
	}
	
	for i := range networks {
		_ = db.upsert(ctx, "networks", networks[i].ID, &networks[i])
	}

}

func (db *PostgresDB) seedDataPlans(ctx context.Context) {
	blobs_networks, err := db.list(ctx, "networks", "")
	if err != nil { return }
	allItems_networks, err := unmarshalAll[models.Network](blobs_networks)
	if err != nil { return }

	now := time.Now()
	
	// Get MTN network ID
	var mtnID, airtelID, gloID uuid.UUID
	for _, n := range allItems_networks {
		id := n.ID
		switch n.Code {
		case "MTN":
			mtnID = id
		case "AIRTEL":
			airtelID = id
		case "GLO":
			gloID = id
		}
	}
	
	plans := []models.DataPlan{
		// MTN Plans
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Daily 100MB", DataAmount: "100MB", DataBytes: 104857600, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Daily 1GB", DataAmount: "1GB", DataBytes: 1073741824, Validity: 1, Price: decimal.NewFromInt(350), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Weekly 1.5GB", DataAmount: "1.5GB", DataBytes: 1610612736, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 2GB", DataAmount: "2GB", DataBytes: 2147483648, Validity: 30, Price: decimal.NewFromInt(1200), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 5GB", DataAmount: "5GB", DataBytes: 5368709120, Validity: 30, Price: decimal.NewFromInt(2500), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 10GB", DataAmount: "10GB", DataBytes: 10737418240, Validity: 30, Price: decimal.NewFromInt(5000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		
		// Airtel Plans
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Daily 100MB", DataAmount: "100MB", DataBytes: 104857600, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Weekly 1GB", DataAmount: "1GB", DataBytes: 1073741824, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Monthly 3GB", DataAmount: "3GB", DataBytes: 3221225472, Validity: 30, Price: decimal.NewFromInt(1500), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Monthly 10GB", DataAmount: "10GB", DataBytes: 10737418240, Validity: 30, Price: decimal.NewFromInt(4000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		
		// Glo Plans
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Daily 200MB", DataAmount: "200MB", DataBytes: 209715200, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Weekly 1.6GB", DataAmount: "1.6GB", DataBytes: 1717986918, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Monthly 4.5GB", DataAmount: "4.5GB", DataBytes: 4831838208, Validity: 30, Price: decimal.NewFromInt(2000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
	}
	
	for i := range plans {
		_ = db.upsert(ctx, "data_plans", plans[i].ID, &plans[i])
	}

}

func (db *PostgresDB) seedESIMPlans(ctx context.Context) {

	now := time.Now()
	plans := []models.ESIMPlan{
		// Africa Regional
		{
			ID:          uuid.New(),
			Name:        "Africa 1GB",
			Description: "1GB data for 7 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(5000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Africa 3GB",
			Description: "3GB data for 15 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "3GB",
			DataBytes:   3221225472,
			Validity:    15,
			Price:       decimal.NewFromInt(12000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Africa 5GB",
			Description: "5GB data for 30 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(18000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		// Europe
		{
			ID:          uuid.New(),
			Name:        "Europe 1GB",
			Description: "1GB data for 7 days across Europe",
			Countries:   []string{"GB", "FR", "DE", "IT", "ES", "NL", "BE", "PT"},
			Region:      "europe",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(8000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Europe 5GB",
			Description: "5GB data for 30 days across Europe",
			Countries:   []string{"GB", "FR", "DE", "IT", "ES", "NL", "BE", "PT"},
			Region:      "europe",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(25000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		// Global
		{
			ID:          uuid.New(),
			Name:        "Global 1GB",
			Description: "1GB data for 7 days worldwide",
			Countries:   []string{"US", "GB", "FR", "DE", "JP", "AU", "CA", "SG"},
			Region:      "global",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(10000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Global 5GB",
			Description: "5GB data for 30 days worldwide",
			Countries:   []string{"US", "GB", "FR", "DE", "JP", "AU", "CA", "SG"},
			Region:      "global",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(35000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
	}
	
	for i := range plans {
		_ = db.upsert(ctx, "esim_plans", plans[i].ID, &plans[i])
	}

}

func (db *PostgresDB) GetNetworks(ctx context.Context) ([]*models.Network, error) {
	blobs_networks, err := db.list(ctx, "networks", "")
	if err != nil { return nil, err }
	allItems_networks, err := unmarshalAll[models.Network](blobs_networks)
	if err != nil { return nil, err }

	
	var networks []*models.Network
	for _, n := range allItems_networks {
		if n.IsActive {
			networks = append(networks, n)
		}
	}
	return networks, nil

}

func (db *PostgresDB) GetNetworksByCountry(ctx context.Context, country string) ([]*models.Network, error) {
	blobs_networks, err := db.list(ctx, "networks", "")
	if err != nil { return nil, err }
	allItems_networks, err := unmarshalAll[models.Network](blobs_networks)
	if err != nil { return nil, err }

	
	var networks []*models.Network
	for _, n := range allItems_networks {
		if n.IsActive && n.Country == country {
			networks = append(networks, n)
		}
	}
	return networks, nil

}

func (db *PostgresDB) GetNetwork(ctx context.Context, id uuid.UUID) (*models.Network, error) {

	v, _ := pgGet[models.Network](ctx, db, "networks", id)
	return v, nil

}

func (db *PostgresDB) GetNetworkByPrefix(ctx context.Context, prefix string) (*models.Network, error) {
	blobs_networks, err := db.list(ctx, "networks", "")
	if err != nil { return nil, err }
	allItems_networks, err := unmarshalAll[models.Network](blobs_networks)
	if err != nil { return nil, err }

	
	for _, n := range allItems_networks {
		for _, p := range n.PhonePrefix {
			if p == prefix {
				return n, nil
			}
		}
	}
	return nil, nil

}

func (db *PostgresDB) GetDataPlans(ctx context.Context, networkID uuid.UUID) ([]*models.DataPlan, error) {
	blobs_dataPlans, err := db.list(ctx, "data_plans", "")
	if err != nil { return nil, err }
	allItems_dataPlans, err := unmarshalAll[models.DataPlan](blobs_dataPlans)
	if err != nil { return nil, err }

	
	var plans []*models.DataPlan
	for _, p := range allItems_dataPlans {
		if p.IsActive && p.NetworkID == networkID {
			plans = append(plans, p)
		}
	}
	return plans, nil

}

func (db *PostgresDB) GetDataPlan(ctx context.Context, id uuid.UUID) (*models.DataPlan, error) {

	v, _ := pgGet[models.DataPlan](ctx, db, "data_plans", id)
	return v, nil

}

func (db *PostgresDB) GetESIMPlans(ctx context.Context) ([]*models.ESIMPlan, error) {
	blobs_esimPlans, err := db.list(ctx, "esim_plans", "")
	if err != nil { return nil, err }
	allItems_esimPlans, err := unmarshalAll[models.ESIMPlan](blobs_esimPlans)
	if err != nil { return nil, err }

	
	var plans []*models.ESIMPlan
	for _, p := range allItems_esimPlans {
		if p.IsActive {
			plans = append(plans, p)
		}
	}
	return plans, nil

}

func (db *PostgresDB) GetESIMPlansByRegion(ctx context.Context, region string) ([]*models.ESIMPlan, error) {
	blobs_esimPlans, err := db.list(ctx, "esim_plans", "")
	if err != nil { return nil, err }
	allItems_esimPlans, err := unmarshalAll[models.ESIMPlan](blobs_esimPlans)
	if err != nil { return nil, err }

	
	var plans []*models.ESIMPlan
	for _, p := range allItems_esimPlans {
		if p.IsActive && p.Region == region {
			plans = append(plans, p)
		}
	}
	return plans, nil

}

func (db *PostgresDB) GetESIMPlan(ctx context.Context, id uuid.UUID) (*models.ESIMPlan, error) {

	v, _ := pgGet[models.ESIMPlan](ctx, db, "esim_plans", id)
	return v, nil

}

func (db *PostgresDB) CreateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error {

	if err := db.upsert(ctx, "airtime_txns", txn.ID, txn); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserAirtimeTransactions(ctx context.Context, userID uuid.UUID) ([]*models.AirtimeTransaction, error) {
	blobs_airtimeTxns, err := db.list(ctx, "airtime_txns", "")
	if err != nil { return nil, err }
	allItems_airtimeTxns, err := unmarshalAll[models.AirtimeTransaction](blobs_airtimeTxns)
	if err != nil { return nil, err }

	
	var txns []*models.AirtimeTransaction
	for _, t := range allItems_airtimeTxns {
		if t.UserID == userID {
			txns = append(txns, t)
		}
	}
	return txns, nil

}

func (db *PostgresDB) UpdateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error {

	if err := db.upsert(ctx, "airtime_txns", txn.ID, txn); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateDataTransaction(ctx context.Context, txn *models.DataTransaction) error {

	if err := db.upsert(ctx, "data_txns", txn.ID, txn); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserDataTransactions(ctx context.Context, userID uuid.UUID) ([]*models.DataTransaction, error) {
	blobs_dataTxns, err := db.list(ctx, "data_txns", "")
	if err != nil { return nil, err }
	allItems_dataTxns, err := unmarshalAll[models.DataTransaction](blobs_dataTxns)
	if err != nil { return nil, err }

	
	var txns []*models.DataTransaction
	for _, t := range allItems_dataTxns {
		if t.UserID == userID {
			txns = append(txns, t)
		}
	}
	return txns, nil

}

func (db *PostgresDB) UpdateDataTransaction(ctx context.Context, txn *models.DataTransaction) error {

	if err := db.upsert(ctx, "data_txns", txn.ID, txn); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error {

	if err := db.upsert(ctx, "esim_purchases", purchase.ID, purchase); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetESIMPurchase(ctx context.Context, id uuid.UUID) (*models.ESIMPurchase, error) {

	v, _ := pgGet[models.ESIMPurchase](ctx, db, "esim_purchases", id)
	return v, nil

}

func (db *PostgresDB) GetUserESIMPurchases(ctx context.Context, userID uuid.UUID) ([]*models.ESIMPurchase, error) {
	blobs_esimPurchases, err := db.list(ctx, "esim_purchases", "")
	if err != nil { return nil, err }
	allItems_esimPurchases, err := unmarshalAll[models.ESIMPurchase](blobs_esimPurchases)
	if err != nil { return nil, err }

	
	var purchases []*models.ESIMPurchase
	for _, p := range allItems_esimPurchases {
		if p.UserID == userID {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil

}

func (db *PostgresDB) UpdateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error {

	if err := db.upsert(ctx, "esim_purchases", purchase.ID, purchase); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateBeneficiary(ctx context.Context, beneficiary *models.SavedBeneficiary) error {

	if err := db.upsert(ctx, "beneficiaries", beneficiary.ID, beneficiary); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserBeneficiaries(ctx context.Context, userID uuid.UUID) ([]*models.SavedBeneficiary, error) {
	blobs_beneficiaries, err := db.list(ctx, "beneficiaries", "")
	if err != nil { return nil, err }
	allItems_beneficiaries, err := unmarshalAll[models.SavedBeneficiary](blobs_beneficiaries)
	if err != nil { return nil, err }

	
	var beneficiaries []*models.SavedBeneficiary
	for _, b := range allItems_beneficiaries {
		if b.UserID == userID {
			beneficiaries = append(beneficiaries, b)
		}
	}
	return beneficiaries, nil

}

func (db *PostgresDB) DeleteBeneficiary(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.beneficiaries WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}
