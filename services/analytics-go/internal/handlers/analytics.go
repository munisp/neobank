package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/analytics-service/internal/config"
	"github.com/neobank/analytics-service/internal/database"
	"github.com/neobank/analytics-service/internal/models"
	"github.com/neobank/analytics-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type AnalyticsHandler struct {
	db        database.Store
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewAnalyticsHandler(db database.Store, cfg *config.Config) *AnalyticsHandler {
	return &AnalyticsHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// RecordTransaction records a transaction for analytics
// POST /transactions
func (h *AnalyticsHandler) RecordTransaction(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.RecordTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	tx := &models.Transaction{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		AccountID:       req.AccountID,
		Type:            req.Type,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Category:        req.Category,
		MerchantName:    req.MerchantName,
		Description:     req.Description,
		TransactionDate: now,
		CreatedAt:       now,
	}
	
	if err := h.db.CreateTransaction(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record transaction"})
		return
	}
	
	// Publish transaction event to Kafka for lakehouse analytics
	h.publisher.PublishTransaction(c.Request.Context(), map[string]interface{}{
		"transaction_id": tx.ID.String(),
		"user_id":        tx.UserID.String(),
		"account_id":     tx.AccountID.String(),
		"type":           tx.Type,
		"amount":         tx.Amount.String(),
		"currency":       tx.Currency,
		"category":       tx.Category,
		"merchant_name":  tx.MerchantName,
		"event_type":     "transaction_recorded",
		"created_at":     now.Format(time.RFC3339),
	})
	
	// Update budget if exists
	if req.Type == "debit" {
		budget, _ := h.db.GetUserBudgetByCategory(c.Request.Context(), userID.(uuid.UUID), req.Category)
		if budget != nil {
			budget.Spent = budget.Spent.Add(req.Amount)
			budget.Remaining = budget.Amount.Sub(budget.Spent)
			budget.UpdatedAt = now
			h.db.UpdateBudget(c.Request.Context(), budget)
			
			// Check for alerts
			percentUsed := budget.Spent.Div(budget.Amount).Mul(decimal.NewFromInt(100))
			if percentUsed.GreaterThanOrEqual(budget.AlertThreshold) && percentUsed.LessThan(decimal.NewFromInt(100)) {
				alert := &models.BudgetAlert{
					ID:          uuid.New(),
					BudgetID:    budget.ID,
					UserID:      userID.(uuid.UUID),
					Type:        "threshold_reached",
					Message:     "You've used " + percentUsed.Round(0).String() + "% of your " + budget.Name + " budget",
					PercentUsed: percentUsed,
					IsRead:      false,
					CreatedAt:   now,
				}
				h.db.CreateAlert(c.Request.Context(), alert)
			} else if percentUsed.GreaterThanOrEqual(decimal.NewFromInt(100)) {
				alert := &models.BudgetAlert{
					ID:          uuid.New(),
					BudgetID:    budget.ID,
					UserID:      userID.(uuid.UUID),
					Type:        "exceeded",
					Message:     "You've exceeded your " + budget.Name + " budget",
					PercentUsed: percentUsed,
					IsRead:      false,
					CreatedAt:   now,
				}
				h.db.CreateAlert(c.Request.Context(), alert)
			}
		}
	}
	
	c.JSON(http.StatusCreated, tx)
}

// GetSpendingAnalytics returns spending analytics
// GET /spending
func (h *AnalyticsHandler) GetSpendingAnalytics(c *gin.Context) {
	userID, _ := c.Get("user_id")
	period := c.DefaultQuery("period", "monthly")
	
	startDate, endDate := database.GetPeriodDates(period)
	
	transactions, err := h.db.GetUserTransactions(c.Request.Context(), userID.(uuid.UUID), startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get transactions"})
		return
	}
	
	// Calculate totals
	totalSpending := decimal.Zero
	totalIncome := decimal.Zero
	
	for _, tx := range transactions {
		if tx.Type == "debit" {
			totalSpending = totalSpending.Add(tx.Amount)
		} else {
			totalIncome = totalIncome.Add(tx.Amount)
		}
	}
	
	analytics := models.SpendingAnalytics{
		UserID:             userID.(uuid.UUID),
		Period:             period,
		StartDate:          startDate,
		EndDate:            endDate,
		TotalSpending:      totalSpending,
		TotalIncome:        totalIncome,
		NetCashFlow:        totalIncome.Sub(totalSpending),
		SpendingByCategory: database.CalculateSpendingByCategory(transactions),
		TopMerchants:       database.CalculateTopMerchants(transactions, 10),
		DailySpending:      database.CalculateDailySpending(transactions, startDate, endDate),
	}
	
	// Calculate previous period comparison
	var prevStartDate, prevEndDate time.Time
	switch period {
	case "daily":
		prevStartDate = startDate.AddDate(0, 0, -1)
		prevEndDate = endDate.AddDate(0, 0, -1)
	case "weekly":
		prevStartDate = startDate.AddDate(0, 0, -7)
		prevEndDate = endDate.AddDate(0, 0, -7)
	case "monthly":
		prevStartDate = startDate.AddDate(0, -1, 0)
		prevEndDate = endDate.AddDate(0, -1, 0)
	case "yearly":
		prevStartDate = startDate.AddDate(-1, 0, 0)
		prevEndDate = endDate.AddDate(-1, 0, 0)
	}
	
	prevTransactions, _ := h.db.GetUserTransactions(c.Request.Context(), userID.(uuid.UUID), prevStartDate, prevEndDate)
	prevSpending := decimal.Zero
	for _, tx := range prevTransactions {
		if tx.Type == "debit" {
			prevSpending = prevSpending.Add(tx.Amount)
		}
	}
	
	if !prevSpending.IsZero() {
		percentChange := totalSpending.Sub(prevSpending).Div(prevSpending).Mul(decimal.NewFromInt(100))
		direction := "same"
		if percentChange.GreaterThan(decimal.Zero) {
			direction = "up"
		} else if percentChange.LessThan(decimal.Zero) {
			direction = "down"
		}
		
		analytics.PreviousPeriod = &models.PeriodComparison{
			TotalSpending: prevSpending,
			PercentChange: percentChange.Abs(),
			Direction:     direction,
		}
	}
	
	c.JSON(http.StatusOK, analytics)
}

// GetCategorySpending returns spending for a specific category
// GET /spending/category/:category
func (h *AnalyticsHandler) GetCategorySpending(c *gin.Context) {
	userID, _ := c.Get("user_id")
	category := models.TransactionCategory(c.Param("category"))
	period := c.DefaultQuery("period", "monthly")
	
	startDate, endDate := database.GetPeriodDates(period)
	
	transactions, err := h.db.GetUserTransactionsByCategory(c.Request.Context(), userID.(uuid.UUID), category, startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get transactions"})
		return
	}
	
	totalSpending := decimal.Zero
	for _, tx := range transactions {
		if tx.Type == "debit" {
			totalSpending = totalSpending.Add(tx.Amount)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"category":       category,
		"period":         period,
		"total_spending": totalSpending,
		"transactions":   transactions,
		"count":          len(transactions),
	})
}

// CreateBudget creates a new budget
// POST /budgets
func (h *AnalyticsHandler) CreateBudget(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateBudgetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Check if budget already exists for category
	existing, _ := h.db.GetUserBudgetByCategory(c.Request.Context(), userID.(uuid.UUID), req.Category)
	if existing != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "budget already exists for this category"})
		return
	}
	
	now := time.Now()
	startDate, endDate := database.GetPeriodDates(req.Period)
	
	alertThreshold := decimal.NewFromInt(80)
	if !req.AlertThreshold.IsZero() {
		alertThreshold = req.AlertThreshold
	}
	
	budget := &models.Budget{
		ID:             uuid.New(),
		UserID:         userID.(uuid.UUID),
		Name:           req.Name,
		Category:       req.Category,
		Amount:         req.Amount,
		Spent:          decimal.Zero,
		Remaining:      req.Amount,
		Period:         req.Period,
		StartDate:      startDate,
		EndDate:        endDate,
		AlertThreshold: alertThreshold,
		IsActive:       true,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	
	if err := h.db.CreateBudget(c.Request.Context(), budget); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create budget"})
		return
	}
	
	c.JSON(http.StatusCreated, budget)
}

