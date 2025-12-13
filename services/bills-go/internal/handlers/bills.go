package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/bills-service/internal/config"
	"github.com/neobank/bills-service/internal/database"
	"github.com/neobank/bills-service/internal/models"
	"github.com/shopspring/decimal"
)

type BillsHandler struct {
	db  *database.InMemoryDB
	cfg *config.Config
}

func NewBillsHandler(db *database.InMemoryDB, cfg *config.Config) *BillsHandler {
	return &BillsHandler{db: db, cfg: cfg}
}

// GetBillers returns available billers
// GET /billers
func (h *BillsHandler) GetBillers(c *gin.Context) {
	category := models.BillCategory(c.Query("category"))
	
	var billers []*models.Biller
	var err error
	
	if category != "" {
		billers, err = h.db.GetBillersByCategory(c.Request.Context(), category)
	} else {
		billers, err = h.db.GetBillers(c.Request.Context())
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get billers"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"billers": billers,
		"count":   len(billers),
	})
}

// GetBiller returns a specific biller
// GET /billers/:id
func (h *BillsHandler) GetBiller(c *gin.Context) {
	billerID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid biller ID"})
		return
	}
	
	biller, err := h.db.GetBiller(c.Request.Context(), billerID)
	if err != nil || biller == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "biller not found"})
		return
	}
	
	c.JSON(http.StatusOK, biller)
}

// GetCategories returns bill categories
// GET /categories
func (h *BillsHandler) GetCategories(c *gin.Context) {
	categories := []gin.H{
		{"code": "electricity", "name": "Electricity", "icon": "bolt"},
		{"code": "water", "name": "Water", "icon": "droplet"},
		{"code": "gas", "name": "Gas", "icon": "flame"},
		{"code": "internet", "name": "Internet", "icon": "wifi"},
		{"code": "tv", "name": "TV/Cable", "icon": "tv"},
		{"code": "phone", "name": "Phone", "icon": "phone"},
		{"code": "insurance", "name": "Insurance", "icon": "shield"},
		{"code": "rent", "name": "Rent", "icon": "home"},
		{"code": "education", "name": "Education", "icon": "graduation-cap"},
		{"code": "government", "name": "Government", "icon": "landmark"},
		{"code": "other", "name": "Other", "icon": "file"},
	}
	
	c.JSON(http.StatusOK, gin.H{
		"categories": categories,
	})
}

// ValidateCustomer validates a customer ID with a biller
// POST /validate
func (h *BillsHandler) ValidateCustomer(c *gin.Context) {
	var req models.ValidateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	biller, err := h.db.GetBiller(c.Request.Context(), req.BillerID)
	if err != nil || biller == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "biller not found"})
		return
	}
	
	// Simulate customer validation
	response := models.ValidateCustomerResponse{
		Valid:             true,
		CustomerName:      "Customer " + req.CustomerID,
		OutstandingAmount: decimal.NewFromFloat(5000),
		Message:           "Customer validated successfully",
	}
	
	c.JSON(http.StatusOK, response)
}

// PayBill processes a bill payment
// POST /pay
func (h *BillsHandler) PayBill(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.PayBillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	biller, err := h.db.GetBiller(c.Request.Context(), req.BillerID)
	if err != nil || biller == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "biller not found"})
		return
	}
	
	// Calculate fees
	serviceFee := biller.ServiceFee
	if biller.FeeType == "percentage" {
		serviceFee = req.Amount.Mul(biller.ServiceFee).Div(decimal.NewFromInt(100))
	}
	totalAmount := req.Amount.Add(serviceFee)
	
	now := time.Now()
	payment := &models.BillPayment{
		ID:            uuid.New(),
		UserID:        userID.(uuid.UUID),
		BillerID:      biller.ID,
		BillerName:    biller.Name,
		Category:      biller.Category,
		CustomerID:    req.CustomerID,
		CustomerName:  req.CustomerName,
		CustomerEmail: req.CustomerEmail,
		CustomerPhone: req.CustomerPhone,
		Amount:        req.Amount,
		ServiceFee:    serviceFee,
		TotalAmount:   totalAmount,
		Currency:      "NGN",
		Reference:     database.GenerateReference(),
		Status:        models.PaymentStatusProcessing,
		IsScheduled:   req.ScheduledDate != nil,
		ScheduledDate: req.ScheduledDate,
		CreatedAt:     now,
	}
	
	if req.ScheduledDate != nil {
		payment.Status = models.PaymentStatusPending
	}
	
	if err := h.db.CreatePayment(c.Request.Context(), payment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create payment"})
		return
	}
	
	// Simulate payment processing
	if payment.Status == models.PaymentStatusProcessing {
		payment.Status = models.PaymentStatusCompleted
		payment.PaidAt = &now
		payment.StatusMessage = "Payment successful"
		h.db.UpdatePayment(c.Request.Context(), payment)
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"payment": payment,
		"message": "Bill payment processed successfully",
	})
}

