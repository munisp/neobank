package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/rewards-service/internal/config"
	"github.com/neobank/rewards-service/internal/database"
	"github.com/neobank/rewards-service/internal/models"
	"github.com/shopspring/decimal"
)

type RewardsHandler struct {
	db  *database.InMemoryDB
	cfg *config.Config
}

func NewRewardsHandler(db *database.InMemoryDB, cfg *config.Config) *RewardsHandler {
	return &RewardsHandler{db: db, cfg: cfg}
}

// GetPrograms returns available reward programs
// GET /programs
func (h *RewardsHandler) GetPrograms(c *gin.Context) {
	programs, err := h.db.GetPrograms(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get programs"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"programs": programs,
		"count":    len(programs),
	})
}

// GetUserRewards returns user's rewards summary
// GET /summary
func (h *RewardsHandler) GetUserRewards(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	userRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if userRewards == nil {
		// Create new user rewards
		now := time.Now()
		userRewards = &models.UserRewards{
			ID:                uuid.New(),
			UserID:            userID.(uuid.UUID),
			TotalPoints:       decimal.Zero,
			AvailablePoints:   decimal.Zero,
			PendingPoints:     decimal.Zero,
			RedeemedPoints:    decimal.Zero,
			ExpiredPoints:     decimal.Zero,
			TotalCashback:     decimal.Zero,
			AvailableCashback: decimal.Zero,
			PendingCashback:   decimal.Zero,
			RedeemedCashback:  decimal.Zero,
			Tier:              "standard",
			TierPoints:        decimal.Zero,
			NextTierPoints:    decimal.NewFromInt(25000),
			ReferralCode:      database.GenerateReferralCode(),
			TotalReferrals:    0,
			ReferralEarnings:  decimal.Zero,
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		h.db.CreateUserRewards(c.Request.Context(), userRewards)
	}
	
	c.JSON(http.StatusOK, userRewards)
}

// EarnReward processes a transaction and earns rewards
// POST /earn
func (h *RewardsHandler) EarnReward(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.EarnRewardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get or create user rewards
	userRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if userRewards == nil {
		now := time.Now()
		userRewards = &models.UserRewards{
			ID:              uuid.New(),
			UserID:          userID.(uuid.UUID),
			Tier:            "standard",
			ReferralCode:    database.GenerateReferralCode(),
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		h.db.CreateUserRewards(c.Request.Context(), userRewards)
	}
	
	// Calculate points and cashback
	baseRate := decimal.NewFromFloat(h.cfg.PointsPerNaira)
	cashbackRate := decimal.NewFromFloat(h.cfg.CashbackRate)
	
	// Check for bonus categories
	programs, _ := h.db.GetPrograms(c.Request.Context())
	for _, program := range programs {
		for _, bonus := range program.BonusCategories {
			if bonus.Category == req.Category {
				baseRate = baseRate.Mul(bonus.Multiplier)
				break
			}
		}
	}
	
	pointsEarned := req.Amount.Mul(baseRate).Round(0)
	cashbackEarned := req.Amount.Mul(cashbackRate).Round(2)
	
	now := time.Now()
	availableAt := now.Add(24 * time.Hour) // Points available after 24 hours
	expiresAt := now.AddDate(1, 0, 0)      // Points expire after 1 year
	
	// Create reward record
	reward := &models.Reward{
		ID:            uuid.New(),
		UserID:        userID.(uuid.UUID),
		Type:          models.RewardTypePoints,
		Status:        models.RewardStatusPending,
		Amount:        cashbackEarned,
		Points:        pointsEarned,
		Description:   "Earned from transaction at " + req.MerchantName,
		TransactionID: &req.TransactionID,
		MerchantName:  req.MerchantName,
		Category:      req.Category,
		EarnedAt:      now,
		AvailableAt:   availableAt,
		ExpiresAt:     &expiresAt,
		CreatedAt:     now,
	}
	
	if err := h.db.CreateReward(c.Request.Context(), reward); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create reward"})
		return
	}
	
	// Update user rewards
	userRewards.TotalPoints = userRewards.TotalPoints.Add(pointsEarned)
	userRewards.PendingPoints = userRewards.PendingPoints.Add(pointsEarned)
	userRewards.TotalCashback = userRewards.TotalCashback.Add(cashbackEarned)
	userRewards.PendingCashback = userRewards.PendingCashback.Add(cashbackEarned)
	userRewards.TierPoints = userRewards.TierPoints.Add(pointsEarned)
	userRewards.UpdatedAt = now
	
	// Update tier
	tier, nextTierPoints := database.GetTierFromPoints(userRewards.TierPoints)
	userRewards.Tier = tier
	userRewards.NextTierPoints = nextTierPoints
	
	h.db.UpdateUserRewards(c.Request.Context(), userRewards)
	
	c.JSON(http.StatusCreated, gin.H{
		"reward":          reward,
		"points_earned":   pointsEarned,
		"cashback_earned": cashbackEarned,
		"user_rewards":    userRewards,
	})
}

// GetRewardHistory returns user's reward history
// GET /history
func (h *RewardsHandler) GetRewardHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	rewards, err := h.db.GetUserRewardHistory(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get reward history"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"rewards": rewards,
		"count":   len(rewards),
	})
}

