package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/config"
	"github.com/neobank/banking-service/internal/database"
	"github.com/neobank/banking-service/internal/models"
	"github.com/shopspring/decimal"
)

// ComplianceHandler handles compliance-related HTTP requests
type ComplianceHandler struct {
	db  *database.InMemoryDB
	cfg *config.Config
}

// NewComplianceHandler creates a new compliance handler
func NewComplianceHandler(db *database.InMemoryDB, cfg *config.Config) *ComplianceHandler {
	return &ComplianceHandler{db: db, cfg: cfg}
}

// RunComplianceCheck runs compliance checks for a user
// POST /compliance/check
func (h *ComplianceHandler) RunComplianceCheck(c *gin.Context) {
	var req models.RunComplianceCheckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var checks []*models.ComplianceCheck

	for _, checkType := range req.CheckTypes {
		check := &models.ComplianceCheck{
			UserID:     req.UserID,
			EntityType: req.EntityType,
			CheckType:  checkType,
			Status:     models.ComplianceStatusPending,
		}

		// Perform the check based on type
		switch checkType {
		case models.ComplianceCheckAML:
			h.performAMLCheck(check, req)
		case models.ComplianceCheckPEP:
			h.performPEPCheck(check, req)
		case models.ComplianceCheckSanctions:
			h.performSanctionsCheck(check, req)
		case models.ComplianceCheckFraud:
			h.performFraudCheck(check, req)
		case models.ComplianceCheckKYC:
			h.performKYCCheck(check, req)
		}

		if err := h.db.CreateComplianceCheck(c.Request.Context(), check); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compliance check"})
			return
		}

		checks = append(checks, check)
	}

	c.JSON(http.StatusCreated, checks)
}

// GetComplianceCheck gets a compliance check by ID
// GET /compliance/checks/:id
func (h *ComplianceHandler) GetComplianceCheck(c *gin.Context) {
	checkID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid check ID"})
		return
	}

	check, err := h.db.GetComplianceCheck(c.Request.Context(), checkID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "check not found"})
		return
	}

	c.JSON(http.StatusOK, check)
}

// GetUserComplianceChecks gets all compliance checks for a user
// GET /compliance/users/:user_id/checks
func (h *ComplianceHandler) GetUserComplianceChecks(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}

	checks, err := h.db.GetComplianceChecksByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get checks"})
		return
	}

	c.JSON(http.StatusOK, checks)
}

// GetComplianceSummary gets compliance summary for a user
// GET /compliance/users/:user_id/summary
func (h *ComplianceHandler) GetComplianceSummary(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}

	checks, err := h.db.GetComplianceChecksByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get checks"})
		return
	}

	openAlerts, _ := h.db.GetOpenAlertCount(c.Request.Context(), userID)

	summary := &models.ComplianceSummary{
		UserID:           userID,
		OverallStatus:    models.ComplianceStatusCleared,
		OverallRiskLevel: models.RiskLevelLow,
		OpenAlerts:       openAlerts,
		TotalChecks:      len(checks),
	}

	var lastCheckTime time.Time
	for _, check := range checks {
		if check.Status == models.ComplianceStatusCleared {
			summary.ClearedChecks++
		} else if check.Status == models.ComplianceStatusFlagged || check.Status == models.ComplianceStatusBlocked {
			summary.FlaggedChecks++
			summary.OverallStatus = models.ComplianceStatusFlagged
		}

		// Update overall risk level
		if check.RiskLevel == models.RiskLevelCritical {
			summary.OverallRiskLevel = models.RiskLevelCritical
		} else if check.RiskLevel == models.RiskLevelHigh && summary.OverallRiskLevel != models.RiskLevelCritical {
			summary.OverallRiskLevel = models.RiskLevelHigh
		} else if check.RiskLevel == models.RiskLevelMedium && 
			summary.OverallRiskLevel != models.RiskLevelCritical && 
			summary.OverallRiskLevel != models.RiskLevelHigh {
			summary.OverallRiskLevel = models.RiskLevelMedium
		}

		if check.CreatedAt.After(lastCheckTime) {
			lastCheckTime = check.CreatedAt
		}
	}

	if !lastCheckTime.IsZero() {
		summary.LastCheckDate = &lastCheckTime
		nextCheck := lastCheckTime.AddDate(0, 6, 0) // 6 months
		summary.NextCheckDue = &nextCheck
	}

	summary.Checks = make([]models.ComplianceCheck, len(checks))
	for i, check := range checks {
		summary.Checks[i] = *check
	}

	c.JSON(http.StatusOK, summary)
}

