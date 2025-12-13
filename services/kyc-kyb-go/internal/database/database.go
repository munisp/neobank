package database

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/kyc-kyb-service/internal/models"
)

// InMemoryDB provides thread-safe in-memory storage for KYC/KYB data
// For production, replace with PostgreSQL using pgx
type InMemoryDB struct {
	mu sync.RWMutex

	// KYC tables
	kycApplications       map[uuid.UUID]*models.KYCApplication
	personalInfos         map[uuid.UUID]*models.PersonalInfo
	addressInfos          map[uuid.UUID]*models.AddressInfo
	identityVerifications map[uuid.UUID]*models.IdentityVerification
	kycDocuments          map[uuid.UUID]*models.KYCDocument
	biometricData         map[uuid.UUID]*models.BiometricData
	amlScreenings         map[uuid.UUID]*models.AMLScreeningResult

	// KYB tables
	kybApplications    map[uuid.UUID]*models.KYBApplication
	businessInfos      map[uuid.UUID]*models.BusinessInfo
	cacVerifications   map[uuid.UUID]*models.CACVerification
	ubos               map[uuid.UUID]*models.UBO
	financialInfos     map[uuid.UUID]*models.FinancialInfo
	kybDocuments       map[uuid.UUID]*models.KYBDocument
	riskAssessments    map[uuid.UUID]*models.BusinessRiskAssessment

	// Index maps for efficient lookups
	kycByUser map[uuid.UUID][]uuid.UUID // userID -> []applicationID
	kybByUser map[uuid.UUID][]uuid.UUID // userID -> []applicationID
	ubosByApp map[uuid.UUID][]uuid.UUID // applicationID -> []uboID
	docsByApp map[uuid.UUID][]uuid.UUID // applicationID -> []docID
}

// NewInMemoryDB creates a new in-memory database
func NewInMemoryDB() *InMemoryDB {
	return &InMemoryDB{
		kycApplications:       make(map[uuid.UUID]*models.KYCApplication),
		personalInfos:         make(map[uuid.UUID]*models.PersonalInfo),
		addressInfos:          make(map[uuid.UUID]*models.AddressInfo),
		identityVerifications: make(map[uuid.UUID]*models.IdentityVerification),
		kycDocuments:          make(map[uuid.UUID]*models.KYCDocument),
		biometricData:         make(map[uuid.UUID]*models.BiometricData),
		amlScreenings:         make(map[uuid.UUID]*models.AMLScreeningResult),

		kybApplications:  make(map[uuid.UUID]*models.KYBApplication),
		businessInfos:    make(map[uuid.UUID]*models.BusinessInfo),
		cacVerifications: make(map[uuid.UUID]*models.CACVerification),
		ubos:             make(map[uuid.UUID]*models.UBO),
		financialInfos:   make(map[uuid.UUID]*models.FinancialInfo),
		kybDocuments:     make(map[uuid.UUID]*models.KYBDocument),
		riskAssessments:  make(map[uuid.UUID]*models.BusinessRiskAssessment),

		kycByUser: make(map[uuid.UUID][]uuid.UUID),
		kybByUser: make(map[uuid.UUID][]uuid.UUID),
		ubosByApp: make(map[uuid.UUID][]uuid.UUID),
		docsByApp: make(map[uuid.UUID][]uuid.UUID),
	}
}

// ============ KYC Application Methods ============

func (db *InMemoryDB) CreateKYCApplication(ctx context.Context, app *models.KYCApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	app.ID = uuid.New()
	app.CreatedAt = time.Now()
	app.UpdatedAt = time.Now()
	app.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)

	db.kycApplications[app.ID] = app
	db.kycByUser[app.UserID] = append(db.kycByUser[app.UserID], app.ID)

	return nil
}

func (db *InMemoryDB) GetKYCApplication(ctx context.Context, id uuid.UUID) (*models.KYCApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	app, ok := db.kycApplications[id]
	if !ok {
		return nil, fmt.Errorf("KYC application not found: %s", id)
	}
	return app, nil
}

func (db *InMemoryDB) GetKYCApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYCApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	appIDs := db.kycByUser[userID]
	apps := make([]*models.KYCApplication, 0, len(appIDs))
	for _, id := range appIDs {
		if app, ok := db.kycApplications[id]; ok {
			apps = append(apps, app)
		}
	}
	return apps, nil
}

func (db *InMemoryDB) UpdateKYCApplication(ctx context.Context, app *models.KYCApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.kycApplications[app.ID]; !ok {
		return fmt.Errorf("KYC application not found: %s", app.ID)
	}

	app.UpdatedAt = time.Now()
	db.kycApplications[app.ID] = app
	return nil
}

// ============ Personal Info Methods ============

func (db *InMemoryDB) CreatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	db.personalInfos[info.ApplicationID] = info
	return nil
}

func (db *InMemoryDB) GetPersonalInfo(ctx context.Context, appID uuid.UUID) (*models.PersonalInfo, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	info, ok := db.personalInfos[appID]
	if !ok {
		return nil, nil
	}
	return info, nil
}

