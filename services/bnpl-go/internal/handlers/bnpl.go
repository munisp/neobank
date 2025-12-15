package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/bnpl-service/internal/config"
	"github.com/neobank/bnpl-service/internal/database"
	"github.com/neobank/bnpl-service/internal/models"
	"github.com/neobank/bnpl-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type BNPLHandler struct {
	db        *database.InMemoryDB
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewBNPLHandler(db *database.InMemoryDB, cfg *config.Config) *BNPLHandler {
	return &BNPLHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// GetPlans returns available BNPL plans
// GET /plans
func (h *BNPLHandler) GetPlans(c *gin.Context) {
	plans, err := h.db.GetPlans(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get plans"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"plans": plans,
		"count": len(plans),
	})
}

// CheckEligibility checks user's BNPL eligibility
// GET /eligibility
func (h *BNPLHandler) CheckEligibility(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
	if limit == nil {
		// Create default limit for new users
		limit = &models.BNPLLimit{
			ID:             uuid.New(),
			UserID:         userID.(uuid.UUID),
			TotalLimit:     decimal.NewFromFloat(h.cfg.DefaultLimit),
			UsedLimit:      decimal.Zero,
			AvailableLimit: decimal.NewFromFloat(h.cfg.DefaultLimit),
			Currency:       "NGN",
			CreditScore:    650,
			LastAssessment: time.Now(),
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		h.db.CreateLimit(c.Request.Context(), limit)
	}
	
	plans, _ := h.db.GetPlans(c.Request.Context())
	
	eligible := limit.AvailableLimit.GreaterThan(decimal.NewFromFloat(h.cfg.MinPurchase))
	
	maxPurchase := limit.AvailableLimit
	if maxPurchase.GreaterThan(decimal.NewFromFloat(h.cfg.MaxPurchase)) {
		maxPurchase = decimal.NewFromFloat(h.cfg.MaxPurchase)
	}
	
	response := models.BNPLEligibilityResponse{
		Eligible:       eligible,
		AvailableLimit: limit.AvailableLimit,
		MaxPurchase:    maxPurchase,
		AvailablePlans: make([]models.BNPLPlan, 0),
	}
	
	if eligible {
		for _, p := range plans {
			if limit.AvailableLimit.GreaterThanOrEqual(p.MinAmount) {
				response.AvailablePlans = append(response.AvailablePlans, *p)
			}
		}
	} else {
		response.Reason = "Insufficient available limit"
	}
	
	c.JSON(http.StatusOK, response)
}

// GetQuote returns a quote for a BNPL purchase
// POST /quote
func (h *BNPLHandler) GetQuote(c *gin.Context) {
	var req struct {
		PlanType models.BNPLPlanType `json:"plan_type" binding:"required"`
		Amount   decimal.Decimal     `json:"amount" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	plan, err := h.db.GetPlanByType(c.Request.Context(), req.PlanType)
	if err != nil || plan == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plan not found"})
		return
	}
	
	if req.Amount.LessThan(plan.MinAmount) || req.Amount.GreaterThan(plan.MaxAmount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount outside plan limits"})
		return
	}
	
	installments, processingFee, interestAmount := database.CalculateInstallments(req.Amount, plan)
	totalAmount := req.Amount.Add(processingFee).Add(interestAmount)
	installmentAmount := totalAmount.Div(decimal.NewFromInt(int64(plan.Installments))).Round(2)
	
	now := time.Now()
	firstPayment := now.AddDate(0, 0, plan.FrequencyDays)
	lastPayment := now.AddDate(0, 0, plan.FrequencyDays*plan.Installments)
	
	c.JSON(http.StatusOK, models.BNPLQuoteResponse{
		PlanType:          req.PlanType,
		PurchaseAmount:    req.Amount,
		ProcessingFee:     processingFee,
		InterestAmount:    interestAmount,
		TotalAmount:       totalAmount,
		InstallmentAmount: installmentAmount,
		Installments:      len(installments),
		FirstPaymentDate:  firstPayment,
		LastPaymentDate:   lastPayment,
	})
}

// CreatePurchase creates a new BNPL purchase
// POST /purchases
func (h *BNPLHandler) CreatePurchase(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateBNPLPurchaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Check eligibility
	limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
	if limit == nil {
		limit = &models.BNPLLimit{
			ID:             uuid.New(),
			UserID:         userID.(uuid.UUID),
			TotalLimit:     decimal.NewFromFloat(h.cfg.DefaultLimit),
			UsedLimit:      decimal.Zero,
			AvailableLimit: decimal.NewFromFloat(h.cfg.DefaultLimit),
			Currency:       "NGN",
			CreditScore:    650,
			LastAssessment: time.Now(),
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		h.db.CreateLimit(c.Request.Context(), limit)
	}
	
	if req.Amount.GreaterThan(limit.AvailableLimit) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount exceeds available limit"})
		return
	}
	
	plan, err := h.db.GetPlanByType(c.Request.Context(), req.PlanType)
	if err != nil || plan == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plan not found"})
		return
	}
	
	if req.Amount.LessThan(plan.MinAmount) || req.Amount.GreaterThan(plan.MaxAmount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount outside plan limits"})
		return
	}
	
	installments, processingFee, interestAmount := database.CalculateInstallments(req.Amount, plan)
	totalAmount := req.Amount.Add(processingFee).Add(interestAmount)
	installmentAmount := totalAmount.Div(decimal.NewFromInt(int64(plan.Installments))).Round(2)
	
	now := time.Now()
	nextPayment := now.AddDate(0, 0, plan.FrequencyDays)
	
	purchase := &models.BNPLPurchase{
		ID:                uuid.New(),
		UserID:            userID.(uuid.UUID),
		PlanID:            plan.ID,
		PlanType:          req.PlanType,
		Status:            models.BNPLStatusActive,
		MerchantName:      req.MerchantName,
		MerchantID:        req.MerchantID,
		Description:       req.Description,
		Category:          req.Category,
		PurchaseAmount:    req.Amount,
		TotalAmount:       totalAmount,
		ProcessingFee:     processingFee,
		InterestAmount:    interestAmount,
		Currency:          req.Currency,
		TotalInstallments: plan.Installments,
		PaidInstallments:  0,
		InstallmentAmount: installmentAmount,
		Installments:      installments,
		PurchaseDate:      now,
		NextPaymentDate:   &nextPayment,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	
	// Update purchase IDs in installments
	for i := range purchase.Installments {
		purchase.Installments[i].PurchaseID = purchase.ID
	}
	
	if err := h.db.CreatePurchase(c.Request.Context(), purchase); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create purchase"})
		return
	}
	
	// Update limit
	limit.UsedLimit = limit.UsedLimit.Add(totalAmount)
	limit.AvailableLimit = limit.TotalLimit.Sub(limit.UsedLimit)
	limit.UpdatedAt = now
	h.db.UpdateLimit(c.Request.Context(), limit)
	
	// Publish BNPL purchase event to Kafka for lakehouse analytics
	h.publisher.PublishBNPL(c.Request.Context(), map[string]interface{}{
		"purchase_id":        purchase.ID.String(),
		"user_id":            purchase.UserID.String(),
		"plan_type":          purchase.PlanType,
		"merchant_name":      purchase.MerchantName,
		"purchase_amount":    purchase.PurchaseAmount.String(),
		"total_amount":       purchase.TotalAmount.String(),
		"total_installments": purchase.TotalInstallments,
		"status":             string(purchase.Status),
		"event_type":         "bnpl_purchase_created",
		"created_at":         now.Format(time.RFC3339),
	})
	
	c.JSON(http.StatusCreated, purchase)
}

// GetPurchases returns user's BNPL purchases
// GET /purchases
func (h *BNPLHandler) GetPurchases(c *gin.Context) {
	userID, _ := c.Get("user_id")
	status := c.Query("status")
	
	var purchases []*models.BNPLPurchase
	var err error
	
	if status == "active" {
		purchases, err = h.db.GetUserActivePurchases(c.Request.Context(), userID.(uuid.UUID))
	} else {
		purchases, err = h.db.GetUserPurchases(c.Request.Context(), userID.(uuid.UUID))
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get purchases"})
		return
	}
	
	// Calculate totals
	totalOwed := decimal.Zero
	nextPayment := decimal.Zero
	var nextPaymentDate *time.Time
	
	for _, p := range purchases {
		if p.Status == models.BNPLStatusActive {
			remaining := p.TotalAmount.Sub(p.InstallmentAmount.Mul(decimal.NewFromInt(int64(p.PaidInstallments))))
			totalOwed = totalOwed.Add(remaining)
			
			if nextPaymentDate == nil || (p.NextPaymentDate != nil && p.NextPaymentDate.Before(*nextPaymentDate)) {
				nextPaymentDate = p.NextPaymentDate
				nextPayment = p.InstallmentAmount
			}
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"purchases":         purchases,
		"count":             len(purchases),
		"total_owed":        totalOwed,
		"next_payment":      nextPayment,
		"next_payment_date": nextPaymentDate,
	})
}

// GetPurchase returns a specific purchase
// GET /purchases/:id
func (h *BNPLHandler) GetPurchase(c *gin.Context) {
	purchaseID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid purchase ID"})
		return
	}
	
	purchase, err := h.db.GetPurchase(c.Request.Context(), purchaseID)
	if err != nil || purchase == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase not found"})
		return
	}
	
	c.JSON(http.StatusOK, purchase)
}

// PayInstallment pays an installment
// POST /purchases/:id/pay
func (h *BNPLHandler) PayInstallment(c *gin.Context) {
	userID, _ := c.Get("user_id")
	purchaseID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid purchase ID"})
		return
	}
	
	purchase, err := h.db.GetPurchase(c.Request.Context(), purchaseID)
	if err != nil || purchase == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase not found"})
		return
	}
	
	if purchase.Status != models.BNPLStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase is not active"})
		return
	}
	
	// Find next unpaid installment
	var nextInstallment *models.Installment
	var nextIndex int
	for i, inst := range purchase.Installments {
		if inst.Status == models.InstallmentStatusPending || inst.Status == models.InstallmentStatusOverdue {
			nextInstallment = &purchase.Installments[i]
			nextIndex = i
			break
		}
	}
	
	if nextInstallment == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no pending installments"})
		return
	}
	
	now := time.Now()
	purchase.Installments[nextIndex].Status = models.InstallmentStatusPaid
	purchase.Installments[nextIndex].PaidDate = &now
	purchase.Installments[nextIndex].PaidAmount = nextInstallment.Amount
	purchase.PaidInstallments++
	purchase.UpdatedAt = now
	
	// Check if all installments are paid
	if purchase.PaidInstallments >= purchase.TotalInstallments {
		purchase.Status = models.BNPLStatusCompleted
		purchase.CompletedDate = &now
		purchase.NextPaymentDate = nil
		
		// Release limit
		limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
		if limit != nil {
			limit.UsedLimit = limit.UsedLimit.Sub(purchase.TotalAmount)
			limit.AvailableLimit = limit.TotalLimit.Sub(limit.UsedLimit)
			limit.UpdatedAt = now
			h.db.UpdateLimit(c.Request.Context(), limit)
		}
	} else {
		// Update next payment date
		for _, inst := range purchase.Installments {
			if inst.Status == models.InstallmentStatusPending {
				purchase.NextPaymentDate = &inst.DueDate
				break
			}
		}
	}
	
	if err := h.db.UpdatePurchase(c.Request.Context(), purchase); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update purchase"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"purchase": purchase,
		"message":  "Installment paid successfully",
	})
}

// EarlyPayoff pays off remaining balance early
// POST /purchases/:id/payoff
func (h *BNPLHandler) EarlyPayoff(c *gin.Context) {
	userID, _ := c.Get("user_id")
	purchaseID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid purchase ID"})
		return
	}
	
	purchase, err := h.db.GetPurchase(c.Request.Context(), purchaseID)
	if err != nil || purchase == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase not found"})
		return
	}
	
	if purchase.Status != models.BNPLStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase is not active"})
		return
	}
	
	now := time.Now()
	remainingAmount := decimal.Zero
	
	// Mark all pending installments as paid
	for i, inst := range purchase.Installments {
		if inst.Status == models.InstallmentStatusPending || inst.Status == models.InstallmentStatusOverdue {
			remainingAmount = remainingAmount.Add(inst.Amount)
			purchase.Installments[i].Status = models.InstallmentStatusPaid
			purchase.Installments[i].PaidDate = &now
			purchase.Installments[i].PaidAmount = inst.Amount
			purchase.PaidInstallments++
		}
	}
	
	purchase.Status = models.BNPLStatusCompleted
	purchase.CompletedDate = &now
	purchase.NextPaymentDate = nil
	purchase.UpdatedAt = now
	
	// Release limit
	limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
	if limit != nil {
		limit.UsedLimit = limit.UsedLimit.Sub(purchase.TotalAmount)
		limit.AvailableLimit = limit.TotalLimit.Sub(limit.UsedLimit)
		limit.UpdatedAt = now
		h.db.UpdateLimit(c.Request.Context(), limit)
	}
	
	if err := h.db.UpdatePurchase(c.Request.Context(), purchase); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update purchase"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"purchase":         purchase,
		"amount_paid":      remainingAmount,
		"message":          "Purchase paid off successfully",
	})
}

// GetMerchants returns BNPL-enabled merchants
// GET /merchants
func (h *BNPLHandler) GetMerchants(c *gin.Context) {
	merchants, err := h.db.GetMerchants(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get merchants"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"merchants": merchants,
		"count":     len(merchants),
	})
}

// GetLimit returns user's BNPL limit
// GET /limit
func (h *BNPLHandler) GetLimit(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
	if limit == nil {
		limit = &models.BNPLLimit{
			ID:             uuid.New(),
			UserID:         userID.(uuid.UUID),
			TotalLimit:     decimal.NewFromFloat(h.cfg.DefaultLimit),
			UsedLimit:      decimal.Zero,
			AvailableLimit: decimal.NewFromFloat(h.cfg.DefaultLimit),
			Currency:       "NGN",
			CreditScore:    650,
			LastAssessment: time.Now(),
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		h.db.CreateLimit(c.Request.Context(), limit)
	}
	
	c.JSON(http.StatusOK, limit)
}

// GetSummary returns BNPL summary
// GET /summary
func (h *BNPLHandler) GetSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	limit, _ := h.db.GetUserLimit(c.Request.Context(), userID.(uuid.UUID))
	purchases, _ := h.db.GetUserPurchases(c.Request.Context(), userID.(uuid.UUID))
	
	activePurchases := 0
	totalOwed := decimal.Zero
	nextPayment := decimal.Zero
	var nextPaymentDate *time.Time
	
	for _, p := range purchases {
		if p.Status == models.BNPLStatusActive {
			activePurchases++
			remaining := p.TotalAmount.Sub(p.InstallmentAmount.Mul(decimal.NewFromInt(int64(p.PaidInstallments))))
			totalOwed = totalOwed.Add(remaining)
			
			if nextPaymentDate == nil || (p.NextPaymentDate != nil && p.NextPaymentDate.Before(*nextPaymentDate)) {
				nextPaymentDate = p.NextPaymentDate
				nextPayment = p.InstallmentAmount
			}
		}
	}
	
	var availableLimit decimal.Decimal
	if limit != nil {
		availableLimit = limit.AvailableLimit
	}
	
	c.JSON(http.StatusOK, gin.H{
		"active_purchases":  activePurchases,
		"total_owed":        totalOwed,
		"available_limit":   availableLimit,
		"next_payment":      nextPayment,
		"next_payment_date": nextPaymentDate,
	})
}
