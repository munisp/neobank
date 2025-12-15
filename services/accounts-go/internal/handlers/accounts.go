package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/accounts-service/internal/config"
	"github.com/neobank/accounts-service/internal/database"
	"github.com/neobank/accounts-service/internal/models"
	"github.com/neobank/accounts-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type AccountsHandler struct {
	db        *database.InMemoryDB
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewAccountsHandler(db *database.InMemoryDB, cfg *config.Config) *AccountsHandler {
	return &AccountsHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// GetAccounts returns user's accounts
// GET /accounts
func (h *AccountsHandler) GetAccounts(c *gin.Context) {
	userID, _ := c.Get("user_id")
	accountType := models.AccountType(c.Query("type"))
	
	var accounts []*models.Account
	var err error
	
	if accountType != "" {
		accounts, err = h.db.GetUserAccountsByType(c.Request.Context(), userID.(uuid.UUID), accountType)
	} else {
		accounts, err = h.db.GetUserAccounts(c.Request.Context(), userID.(uuid.UUID))
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get accounts"})
		return
	}
	
	totalBalance := decimal.Zero
	for _, a := range accounts {
		totalBalance = totalBalance.Add(a.Balance)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"accounts":      accounts,
		"count":         len(accounts),
		"total_balance": totalBalance,
	})
}

// GetAccount returns a specific account
// GET /accounts/:id
func (h *AccountsHandler) GetAccount(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	c.JSON(http.StatusOK, account)
}

// CreateJointAccount creates a new joint account
// POST /accounts/joint
func (h *AccountsHandler) CreateJointAccount(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateJointAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	account := &models.Account{
		ID:               uuid.New(),
		UserID:           userID.(uuid.UUID),
		Type:             models.AccountTypeJoint,
		Status:           models.AccountStatusPending,
		AccountNumber:    database.GenerateAccountNumber(),
		Currency:         req.Currency,
		Balance:          decimal.Zero,
		AvailableBalance: decimal.Zero,
		Name:             req.Name,
		JointDetails: &models.JointAccountDetails{
			Owners: []models.JointOwner{
				{
					UserID:      userID.(uuid.UUID),
					Name:        "Primary Owner",
					Role:        "primary",
					Status:      "accepted",
					JoinedAt:    &now,
					Permissions: []string{"view", "transfer", "manage"},
				},
			},
			RequireAllApproval: req.RequireAllApproval,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	if err := h.db.CreateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create account"})
		return
	}
	
	// Publish account event to Kafka for lakehouse analytics
	h.publisher.PublishAccount(c.Request.Context(), map[string]interface{}{
		"account_id":     account.ID.String(),
		"user_id":        account.UserID.String(),
		"type":           string(account.Type),
		"status":         string(account.Status),
		"account_number": account.AccountNumber,
		"currency":       account.Currency,
		"balance":        account.Balance.String(),
		"name":           account.Name,
		"event_type":     "account_created",
		"created_at":     now.Format(time.RFC3339),
	})
	
	// Create invitation for the other person
	invitation := &models.AccountInvitation{
		ID:           uuid.New(),
		AccountID:    account.ID,
		InviterID:    userID.(uuid.UUID),
		InviterName:  "Primary Owner",
		InviteeEmail: req.InviteeEmail,
		InviteeName:  req.InviteeName,
		Status:       "pending",
		ExpiresAt:    now.AddDate(0, 0, 7),
		CreatedAt:    now,
	}
	
	if err := h.db.CreateInvitation(c.Request.Context(), invitation); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create invitation"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"account":    account,
		"invitation": invitation,
	})
}

// InviteToJointAccount invites someone to a joint account
// POST /accounts/:id/invite
func (h *AccountsHandler) InviteToJointAccount(c *gin.Context) {
	userID, _ := c.Get("user_id")
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	var req models.InviteToJointAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.Type != models.AccountTypeJoint {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a joint account"})
		return
	}
	
	now := time.Now()
	invitation := &models.AccountInvitation{
		ID:           uuid.New(),
		AccountID:    accountID,
		InviterID:    userID.(uuid.UUID),
		InviterName:  "Account Owner",
		InviteeEmail: req.Email,
		InviteeName:  req.Name,
		Status:       "pending",
		ExpiresAt:    now.AddDate(0, 0, 7),
		CreatedAt:    now,
	}
	
	if err := h.db.CreateInvitation(c.Request.Context(), invitation); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create invitation"})
		return
	}
	
	c.JSON(http.StatusCreated, invitation)
}

// GetInvitations returns pending invitations for user
// GET /invitations
func (h *AccountsHandler) GetInvitations(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email required"})
		return
	}
	
	invitations, err := h.db.GetInvitationsByEmail(c.Request.Context(), email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get invitations"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"invitations": invitations,
		"count":       len(invitations),
	})
}