// GetAlerts gets compliance alerts
// GET /compliance/alerts
func (h *ComplianceHandler) GetAlerts(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	alerts, err := h.db.GetComplianceAlertsByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get alerts"})
		return
	}

	c.JSON(http.StatusOK, alerts)
}

// GetAlert gets a specific alert
// GET /compliance/alerts/:id
func (h *ComplianceHandler) GetAlert(c *gin.Context) {
	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert ID"})
		return
	}

	alert, err := h.db.GetComplianceAlert(c.Request.Context(), alertID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
		return
	}

	c.JSON(http.StatusOK, alert)
}

// ReviewAlert reviews and updates an alert
// PUT /compliance/alerts/:id/review
func (h *ComplianceHandler) ReviewAlert(c *gin.Context) {
	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert ID"})
		return
	}

	var req models.ReviewAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	alert, err := h.db.GetComplianceAlert(c.Request.Context(), alertID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	alert.Status = req.Status
	alert.Resolution = req.Resolution
	alert.AssignedTo = &uid

	if req.Status == "resolved" {
		now := time.Now()
		alert.ResolvedAt = &now
		alert.ResolvedBy = &uid
	}

	if err := h.db.UpdateComplianceAlert(c.Request.Context(), alert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update alert"})
		return
	}

	c.JSON(http.StatusOK, alert)
}

// Helper functions for compliance checks

func (h *ComplianceHandler) performAMLCheck(check *models.ComplianceCheck, req models.RunComplianceCheckRequest) {
	// Simulate AML screening
	check.DataSources = []string{"ComplyAdvantage", "World-Check", "Internal Database"}
	check.RiskScore = decimal.NewFromFloat(15.5)
	check.RiskLevel = models.RiskLevelLow
	check.Status = models.ComplianceStatusCleared

	// Check for high-risk indicators
	if req.Nationality == "NG" {
		check.RiskScore = check.RiskScore.Add(decimal.NewFromFloat(5))
	}

	if check.RiskScore.GreaterThan(decimal.NewFromFloat(50)) {
		check.RiskLevel = models.RiskLevelHigh
		check.Status = models.ComplianceStatusFlagged
	} else if check.RiskScore.GreaterThan(decimal.NewFromFloat(30)) {
		check.RiskLevel = models.RiskLevelMedium
	}
}

func (h *ComplianceHandler) performPEPCheck(check *models.ComplianceCheck, req models.RunComplianceCheckRequest) {
	// Simulate PEP screening
	check.DataSources = []string{"World-Check", "Dow Jones", "LexisNexis"}
	check.RiskScore = decimal.NewFromFloat(10.0)
	check.RiskLevel = models.RiskLevelLow
	check.Status = models.ComplianceStatusCleared
}

func (h *ComplianceHandler) performSanctionsCheck(check *models.ComplianceCheck, req models.RunComplianceCheckRequest) {
	// Simulate sanctions screening
	check.DataSources = []string{"OFAC", "UN Sanctions", "EU Sanctions", "UK Sanctions"}
	check.RiskScore = decimal.NewFromFloat(5.0)
	check.RiskLevel = models.RiskLevelLow
	check.Status = models.ComplianceStatusCleared
}

func (h *ComplianceHandler) performFraudCheck(check *models.ComplianceCheck, req models.RunComplianceCheckRequest) {
	// Simulate fraud check
	check.DataSources = []string{"Internal Fraud Database", "Device Fingerprint", "Behavioral Analysis"}
	check.RiskScore = decimal.NewFromFloat(12.0)
	check.RiskLevel = models.RiskLevelLow
	check.Status = models.ComplianceStatusCleared
}

func (h *ComplianceHandler) performKYCCheck(check *models.ComplianceCheck, req models.RunComplianceCheckRequest) {
	// Simulate KYC verification
	check.DataSources = []string{"BVN Verification", "NIN Verification", "Document Verification"}
	check.RiskScore = decimal.NewFromFloat(8.0)
	check.RiskLevel = models.RiskLevelLow
	check.Status = models.ComplianceStatusCleared

	// Add findings if ID number provided
	if req.IDNumber != "" {
		check.Findings = append(check.Findings, models.ComplianceFinding{
			ID:          uuid.New(),
			CheckID:     check.ID,
			Type:        "identity_verified",
			Severity:    "low",
			Description: "Identity document verified successfully",
			Source:      "BVN Verification Service",
			MatchScore:  0.98,
			CreatedAt:   time.Now(),
		})
	}
}
