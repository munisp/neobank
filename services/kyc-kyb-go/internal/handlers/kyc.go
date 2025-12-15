package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/kyc-kyb-service/internal/config"
	"github.com/neobank/kyc-kyb-service/internal/database"
	"github.com/neobank/kyc-kyb-service/internal/models"
	"github.com/neobank/kyc-kyb-service/pkg/compliance"
	"github.com/neobank/kyc-kyb-service/pkg/kafka"
)

// KYCHandler handles KYC-related HTTP requests
type KYCHandler struct {
	db                     *database.InMemoryDB
	cfg                    *config.Config
	amlService             *compliance.AMLService
	riskService            *compliance.RiskScoringService
	countryVerifyService   *compliance.CountryVerificationService
	publisher              *kafka.EventPublisher
}

// NewKYCHandler creates a new KYC handler
func NewKYCHandler(db *database.InMemoryDB, cfg *config.Config) *KYCHandler {
	var amlService *compliance.AMLService
	if cfg.Compliance.ComplyAdvantageAPIKey != "" {
		amlService, _ = compliance.NewAMLService(&cfg.Compliance)
	}

	// Initialize country verification service with config
	countryVerifyConfig := &compliance.CountryVerificationConfig{
		NigeriaBVNAPIKey:   cfg.Compliance.NigeriaBVNAPIKey,
		NigeriaNINAPIKey:   cfg.Compliance.NigeriaNINAPIKey,
		NigeriaCACAPIKey:   cfg.Compliance.NigeriaCACAPIKey,
	}
	countryVerifyService := compliance.NewCountryVerificationService(countryVerifyConfig)

	return &KYCHandler{
		db:                   db,
		cfg:                  cfg,
		amlService:           amlService,
		riskService:          compliance.NewRiskScoringService(),
		countryVerifyService: countryVerifyService,
		publisher:            kafka.GetPublisher(),
	}
}

// InitiateKYC initiates a new KYC application
// POST /kyc/initiate
func (h *KYCHandler) InitiateKYC(c *gin.Context) {
	var req models.InitiateKYCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user ID from context (set by auth middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		// For testing, generate a user ID
		userID = uuid.New()
	}

	uid, ok := userID.(uuid.UUID)
	if !ok {
		if uidStr, ok := userID.(string); ok {
			var err error
			uid, err = uuid.Parse(uidStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
				return
			}
		}
	}

	// Determine required documents based on tier
	requiredDocs := getRequiredDocuments(req.Tier)

	app := &models.KYCApplication{
		UserID:               uid,
		Tier:                 req.Tier,
		Status:               models.KYCStatusPending,
		CompletionPercentage: 0,
		RequiredDocuments:    requiredDocs,
		SubmittedDocuments:   []models.DocumentType{},
	}

	if err := h.db.CreateKYCApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create application"})
		return
	}

	// Publish KYC event to Kafka for lakehouse analytics
	h.publisher.PublishKYC(c.Request.Context(), map[string]interface{}{
		"application_id": app.ID.String(),
		"user_id":        uid.String(),
		"tier":           string(app.Tier),
		"status":         string(app.Status),
		"event_type":     "kyc_initiated",
	})

	c.JSON(http.StatusCreated, models.InitiateKYCResponse{
		ApplicationID: app.ID,
		Status:        app.Status,
		Tier:          app.Tier,
		RequiredDocs:  app.RequiredDocuments,
		ExpiresAt:     app.ExpiresAt,
	})
}

// GetApplication gets a KYC application by ID
// GET /kyc/applications/:id
func (h *KYCHandler) GetApplication(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	c.JSON(http.StatusOK, app)
}

// GetUserApplications gets all KYC applications for the current user
// GET /kyc/applications
func (h *KYCHandler) GetUserApplications(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid, _ := userID.(uuid.UUID)
	apps, err := h.db.GetKYCApplicationsByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get applications"})
		return
	}

	c.JSON(http.StatusOK, apps)
}