// RespondToInvitation accepts or declines an invitation
// POST /invitations/:id/respond
func (h *AccountsHandler) RespondToInvitation(c *gin.Context) {
	userID, _ := c.Get("user_id")
	invitationID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invitation ID"})
		return
	}
	
	var req models.RespondToInvitationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	invitation, err := h.db.GetInvitation(c.Request.Context(), invitationID)
	if err != nil || invitation == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found"})
		return
	}
	
	if invitation.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invitation already responded to"})
		return
	}
	
	now := time.Now()
	if req.Accept {
		invitation.Status = "accepted"
		
		// Add user to joint account
		account, _ := h.db.GetAccount(c.Request.Context(), invitation.AccountID)
		if account != nil && account.JointDetails != nil {
			account.JointDetails.Owners = append(account.JointDetails.Owners, models.JointOwner{
				UserID:      userID.(uuid.UUID),
				Name:        invitation.InviteeName,
				Email:       invitation.InviteeEmail,
				Role:        "secondary",
				Status:      "accepted",
				JoinedAt:    &now,
				Permissions: []string{"view", "transfer"},
			})
			account.Status = models.AccountStatusActive
			account.UpdatedAt = now
			h.db.UpdateAccount(c.Request.Context(), account)
		}
	} else {
		invitation.Status = "declined"
	}
	
	h.db.UpdateInvitation(c.Request.Context(), invitation)
	
	c.JSON(http.StatusOK, gin.H{
		"invitation": invitation,
		"message":    "Invitation " + invitation.Status,
	})
}

// CreateKidsAccount creates a new kids account
// POST /accounts/kids
func (h *AccountsHandler) CreateKidsAccount(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateKidsAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Validate child age
	age := database.CalculateAge(req.ChildDOB)
	if age < h.cfg.MinChildAge || age > h.cfg.MaxChildAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "child must be between 6 and 17 years old"})
		return
	}
	
	now := time.Now()
	dailyLimit, weeklyLimit, monthlyLimit := database.GetDefaultKidsLimits()
	
	if !req.DailyLimit.IsZero() {
		dailyLimit = req.DailyLimit
	}
	if !req.WeeklyLimit.IsZero() {
		weeklyLimit = req.WeeklyLimit
	}
	if !req.MonthlyLimit.IsZero() {
		monthlyLimit = req.MonthlyLimit
	}
	
	account := &models.Account{
		ID:               uuid.New(),
		UserID:           uuid.New(), // Child's user ID (would be created separately)
		Type:             models.AccountTypeKids,
		Status:           models.AccountStatusActive,
		AccountNumber:    database.GenerateAccountNumber(),
		Currency:         req.Currency,
		Balance:          req.InitialDeposit,
		AvailableBalance: req.InitialDeposit,
		Name:             req.ChildName + "'s Account",
		KidsDetails: &models.KidsAccountDetails{
			ChildName:         req.ChildName,
			ChildDOB:          req.ChildDOB,
			ParentID:          userID.(uuid.UUID),
			ParentName:        "Parent",
			SpendingLimit:     monthlyLimit,
			DailyLimit:        dailyLimit,
			WeeklyLimit:       weeklyLimit,
			MonthlyLimit:      monthlyLimit,
			AllowedCategories: []string{"food", "entertainment", "education", "transport"},
			BlockedCategories: []string{"gambling", "alcohol", "tobacco"},
			BlockedMerchants:  []string{},
			NotifyOnSpend:     true,
			NotifyThreshold:   decimal.NewFromFloat(1000),
			Tasks:             []models.KidsTask{},
			TotalEarned:       decimal.Zero,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	if err := h.db.CreateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create account"})
		return
	}
	
	c.JSON(http.StatusCreated, account)
}

// GetKidsAccounts returns parent's kids accounts
// GET /accounts/kids
func (h *AccountsHandler) GetKidsAccounts(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	accounts, err := h.db.GetKidsAccountsByParent(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get kids accounts"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"accounts": accounts,
		"count":    len(accounts),
	})
}

// SetSpendingLimit sets spending limits for a kids account
// POST /accounts/:id/limits
func (h *AccountsHandler) SetSpendingLimit(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	var req models.SetSpendingLimitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	switch req.Type {
	case "daily":
		account.KidsDetails.DailyLimit = req.Limit
	case "weekly":
		account.KidsDetails.WeeklyLimit = req.Limit
	case "monthly":
		account.KidsDetails.MonthlyLimit = req.Limit
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit type"})
		return
	}
	
	account.UpdatedAt = time.Now()
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update account"})
		return
	}
	
	c.JSON(http.StatusOK, account)
}

