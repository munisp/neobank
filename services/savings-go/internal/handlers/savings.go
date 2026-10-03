package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/savings-service/internal/config"
	"github.com/neobank/savings-service/internal/database"
	"github.com/neobank/savings-service/internal/models"
	"github.com/neobank/savings-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type SavingsHandler struct {
	db        database.Store
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewSavingsHandler(db database.Store, cfg *config.Config) *SavingsHandler {
	return &SavingsHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// CreateVault creates a new savings vault
// POST /vaults
func (h *SavingsHandler) CreateVault(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateVaultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	
	// Get interest rate based on vault type
	var interestRate decimal.Decimal
	switch req.Type {
	case models.VaultTypeGoal:
		interestRate = decimal.NewFromFloat(6.0)
	case models.VaultTypeFlexible:
		interestRate = decimal.NewFromFloat(4.0)
	case models.VaultTypeFixed:
		interestRate = database.GetFixedDepositRate(req.TermDays)
	case models.VaultTypeRoundUp:
		interestRate = decimal.NewFromFloat(5.0)
	case models.VaultTypeEmergency:
		interestRate = decimal.NewFromFloat(5.5)
	case models.VaultTypeKids:
		interestRate = decimal.NewFromFloat(7.0)
	default:
		interestRate = decimal.NewFromFloat(4.0)
	}
	
	vault := &models.Vault{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		Name:            req.Name,
		Description:     req.Description,
		Type:            req.Type,
		Status:          models.VaultStatusActive,
		Currency:        req.Currency,
		Balance:         decimal.Zero,
		TargetAmount:    req.TargetAmount,
		Progress:        decimal.Zero,
		InterestRate:    interestRate,
		AccruedInterest: decimal.Zero,
		InterestPaid:    decimal.Zero,
		TermDays:        req.TermDays,
		TargetDate:      req.TargetDate,
		ImageURL:        req.ImageURL,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	
	// Set maturity date for fixed vaults
	if req.Type == models.VaultTypeFixed && req.TermDays > 0 {
		maturity := now.AddDate(0, 0, req.TermDays)
		vault.MaturityDate = &maturity
		vault.Status = models.VaultStatusLocked
		vault.EarlyWithdrawalPenalty = decimal.NewFromFloat(0.5) // 0.5% penalty
	}
	
	if err := h.db.CreateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create vault"})
		return
	}
	
	// Process initial deposit if provided
	if req.InitialDeposit.GreaterThan(decimal.Zero) {
		vault.Balance = req.InitialDeposit
		vault.UpdatedAt = now
		h.db.UpdateVault(c.Request.Context(), vault)
		
		// Create transaction record
		txn := &models.VaultTransaction{
			ID:           uuid.New(),
			VaultID:      vault.ID,
			UserID:       userID.(uuid.UUID),
			Type:         "deposit",
			Amount:       req.InitialDeposit,
			BalanceAfter: vault.Balance,
			Description:  "Initial deposit",
			CreatedAt:    now,
		}
		h.db.CreateVaultTransaction(c.Request.Context(), txn)
		
		// Update progress
		if !vault.TargetAmount.IsZero() {
			vault.Progress = vault.Balance.Div(vault.TargetAmount).Mul(decimal.NewFromInt(100))
			h.db.UpdateVault(c.Request.Context(), vault)
		}
	}
	
	// Publish savings event to Kafka for lakehouse analytics
	h.publisher.PublishSavings(c.Request.Context(), map[string]interface{}{
		"vault_id":      vault.ID.String(),
		"user_id":       vault.UserID.String(),
		"name":          vault.Name,
		"type":          string(vault.Type),
		"currency":      vault.Currency,
		"balance":       vault.Balance.String(),
		"target_amount": vault.TargetAmount.String(),
		"interest_rate": vault.InterestRate.String(),
		"status":        string(vault.Status),
		"event_type":    "vault_created",
		"created_at":    now.Format(time.RFC3339),
	})
	
	c.JSON(http.StatusCreated, vault)
}

// GetVaults returns all user's vaults
// GET /vaults
func (h *SavingsHandler) GetVaults(c *gin.Context) {
	userID, _ := c.Get("user_id")
	vaultType := models.VaultType(c.Query("type"))
	
	var vaults []*models.Vault
	var err error
	
	if vaultType != "" {
		vaults, err = h.db.GetUserVaultsByType(c.Request.Context(), userID.(uuid.UUID), vaultType)
	} else {
		vaults, err = h.db.GetUserVaults(c.Request.Context(), userID.(uuid.UUID))
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get vaults"})
		return
	}
	
	// Calculate totals
	totalBalance := decimal.Zero
	totalInterest := decimal.Zero
	for _, v := range vaults {
		totalBalance = totalBalance.Add(v.Balance)
		totalInterest = totalInterest.Add(v.AccruedInterest)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"vaults":         vaults,
		"count":          len(vaults),
		"total_balance":  totalBalance,
		"total_interest": totalInterest,
	})
}