// GetBudgets returns user's budgets
// GET /budgets
func (h *AnalyticsHandler) GetBudgets(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	budgets, err := h.db.GetUserBudgets(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get budgets"})
		return
	}
	
	totalBudget := decimal.Zero
	totalSpent := decimal.Zero
	
	for _, b := range budgets {
		totalBudget = totalBudget.Add(b.Amount)
		totalSpent = totalSpent.Add(b.Spent)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"budgets":      budgets,
		"count":        len(budgets),
		"total_budget": totalBudget,
		"total_spent":  totalSpent,
	})
}

// GetBudget returns a specific budget
// GET /budgets/:id
func (h *AnalyticsHandler) GetBudget(c *gin.Context) {
	budgetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget ID"})
		return
	}
	
	budget, err := h.db.GetBudget(c.Request.Context(), budgetID)
	if err != nil || budget == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
		return
	}
	
	c.JSON(http.StatusOK, budget)
}

// UpdateBudget updates a budget
// PUT /budgets/:id
func (h *AnalyticsHandler) UpdateBudget(c *gin.Context) {
	budgetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget ID"})
		return
	}
	
	var req models.UpdateBudgetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	budget, err := h.db.GetBudget(c.Request.Context(), budgetID)
	if err != nil || budget == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
		return
	}
	
	if req.Name != "" {
		budget.Name = req.Name
	}
	if !req.Amount.IsZero() {
		budget.Amount = req.Amount
		budget.Remaining = req.Amount.Sub(budget.Spent)
	}
	if !req.AlertThreshold.IsZero() {
		budget.AlertThreshold = req.AlertThreshold
	}
	
	budget.UpdatedAt = time.Now()
	
	if err := h.db.UpdateBudget(c.Request.Context(), budget); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update budget"})
		return
	}
	
	c.JSON(http.StatusOK, budget)
}