// RedeemPoints redeems points for rewards
// POST /redeem/points
func (h *RewardsHandler) RedeemPoints(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.RedeemPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if userRewards == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no rewards found"})
		return
	}
	
	if req.Points.GreaterThan(userRewards.AvailablePoints) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient points"})
		return
	}
	
	// Calculate value
	pointsToNaira := decimal.NewFromFloat(h.cfg.PointsToNairaRate)
	value := req.Points.Mul(pointsToNaira)
	
	now := time.Now()
	redemption := &models.Redemption{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		Type:            req.Type,
		PointsUsed:      req.Points,
		CashbackUsed:    decimal.Zero,
		Value:           value,
		Currency:        "NGN",
		DestinationType: req.Type,
		DestinationID:   req.DestinationID,
		Status:          "completed",
		CreatedAt:       now,
	}
	
	if err := h.db.CreateRedemption(c.Request.Context(), redemption); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create redemption"})
		return
	}
	
	// Update user rewards
	userRewards.AvailablePoints = userRewards.AvailablePoints.Sub(req.Points)
	userRewards.RedeemedPoints = userRewards.RedeemedPoints.Add(req.Points)
	userRewards.UpdatedAt = now
	
	h.db.UpdateUserRewards(c.Request.Context(), userRewards)
	
	c.JSON(http.StatusOK, gin.H{
		"redemption":   redemption,
		"value":        value,
		"user_rewards": userRewards,
	})
}

// RedeemCashback redeems cashback to account
// POST /redeem/cashback
func (h *RewardsHandler) RedeemCashback(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.RedeemCashbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if userRewards == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no rewards found"})
		return
	}
	
	if req.Amount.GreaterThan(userRewards.AvailableCashback) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient cashback"})
		return
	}
	
	now := time.Now()
	redemption := &models.Redemption{
		ID:              uuid.New(),
		UserID:          userID.(uuid.UUID),
		Type:            "cashback",
		PointsUsed:      decimal.Zero,
		CashbackUsed:    req.Amount,
		Value:           req.Amount,
		Currency:        "NGN",
		DestinationType: "account",
		DestinationID:   req.AccountID.String(),
		Status:          "completed",
		CreatedAt:       now,
	}
	
	if err := h.db.CreateRedemption(c.Request.Context(), redemption); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create redemption"})
		return
	}
	
	// Update user rewards
	userRewards.AvailableCashback = userRewards.AvailableCashback.Sub(req.Amount)
	userRewards.RedeemedCashback = userRewards.RedeemedCashback.Add(req.Amount)
	userRewards.UpdatedAt = now
	
	h.db.UpdateUserRewards(c.Request.Context(), userRewards)
	
	c.JSON(http.StatusOK, gin.H{
		"redemption":   redemption,
		"amount":       req.Amount,
		"user_rewards": userRewards,
		"message":      "Cashback transferred to account",
	})
}

// GetRedemptionHistory returns user's redemption history
// GET /redemptions
func (h *RewardsHandler) GetRedemptionHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	redemptions, err := h.db.GetUserRedemptions(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get redemption history"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"redemptions": redemptions,
		"count":       len(redemptions),
	})
}

// GetPartners returns reward partners
// GET /partners
func (h *RewardsHandler) GetPartners(c *gin.Context) {
	partners, err := h.db.GetPartners(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get partners"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"partners": partners,
		"count":    len(partners),
	})
}

// GetPartner returns a specific partner
// GET /partners/:id
func (h *RewardsHandler) GetPartner(c *gin.Context) {
	partnerID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid partner ID"})
		return
	}
	
	partner, err := h.db.GetPartner(c.Request.Context(), partnerID)
	if err != nil || partner == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "partner not found"})
		return
	}
	
	c.JSON(http.StatusOK, partner)
}

// GetReferralCode returns user's referral code
// GET /referral/code
func (h *RewardsHandler) GetReferralCode(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	userRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if userRewards == nil {
		now := time.Now()
		userRewards = &models.UserRewards{
			ID:           uuid.New(),
			UserID:       userID.(uuid.UUID),
			Tier:         "standard",
			ReferralCode: database.GenerateReferralCode(),
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		h.db.CreateUserRewards(c.Request.Context(), userRewards)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"referral_code":     userRewards.ReferralCode,
		"total_referrals":   userRewards.TotalReferrals,
		"referral_earnings": userRewards.ReferralEarnings,
	})
}

