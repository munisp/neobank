package handlers

import (
	"context"
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
)

// KYBHandler handles KYB-related HTTP requests
type KYBHandler struct {
	db          *database.InMemoryDB
	cfg         *config.Config
	amlService  *compliance.AMLService
	cacService  *compliance.CACService
	riskService *compliance.RiskScoringService
}

// NewKYBHandler creates a new KYB handler
func NewKYBHandler(db *database.InMemoryDB, cfg *config.Config) *KYBHandler {
	var amlService *compliance.AMLService
	var cacService *compliance.CACService

	if cfg.Compliance.ComplyAdvantageAPIKey != "" {
		amlService, _ = compliance.NewAMLService(&cfg.Compliance)
	}
	if cfg.Compliance.CACVerificationAPIKey != "" {
		cacService, _ = compliance.NewCACService(&cfg.Compliance)
	}

	return &KYBHandler{
		db:          db,
		cfg:         cfg,
		amlService:  amlService,
		cacService:  cacService,
		riskService: compliance.NewRiskScoringService(),
	}
}

// InitiateKYB initiates a new KYB application
// POST /kyb/initiate
func (h *KYBHandler) InitiateKYB(c *gin.Context) {
	var req models.InitiateKYBRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
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

	app := &models.KYBApplication{
		UserID:               uid,
		BusinessName:         req.BusinessName,
		Status:               models.KYBStatusPending,
		CompletionPercentage: 0,
		CACVerified:          false,
		UBOsVerified:         false,
		FinancialVerified:    false,
	}

	if err := h.db.CreateKYBApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create application"})
		return
	}

	c.JSON(http.StatusCreated, models.InitiateKYBResponse{
		ApplicationID: app.ID,
		BusinessName:  app.BusinessName,
		Status:        app.Status,
		ExpiresAt:     app.ExpiresAt,
	})
}

// GetApplication gets a KYB application by ID
// GET /kyb/applications/:id
func (h *KYBHandler) GetApplication(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	c.JSON(http.StatusOK, app)
}

// GetUserApplications gets all KYB applications for the current user
// GET /kyb/applications
func (h *KYBHandler) GetUserApplications(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid, _ := userID.(uuid.UUID)
	apps, err := h.db.GetKYBApplicationsByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get applications"})
		return
	}

	c.JSON(http.StatusOK, apps)
}

// SubmitBusinessInfo submits business information for a KYB application
// POST /kyb/applications/:id/business-info
func (h *KYBHandler) SubmitBusinessInfo(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.BusinessInfoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create business info
	info := &models.BusinessInfo{
		ApplicationID:          appID,
		BusinessName:           req.BusinessName,
		BusinessType:           req.BusinessType,
		RegistrationNumber:     req.RegistrationNumber,
		TaxID:                  req.TaxID,
		IncorporationDate:      req.IncorporationDate,
		CountryOfIncorporation: req.CountryOfIncorporation,
		Industry:               req.Industry,
		Website:                req.Website,
		PhoneNumber:            req.PhoneNumber,
		Email:                  req.Email,
		StreetAddress:          req.BusinessAddress.StreetAddress,
		City:                   req.BusinessAddress.City,
		State:                  req.BusinessAddress.State,
		PostalCode:             req.BusinessAddress.PostalCode,
		Country:                req.BusinessAddress.Country,
	}

	if err := h.db.CreateBusinessInfo(c.Request.Context(), info); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save business info"})
		return
	}

	// Update application
	app.BusinessName = req.BusinessName
	app.Status = models.KYBStatusInProgress
	app.CompletionPercentage = h.calculateKYBCompletion(c.Request.Context(), appID)
	h.db.UpdateKYBApplication(c.Request.Context(), app)

	c.JSON(http.StatusOK, gin.H{"message": "Business information submitted successfully"})
}

// VerifyCACRegistration verifies business with CAC
// POST /kyb/applications/:id/cac-verification
func (h *KYBHandler) VerifyCACRegistration(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.CACVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	var cacResult *models.CACVerification

	// Call CAC verification service if available
	if h.cacService != nil {
		cacResult, err = h.cacService.VerifyBusiness(c.Request.Context(), req.RCNumber)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "CAC verification service unavailable"})
			return
		}
	} else {
		// Create a pending verification record
		cacResult = &models.CACVerification{
			ApplicationID: appID,
			Verified:      false,
			RCNumber:      req.RCNumber,
			Status:        "PENDING_VERIFICATION",
			Provider:      "Manual",
		}
	}

	cacResult.ApplicationID = appID
	if err := h.db.CreateCACVerification(c.Request.Context(), cacResult); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save CAC verification"})
		return
	}

	// Update application
	app.CACVerified = cacResult.Verified
	app.CompletionPercentage = h.calculateKYBCompletion(c.Request.Context(), appID)
	h.db.UpdateKYBApplication(c.Request.Context(), app)

	c.JSON(http.StatusOK, cacResult)
}

