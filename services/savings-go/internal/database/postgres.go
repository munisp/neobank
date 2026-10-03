package database

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/savings-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "savings_service"

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
	for _, table := range []string{"fixed_deposits", "flexible_savings", "group_savings", "salary_advances", "vault_txns", "vaults"} {
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

func (db *PostgresDB) seedInterestTiers() {
	// tiers are static reference data (see tiers.go) — nothing to persist
}

func (db *PostgresDB) GetInterestTiers() []models.InterestTier {
	return defaultInterestTiers
}

func (db *PostgresDB) GetInterestRateForBalance(balance decimal.Decimal) decimal.Decimal {
	for _, tier := range defaultInterestTiers {
		if balance.GreaterThanOrEqual(tier.MinBalance) && balance.LessThan(tier.MaxBalance) {
			return tier.Rate
		}
	}
	return decimal.NewFromFloat(4.0)
}

func (db *PostgresDB) CreateVault(ctx context.Context, vault *models.Vault) error {

	if err := db.upsert(ctx, "vaults", vault.ID, vault); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetVault(ctx context.Context, id uuid.UUID) (*models.Vault, error) {

	v, _ := pgGet[models.Vault](ctx, db, "vaults", id)
	return v, nil

}

func (db *PostgresDB) GetUserVaults(ctx context.Context, userID uuid.UUID) ([]*models.Vault, error) {
	blobs_vaults, err := db.list(ctx, "vaults", "")
	if err != nil { return nil, err }
	allItems_vaults, err := unmarshalAll[models.Vault](blobs_vaults)
	if err != nil { return nil, err }

	
	var vaults []*models.Vault
	for _, v := range allItems_vaults {
		if v.UserID == userID {
			vaults = append(vaults, v)
		}
	}
	return vaults, nil

}

func (db *PostgresDB) GetUserVaultsByType(ctx context.Context, userID uuid.UUID, vaultType models.VaultType) ([]*models.Vault, error) {
	blobs_vaults, err := db.list(ctx, "vaults", "")
	if err != nil { return nil, err }
	allItems_vaults, err := unmarshalAll[models.Vault](blobs_vaults)
	if err != nil { return nil, err }

	
	var vaults []*models.Vault
	for _, v := range allItems_vaults {
		if v.UserID == userID && v.Type == vaultType {
			vaults = append(vaults, v)
		}
	}
	return vaults, nil

}

func (db *PostgresDB) UpdateVault(ctx context.Context, vault *models.Vault) error {

	if err := db.upsert(ctx, "vaults", vault.ID, vault); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteVault(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.vaults WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateVaultTransaction(ctx context.Context, txn *models.VaultTransaction) error {

	if err := db.upsert(ctx, "vault_txns", txn.ID, txn); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetVaultTransactions(ctx context.Context, vaultID uuid.UUID) ([]*models.VaultTransaction, error) {
	blobs_vaultTxns, err := db.list(ctx, "vault_txns", "")
	if err != nil { return nil, err }
	allItems_vaultTxns, err := unmarshalAll[models.VaultTransaction](blobs_vaultTxns)
	if err != nil { return nil, err }

	
	var txns []*models.VaultTransaction
	for _, t := range allItems_vaultTxns {
		if t.VaultID == vaultID {
			txns = append(txns, t)
		}
	}
	return txns, nil

}

func (db *PostgresDB) CreateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error {

	if err := db.upsert(ctx, "flexible_savings", savings.ID, savings); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetFlexibleSavings(ctx context.Context, id uuid.UUID) (*models.FlexibleSavings, error) {

	v, _ := pgGet[models.FlexibleSavings](ctx, db, "flexible_savings", id)
	return v, nil

}

func (db *PostgresDB) GetUserFlexibleSavings(ctx context.Context, userID uuid.UUID) (*models.FlexibleSavings, error) {
	blobs_flexibleSavings, err := db.list(ctx, "flexible_savings", "")
	if err != nil { return nil, err }
	allItems_flexibleSavings, err := unmarshalAll[models.FlexibleSavings](blobs_flexibleSavings)
	if err != nil { return nil, err }

	
	for _, s := range allItems_flexibleSavings {
		if s.UserID == userID {
			return s, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) UpdateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error {

	if err := db.upsert(ctx, "flexible_savings", savings.ID, savings); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error {

	if err := db.upsert(ctx, "fixed_deposits", deposit.ID, deposit); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetFixedDeposit(ctx context.Context, id uuid.UUID) (*models.FixedDeposit, error) {

	v, _ := pgGet[models.FixedDeposit](ctx, db, "fixed_deposits", id)
	return v, nil

}

func (db *PostgresDB) GetUserFixedDeposits(ctx context.Context, userID uuid.UUID) ([]*models.FixedDeposit, error) {
	blobs_fixedDeposits, err := db.list(ctx, "fixed_deposits", "")
	if err != nil { return nil, err }
	allItems_fixedDeposits, err := unmarshalAll[models.FixedDeposit](blobs_fixedDeposits)
	if err != nil { return nil, err }

	
	var deposits []*models.FixedDeposit
	for _, d := range allItems_fixedDeposits {
		if d.UserID == userID {
			deposits = append(deposits, d)
		}
	}
	return deposits, nil

}

func (db *PostgresDB) UpdateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error {

	if err := db.upsert(ctx, "fixed_deposits", deposit.ID, deposit); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateGroupSavings(ctx context.Context, group *models.GroupSavings) error {

	if err := db.upsert(ctx, "group_savings", group.ID, group); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetGroupSavings(ctx context.Context, id uuid.UUID) (*models.GroupSavings, error) {

	v, _ := pgGet[models.GroupSavings](ctx, db, "group_savings", id)
	return v, nil

}

func (db *PostgresDB) GetAllGroupSavings(ctx context.Context) ([]*models.GroupSavings, error) {
	blobs_groupSavings, err := db.list(ctx, "group_savings", "")
	if err != nil { return nil, err }
	allItems_groupSavings, err := unmarshalAll[models.GroupSavings](blobs_groupSavings)
	if err != nil { return nil, err }

	
	var groups []*models.GroupSavings
	for _, g := range allItems_groupSavings {
		groups = append(groups, g)
	}
	return groups, nil

}

func (db *PostgresDB) GetUserGroupSavings(ctx context.Context, userID uuid.UUID) ([]*models.GroupSavings, error) {
	blobs_groupSavings, err := db.list(ctx, "group_savings", "")
	if err != nil { return nil, err }
	allItems_groupSavings, err := unmarshalAll[models.GroupSavings](blobs_groupSavings)
	if err != nil { return nil, err }

	
	var groups []*models.GroupSavings
	for _, g := range allItems_groupSavings {
		for _, m := range g.Members {
			if m.UserID == userID {
				groups = append(groups, g)
				break
			}
		}
	}
	return groups, nil

}

func (db *PostgresDB) UpdateGroupSavings(ctx context.Context, group *models.GroupSavings) error {

	if err := db.upsert(ctx, "group_savings", group.ID, group); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error {

	if err := db.upsert(ctx, "salary_advances", advance.ID, advance); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetSalaryAdvance(ctx context.Context, id uuid.UUID) (*models.SalaryAdvance, error) {

	v, _ := pgGet[models.SalaryAdvance](ctx, db, "salary_advances", id)
	return v, nil

}

func (db *PostgresDB) GetUserSalaryAdvances(ctx context.Context, userID uuid.UUID) ([]*models.SalaryAdvance, error) {
	blobs_salaryAdvances, err := db.list(ctx, "salary_advances", "")
	if err != nil { return nil, err }
	allItems_salaryAdvances, err := unmarshalAll[models.SalaryAdvance](blobs_salaryAdvances)
	if err != nil { return nil, err }

	
	var advances []*models.SalaryAdvance
	for _, a := range allItems_salaryAdvances {
		if a.UserID == userID {
			advances = append(advances, a)
		}
	}
	return advances, nil

}

func (db *PostgresDB) GetUserActiveSalaryAdvance(ctx context.Context, userID uuid.UUID) (*models.SalaryAdvance, error) {
	blobs_salaryAdvances, err := db.list(ctx, "salary_advances", "")
	if err != nil { return nil, err }
	allItems_salaryAdvances, err := unmarshalAll[models.SalaryAdvance](blobs_salaryAdvances)
	if err != nil { return nil, err }

	
	for _, a := range allItems_salaryAdvances {
		if a.UserID == userID && (a.Status == "pending" || a.Status == "approved" || a.Status == "disbursed") {
			return a, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) UpdateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error {

	if err := db.upsert(ctx, "salary_advances", advance.ID, advance); err != nil { return err }
	return nil

}