// GetVault returns a specific vault
// GET /vaults/:id
func (h *SavingsHandler) GetVault(c *gin.Context) {
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	// Get transactions
	txns, _ := h.db.GetVaultTransactions(c.Request.Context(), vaultID)
	
	c.JSON(http.StatusOK, gin.H{
		"vault":        vault,
		"transactions": txns,
	})
}

// DepositToVault deposits money to a vault
// POST /vaults/:id/deposit
func (h *SavingsHandler) DepositToVault(c *gin.Context) {
	userID, _ := c.Get("user_id")
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	var req models.DepositToVaultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	if vault.Status == models.VaultStatusClosed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vault is closed"})
		return
	}
	
	now := time.Now()
	vault.Balance = vault.Balance.Add(req.Amount)
	vault.UpdatedAt = now
	
	// Update progress
	if !vault.TargetAmount.IsZero() {
		vault.Progress = vault.Balance.Div(vault.TargetAmount).Mul(decimal.NewFromInt(100))
		if vault.Progress.GreaterThanOrEqual(decimal.NewFromInt(100)) {
			vault.Status = models.VaultStatusCompleted
		}
	}
	
	if err := h.db.UpdateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault"})
		return
	}
	
	// Create transaction record
	txn := &models.VaultTransaction{
		ID:           uuid.New(),
		VaultID:      vault.ID,
		UserID:       userID.(uuid.UUID),
		Type:         "deposit",
		Amount:       req.Amount,
		BalanceAfter: vault.Balance,
		Description:  req.Description,
		CreatedAt:    now,
	}
	h.db.CreateVaultTransaction(c.Request.Context(), txn)
	
	c.JSON(http.StatusOK, gin.H{
		"vault":       vault,
		"transaction": txn,
	})
}

// WithdrawFromVault withdraws money from a vault
// POST /vaults/:id/withdraw
func (h *SavingsHandler) WithdrawFromVault(c *gin.Context) {
	userID, _ := c.Get("user_id")
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	var req models.WithdrawFromVaultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	if vault.Status == models.VaultStatusClosed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vault is closed"})
		return
	}
	
	// Check for locked vaults (fixed term)
	if vault.Status == models.VaultStatusLocked && vault.MaturityDate != nil {
		if time.Now().Before(*vault.MaturityDate) {
			// Apply early withdrawal penalty
			penalty := req.Amount.Mul(vault.EarlyWithdrawalPenalty.Div(decimal.NewFromInt(100)))
			req.Amount = req.Amount.Sub(penalty)
		}
	}
	
	if vault.Balance.LessThan(req.Amount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient balance"})
		return
	}
	
	now := time.Now()
	vault.Balance = vault.Balance.Sub(req.Amount)
	vault.UpdatedAt = now
	
	// Update progress
	if !vault.TargetAmount.IsZero() {
		vault.Progress = vault.Balance.Div(vault.TargetAmount).Mul(decimal.NewFromInt(100))
	}
	
	if err := h.db.UpdateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault"})
		return
	}
	
	// Create transaction record
	txn := &models.VaultTransaction{
		ID:           uuid.New(),
		VaultID:      vault.ID,
		UserID:       userID.(uuid.UUID),
		Type:         "withdrawal",
		Amount:       req.Amount,
		BalanceAfter: vault.Balance,
		Description:  req.Description,
		CreatedAt:    now,
	}
	h.db.CreateVaultTransaction(c.Request.Context(), txn)
	
	c.JSON(http.StatusOK, gin.H{
		"vault":       vault,
		"transaction": txn,
	})
}

