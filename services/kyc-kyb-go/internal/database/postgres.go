package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/kyc-kyb-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "kyc_kyb_service"

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
	for _, table := range []string{"address_infos", "aml_screenings", "biometric_data", "business_infos", "cac_verifications", "financial_infos", "identity_verifications", "kyb_applications", "kyb_documents", "kyc_applications", "kyc_documents", "personal_infos", "risk_assessments", "ubos"} {
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

func (db *PostgresDB) CreateKYCApplication(ctx context.Context, app *models.KYCApplication) error {


	app.ID = uuid.New()
	app.CreatedAt = time.Now()
	app.UpdatedAt = time.Now()
	app.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)

	if err := db.upsert(ctx, "kyc_applications", app.ID, app); err != nil { return err }

	return nil

}

func (db *PostgresDB) GetKYCApplication(ctx context.Context, id uuid.UUID) (*models.KYCApplication, error) {


	app, ok := pgGet[models.KYCApplication](ctx, db, "kyc_applications", id)
	if !ok {
		return nil, fmt.Errorf("KYC application not found: %s", id)
	}
	return app, nil

}

func (db *PostgresDB) GetKYCApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYCApplication, error) {
	blobs, err := db.list(ctx, "kyc_applications", "data->>'user_id' = $1", userID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.KYCApplication](blobs)
}

func (db *PostgresDB) UpdateKYCApplication(ctx context.Context, app *models.KYCApplication) error {


	if _, ok := pgGet[models.KYCApplication](ctx, db, "kyc_applications", app.ID); !ok {
		return fmt.Errorf("KYC application not found: %s", app.ID)
	}

	app.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "kyc_applications", app.ID, app); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error {


	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "personal_infos", info.ApplicationID, info); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetPersonalInfo(ctx context.Context, appID uuid.UUID) (*models.PersonalInfo, error) {


	info, ok := pgGet[models.PersonalInfo](ctx, db, "personal_infos", appID)
	if !ok {
		return nil, nil
	}
	return info, nil

}

func (db *PostgresDB) UpdatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error {


	info.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "personal_infos", info.ApplicationID, info); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateAddressInfo(ctx context.Context, info *models.AddressInfo) error {


	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "address_infos", info.ApplicationID, info); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetAddressInfo(ctx context.Context, appID uuid.UUID) (*models.AddressInfo, error) {


	info, ok := pgGet[models.AddressInfo](ctx, db, "address_infos", appID)
	if !ok {
		return nil, nil
	}
	return info, nil

}

func (db *PostgresDB) CreateIdentityVerification(ctx context.Context, v *models.IdentityVerification) error {


	v.ID = uuid.New()
	v.CreatedAt = time.Now()
	v.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "identity_verifications", v.ApplicationID, v); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetIdentityVerification(ctx context.Context, appID uuid.UUID) (*models.IdentityVerification, error) {


	v, ok := pgGet[models.IdentityVerification](ctx, db, "identity_verifications", appID)
	if !ok {
		return nil, nil
	}
	return v, nil

}

func (db *PostgresDB) CreateKYCDocument(ctx context.Context, doc *models.KYCDocument) error {


	doc.ID = uuid.New()
	doc.UploadedAt = time.Now()

	if err := db.upsert(ctx, "kyc_documents", doc.ID, doc); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetKYCDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYCDocument, error) {
	blobs, err := db.list(ctx, "kyc_documents", "data->>'application_id' = $1", appID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.KYCDocument](blobs)
}