// DeleteBudget deletes a budget
// DELETE /budgets/:id
func (h *AnalyticsHandler) DeleteBudget(c *gin.Context) {
	budgetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget ID"})
		return
	}
	
	if err := h.db.DeleteBudget(c.Request.Context(), budgetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete budget"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Budget deleted"})
}

// GetAlerts returns budget alerts
// GET /alerts
func (h *AnalyticsHandler) GetAlerts(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	alerts, err := h.db.GetUserAlerts(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get alerts"})
		return
	}
	
	unreadCount := 0
	for _, a := range alerts {
		if !a.IsRead {
			unreadCount++
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"alerts":       alerts,
		"count":        len(alerts),
		"unread_count": unreadCount,
	})
}

// MarkAlertRead marks an alert as read
// POST /alerts/:id/read
func (h *AnalyticsHandler) MarkAlertRead(c *gin.Context) {
	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert ID"})
		return
	}
	
	if err := h.db.MarkAlertRead(c.Request.Context(), alertID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark alert as read"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Alert marked as read"})
}

// GetInsights returns financial insights
// GET /insights
func (h *AnalyticsHandler) GetInsights(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	insights, err := h.db.GetUserInsights(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get insights"})
		return
	}
	
	// Generate new insights based on spending patterns
	startDate, endDate := database.GetPeriodDates("monthly")
	transactions, _ := h.db.GetUserTransactions(c.Request.Context(), userID.(uuid.UUID), startDate, endDate)
	
	if len(transactions) > 0 {
		spendingByCategory := database.CalculateSpendingByCategory(transactions)
		
		// Find highest spending category
		var highestCategory models.TransactionCategory
		highestAmount := decimal.Zero
		for cat, amount := range spendingByCategory {
			if amount.GreaterThan(highestAmount) {
				highestAmount = amount
				highestCategory = cat
			}
		}
		
		if !highestAmount.IsZero() {
			insight := &models.Insight{
				ID:          uuid.New(),
				UserID:      userID.(uuid.UUID),
				Type:        "spending_spike",
				Title:       "High spending in " + string(highestCategory),
				Description: "You've spent " + highestAmount.Round(2).String() + " on " + string(highestCategory) + " this month",
				Category:    highestCategory,
				Amount:      highestAmount,
				ActionType:  "create_budget",
				IsRead:      false,
				CreatedAt:   time.Now(),
			}
			insights = append(insights, insight)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"insights": insights,
		"count":    len(insights),
	})
}