// CreateReferral creates a referral invitation
// POST /referral/invite
func (h *RewardsHandler) CreateReferral(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateReferralRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	referral := &models.Referral{
		ID:             uuid.New(),
		ReferrerID:     userID.(uuid.UUID),
		RefereeEmail:   req.Email,
		Status:         "pending",
		ReferrerReward: decimal.NewFromFloat(h.cfg.ReferralReward),
		RefereeReward:  decimal.NewFromFloat(h.cfg.SignupBonus),
		CreatedAt:      now,
	}
	
	if err := h.db.CreateReferral(c.Request.Context(), referral); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create referral"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"referral": referral,
		"message":  "Referral invitation sent",
	})
}

// ApplyReferralCode applies a referral code for a new user
// POST /referral/apply
func (h *RewardsHandler) ApplyReferralCode(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.ApplyReferralCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Find referrer by code
	_, referrerRewards, err := h.db.GetReferralByCode(c.Request.Context(), req.Code)
	if err != nil || referrerRewards == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid referral code"})
		return
	}
	
	now := time.Now()
	
	// Create referral record
	referral := &models.Referral{
		ID:             uuid.New(),
		ReferrerID:     referrerRewards.UserID,
		RefereeID:      userID.(uuid.UUID),
		Status:         "completed",
		ReferrerReward: decimal.NewFromFloat(h.cfg.ReferralReward),
		RefereeReward:  decimal.NewFromFloat(h.cfg.SignupBonus),
		CompletedAt:    &now,
		CreatedAt:      now,
	}
	
	h.db.CreateReferral(c.Request.Context(), referral)
	
	// Update referrer rewards
	referrerRewards.TotalReferrals++
	referrerRewards.ReferralEarnings = referrerRewards.ReferralEarnings.Add(referral.ReferrerReward)
	referrerRewards.AvailablePoints = referrerRewards.AvailablePoints.Add(referral.ReferrerReward)
	referrerRewards.TotalPoints = referrerRewards.TotalPoints.Add(referral.ReferrerReward)
	referrerRewards.UpdatedAt = now
	h.db.UpdateUserRewards(c.Request.Context(), referrerRewards)
	
	// Create/update referee rewards
	refereeRewards, _ := h.db.GetUserRewards(c.Request.Context(), userID.(uuid.UUID))
	if refereeRewards == nil {
		refereeRewards = &models.UserRewards{
			ID:              uuid.New(),
			UserID:          userID.(uuid.UUID),
			Tier:            "standard",
			ReferralCode:    database.GenerateReferralCode(),
			AvailablePoints: referral.RefereeReward,
			TotalPoints:     referral.RefereeReward,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		h.db.CreateUserRewards(c.Request.Context(), refereeRewards)
	} else {
		refereeRewards.AvailablePoints = refereeRewards.AvailablePoints.Add(referral.RefereeReward)
		refereeRewards.TotalPoints = refereeRewards.TotalPoints.Add(referral.RefereeReward)
		refereeRewards.UpdatedAt = now
		h.db.UpdateUserRewards(c.Request.Context(), refereeRewards)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"referral":     referral,
		"bonus":        referral.RefereeReward,
		"user_rewards": refereeRewards,
		"message":      "Referral code applied successfully",
	})
}

// GetReferrals returns user's referrals
// GET /referrals
func (h *RewardsHandler) GetReferrals(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	referrals, err := h.db.GetUserReferrals(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get referrals"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"referrals": referrals,
		"count":     len(referrals),
	})
}

// GetTiers returns available reward tiers
// GET /tiers
func (h *RewardsHandler) GetTiers(c *gin.Context) {
	tiers := []gin.H{
		{
			"name":        "standard",
			"threshold":   0,
			"benefits":    []string{"1% cashback", "Basic rewards"},
		},
		{
			"name":        "plus",
			"threshold":   25000,
			"benefits":    []string{"1.5% cashback", "Priority support", "Free ATM withdrawals"},
		},
		{
			"name":        "premium",
			"threshold":   100000,
			"benefits":    []string{"2% cashback", "Travel insurance", "Airport lounge access"},
		},
		{
			"name":        "metal",
			"threshold":   500000,
			"benefits":    []string{"3% cashback", "Concierge service", "Premium metal card"},
		},
		{
			"name":        "ultra",
			"threshold":   1000000,
			"benefits":    []string{"5% cashback", "Dedicated account manager", "Exclusive events"},
		},
	}
	
	c.JSON(http.StatusOK, gin.H{
		"tiers": tiers,
	})
}