// GetPayments returns user's bill payments
// GET /payments
func (h *BillsHandler) GetPayments(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	payments, err := h.db.GetUserPayments(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get payments"})
		return
	}
	
	totalPaid := decimal.Zero
	for _, p := range payments {
		if p.Status == models.PaymentStatusCompleted {
			totalPaid = totalPaid.Add(p.TotalAmount)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"payments":   payments,
		"count":      len(payments),
		"total_paid": totalPaid,
	})
}

// GetPayment returns a specific payment
// GET /payments/:id
func (h *BillsHandler) GetPayment(c *gin.Context) {
	paymentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payment ID"})
		return
	}
	
	payment, err := h.db.GetPayment(c.Request.Context(), paymentID)
	if err != nil || payment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}
	
	c.JSON(http.StatusOK, payment)
}

// SaveBiller saves a biller for quick payments
// POST /saved
func (h *BillsHandler) SaveBiller(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.SaveBillerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	biller, err := h.db.GetBiller(c.Request.Context(), req.BillerID)
	if err != nil || biller == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "biller not found"})
		return
	}
	
	now := time.Now()
	savedBiller := &models.SavedBiller{
		ID:            uuid.New(),
		UserID:        userID.(uuid.UUID),
		BillerID:      biller.ID,
		BillerName:    biller.Name,
		Category:      biller.Category,
		CustomerID:    req.CustomerID,
		CustomerName:  req.CustomerName,
		Nickname:      req.Nickname,
		AutoPay:       req.AutoPay,
		AutoPayAmount: req.AutoPayAmount,
		AutoPayDay:    req.AutoPayDay,
		CreatedAt:     now,
	}
	
	if err := h.db.CreateSavedBiller(c.Request.Context(), savedBiller); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save biller"})
		return
	}
	
	c.JSON(http.StatusCreated, savedBiller)
}

// GetSavedBillers returns user's saved billers
// GET /saved
func (h *BillsHandler) GetSavedBillers(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	savedBillers, err := h.db.GetUserSavedBillers(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get saved billers"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"saved_billers": savedBillers,
		"count":         len(savedBillers),
	})
}

// DeleteSavedBiller removes a saved biller
// DELETE /saved/:id
func (h *BillsHandler) DeleteSavedBiller(c *gin.Context) {
	savedBillerID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid saved biller ID"})
		return
	}
	
	if err := h.db.DeleteSavedBiller(c.Request.Context(), savedBillerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete saved biller"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Saved biller deleted"})
}

// CreateSubscription creates a subscription
// POST /subscriptions
func (h *BillsHandler) CreateSubscription(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	nextBillingDate := database.CalculateNextBillingDate(req.Frequency, req.StartDate)
	
	notifyBefore := 3
	if req.NotifyBefore > 0 {
		notifyBefore = req.NotifyBefore
	}
	
	subscription := &models.Subscription{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		Name:            req.Name,
		Category:        req.Category,
		ProviderName:    req.ProviderName,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Frequency:       req.Frequency,
		StartDate:       req.StartDate,
		NextBillingDate: nextBillingDate,
		Status:          "active",
		AutoRenew:       true,
		IsDetected:      false,
		NotifyBefore:    notifyBefore,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	
	if err := h.db.CreateSubscription(c.Request.Context(), subscription); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create subscription"})
		return
	}
	
	c.JSON(http.StatusCreated, subscription)
}

// GetSubscriptions returns user's subscriptions
// GET /subscriptions
func (h *BillsHandler) GetSubscriptions(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	subscriptions, err := h.db.GetUserSubscriptions(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get subscriptions"})
		return
	}
	
	totalMonthly := decimal.Zero
	activeCount := 0
	
	for _, s := range subscriptions {
		if s.Status == "active" {
			activeCount++
			switch s.Frequency {
			case "weekly":
				totalMonthly = totalMonthly.Add(s.Amount.Mul(decimal.NewFromFloat(4.33)))
			case "monthly":
				totalMonthly = totalMonthly.Add(s.Amount)
			case "yearly":
				totalMonthly = totalMonthly.Add(s.Amount.Div(decimal.NewFromInt(12)))
			}
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"subscriptions":  subscriptions,
		"count":          len(subscriptions),
		"active_count":   activeCount,
		"total_monthly":  totalMonthly,
	})
}

// GetSubscription returns a specific subscription
// GET /subscriptions/:id
func (h *BillsHandler) GetSubscription(c *gin.Context) {
	subscriptionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subscription ID"})
		return
	}
	
	subscription, err := h.db.GetSubscription(c.Request.Context(), subscriptionID)
	if err != nil || subscription == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subscription not found"})
		return
	}
	
	c.JSON(http.StatusOK, subscription)
}

// PauseSubscription pauses a subscription
// POST /subscriptions/:id/pause
func (h *BillsHandler) PauseSubscription(c *gin.Context) {
	subscriptionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subscription ID"})
		return
	}
	
	subscription, err := h.db.GetSubscription(c.Request.Context(), subscriptionID)
	if err != nil || subscription == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subscription not found"})
		return
	}
	
	subscription.Status = "paused"
	subscription.UpdatedAt = time.Now()
	
	if err := h.db.UpdateSubscription(c.Request.Context(), subscription); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to pause subscription"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":      "Subscription paused",
		"subscription": subscription,
	})
}