// SubmitPersonalInfo submits personal information for a KYC application
// POST /kyc/applications/:id/personal-info
func (h *KYCHandler) SubmitPersonalInfo(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.PersonalInfoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create personal info
	info := &models.PersonalInfo{
		ApplicationID: appID,
		FirstName:     req.FirstName,
		LastName:      req.LastName,
		MiddleName:    req.MiddleName,
		DateOfBirth:   req.DateOfBirth,
		Nationality:   req.Nationality,
		PhoneNumber:   req.PhoneNumber,
		Email:         req.Email,
		BVN:           req.BVN,
	}

	if err := h.db.CreatePersonalInfo(c.Request.Context(), info); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save personal info"})
		return
	}

	// Update application status and completion
	app.Status = models.KYCStatusInProgress
	app.CompletionPercentage = calculateCompletion(app, true, false, false, 0, false)
	if err := h.db.UpdateKYCApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update application"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Personal information submitted successfully"})
}

// SubmitAddressInfo submits address information for a KYC application
// POST /kyc/applications/:id/address
func (h *KYCHandler) SubmitAddressInfo(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.AddressInfoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create address info
	info := &models.AddressInfo{
		ApplicationID: appID,
		StreetAddress: req.StreetAddress,
		City:          req.City,
		State:         req.State,
		PostalCode:    req.PostalCode,
		Country:       req.Country,
	}

	if err := h.db.CreateAddressInfo(c.Request.Context(), info); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save address info"})
		return
	}

	// Update completion percentage
	personalInfo, _ := h.db.GetPersonalInfo(c.Request.Context(), appID)
	docs, _ := h.db.GetKYCDocuments(c.Request.Context(), appID)
	biometric, _ := h.db.GetBiometricData(c.Request.Context(), appID)
	app.CompletionPercentage = calculateCompletion(app, personalInfo != nil, true, false, len(docs), biometric != nil)
	h.db.UpdateKYCApplication(c.Request.Context(), app)

	c.JSON(http.StatusOK, gin.H{"message": "Address information submitted successfully"})
}

// SubmitIdentityVerification submits identity document information
// POST /kyc/applications/:id/identity
func (h *KYCHandler) SubmitIdentityVerification(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.IdentityVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	_, err = h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create identity verification
	verification := &models.IdentityVerification{
		ApplicationID:  appID,
		DocumentType:   req.DocumentType,
		DocumentNumber: req.DocumentNumber,
		IssueDate:      req.IssueDate,
		ExpiryDate:     req.ExpiryDate,
		IssuingCountry: req.IssuingCountry,
		Verified:       false,
	}

	if err := h.db.CreateIdentityVerification(c.Request.Context(), verification); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save identity verification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Identity verification submitted successfully"})
}

// UploadDocument uploads a document for KYC verification
// POST /kyc/applications/:id/documents
func (h *KYCHandler) UploadDocument(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Get document type
	docType := models.DocumentType(c.PostForm("document_type"))
	if docType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "document_type is required"})
		return
	}

	// Get uploaded file
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	// Validate file size
	if header.Size > h.cfg.Storage.MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
		return
	}

	// Read file content
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	// Calculate checksum
	hash := sha256.Sum256(content)
	checksum := hex.EncodeToString(hash[:])

	// Create upload directory
	uploadDir := filepath.Join(h.cfg.Storage.UploadDir, appID.String())
	os.MkdirAll(uploadDir, 0755)

	// Save file
	fileName := fmt.Sprintf("%s_%s%s", docType, uuid.New().String()[:8], filepath.Ext(header.Filename))
	filePath := filepath.Join(uploadDir, fileName)
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	// Create document record
	doc := &models.KYCDocument{
		ApplicationID: appID,
		DocumentType:  docType,
		FileName:      header.Filename,
		FilePath:      filePath,
		FileURL:       fmt.Sprintf("/api/kyc/documents/%s/%s", appID, fileName),
		FileSize:      header.Size,
		MimeType:      header.Header.Get("Content-Type"),
		Checksum:      checksum,
		Status:        models.DocumentStatusPending,
	}

	if err := h.db.CreateKYCDocument(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save document record"})
		return
	}

	// Update submitted documents
	app.SubmittedDocuments = append(app.SubmittedDocuments, docType)
	
	// Update completion percentage
	personalInfo, _ := h.db.GetPersonalInfo(c.Request.Context(), appID)
	addressInfo, _ := h.db.GetAddressInfo(c.Request.Context(), appID)
	docs, _ := h.db.GetKYCDocuments(c.Request.Context(), appID)
	biometric, _ := h.db.GetBiometricData(c.Request.Context(), appID)
	app.CompletionPercentage = calculateCompletion(app, personalInfo != nil, addressInfo != nil, false, len(docs), biometric != nil)
	h.db.UpdateKYCApplication(c.Request.Context(), app)

	c.JSON(http.StatusCreated, doc)
}