func (db *InMemoryDB) UpdatePersonalInfo(ctx context.Context, info *models.PersonalInfo) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	info.UpdatedAt = time.Now()
	db.personalInfos[info.ApplicationID] = info
	return nil
}

// ============ Address Info Methods ============

func (db *InMemoryDB) CreateAddressInfo(ctx context.Context, info *models.AddressInfo) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	db.addressInfos[info.ApplicationID] = info
	return nil
}

func (db *InMemoryDB) GetAddressInfo(ctx context.Context, appID uuid.UUID) (*models.AddressInfo, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	info, ok := db.addressInfos[appID]
	if !ok {
		return nil, nil
	}
	return info, nil
}

// ============ Identity Verification Methods ============

func (db *InMemoryDB) CreateIdentityVerification(ctx context.Context, v *models.IdentityVerification) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	v.ID = uuid.New()
	v.CreatedAt = time.Now()
	v.UpdatedAt = time.Now()

	db.identityVerifications[v.ApplicationID] = v
	return nil
}

func (db *InMemoryDB) GetIdentityVerification(ctx context.Context, appID uuid.UUID) (*models.IdentityVerification, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	v, ok := db.identityVerifications[appID]
	if !ok {
		return nil, nil
	}
	return v, nil
}

// ============ KYC Document Methods ============

func (db *InMemoryDB) CreateKYCDocument(ctx context.Context, doc *models.KYCDocument) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	doc.ID = uuid.New()
	doc.UploadedAt = time.Now()

	db.kycDocuments[doc.ID] = doc
	db.docsByApp[doc.ApplicationID] = append(db.docsByApp[doc.ApplicationID], doc.ID)
	return nil
}

func (db *InMemoryDB) GetKYCDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYCDocument, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	docIDs := db.docsByApp[appID]
	docs := make([]*models.KYCDocument, 0, len(docIDs))
	for _, id := range docIDs {
		if doc, ok := db.kycDocuments[id]; ok {
			docs = append(docs, doc)
		}
	}
	return docs, nil
}

func (db *InMemoryDB) UpdateKYCDocument(ctx context.Context, doc *models.KYCDocument) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.kycDocuments[doc.ID]; !ok {
		return fmt.Errorf("document not found: %s", doc.ID)
	}

	db.kycDocuments[doc.ID] = doc
	return nil
}

// ============ Biometric Data Methods ============

func (db *InMemoryDB) CreateBiometricData(ctx context.Context, data *models.BiometricData) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	data.ID = uuid.New()
	data.CreatedAt = time.Now()
	data.UpdatedAt = time.Now()

	db.biometricData[data.ApplicationID] = data
	return nil
}

func (db *InMemoryDB) GetBiometricData(ctx context.Context, appID uuid.UUID) (*models.BiometricData, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	data, ok := db.biometricData[appID]
	if !ok {
		return nil, nil
	}
	return data, nil
}

// ============ AML Screening Methods ============

func (db *InMemoryDB) CreateAMLScreening(ctx context.Context, result *models.AMLScreeningResult) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	result.ID = uuid.New()
	result.ScreenedAt = time.Now()

	db.amlScreenings[result.ApplicationID] = result
	return nil
}

func (db *InMemoryDB) GetAMLScreening(ctx context.Context, appID uuid.UUID) (*models.AMLScreeningResult, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	result, ok := db.amlScreenings[appID]
	if !ok {
		return nil, nil
	}
	return result, nil
}

// ============ KYB Application Methods ============

func (db *InMemoryDB) CreateKYBApplication(ctx context.Context, app *models.KYBApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	app.ID = uuid.New()
	app.CreatedAt = time.Now()
	app.UpdatedAt = time.Now()
	app.ExpiresAt = time.Now().Add(30 * 24 * time.Hour)

	db.kybApplications[app.ID] = app
	db.kybByUser[app.UserID] = append(db.kybByUser[app.UserID], app.ID)

	return nil
}

func (db *InMemoryDB) GetKYBApplication(ctx context.Context, id uuid.UUID) (*models.KYBApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	app, ok := db.kybApplications[id]
	if !ok {
		return nil, fmt.Errorf("KYB application not found: %s", id)
	}
	return app, nil
}

func (db *InMemoryDB) GetKYBApplicationsByUser(ctx context.Context, userID uuid.UUID) ([]*models.KYBApplication, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	appIDs := db.kybByUser[userID]
	apps := make([]*models.KYBApplication, 0, len(appIDs))
	for _, id := range appIDs {
		if app, ok := db.kybApplications[id]; ok {
			apps = append(apps, app)
		}
	}
	return apps, nil
}

func (db *InMemoryDB) UpdateKYBApplication(ctx context.Context, app *models.KYBApplication) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.kybApplications[app.ID]; !ok {
		return fmt.Errorf("KYB application not found: %s", app.ID)
	}

	app.UpdatedAt = time.Now()
	db.kybApplications[app.ID] = app
	return nil
}