// MarkInsightRead marks an insight as read
// POST /insights/:id/read
func (h *AnalyticsHandler) MarkInsightRead(c *gin.Context) {
	insightID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid insight ID"})
		return
	}
	
	if err := h.db.MarkInsightRead(c.Request.Context(), insightID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark insight as read"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Insight marked as read"})
}

// GetRecurringTransactions returns detected recurring transactions
// GET /recurring
func (h *AnalyticsHandler) GetRecurringTransactions(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	recurring, err := h.db.GetUserRecurringTransactions(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get recurring transactions"})
		return
	}
	
	totalMonthly := decimal.Zero
	for _, r := range recurring {
		if r.Status == "active" {
			switch r.Frequency {
			case "weekly":
				totalMonthly = totalMonthly.Add(r.Amount.Mul(decimal.NewFromFloat(4.33)))
			case "monthly":
				totalMonthly = totalMonthly.Add(r.Amount)
			case "yearly":
				totalMonthly = totalMonthly.Add(r.Amount.Div(decimal.NewFromInt(12)))
			}
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"recurring":     recurring,
		"count":         len(recurring),
		"total_monthly": totalMonthly,
	})
}

// GetSummary returns overall financial summary
// GET /summary
func (h *AnalyticsHandler) GetSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	// Get monthly data
	startDate, endDate := database.GetPeriodDates("monthly")
	transactions, _ := h.db.GetUserTransactions(c.Request.Context(), userID.(uuid.UUID), startDate, endDate)
	budgets, _ := h.db.GetUserBudgets(c.Request.Context(), userID.(uuid.UUID))
	alerts, _ := h.db.GetUserAlerts(c.Request.Context(), userID.(uuid.UUID))
	recurring, _ := h.db.GetUserRecurringTransactions(c.Request.Context(), userID.(uuid.UUID))
	
	totalSpending := decimal.Zero
	totalIncome := decimal.Zero
	for _, tx := range transactions {
		if tx.Type == "debit" {
			totalSpending = totalSpending.Add(tx.Amount)
		} else {
			totalIncome = totalIncome.Add(tx.Amount)
		}
	}
	
	totalBudget := decimal.Zero
	totalBudgetSpent := decimal.Zero
	for _, b := range budgets {
		totalBudget = totalBudget.Add(b.Amount)
		totalBudgetSpent = totalBudgetSpent.Add(b.Spent)
	}
	
	unreadAlerts := 0
	for _, a := range alerts {
		if !a.IsRead {
			unreadAlerts++
		}
	}
	
	activeSubscriptions := 0
	monthlySubscriptionCost := decimal.Zero
	for _, r := range recurring {
		if r.Status == "active" && r.IsSubscription {
			activeSubscriptions++
			if r.Frequency == "monthly" {
				monthlySubscriptionCost = monthlySubscriptionCost.Add(r.Amount)
			}
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"period":                   "monthly",
		"total_spending":           totalSpending,
		"total_income":             totalIncome,
		"net_cash_flow":            totalIncome.Sub(totalSpending),
		"total_budget":             totalBudget,
		"total_budget_spent":       totalBudgetSpent,
		"budget_remaining":         totalBudget.Sub(totalBudgetSpent),
		"active_budgets":           len(budgets),
		"unread_alerts":            unreadAlerts,
		"active_subscriptions":     activeSubscriptions,
		"monthly_subscription_cost": monthlySubscriptionCost,
		"transaction_count":        len(transactions),
	})
}