// GetDocuments gets all documents for a KYC application
// GET /kyc/applications/:id/documents
func (h *KYCHandler) GetDocuments(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	docs, err := h.db.GetKYCDocuments(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get documents"})
		return
	}

	c.JSON(http.StatusOK, docs)
}

// SubmitBiometric submits biometric data (selfie) for verification
// POST /kyc/applications/:id/biometric
func (h *KYCHandler) SubmitBiometric(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Get uploaded selfie
	file, header, err := c.Request.FormFile("selfie")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "selfie file is required"})
		return
	}
	defer file.Close()

	// Save selfie
	content, _ := io.ReadAll(file)
	uploadDir := filepath.Join(h.cfg.Storage.UploadDir, appID.String())
	os.MkdirAll(uploadDir, 0755)
	selfiePath := filepath.Join(uploadDir, "selfie"+filepath.Ext(header.Filename))
	os.WriteFile(selfiePath, content, 0644)

	// Create selfie document
	selfieDoc := &models.KYCDocument{
		ApplicationID: appID,
		DocumentType:  models.DocumentTypeSelfie,
		FileName:      header.Filename,
		FilePath:      selfiePath,
		FileURL:       fmt.Sprintf("/api/kyc/documents/%s/selfie%s", appID, filepath.Ext(header.Filename)),
		FileSize:      header.Size,
		MimeType:      header.Header.Get("Content-Type"),
		Status:        models.DocumentStatusPending,
	}
	h.db.CreateKYCDocument(c.Request.Context(), selfieDoc)

	// Create biometric data record
	// In production, this would call the biometric verification service
	biometric := &models.BiometricData{
		ApplicationID:  appID,
		FaceMatchScore: 0.92, // Would come from actual verification
		LivenessScore:  0.95,
		Verified:       true,
		SelfieDocID:    &selfieDoc.ID,
	}

	if err := h.db.CreateBiometricData(c.Request.Context(), biometric); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save biometric data"})
		return
	}

	// Update completion
	personalInfo, _ := h.db.GetPersonalInfo(c.Request.Context(), appID)
	addressInfo, _ := h.db.GetAddressInfo(c.Request.Context(), appID)
	docs, _ := h.db.GetKYCDocuments(c.Request.Context(), appID)
	app.CompletionPercentage = calculateCompletion(app, personalInfo != nil, addressInfo != nil, false, len(docs), true)
	h.db.UpdateKYCApplication(c.Request.Context(), app)

	c.JSON(http.StatusOK, biometric)
}

// SubmitForReview submits the KYC application for review
// POST /kyc/applications/:id/submit
func (h *KYCHandler) SubmitForReview(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Verify all required data is present
	personalInfo, _ := h.db.GetPersonalInfo(c.Request.Context(), appID)
	if personalInfo == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "personal information is required"})
		return
	}

	// Perform AML screening if service is available
	if h.amlService != nil {
		fullName := fmt.Sprintf("%s %s", personalInfo.FirstName, personalInfo.LastName)
		amlResult, err := h.amlService.ScreenCustomer(c.Request.Context(), fullName, personalInfo.DateOfBirth, personalInfo.Nationality)
		if err == nil {
			amlResult.ApplicationID = appID
			h.db.CreateAMLScreening(c.Request.Context(), amlResult)

			// Check if manual review is needed
			if amlResult.RiskLevel == models.RiskLevelHigh || amlResult.RiskLevel == models.RiskLevelCritical {
				app.Status = models.KYCStatusUnderReview
				app.ReviewNotes = "AML screening flagged for review"
			}
		}
	}

	// Update application status
	if app.Status != models.KYCStatusUnderReview {
		app.Status = models.KYCStatusUnderReview
	}
	app.CompletionPercentage = 100

	if err := h.db.UpdateKYCApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit application"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Application submitted for review"})
}

