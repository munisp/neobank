package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/insurance-service/internal/config"
	"github.com/neobank/insurance-service/internal/database"
	"github.com/neobank/insurance-service/internal/models"
	"github.com/neobank/insurance-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type InsuranceHandler struct {
	db        database.Store
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewInsuranceHandler(db database.Store, cfg *config.Config) *InsuranceHandler {
	return &InsuranceHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// GetProducts returns available insurance products
// GET /products
func (h *InsuranceHandler) GetProducts(c *gin.Context) {
	insuranceType := models.InsuranceType(c.Query("type"))
	
	products, err := h.db.GetProducts(c.Request.Context(), insuranceType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get products"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"products": products,
		"count":    len(products),
	})
}

// GetProduct returns a specific product
// GET /products/:id
func (h *InsuranceHandler) GetProduct(c *gin.Context) {
	productID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product ID"})
		return
	}
	
	product, err := h.db.GetProduct(c.Request.Context(), productID)
	if err != nil || product == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	
	c.JSON(http.StatusOK, product)
}

// GetQuote returns insurance quotes based on criteria
// POST /quotes
func (h *InsuranceHandler) GetQuote(c *gin.Context) {
	var req models.GetQuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	products, err := h.db.GetProducts(c.Request.Context(), req.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get quotes"})
		return
	}
	
	// Adjust premiums based on request parameters
	var adjustedProducts []models.InsuranceProduct
	for _, p := range products {
		adjusted := *p
		
		switch req.Type {
		case models.InsuranceTypeTravel:
			if req.DepartureDate != nil && req.ReturnDate != nil {
				days := int(req.ReturnDate.Sub(*req.DepartureDate).Hours() / 24)
				if days > 30 {
					adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(decimal.NewFromFloat(1.5))
				}
			}
			if req.TravelersCount > 1 {
				multiplier := decimal.NewFromFloat(1.0 + float64(req.TravelersCount-1)*0.7)
				adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(multiplier)
			}
		case models.InsuranceTypeDevice:
			if !req.PurchasePrice.IsZero() {
				if req.PurchasePrice.GreaterThan(decimal.NewFromInt(500000)) {
					adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(decimal.NewFromFloat(1.5))
				}
			}
		case models.InsuranceTypeLife:
			if req.Age > 0 {
				if req.Age > 50 {
					adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(decimal.NewFromFloat(2.0))
				} else if req.Age > 40 {
					adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(decimal.NewFromFloat(1.5))
				}
			}
			if !req.SumAssured.IsZero() {
				ratio := req.SumAssured.Div(adjusted.CoverageAmount)
				adjusted.PremiumMonthly = adjusted.PremiumMonthly.Mul(ratio)
				adjusted.CoverageAmount = req.SumAssured
			}
		}
		
		adjusted.PremiumAnnual = adjusted.PremiumMonthly.Mul(decimal.NewFromInt(10)) // 2 months free
		adjustedProducts = append(adjustedProducts, adjusted)
	}
	
	var recommendedID uuid.UUID
	if len(adjustedProducts) > 0 {
		recommendedID = adjustedProducts[0].ID
	}
	
	c.JSON(http.StatusOK, models.QuoteResponse{
		Type:          req.Type,
		Products:      adjustedProducts,
		RecommendedID: recommendedID,
	})
}

