package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/kyc-kyb-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	CreateKYCApplication(ctx context.Context, app *models.KYCApplication) error
	GetKYCApplication(ctx context.Context, id uuid.UUID) (*models.KYCApplication, error)
	GetKYCApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYCApplication, error)
	UpdateKYCApplication(ctx context.Context, app *models.KYCApplication) error
	CreatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error
	GetPersonalInfo(ctx context.Context, appID uuid.UUID) (*models.PersonalInfo, error)
	UpdatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error
	CreateAddressInfo(ctx context.Context, info *models.AddressInfo) error
	GetAddressInfo(ctx context.Context, appID uuid.UUID) (*models.AddressInfo, error)
	CreateIdentityVerification(ctx context.Context, v *models.IdentityVerification) error
	GetIdentityVerification(ctx context.Context, appID uuid.UUID) (*models.IdentityVerification, error)
	CreateKYCDocument(ctx context.Context, doc *models.KYCDocument) error
	GetKYCDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYCDocument, error)
	UpdateKYCDocument(ctx context.Context, doc *models.KYCDocument) error
	CreateBiometricData(ctx context.Context, data *models.BiometricData) error
	GetBiometricData(ctx context.Context, appID uuid.UUID) (*models.BiometricData, error)
	CreateAMLScreening(ctx context.Context, result *models.AMLScreeningResult) error
	GetAMLScreening(ctx context.Context, appID uuid.UUID) (*models.AMLScreeningResult, error)
	CreateKYBApplication(ctx context.Context, app *models.KYBApplication) error
	GetKYBApplication(ctx context.Context, id uuid.UUID) (*models.KYBApplication, error)
	GetKYBApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYBApplication, error)
	UpdateKYBApplication(ctx context.Context, app *models.KYBApplication) error
	CreateBusinessInfo(ctx context.Context, info *models.BusinessInfo) error
	GetBusinessInfo(ctx context.Context, appID uuid.UUID) (*models.BusinessInfo, error)
	CreateCACVerification(ctx context.Context, v *models.CACVerification) error
	GetCACVerification(ctx context.Context, appID uuid.UUID) (*models.CACVerification, error)
	CreateUBO(ctx context.Context, ubo *models.UBO) error
	GetUBOs(ctx context.Context, appID uuid.UUID) ([]*models.UBO, error)
	GetUBO(ctx context.Context, id uuid.UUID) (*models.UBO, error)
	UpdateUBO(ctx context.Context, ubo *models.UBO) error
	DeleteUBO(ctx context.Context, id uuid.UUID) error
	CreateFinancialInfo(ctx context.Context, info *models.FinancialInfo) error
	GetFinancialInfo(ctx context.Context, appID uuid.UUID) (*models.FinancialInfo, error)
	CreateKYBDocument(ctx context.Context, doc *models.KYBDocument) error
	GetKYBDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYBDocument, error)
	CreateRiskAssessment(ctx context.Context, assessment *models.BusinessRiskAssessment) error
	GetRiskAssessment(ctx context.Context, appID uuid.UUID) (*models.BusinessRiskAssessment, error)
	Close(ctx context.Context) error
}

// Compile-time conformance assertions.
var (
	_ Store = (*InMemoryDB)(nil)
	_ Store = (*PostgresDB)(nil)
)

// Close is a no-op for the in-memory store.
func (db *InMemoryDB) Close(ctx context.Context) error { return nil }

// NewStore selects the persistence backend. An empty databaseURL yields the
// in-memory store (dev/test only) plus an explanatory error for logging.
func NewStore(ctx context.Context, databaseURL string) (Store, error) {
	if databaseURL == "" {
		log.Println("WARNING: DATABASE_URL not set — using in-memory store; data will NOT persist")
		return NewInMemoryDB(), errors.New("DATABASE_URL not configured; using non-persistent in-memory store")
	}
	return NewPostgresDB(ctx, databaseURL)
}