// GetAMLScreening gets AML screening results for an application
// GET /kyc/applications/:id/aml-screening
func (h *KYCHandler) GetAMLScreening(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	screening, err := h.db.GetAMLScreening(c.Request.Context(), appID)
	if err != nil || screening == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "AML screening not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pep_match":       screening.PEPMatch,
		"sanctions_match": screening.SanctionsMatch,
		"adverse_media":   screening.AdverseMedia,
		"risk_score":      screening.RiskScore,
	})
}

// UpgradeTier upgrades the KYC tier
// POST /kyc/applications/:id/upgrade
func (h *KYCHandler) UpgradeTier(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.UpgradeTierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	app, err := h.db.GetKYCApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Validate tier upgrade
	if !isValidTierUpgrade(app.Tier, req.NewTier) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tier upgrade"})
		return
	}

	app.Tier = req.NewTier
	app.RequiredDocuments = getRequiredDocuments(req.NewTier)
	app.Status = models.KYCStatusInProgress

	if err := h.db.UpdateKYCApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upgrade tier"})
		return
	}

	c.JSON(http.StatusOK, app)
}

// Helper functions

func getRequiredDocuments(tier models.KYCTier) []models.DocumentType {
	switch tier {
	case models.KYCTierBasic:
		return []models.DocumentType{
			models.DocumentTypeNationalID,
			models.DocumentTypeSelfie,
		}
	case models.KYCTierEnhanced:
		return []models.DocumentType{
			models.DocumentTypeNationalID,
			models.DocumentTypeSelfie,
			models.DocumentTypeUtilityBill,
		}
	case models.KYCTierPremium:
		return []models.DocumentType{
			models.DocumentTypePassport,
			models.DocumentTypeSelfie,
			models.DocumentTypeUtilityBill,
			models.DocumentTypeBankStatement,
		}
	default:
		return []models.DocumentType{models.DocumentTypeNationalID}
	}
}

func calculateCompletion(app *models.KYCApplication, hasPersonal, hasAddress, hasIdentity bool, docCount int, hasBiometric bool) int {
	total := 0
	if hasPersonal {
		total += 20
	}
	if hasAddress {
		total += 15
	}
	if hasIdentity {
		total += 15
	}
	
	// Documents contribute up to 30%
	requiredDocs := len(app.RequiredDocuments)
	if requiredDocs > 0 {
		docPercent := (docCount * 30) / requiredDocs
		if docPercent > 30 {
			docPercent = 30
		}
		total += docPercent
	}
	
	if hasBiometric {
		total += 20
	}
	
	return total
}

func isValidTierUpgrade(current, new models.KYCTier) bool {
	tierOrder := map[models.KYCTier]int{
		models.KYCTierBasic:    1,
		models.KYCTierEnhanced: 2,
		models.KYCTierPremium:  3,
	}
	return tierOrder[new] > tierOrder[current]
}

// GetSupportedCountries returns list of supported countries for KYC
// GET /kyc/countries
func (h *KYCHandler) GetSupportedCountries(c *gin.Context) {
	countries := h.countryVerifyService.GetSupportedCountries()
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"countries": countries,
		"total":     len(countries),
	})
}