// SetAutoSave configures auto-save for a vault
// POST /vaults/:id/auto-save
func (h *SavingsHandler) SetAutoSave(c *gin.Context) {
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	var req models.SetAutoSaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	vault.AutoSaveEnabled = req.Enabled
	vault.AutoSaveAmount = req.Amount
	vault.AutoSaveFrequency = req.Frequency
	vault.UpdatedAt = time.Now()
	
	if req.Enabled {
		nextSave := database.CalculateNextAutoSaveDate(req.Frequency)
		vault.NextAutoSave = &nextSave
	} else {
		vault.NextAutoSave = nil
	}
	
	if err := h.db.UpdateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault"})
		return
	}
	
	c.JSON(http.StatusOK, vault)
}

// SetRoundUp configures round-up for a vault
// POST /vaults/:id/round-up
func (h *SavingsHandler) SetRoundUp(c *gin.Context) {
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	var req models.SetRoundUpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	vault.RoundUpEnabled = req.Enabled
	if req.Multiplier > 0 {
		vault.RoundUpMultiplier = req.Multiplier
	} else {
		vault.RoundUpMultiplier = 1
	}
	vault.UpdatedAt = time.Now()
	
	if err := h.db.UpdateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault"})
		return
	}
	
	c.JSON(http.StatusOK, vault)
}

// CloseVault closes a vault and returns funds
// POST /vaults/:id/close
func (h *SavingsHandler) CloseVault(c *gin.Context) {
	vaultID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault ID"})
		return
	}
	
	vault, err := h.db.GetVault(c.Request.Context(), vaultID)
	if err != nil || vault == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
		return
	}
	
	if vault.Status == models.VaultStatusClosed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vault is already closed"})
		return
	}
	
	// Calculate final amount including interest
	finalAmount := vault.Balance.Add(vault.AccruedInterest)
	
	vault.Status = models.VaultStatusClosed
	vault.UpdatedAt = time.Now()
	
	if err := h.db.UpdateVault(c.Request.Context(), vault); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to close vault"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"vault":        vault,
		"final_amount": finalAmount,
		"message":      "Vault closed successfully. Funds will be transferred to your main account.",
	})
}

// CreateFixedDeposit creates a new fixed deposit
// POST /fixed-deposits
func (h *SavingsHandler) CreateFixedDeposit(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateFixedDepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if req.Amount.LessThan(decimal.NewFromFloat(h.cfg.MinFixedDeposit)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "minimum deposit amount not met"})
		return
	}
	
	now := time.Now()
	rate := database.GetFixedDepositRate(req.TermDays)
	maturityAmount := database.CalculateMaturityAmount(req.Amount, rate, req.TermDays)
	interestEarned := maturityAmount.Sub(req.Amount)
	
	deposit := &models.FixedDeposit{
		ID:                     uuid.New(),
		UserID:                 userID.(uuid.UUID),
		Currency:               req.Currency,
		Principal:              req.Amount,
		InterestRate:           rate,
		TermDays:               req.TermDays,
		MaturityAmount:         maturityAmount,
		InterestEarned:         interestEarned,
		StartDate:              now,
		MaturityDate:           now.AddDate(0, 0, req.TermDays),
		Status:                 "active",
		AutoRenew:              req.AutoRenew,
		EarlyWithdrawalAllowed: true,
		EarlyWithdrawalPenalty: decimal.NewFromFloat(1.0), // 1% penalty
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	
	if err := h.db.CreateFixedDeposit(c.Request.Context(), deposit); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create fixed deposit"})
		return
	}
	
	c.JSON(http.StatusCreated, deposit)
}

// GetFixedDeposits returns user's fixed deposits
// GET /fixed-deposits
func (h *SavingsHandler) GetFixedDeposits(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	deposits, err := h.db.GetUserFixedDeposits(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get fixed deposits"})
		return
	}
	
	// Calculate totals
	totalPrincipal := decimal.Zero
	totalInterest := decimal.Zero
	for _, d := range deposits {
		if d.Status == "active" {
			totalPrincipal = totalPrincipal.Add(d.Principal)
			totalInterest = totalInterest.Add(d.InterestEarned)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"deposits":        deposits,
		"count":           len(deposits),
		"total_principal": totalPrincipal,
		"total_interest":  totalInterest,
	})
}

// GetFixedDepositRates returns available fixed deposit rates
// GET /fixed-deposits/rates
func (h *SavingsHandler) GetFixedDepositRates(c *gin.Context) {
	rates := []gin.H{
		{"term_days": 30, "rate": 6.0, "description": "30 days"},
		{"term_days": 90, "rate": 8.0, "description": "90 days"},
		{"term_days": 180, "rate": 10.0, "description": "180 days"},
		{"term_days": 365, "rate": 12.0, "description": "1 year"},
		{"term_days": 730, "rate": 14.0, "description": "2 years"},
	}
	
	c.JSON(http.StatusOK, gin.H{
		"rates":       rates,
		"min_deposit": h.cfg.MinFixedDeposit,
	})
}