// PurchasePolicy purchases an insurance policy
// POST /policies
func (h *InsuranceHandler) PurchasePolicy(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.PurchasePolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	product, err := h.db.GetProduct(c.Request.Context(), req.ProductID)
	if err != nil || product == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	
	now := time.Now()
	var endDate time.Time
	var premium decimal.Decimal
	
	if req.PaymentFrequency == "annual" {
		endDate = now.AddDate(1, 0, 0)
		premium = product.PremiumAnnual
	} else {
		endDate = now.AddDate(0, 1, 0)
		premium = product.PremiumMonthly
	}
	
	nextPayment := endDate
	
	policy := &models.InsurancePolicy{
		ID:               uuid.New(),
		UserID:           userID.(uuid.UUID),
		ProductID:        product.ID,
		Type:             product.Type,
		PolicyNumber:     database.GeneratePolicyNumber(),
		Status:           models.PolicyStatusActive,
		CoverageAmount:   product.CoverageAmount,
		Deductible:       product.Deductible,
		Premium:          premium,
		PaymentFrequency: req.PaymentFrequency,
		NextPaymentDate:  &nextPayment,
		StartDate:        now,
		EndDate:          endDate,
		Beneficiaries:    req.Beneficiaries,
		TravelDetails:    req.TravelDetails,
		DeviceDetails:    req.DeviceDetails,
		LifeDetails:      req.LifeDetails,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	
	if err := h.db.CreatePolicy(c.Request.Context(), policy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create policy"})
		return
	}
	
	// Publish insurance policy event to Kafka for lakehouse analytics
	h.publisher.PublishInsurance(c.Request.Context(), map[string]interface{}{
		"policy_id":        policy.ID.String(),
		"user_id":          policy.UserID.String(),
		"product_id":       policy.ProductID.String(),
		"type":             string(policy.Type),
		"policy_number":    policy.PolicyNumber,
		"status":           string(policy.Status),
		"coverage_amount":  policy.CoverageAmount.String(),
		"premium":          policy.Premium.String(),
		"payment_frequency": policy.PaymentFrequency,
		"event_type":       "policy_purchased",
		"created_at":       now.Format(time.RFC3339),
	})
	
	c.JSON(http.StatusCreated, policy)
}

// GetPolicies returns user's policies
// GET /policies
func (h *InsuranceHandler) GetPolicies(c *gin.Context) {
	userID, _ := c.Get("user_id")
	status := c.Query("status")
	
	var policies []*models.InsurancePolicy
	var err error
	
	if status == "active" {
		policies, err = h.db.GetUserActivePolicies(c.Request.Context(), userID.(uuid.UUID))
	} else {
		policies, err = h.db.GetUserPolicies(c.Request.Context(), userID.(uuid.UUID))
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get policies"})
		return
	}
	
	// Calculate totals
	totalCoverage := decimal.Zero
	totalPremium := decimal.Zero
	for _, p := range policies {
		if p.Status == models.PolicyStatusActive {
			totalCoverage = totalCoverage.Add(p.CoverageAmount)
			totalPremium = totalPremium.Add(p.Premium)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"policies":       policies,
		"count":          len(policies),
		"total_coverage": totalCoverage,
		"total_premium":  totalPremium,
	})
}

// GetPolicy returns a specific policy
// GET /policies/:id
func (h *InsuranceHandler) GetPolicy(c *gin.Context) {
	policyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid policy ID"})
		return
	}
	
	policy, err := h.db.GetPolicy(c.Request.Context(), policyID)
	if err != nil || policy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "policy not found"})
		return
	}
	
	// Get associated claims
	claims, _ := h.db.GetPolicyClaims(c.Request.Context(), policyID)
	
	c.JSON(http.StatusOK, gin.H{
		"policy": policy,
		"claims": claims,
	})
}

// CancelPolicy cancels a policy
// POST /policies/:id/cancel
func (h *InsuranceHandler) CancelPolicy(c *gin.Context) {
	policyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid policy ID"})
		return
	}
	
	policy, err := h.db.GetPolicy(c.Request.Context(), policyID)
	if err != nil || policy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "policy not found"})
		return
	}
	
	if policy.Status != models.PolicyStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "policy is not active"})
		return
	}
	
	policy.Status = models.PolicyStatusCancelled
	policy.UpdatedAt = time.Now()
	
	if err := h.db.UpdatePolicy(c.Request.Context(), policy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel policy"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"policy":  policy,
		"message": "Policy cancelled successfully",
	})
}

// RenewPolicy renews a policy
// POST /policies/:id/renew
func (h *InsuranceHandler) RenewPolicy(c *gin.Context) {
	policyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid policy ID"})
		return
	}
	
	policy, err := h.db.GetPolicy(c.Request.Context(), policyID)
	if err != nil || policy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "policy not found"})
		return
	}
	
	now := time.Now()
	var newEndDate time.Time
	
	if policy.PaymentFrequency == "annual" {
		newEndDate = policy.EndDate.AddDate(1, 0, 0)
	} else {
		newEndDate = policy.EndDate.AddDate(0, 1, 0)
	}
	
	policy.EndDate = newEndDate
	policy.NextPaymentDate = &newEndDate
	policy.Status = models.PolicyStatusActive
	policy.UpdatedAt = now
	
	if err := h.db.UpdatePolicy(c.Request.Context(), policy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to renew policy"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"policy":  policy,
		"message": "Policy renewed successfully",
	})
}