// GetCountryRequirements returns KYC requirements for a specific country
// GET /kyc/countries/:code/requirements
func (h *KYCHandler) GetCountryRequirements(c *gin.Context) {
	countryCode := c.Param("code")
	requirements := h.countryVerifyService.GetCountryDocumentRequirements(countryCode)
	if requirements == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Country not supported"})
		return
	}

	verificationTypes := h.countryVerifyService.GetVerificationTypes(countryCode)

	c.JSON(http.StatusOK, gin.H{
		"success":            true,
		"country":            requirements.Country,
		"country_code":       requirements.CountryCode,
		"basic_tier_docs":    requirements.BasicTierDocs,
		"enhanced_tier_docs": requirements.EnhancedTierDocs,
		"premium_tier_docs":  requirements.PremiumTierDocs,
		"national_id_types":  requirements.NationalIDTypes,
		"business_reg_types": requirements.BusinessRegTypes,
		"tax_id_types":       requirements.TaxIDTypes,
		"verification_types": verificationTypes,
	})
}

// VerifyCountryDocument verifies a country-specific document
// POST /kyc/countries/:code/verify
func (h *KYCHandler) VerifyCountryDocument(c *gin.Context) {
	countryCode := c.Param("code")

	var req struct {
		DocumentType   string            `json:"document_type" binding:"required"`
		DocumentNumber string            `json:"document_number" binding:"required"`
		AdditionalData map[string]string `json:"additional_data"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyDocument(
		c.Request.Context(),
		countryCode,
		req.DocumentType,
		req.DocumentNumber,
		req.AdditionalData,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifyNigeriaBVN verifies a Nigerian BVN
// POST /kyc/nigeria/bvn/verify
func (h *KYCHandler) VerifyNigeriaBVN(c *gin.Context) {
	var req struct {
		BVN         string `json:"bvn" binding:"required,len=11"`
		FirstName   string `json:"first_name" binding:"required"`
		LastName    string `json:"last_name" binding:"required"`
		DateOfBirth string `json:"date_of_birth" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyNigeriaBVN(
		c.Request.Context(),
		req.BVN,
		req.FirstName,
		req.LastName,
		req.DateOfBirth,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifyNigeriaNIN verifies a Nigerian NIN
// POST /kyc/nigeria/nin/verify
func (h *KYCHandler) VerifyNigeriaNIN(c *gin.Context) {
	var req struct {
		NIN       string `json:"nin" binding:"required,len=11"`
		FirstName string `json:"first_name" binding:"required"`
		LastName  string `json:"last_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyNigeriaNIN(
		c.Request.Context(),
		req.NIN,
		req.FirstName,
		req.LastName,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifySouthAfricaID verifies a South African ID
// POST /kyc/south-africa/id/verify
func (h *KYCHandler) VerifySouthAfricaID(c *gin.Context) {
	var req struct {
		IDNumber  string `json:"id_number" binding:"required,len=13"`
		FirstName string `json:"first_name" binding:"required"`
		LastName  string `json:"last_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifySouthAfricaID(
		c.Request.Context(),
		req.IDNumber,
		req.FirstName,
		req.LastName,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifyKenyaID verifies a Kenyan National ID
// POST /kyc/kenya/id/verify
func (h *KYCHandler) VerifyKenyaID(c *gin.Context) {
	var req struct {
		IDNumber  string `json:"id_number" binding:"required"`
		FirstName string `json:"first_name" binding:"required"`
		LastName  string `json:"last_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyKenyaID(
		c.Request.Context(),
		req.IDNumber,
		req.FirstName,
		req.LastName,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifyGhanaCard verifies a Ghana Card
// POST /kyc/ghana/card/verify
func (h *KYCHandler) VerifyGhanaCard(c *gin.Context) {
	var req struct {
		CardNumber string `json:"card_number" binding:"required"`
		FirstName  string `json:"first_name" binding:"required"`
		LastName   string `json:"last_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyGhanaCard(
		c.Request.Context(),
		req.CardNumber,
		req.FirstName,
		req.LastName,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// VerifyEgyptNationalID verifies an Egyptian National ID
// POST /kyc/egypt/id/verify
func (h *KYCHandler) VerifyEgyptNationalID(c *gin.Context) {
	var req struct {
		IDNumber  string `json:"id_number" binding:"required,len=14"`
		FirstName string `json:"first_name" binding:"required"`
		LastName  string `json:"last_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.countryVerifyService.VerifyEgyptNationalID(
		c.Request.Context(),
		req.IDNumber,
		req.FirstName,
		req.LastName,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}