// CreateGroupSavings creates a new group savings scheme
// POST /group-savings
func (h *SavingsHandler) CreateGroupSavings(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateGroupSavingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if req.MaxMembers < h.cfg.MinGroupMembers || req.MaxMembers > h.cfg.MaxGroupMembers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid number of members"})
		return
	}
	
	now := time.Now()
	group := &models.GroupSavings{
		ID:                 uuid.New(),
		Name:               req.Name,
		Description:        req.Description,
		CreatorID:          userID.(uuid.UUID),
		Currency:           req.Currency,
		ContributionAmount: req.ContributionAmount,
		Frequency:          req.Frequency,
		TotalPool:          decimal.Zero,
		CurrentRound:       0,
		TotalRounds:        req.MaxMembers,
		MaxMembers:         req.MaxMembers,
		Status:             "forming",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	
	// Add creator as first member
	group.Members = []models.GroupMember{
		{
			UserID:           userID.(uuid.UUID),
			Name:             "Creator",
			Role:             "admin",
			JoinedAt:         now,
			TotalContributed: decimal.Zero,
			PayoutReceived:   false,
		},
	}
	
	if err := h.db.CreateGroupSavings(c.Request.Context(), group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create group savings"})
		return
	}
	
	c.JSON(http.StatusCreated, group)
}

// GetGroupSavings returns available group savings schemes
// GET /group-savings
func (h *SavingsHandler) GetGroupSavings(c *gin.Context) {
	userID, _ := c.Get("user_id")
	myGroups := c.Query("my_groups") == "true"
	
	var groups []*models.GroupSavings
	var err error
	
	if myGroups {
		groups, err = h.db.GetUserGroupSavings(c.Request.Context(), userID.(uuid.UUID))
	} else {
		groups, err = h.db.GetAllGroupSavings(c.Request.Context())
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get group savings"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"groups": groups,
		"count":  len(groups),
	})
}

// JoinGroupSavings joins a group savings scheme
// POST /group-savings/:id/join
func (h *SavingsHandler) JoinGroupSavings(c *gin.Context) {
	userID, _ := c.Get("user_id")
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group ID"})
		return
	}
	
	group, err := h.db.GetGroupSavings(c.Request.Context(), groupID)
	if err != nil || group == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	
	if group.Status != "forming" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "group is no longer accepting members"})
		return
	}
	
	if len(group.Members) >= group.MaxMembers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "group is full"})
		return
	}
	
	// Check if already a member
	for _, m := range group.Members {
		if m.UserID == userID.(uuid.UUID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "already a member"})
			return
		}
	}
	
	// Add new member
	group.Members = append(group.Members, models.GroupMember{
		UserID:           userID.(uuid.UUID),
		Name:             "Member",
		Role:             "member",
		JoinedAt:         time.Now(),
		TotalContributed: decimal.Zero,
		PayoutReceived:   false,
	})
	
	// Start group if full
	if len(group.Members) == group.MaxMembers {
		group.Status = "active"
		now := time.Now()
		group.StartDate = &now
		group.CurrentRound = 1
	}
	
	group.UpdatedAt = time.Now()
	
	if err := h.db.UpdateGroupSavings(c.Request.Context(), group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to join group"})
		return
	}
	
	c.JSON(http.StatusOK, group)
}

// ContributeToGroup makes a contribution to group savings
// POST /group-savings/:id/contribute
func (h *SavingsHandler) ContributeToGroup(c *gin.Context) {
	userID, _ := c.Get("user_id")
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group ID"})
		return
	}
	
	group, err := h.db.GetGroupSavings(c.Request.Context(), groupID)
	if err != nil || group == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	
	if group.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "group is not active"})
		return
	}
	
	// Find member and update contribution
	memberFound := false
	for i, m := range group.Members {
		if m.UserID == userID.(uuid.UUID) {
			group.Members[i].TotalContributed = m.TotalContributed.Add(group.ContributionAmount)
			memberFound = true
			break
		}
	}
	
	if !memberFound {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a member of this group"})
		return
	}
	
	group.TotalPool = group.TotalPool.Add(group.ContributionAmount)
	group.UpdatedAt = time.Now()
	
	if err := h.db.UpdateGroupSavings(c.Request.Context(), group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record contribution"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"group":   group,
		"message": "Contribution recorded successfully",
	})
}