// SubmitClaim submits an insurance claim
// POST /claims
func (h *InsuranceHandler) SubmitClaim(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.SubmitClaimRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	policy, err := h.db.GetPolicy(c.Request.Context(), req.PolicyID)
	if err != nil || policy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "policy not found"})
		return
	}
	
	if policy.Status != models.PolicyStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "policy is not active"})
		return
	}
	
	if req.ClaimAmount.GreaterThan(policy.CoverageAmount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "claim amount exceeds coverage"})
		return
	}
	
	now := time.Now()
	claim := &models.InsuranceClaim{
		ID:           uuid.New(),
		PolicyID:     req.PolicyID,
		UserID:       userID.(uuid.UUID),
		ClaimNumber:  database.GenerateClaimNumber(),
		Type:         policy.Type,
		Status:       models.ClaimStatusSubmitted,
		IncidentDate: req.IncidentDate,
		Description:  req.Description,
		ClaimAmount:  req.ClaimAmount,
		Documents:    []models.ClaimDocument{},
		SubmittedAt:  now,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	
	if err := h.db.CreateClaim(c.Request.Context(), claim); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit claim"})
		return
	}
	
	c.JSON(http.StatusCreated, claim)
}

// GetClaims returns user's claims
// GET /claims
func (h *InsuranceHandler) GetClaims(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	claims, err := h.db.GetUserClaims(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get claims"})
		return
	}
	
	// Calculate totals
	totalClaimed := decimal.Zero
	totalApproved := decimal.Zero
	for _, cl := range claims {
		totalClaimed = totalClaimed.Add(cl.ClaimAmount)
		totalApproved = totalApproved.Add(cl.ApprovedAmount)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"claims":         claims,
		"count":          len(claims),
		"total_claimed":  totalClaimed,
		"total_approved": totalApproved,
	})
}

// GetClaim returns a specific claim
// GET /claims/:id
func (h *InsuranceHandler) GetClaim(c *gin.Context) {
	claimID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid claim ID"})
		return
	}
	
	claim, err := h.db.GetClaim(c.Request.Context(), claimID)
	if err != nil || claim == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "claim not found"})
		return
	}
	
	c.JSON(http.StatusOK, claim)
}

// UploadClaimDocument uploads a document for a claim
// POST /claims/:id/documents
func (h *InsuranceHandler) UploadClaimDocument(c *gin.Context) {
	claimID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid claim ID"})
		return
	}
	
	var req models.UploadDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	claim, err := h.db.GetClaim(c.Request.Context(), claimID)
	if err != nil || claim == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "claim not found"})
		return
	}
	
	doc := models.ClaimDocument{
		ID:         uuid.New(),
		Name:       req.Name,
		Type:       req.Type,
		URL:        req.URL,
		UploadedAt: time.Now(),
	}
	
	claim.Documents = append(claim.Documents, doc)
	claim.UpdatedAt = time.Now()
	
	if err := h.db.UpdateClaim(c.Request.Context(), claim); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload document"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"claim":    claim,
		"document": doc,
	})
}

// GetInsuranceSummary returns a summary of user's insurance
// GET /summary
func (h *InsuranceHandler) GetInsuranceSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	policies, _ := h.db.GetUserPolicies(c.Request.Context(), userID.(uuid.UUID))
	claims, _ := h.db.GetUserClaims(c.Request.Context(), userID.(uuid.UUID))
	
	activePolicies := 0
	totalCoverage := decimal.Zero
	totalPremium := decimal.Zero
	
	byType := make(map[models.InsuranceType]int)
	
	for _, p := range policies {
		if p.Status == models.PolicyStatusActive {
			activePolicies++
			totalCoverage = totalCoverage.Add(p.CoverageAmount)
			totalPremium = totalPremium.Add(p.Premium)
			byType[p.Type]++
		}
	}
	
	pendingClaims := 0
	totalClaimed := decimal.Zero
	for _, cl := range claims {
		if cl.Status == models.ClaimStatusSubmitted || cl.Status == models.ClaimStatusUnderReview {
			pendingClaims++
		}
		totalClaimed = totalClaimed.Add(cl.ClaimAmount)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"active_policies":  activePolicies,
		"total_coverage":   totalCoverage,
		"monthly_premium":  totalPremium,
		"policies_by_type": byType,
		"pending_claims":   pendingClaims,
		"total_claimed":    totalClaimed,
	})
}