// ResumeSubscription resumes a paused subscription
// POST /subscriptions/:id/resume
func (h *BillsHandler) ResumeSubscription(c *gin.Context) {
	subscriptionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subscription ID"})
		return
	}
	
	subscription, err := h.db.GetSubscription(c.Request.Context(), subscriptionID)
	if err != nil || subscription == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subscription not found"})
		return
	}
	
	subscription.Status = "active"
	subscription.UpdatedAt = time.Now()
	
	if err := h.db.UpdateSubscription(c.Request.Context(), subscription); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resume subscription"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":      "Subscription resumed",
		"subscription": subscription,
	})
}

// CancelSubscription cancels a subscription
// POST /subscriptions/:id/cancel
func (h *BillsHandler) CancelSubscription(c *gin.Context) {
	subscriptionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subscription ID"})
		return
	}
	
	subscription, err := h.db.GetSubscription(c.Request.Context(), subscriptionID)
	if err != nil || subscription == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subscription not found"})
		return
	}
	
	subscription.Status = "cancelled"
	subscription.AutoRenew = false
	subscription.UpdatedAt = time.Now()
	
	if err := h.db.UpdateSubscription(c.Request.Context(), subscription); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel subscription"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":      "Subscription cancelled",
		"subscription": subscription,
	})
}

// SchedulePayment creates a scheduled payment
// POST /scheduled
func (h *BillsHandler) SchedulePayment(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.SchedulePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	biller, err := h.db.GetBiller(c.Request.Context(), req.BillerID)
	if err != nil || biller == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "biller not found"})
		return
	}
	
	now := time.Now()
	scheduled := &models.ScheduledPayment{
		ID:            uuid.New(),
		UserID:        userID.(uuid.UUID),
		BillerID:      biller.ID,
		BillerName:    biller.Name,
		CustomerID:    req.CustomerID,
		CustomerName:  req.CustomerName,
		Amount:        req.Amount,
		Currency:      "NGN",
		Frequency:     req.Frequency,
		ScheduledDate: req.ScheduledDate,
		NextRunDate:   req.ScheduledDate,
		Status:        "active",
		RunCount:      0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	
	if err := h.db.CreateScheduledPayment(c.Request.Context(), scheduled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create scheduled payment"})
		return
	}
	
	c.JSON(http.StatusCreated, scheduled)
}

// GetScheduledPayments returns user's scheduled payments
// GET /scheduled
func (h *BillsHandler) GetScheduledPayments(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	scheduled, err := h.db.GetUserScheduledPayments(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get scheduled payments"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"scheduled_payments": scheduled,
		"count":              len(scheduled),
	})
}

// CancelScheduledPayment cancels a scheduled payment
// DELETE /scheduled/:id
func (h *BillsHandler) CancelScheduledPayment(c *gin.Context) {
	scheduledID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scheduled payment ID"})
		return
	}
	
	if err := h.db.DeleteScheduledPayment(c.Request.Context(), scheduledID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel scheduled payment"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Scheduled payment cancelled"})
}

// GetSummary returns bills summary
// GET /summary
func (h *BillsHandler) GetSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	payments, _ := h.db.GetUserPayments(c.Request.Context(), userID.(uuid.UUID))
	subscriptions, _ := h.db.GetUserSubscriptions(c.Request.Context(), userID.(uuid.UUID))
	savedBillers, _ := h.db.GetUserSavedBillers(c.Request.Context(), userID.(uuid.UUID))
	scheduled, _ := h.db.GetUserScheduledPayments(c.Request.Context(), userID.(uuid.UUID))
	
	totalPaid := decimal.Zero
	thisMonthPaid := decimal.Zero
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	
	for _, p := range payments {
		if p.Status == models.PaymentStatusCompleted {
			totalPaid = totalPaid.Add(p.TotalAmount)
			if p.PaidAt != nil && !p.PaidAt.Before(monthStart) {
				thisMonthPaid = thisMonthPaid.Add(p.TotalAmount)
			}
		}
	}
	
	activeSubscriptions := 0
	monthlySubscriptionCost := decimal.Zero
	for _, s := range subscriptions {
		if s.Status == "active" {
			activeSubscriptions++
			switch s.Frequency {
			case "weekly":
				monthlySubscriptionCost = monthlySubscriptionCost.Add(s.Amount.Mul(decimal.NewFromFloat(4.33)))
			case "monthly":
				monthlySubscriptionCost = monthlySubscriptionCost.Add(s.Amount)
			case "yearly":
				monthlySubscriptionCost = monthlySubscriptionCost.Add(s.Amount.Div(decimal.NewFromInt(12)))
			}
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"total_paid":                totalPaid,
		"this_month_paid":           thisMonthPaid,
		"payment_count":             len(payments),
		"active_subscriptions":      activeSubscriptions,
		"monthly_subscription_cost": monthlySubscriptionCost,
		"saved_billers_count":       len(savedBillers),
		"scheduled_payments_count":  len(scheduled),
	})
}