// ============ Business Info Methods ============

func (db *InMemoryDB) CreateBusinessInfo(ctx context.Context, info *models.BusinessInfo) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	db.businessInfos[info.ApplicationID] = info
	return nil
}

func (db *InMemoryDB) GetBusinessInfo(ctx context.Context, appID uuid.UUID) (*models.BusinessInfo, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	info, ok := db.businessInfos[appID]
	if !ok {
		return nil, nil
	}
	return info, nil
}

// ============ CAC Verification Methods ============

func (db *InMemoryDB) CreateCACVerification(ctx context.Context, v *models.CACVerification) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	v.ID = uuid.New()
	v.VerifiedAt = time.Now()

	db.cacVerifications[v.ApplicationID] = v
	return nil
}

func (db *InMemoryDB) GetCACVerification(ctx context.Context, appID uuid.UUID) (*models.CACVerification, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	v, ok := db.cacVerifications[appID]
	if !ok {
		return nil, nil
	}
	return v, nil
}

// ============ UBO Methods ============

func (db *InMemoryDB) CreateUBO(ctx context.Context, ubo *models.UBO) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	ubo.ID = uuid.New()
	ubo.CreatedAt = time.Now()
	ubo.UpdatedAt = time.Now()

	db.ubos[ubo.ID] = ubo
	db.ubosByApp[ubo.ApplicationID] = append(db.ubosByApp[ubo.ApplicationID], ubo.ID)
	return nil
}

func (db *InMemoryDB) GetUBOs(ctx context.Context, appID uuid.UUID) ([]*models.UBO, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	uboIDs := db.ubosByApp[appID]
	ubos := make([]*models.UBO, 0, len(uboIDs))
	for _, id := range uboIDs {
		if ubo, ok := db.ubos[id]; ok {
			ubos = append(ubos, ubo)
		}
	}
	return ubos, nil
}

func (db *InMemoryDB) GetUBO(ctx context.Context, id uuid.UUID) (*models.UBO, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	ubo, ok := db.ubos[id]
	if !ok {
		return nil, fmt.Errorf("UBO not found: %s", id)
	}
	return ubo, nil
}

func (db *InMemoryDB) UpdateUBO(ctx context.Context, ubo *models.UBO) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, ok := db.ubos[ubo.ID]; !ok {
		return fmt.Errorf("UBO not found: %s", ubo.ID)
	}

	ubo.UpdatedAt = time.Now()
	db.ubos[ubo.ID] = ubo
	return nil
}

func (db *InMemoryDB) DeleteUBO(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	ubo, ok := db.ubos[id]
	if !ok {
		return fmt.Errorf("UBO not found: %s", id)
	}

	delete(db.ubos, id)

	// Remove from index
	appUBOs := db.ubosByApp[ubo.ApplicationID]
	for i, uboID := range appUBOs {
		if uboID == id {
			db.ubosByApp[ubo.ApplicationID] = append(appUBOs[:i], appUBOs[i+1:]...)
			break
		}
	}

	return nil
}

// ============ Financial Info Methods ============

func (db *InMemoryDB) CreateFinancialInfo(ctx context.Context, info *models.FinancialInfo) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	info.ID = uuid.New()
	info.CreatedAt = time.Now()
	info.UpdatedAt = time.Now()

	db.financialInfos[info.ApplicationID] = info
	return nil
}

func (db *InMemoryDB) GetFinancialInfo(ctx context.Context, appID uuid.UUID) (*models.FinancialInfo, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	info, ok := db.financialInfos[appID]
	if !ok {
		return nil, nil
	}
	return info, nil
}

// ============ KYB Document Methods ============

func (db *InMemoryDB) CreateKYBDocument(ctx context.Context, doc *models.KYBDocument) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	doc.ID = uuid.New()
	doc.UploadedAt = time.Now()

	db.kybDocuments[doc.ID] = doc
	db.docsByApp[doc.ApplicationID] = append(db.docsByApp[doc.ApplicationID], doc.ID)
	return nil
}

func (db *InMemoryDB) GetKYBDocuments(ctx context.Context, appID uuid.UUID) ([]*models.KYBDocument, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	docIDs := db.docsByApp[appID]
	docs := make([]*models.KYBDocument, 0, len(docIDs))
	for _, id := range docIDs {
		if doc, ok := db.kybDocuments[id]; ok {
			docs = append(docs, doc)
		}
	}
	return docs, nil
}

// ============ Risk Assessment Methods ============

func (db *InMemoryDB) CreateRiskAssessment(ctx context.Context, assessment *models.BusinessRiskAssessment) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	assessment.ID = uuid.New()
	assessment.AssessedAt = time.Now()

	db.riskAssessments[assessment.ApplicationID] = assessment
	return nil
}

func (db *InMemoryDB) GetRiskAssessment(ctx context.Context, appID uuid.UUID) (*models.BusinessRiskAssessment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	assessment, ok := db.riskAssessments[appID]
	if !ok {
		return nil, nil
	}
	return assessment, nil
}