// SetCategoryRestrictions sets category restrictions for a kids account
// POST /accounts/:id/restrictions
func (h *AccountsHandler) SetCategoryRestrictions(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	var req models.SetCategoryRestrictionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	if req.AllowedCategories != nil {
		account.KidsDetails.AllowedCategories = req.AllowedCategories
	}
	if req.BlockedCategories != nil {
		account.KidsDetails.BlockedCategories = req.BlockedCategories
	}
	if req.BlockedMerchants != nil {
		account.KidsDetails.BlockedMerchants = req.BlockedMerchants
	}
	
	account.UpdatedAt = time.Now()
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update account"})
		return
	}
	
	c.JSON(http.StatusOK, account)
}

// CreateTask creates a task for a kids account
// POST /accounts/:id/tasks
func (h *AccountsHandler) CreateTask(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	var req models.CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	now := time.Now()
	task := models.KidsTask{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		Reward:      req.Reward,
		DueDate:     req.DueDate,
		Status:      "pending",
		CreatedAt:   now,
	}
	
	account.KidsDetails.Tasks = append(account.KidsDetails.Tasks, task)
	account.UpdatedAt = now
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"task":    task,
		"account": account,
	})
}

// CompleteTask marks a task as completed (by child)
// POST /accounts/:id/tasks/:taskId/complete
func (h *AccountsHandler) CompleteTask(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	taskID, err := uuid.Parse(c.Param("taskId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task ID"})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	now := time.Now()
	taskFound := false
	for i, t := range account.KidsDetails.Tasks {
		if t.ID == taskID {
			if t.Status != "pending" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "task is not pending"})
				return
			}
			account.KidsDetails.Tasks[i].Status = "completed"
			account.KidsDetails.Tasks[i].CompletedAt = &now
			taskFound = true
			break
		}
	}
	
	if !taskFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	
	account.UpdatedAt = now
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update task"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Task marked as completed, awaiting parent approval",
		"account": account,
	})
}

// ApproveTask approves or rejects a completed task (by parent)
// POST /accounts/:id/tasks/:taskId/approve
func (h *AccountsHandler) ApproveTask(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	taskID, err := uuid.Parse(c.Param("taskId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task ID"})
		return
	}
	
	var req models.ApproveTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	now := time.Now()
	var reward decimal.Decimal
	taskFound := false
	
	for i, t := range account.KidsDetails.Tasks {
		if t.ID == taskID {
			if t.Status != "completed" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "task is not completed"})
				return
			}
			
			if req.Approved {
				account.KidsDetails.Tasks[i].Status = "approved"
				account.KidsDetails.Tasks[i].ApprovedAt = &now
				reward = t.Reward
				
				// Add reward to balance
				account.Balance = account.Balance.Add(reward)
				account.AvailableBalance = account.AvailableBalance.Add(reward)
				account.KidsDetails.TotalEarned = account.KidsDetails.TotalEarned.Add(reward)
			} else {
				account.KidsDetails.Tasks[i].Status = "rejected"
			}
			taskFound = true
			break
		}
	}
	
	if !taskFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	
	account.UpdatedAt = now
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update task"})
		return
	}
	
	message := "Task rejected"
	if req.Approved {
		message = "Task approved, reward added to balance"
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": message,
		"reward":  reward,
		"account": account,
	})
}

// TransferToKids transfers money to a kids account
// POST /accounts/:id/transfer
func (h *AccountsHandler) TransferToKids(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	var req models.TransferToKidsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	if account.KidsDetails == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a kids account"})
		return
	}
	
	account.Balance = account.Balance.Add(req.Amount)
	account.AvailableBalance = account.AvailableBalance.Add(req.Amount)
	account.UpdatedAt = time.Now()
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to transfer"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":     "Transfer successful",
		"amount":      req.Amount,
		"new_balance": account.Balance,
		"account":     account,
	})
}

// FreezeAccount freezes an account
// POST /accounts/:id/freeze
func (h *AccountsHandler) FreezeAccount(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	account.Status = models.AccountStatusFrozen
	account.UpdatedAt = time.Now()
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to freeze account"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Account frozen",
		"account": account,
	})
}

// UnfreezeAccount unfreezes an account
// POST /accounts/:id/unfreeze
func (h *AccountsHandler) UnfreezeAccount(c *gin.Context) {
	accountID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}
	
	account, err := h.db.GetAccount(c.Request.Context(), accountID)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	
	account.Status = models.AccountStatusActive
	account.UpdatedAt = time.Now()
	
	if err := h.db.UpdateAccount(c.Request.Context(), account); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unfreeze account"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Account unfrozen",
		"account": account,
	})
}