// AddUBO adds an Ultimate Beneficial Owner
// POST /kyb/applications/:id/ubos
func (h *KYBHandler) AddUBO(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.UBORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create UBO
	ubo := &models.UBO{
		ApplicationID:       appID,
		FullName:            req.FullName,
		DateOfBirth:         req.DateOfBirth,
		Nationality:         req.Nationality,
		OwnershipPercentage: req.OwnershipPercentage,
		Position:            req.Position,
		IDDocumentType:      req.IDDocumentType,
		IDDocumentNumber:    req.IDDocumentNumber,
		StreetAddress:       req.Address.StreetAddress,
		City:                req.Address.City,
		State:               req.Address.State,
		PostalCode:          req.Address.PostalCode,
		Country:             req.Address.Country,
		PEPStatus:           false,
		SanctionsStatus:     false,
	}

	// Screen UBO if AML service available
	if h.amlService != nil {
		amlResult, err := h.amlService.ScreenCustomer(c.Request.Context(), req.FullName, req.DateOfBirth, req.Nationality)
		if err == nil {
			ubo.PEPStatus = amlResult.PEPMatch
			ubo.SanctionsStatus = amlResult.SanctionsMatch
		}
	}

	if err := h.db.CreateUBO(c.Request.Context(), ubo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save UBO"})
		return
	}

	// Update application
	app.CompletionPercentage = h.calculateKYBCompletion(c.Request.Context(), appID)
	h.db.UpdateKYBApplication(c.Request.Context(), app)

	c.JSON(http.StatusCreated, ubo)
}

// GetUBOs gets all UBOs for an application
// GET /kyb/applications/:id/ubos
func (h *KYBHandler) GetUBOs(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	ubos, err := h.db.GetUBOs(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get UBOs"})
		return
	}

	c.JSON(http.StatusOK, ubos)
}

// UpdateUBO updates a UBO
// PUT /kyb/applications/:id/ubos/:ubo_id
func (h *KYBHandler) UpdateUBO(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	uboID, err := uuid.Parse(c.Param("ubo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid UBO ID"})
		return
	}

	var req models.UBORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get existing UBO
	ubo, err := h.db.GetUBO(c.Request.Context(), uboID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "UBO not found"})
		return
	}

	// Verify UBO belongs to application
	if ubo.ApplicationID != appID {
		c.JSON(http.StatusForbidden, gin.H{"error": "UBO does not belong to this application"})
		return
	}

	// Update UBO fields
	ubo.FullName = req.FullName
	ubo.DateOfBirth = req.DateOfBirth
	ubo.Nationality = req.Nationality
	ubo.OwnershipPercentage = req.OwnershipPercentage
	ubo.Position = req.Position
	ubo.IDDocumentType = req.IDDocumentType
	ubo.IDDocumentNumber = req.IDDocumentNumber
	ubo.StreetAddress = req.Address.StreetAddress
	ubo.City = req.Address.City
	ubo.State = req.Address.State
	ubo.PostalCode = req.Address.PostalCode
	ubo.Country = req.Address.Country

	if err := h.db.UpdateUBO(c.Request.Context(), ubo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update UBO"})
		return
	}

	c.JSON(http.StatusOK, ubo)
}

// DeleteUBO deletes a UBO
// DELETE /kyb/applications/:id/ubos/:ubo_id
func (h *KYBHandler) DeleteUBO(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	uboID, err := uuid.Parse(c.Param("ubo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid UBO ID"})
		return
	}

	// Get existing UBO
	ubo, err := h.db.GetUBO(c.Request.Context(), uboID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "UBO not found"})
		return
	}

	// Verify UBO belongs to application
	if ubo.ApplicationID != appID {
		c.JSON(http.StatusForbidden, gin.H{"error": "UBO does not belong to this application"})
		return
	}

	if err := h.db.DeleteUBO(c.Request.Context(), uboID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete UBO"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "UBO deleted successfully"})
}

// SubmitFinancialInfo submits financial information
// POST /kyb/applications/:id/financial-info
func (h *KYBHandler) SubmitFinancialInfo(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	var req models.FinancialInfoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify application exists
	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Create financial info
	info := &models.FinancialInfo{
		ApplicationID:             appID,
		AnnualRevenue:             req.AnnualRevenue,
		RevenueCurrency:           req.RevenueCurrency,
		NumberOfEmployees:         req.NumberOfEmployees,
		ExpectedTransactionVolume: req.ExpectedTransactionVolume,
		SourceOfFunds:             req.SourceOfFunds,
		BankStatementsUploaded:    false,
	}

	if err := h.db.CreateFinancialInfo(c.Request.Context(), info); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save financial info"})
		return
	}

	// Update application
	app.FinancialVerified = true
	app.CompletionPercentage = h.calculateKYBCompletion(c.Request.Context(), appID)
	h.db.UpdateKYBApplication(c.Request.Context(), app)

	c.JSON(http.StatusOK, gin.H{"message": "Financial information submitted successfully"})
}

