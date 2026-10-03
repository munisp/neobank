package database

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/accounts-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN
// indexes; filters evaluate against JSONB fields.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "accounts_service"

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
	for _, table := range []string{"accounts", "account_invitations", "spending_controls"} {
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

// -- accounts ------------------------------------------------------------------

func (db *PostgresDB) CreateAccount(ctx context.Context, account *models.Account) error {
	return db.upsert(ctx, "accounts", account.ID, account)
}

func (db *PostgresDB) GetAccount(ctx context.Context, id uuid.UUID) (*models.Account, error) {
	var a models.Account
	found, err := db.get(ctx, "accounts", id, &a)
	if err != nil || !found {
		return nil, err // nil, nil mirrors in-memory miss semantics
	}
	return &a, nil
}

func (db *PostgresDB) GetUserAccounts(ctx context.Context, userID uuid.UUID) ([]*models.Account, error) {
	blobs, err := db.list(ctx, "accounts",
		`data->>'user_id' = $1::text OR EXISTS (
			SELECT 1 FROM jsonb_array_elements(data->'joint_details'->'owners') o
			WHERE o->>'user_id' = $1::text AND o->>'status' = 'accepted'
		)`, userID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.Account](blobs)
}

func (db *PostgresDB) GetUserAccountsByType(ctx context.Context, userID uuid.UUID, accountType models.AccountType) ([]*models.Account, error) {
	blobs, err := db.list(ctx, "accounts",
		`data->>'user_id' = $1 AND data->>'type' = $2`, userID.String(), string(accountType))
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.Account](blobs)
}

func (db *PostgresDB) GetKidsAccountsByParent(ctx context.Context, parentID uuid.UUID) ([]*models.Account, error) {
	blobs, err := db.list(ctx, "accounts",
		`data->>'type' = 'kids' AND data->'kids_details'->>'parent_id' = $1`, parentID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.Account](blobs)
}

func (db *PostgresDB) UpdateAccount(ctx context.Context, account *models.Account) error {
	return db.upsert(ctx, "accounts", account.ID, account)
}

func (db *PostgresDB) DeleteAccount(ctx context.Context, id uuid.UUID) error {
	_, err := db.pool.Exec(ctx,
		fmt.Sprintf(`DELETE FROM %s.accounts WHERE id = $1`, schemaName), id)
	return err
}

// -- invitations -----------------------------------------------------------------

func (db *PostgresDB) CreateInvitation(ctx context.Context, invitation *models.AccountInvitation) error {
	return db.upsert(ctx, "account_invitations", invitation.ID, invitation)
}

func (db *PostgresDB) GetInvitation(ctx context.Context, id uuid.UUID) (*models.AccountInvitation, error) {
	var v models.AccountInvitation
	found, err := db.get(ctx, "account_invitations", id, &v)
	if err != nil || !found {
		return nil, err
	}
	return &v, nil
}

func (db *PostgresDB) GetInvitationsByEmail(ctx context.Context, email string) ([]*models.AccountInvitation, error) {
	blobs, err := db.list(ctx, "account_invitations", `data->>'invitee_email' = $1`, email)
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.AccountInvitation](blobs)
}

func (db *PostgresDB) GetAccountInvitations(ctx context.Context, accountID uuid.UUID) ([]*models.AccountInvitation, error) {
	blobs, err := db.list(ctx, "account_invitations", `data->>'account_id' = $1`, accountID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.AccountInvitation](blobs)
}

func (db *PostgresDB) UpdateInvitation(ctx context.Context, invitation *models.AccountInvitation) error {
	return db.upsert(ctx, "account_invitations", invitation.ID, invitation)
}

// -- spending controls -------------------------------------------------------------

func (db *PostgresDB) CreateSpendingControl(ctx context.Context, control *models.SpendingControl) error {
	return db.upsert(ctx, "spending_controls", control.ID, control)
}

func (db *PostgresDB) GetAccountSpendingControls(ctx context.Context, accountID uuid.UUID) ([]*models.SpendingControl, error) {
	blobs, err := db.list(ctx, "spending_controls", `data->>'account_id' = $1`, accountID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.SpendingControl](blobs)
}

func (db *PostgresDB) UpdateSpendingControl(ctx context.Context, control *models.SpendingControl) error {
	return db.upsert(ctx, "spending_controls", control.ID, control)
}