// RequestSalaryAdvance requests a salary advance
// POST /salary-advance
func (h *SavingsHandler) RequestSalaryAdvance(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.RequestSalaryAdvanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if req.Amount.GreaterThan(decimal.NewFromFloat(h.cfg.MaxSalaryAdvance)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount exceeds maximum allowed"})
		return
	}
	
	// Check for existing active advance
	existing, _ := h.db.GetUserActiveSalaryAdvance(c.Request.Context(), userID.(uuid.UUID))
	if existing != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you already have an active salary advance"})
		return
	}
	
	now := time.Now()
	daysUntilPayday := 14 // Default assumption
	fee := database.CalculateSalaryAdvanceFee(req.Amount, daysUntilPayday)
	netAmount := req.Amount.Sub(fee)
	repaymentDate := now.AddDate(0, 0, daysUntilPayday)
	
	advance := &models.SalaryAdvance{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		Amount:          req.Amount,
		Fee:             fee,
		NetAmount:       netAmount,
		RepaymentDate:   repaymentDate,
		RepaymentAmount: req.Amount,
		Status:          "pending",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	
	if err := h.db.CreateSalaryAdvance(c.Request.Context(), advance); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create salary advance"})
		return
	}
	
	c.JSON(http.StatusCreated, advance)
}

// GetSalaryAdvances returns user's salary advances
// GET /salary-advance
func (h *SavingsHandler) GetSalaryAdvances(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	advances, err := h.db.GetUserSalaryAdvances(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get salary advances"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"advances": advances,
		"count":    len(advances),
	})
}

// GetInterestRates returns current interest rates
// GET /interest-rates
func (h *SavingsHandler) GetInterestRates(c *gin.Context) {
	tiers := h.db.GetInterestTiers()
	
	c.JSON(http.StatusOK, gin.H{
		"flexible_savings_tiers": tiers,
		"vault_rates": gin.H{
			"goal":      6.0,
			"flexible":  4.0,
			"round_up":  5.0,
			"emergency": 5.5,
			"kids":      7.0,
		},
		"fixed_deposit_rates": gin.H{
			"30_days":  6.0,
			"90_days":  8.0,
			"180_days": 10.0,
			"365_days": 12.0,
			"730_days": 14.0,
		},
	})
}

// GetSavingsSummary returns a summary of all savings
// GET /summary
func (h *SavingsHandler) GetSavingsSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	// Get all vaults
	vaults, _ := h.db.GetUserVaults(c.Request.Context(), userID.(uuid.UUID))
	vaultBalance := decimal.Zero
	vaultInterest := decimal.Zero
	for _, v := range vaults {
		vaultBalance = vaultBalance.Add(v.Balance)
		vaultInterest = vaultInterest.Add(v.AccruedInterest)
	}
	
	// Get fixed deposits
	deposits, _ := h.db.GetUserFixedDeposits(c.Request.Context(), userID.(uuid.UUID))
	depositBalance := decimal.Zero
	depositInterest := decimal.Zero
	for _, d := range deposits {
		if d.Status == "active" {
			depositBalance = depositBalance.Add(d.Principal)
			depositInterest = depositInterest.Add(d.InterestEarned)
		}
	}
	
	// Get group savings
	groups, _ := h.db.GetUserGroupSavings(c.Request.Context(), userID.(uuid.UUID))
	groupContributions := decimal.Zero
	for _, g := range groups {
		for _, m := range g.Members {
			if m.UserID == userID.(uuid.UUID) {
				groupContributions = groupContributions.Add(m.TotalContributed)
				break
			}
		}
	}
	
	totalSavings := vaultBalance.Add(depositBalance).Add(groupContributions)
	totalInterest := vaultInterest.Add(depositInterest)
	
	c.JSON(http.StatusOK, gin.H{
		"total_savings":      totalSavings,
		"total_interest":     totalInterest,
		"vaults":             gin.H{"balance": vaultBalance, "interest": vaultInterest, "count": len(vaults)},
		"fixed_deposits":     gin.H{"balance": depositBalance, "interest": depositInterest, "count": len(deposits)},
		"group_savings":      gin.H{"contributions": groupContributions, "count": len(groups)},
	})
}