// UploadDocument uploads a document for KYB verification
// POST /kyb/applications/:id/documents
func (h *KYBHandler) UploadDocument(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	// Verify application exists
	_, err = h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Get document type
	docType := c.PostForm("document_type")
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
	uploadDir := filepath.Join(h.cfg.Storage.UploadDir, "kyb", appID.String())
	os.MkdirAll(uploadDir, 0755)

	// Save file
	fileName := fmt.Sprintf("%s_%s%s", docType, uuid.New().String()[:8], filepath.Ext(header.Filename))
	filePath := filepath.Join(uploadDir, fileName)
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	// Create document record
	doc := &models.KYBDocument{
		ApplicationID: appID,
		DocumentType:  docType,
		FileName:      header.Filename,
		FilePath:      filePath,
		FileURL:       fmt.Sprintf("/api/kyb/documents/%s/%s", appID, fileName),
		FileSize:      header.Size,
		MimeType:      header.Header.Get("Content-Type"),
		Checksum:      checksum,
		Status:        models.DocumentStatusPending,
	}

	if err := h.db.CreateKYBDocument(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save document record"})
		return
	}

	c.JSON(http.StatusCreated, doc)
}

// GetDocuments gets all documents for a KYB application
// GET /kyb/applications/:id/documents
func (h *KYBHandler) GetDocuments(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	docs, err := h.db.GetKYBDocuments(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get documents"})
		return
	}

	c.JSON(http.StatusOK, docs)
}

// SubmitForReview submits the KYB application for review
// POST /kyb/applications/:id/submit
func (h *KYBHandler) SubmitForReview(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	app, err := h.db.GetKYBApplication(c.Request.Context(), appID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// Verify required data is present
	businessInfo, _ := h.db.GetBusinessInfo(c.Request.Context(), appID)
	if businessInfo == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "business information is required"})
		return
	}

	ubos, _ := h.db.GetUBOs(c.Request.Context(), appID)
	if len(ubos) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one UBO is required"})
		return
	}

	// Calculate risk assessment
	cacVerification, _ := h.db.GetCACVerification(c.Request.Context(), appID)
	financialInfo, _ := h.db.GetFinancialInfo(c.Request.Context(), appID)
	docs, _ := h.db.GetKYBDocuments(c.Request.Context(), appID)

	// Convert to pointer slice for risk calculation
	kybDocs := make([]*models.KYBDocument, len(docs))
	for i := range docs {
		kybDocs[i] = docs[i]
	}

	riskAssessment := h.riskService.CalculateBusinessRisk(businessInfo, cacVerification, financialInfo, ubos, kybDocs)
	riskAssessment.ApplicationID = appID
	h.db.CreateRiskAssessment(c.Request.Context(), riskAssessment)

	// Update application status based on risk
	switch riskAssessment.Decision {
	case "AUTO_APPROVE":
		app.Status = models.KYBStatusApproved
	case "AUTO_REJECT":
		app.Status = models.KYBStatusRejected
	default:
		app.Status = models.KYBStatusUnderReview
	}

	app.CompletionPercentage = 100
	if err := h.db.UpdateKYBApplication(c.Request.Context(), app); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit application"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Application submitted for review",
		"status":          app.Status,
		"risk_assessment": riskAssessment,
	})
}

// GetRiskAssessment gets risk assessment for an application
// GET /kyb/applications/:id/risk-assessment
func (h *KYBHandler) GetRiskAssessment(c *gin.Context) {
	appID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid application ID"})
		return
	}

	assessment, err := h.db.GetRiskAssessment(c.Request.Context(), appID)
	if err != nil || assessment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "risk assessment not found"})
		return
	}

	c.JSON(http.StatusOK, models.RiskAssessmentResponse{
		RiskScore:   assessment.RiskScore,
		RiskLevel:   assessment.RiskLevel,
		RiskFactors: assessment.RiskFactors,
	})
}

// Helper function to calculate KYB completion percentage
func (h *KYBHandler) calculateKYBCompletion(ctx context.Context, appID uuid.UUID) int {
	total := 0

	// Business info (25%)
	if info, _ := h.db.GetBusinessInfo(ctx, appID); info != nil {
		total += 25
	}

	// CAC verification (20%)
	if cac, _ := h.db.GetCACVerification(ctx, appID); cac != nil && cac.Verified {
		total += 20
	}

	// UBOs (20%)
	if ubos, _ := h.db.GetUBOs(ctx, appID); len(ubos) > 0 {
		total += 20
	}

	// Financial info (20%)
	if fin, _ := h.db.GetFinancialInfo(ctx, appID); fin != nil {
		total += 20
	}

	// Documents (15%)
	if docs, _ := h.db.GetKYBDocuments(ctx, appID); len(docs) > 0 {
		total += 15
	}

	return total
}