func (db *PostgresDB) UpdateKYCDocument(ctx context.Context, doc *models.KYCDocument) error {


	if _, ok := pgGet[models.KYCDocument](ctx, db, "kyc_documents", doc.ID); !ok {
		return fmt.Errorf("document not found: %s", doc.ID)
	}

	if err := db.upsert(ctx, "kyc_documents", doc.ID, doc); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateBiometricData(ctx context.Context, data *models.BiometricData) error {


	data.ID = uuid.New()
	data.CreatedAt = time.Now()
	data.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "biometric_data", data.ApplicationID, data); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetBiometricData(ctx context.Context, appID uuid.UUID) (*models.BiometricData, error) {


	data, ok := pgGet[models.BiometricData](ctx, db, "biometric_data", appID)
	if !ok {
		return nil, nil
	}
	return data, nil

}

func (db *PostgresDB) CreateAMLScreening(ctx context.Context, result *models.AMLScreeningResult) error {


	result.ID = uuid.New()
	result.ScreenedAt = time.Now()

	if err := db.upsert(ctx, "aml_screenings", result.ApplicationID, result); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetAMLScreening(ctx context.Context, appID uuid.UUID) (*models.AMLScreeningResult, error) {


	result, ok := pgGet[models.AMLScreeningResult](ctx, db, "aml_screenings", appID)
	if !ok {
		return nil, nil
	}
	return result, nil

}

func (db *PostgresDB) CreateKYBApplication(ctx context.Context, app *models.KYBApplication) error {


	app.ID = uuid.New()
	app.CreatedAt = time.Now()
	app.UpdatedAt = time.Now()
	app.ExpiresAt = time.Now().Add(30 * 24 * time.Hour)

	if err := db.upsert(ctx, "kyb_applications", app.ID, app); err != nil { return err }

	return nil

}

func (db *PostgresDB) GetKYBApplication(ctx context.Context, id uuid.UUID) (*models.KYBApplication, error) {


	app, ok := pgGet[models.KYBApplication](ctx, db, "kyb_applications", id)
	if !ok {
		return nil, fmt.Errorf("KYB application not found: %s", id)
	}
	return app, nil

}

func (db *PostgresDB) GetKYBApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYBApplication, error) {
	blobs, err := db.list(ctx, "kyb_applications", "data->>'user_id' = $1", userID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.KYBApplication](blobs)
}

func (db *PostgresDB) UpdateKYBApplication(ctx context.Context, app *models.KYBApplication) error {


	if _, ok := pgGet[models.KYBApplication](ctx, db, "kyb_applications", app.ID); !ok {
		return fmt.Errorf("KYB application not found: %s", app.ID)
	}

	app.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "kyb_applications", app.ID, app); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateBusinessInfo(ctx context.Context, info *models.BusinessInfo) error {


	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "business_infos", info.ApplicationID, info); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetBusinessInfo(ctx context.Context, appID uuid.UUID) (*models.BusinessInfo, error) {


	info, ok := pgGet[models.BusinessInfo](ctx, db, "business_infos", appID)
	if !ok {
		return nil, nil
	}
	return info, nil

}

func (db *PostgresDB) CreateCACVerification(ctx context.Context, v *models.CACVerification) error {


	v.ID = uuid.New()
	v.VerifiedAt = time.Now()

	if err := db.upsert(ctx, "cac_verifications", v.ApplicationID, v); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetCACVerification(ctx context.Context, appID uuid.UUID) (*models.CACVerification, error) {


	v, ok := pgGet[models.CACVerification](ctx, db, "cac_verifications", appID)
	if !ok {
		return nil, nil
	}
	return v, nil

}

func (db *PostgresDB) CreateUBO(ctx context.Context, ubo *models.UBO) error {


	ubo.ID = uuid.New()
	ubo.CreatedAt = time.Now()
	ubo.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "ubos", ubo.ID, ubo); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUBOs(ctx context.Context, appID uuid.UUID) ([]*models.UBO, error) {
	blobs, err := db.list(ctx, "ubos", "data->>'application_id' = $1", appID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.UBO](blobs)
}

func (db *PostgresDB) GetUBO(ctx context.Context, id uuid.UUID) (*models.UBO, error) {


	ubo, ok := pgGet[models.UBO](ctx, db, "ubos", id)
	if !ok {
		return nil, fmt.Errorf("UBO not found: %s", id)
	}
	return ubo, nil

}

func (db *PostgresDB) UpdateUBO(ctx context.Context, ubo *models.UBO) error {


	if _, ok := pgGet[models.UBO](ctx, db, "ubos", ubo.ID); !ok {
		return fmt.Errorf("UBO not found: %s", ubo.ID)
	}

	ubo.UpdatedAt = time.Now()
	if err := db.upsert(ctx, "ubos", ubo.ID, ubo); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteUBO(ctx context.Context, id uuid.UUID) error {
	if _, ok := pgGet[models.UBO](ctx, db, "ubos", id); !ok {
		return fmt.Errorf("UBO not found: %s", id)
	}
	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.ubos WHERE id = $1", schemaName), id)
	return err
}

func (db *PostgresDB) CreateFinancialInfo(ctx context.Context, info *models.FinancialInfo) error {


	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	if err := db.upsert(ctx, "financial_infos", info.ApplicationID, info); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetFinancialInfo(ctx context.Context, appID uuid.UUID) (*models.FinancialInfo, error) {


	info, ok := pgGet[models.FinancialInfo](ctx, db, "financial_infos", appID)
	if !ok {
		return nil, nil
	}
	return info, nil

}

func (db *PostgresDB) CreateKYBDocument(ctx context.Context, doc *models.KYBDocument) error {


	doc.ID = uuid.New()
	doc.UploadedAt = time.Now()

	if err := db.upsert(ctx, "kyb_documents", doc.ID, doc); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetKYBDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYBDocument, error) {
	blobs, err := db.list(ctx, "kyb_documents", "data->>'application_id' = $1", appID.String())
	if err != nil {
		return nil, err
	}
	return unmarshalAll[models.KYBDocument](blobs)
}

func (db *PostgresDB) CreateRiskAssessment(ctx context.Context, assessment *models.BusinessRiskAssessment) error {


	assessment.ID = uuid.New()
	assessment.AssessedAt = time.Now()

	if err := db.upsert(ctx, "risk_assessments", assessment.ApplicationID, assessment); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetRiskAssessment(ctx context.Context, appID uuid.UUID) (*models.BusinessRiskAssessment, error) {


	assessment, ok := pgGet[models.BusinessRiskAssessment](ctx, db, "risk_assessments", appID)
	if !ok {
		return nil, nil
	}
	return assessment, nil

}
