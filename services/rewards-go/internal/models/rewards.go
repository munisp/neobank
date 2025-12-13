package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// RewardType represents the type of reward
type RewardType string

const (
	RewardTypeCashback    RewardType = "cashback"
	RewardTypePoints      RewardType = "points"
	RewardTypeDiscount    RewardType = "discount"
	RewardTypeVoucher     RewardType = "voucher"
	RewardTypeReferral    RewardType = "referral"
	RewardTypeSignup      RewardType = "signup"
	RewardTypeMilestone   RewardType = "milestone"
)

type RewardStatus string

const (
	RewardStatusPending   RewardStatus = "pending"
	RewardStatusAvailable RewardStatus = "available"
	RewardStatusRedeemed  RewardStatus = "redeemed"
	RewardStatusExpired   RewardStatus = "expired"
)

// RewardProgram represents a rewards program
type RewardProgram struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	Type            RewardType      `json:"type"`
	
	// Earning rules
	EarnRate        decimal.Decimal `json:"earn_rate"` // Points per currency unit spent
	MinTransaction  decimal.Decimal `json:"min_transaction"`
	MaxEarnPerDay   decimal.Decimal `json:"max_earn_per_day"`
	
	// Categories with bonus rates
	BonusCategories []BonusCategory `json:"bonus_categories,omitempty"`
	
	// Validity
	StartDate       time.Time       `json:"start_date"`
	EndDate         *time.Time      `json:"end_date,omitempty"`
	IsActive        bool            `json:"is_active"`
	
	CreatedAt       time.Time       `json:"created_at"`
}

type BonusCategory struct {
	Category   string          `json:"category"`
	Multiplier decimal.Decimal `json:"multiplier"`
}

// UserRewards represents a user's rewards balance
type UserRewards struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	
	// Points
	TotalPoints     decimal.Decimal `json:"total_points"`
	AvailablePoints decimal.Decimal `json:"available_points"`
	PendingPoints   decimal.Decimal `json:"pending_points"`
	RedeemedPoints  decimal.Decimal `json:"redeemed_points"`
	ExpiredPoints   decimal.Decimal `json:"expired_points"`
	
	// Cashback
	TotalCashback     decimal.Decimal `json:"total_cashback"`
	AvailableCashback decimal.Decimal `json:"available_cashback"`
	PendingCashback   decimal.Decimal `json:"pending_cashback"`
	RedeemedCashback  decimal.Decimal `json:"redeemed_cashback"`
	
	// Tier
	Tier            string          `json:"tier"` // standard, plus, premium, metal, ultra
	TierPoints      decimal.Decimal `json:"tier_points"`
	NextTierPoints  decimal.Decimal `json:"next_tier_points"`
	
	// Referrals
	ReferralCode    string          `json:"referral_code"`
	TotalReferrals  int             `json:"total_referrals"`
	ReferralEarnings decimal.Decimal `json:"referral_earnings"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Reward represents a single reward earned
type Reward struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            RewardType      `json:"type"`
	Status          RewardStatus    `json:"status"`
	
	// Reward details
	Amount          decimal.Decimal `json:"amount"`
	Points          decimal.Decimal `json:"points"`
	Description     string          `json:"description"`
	
	// Source
	TransactionID   *uuid.UUID      `json:"transaction_id,omitempty"`
	MerchantName    string          `json:"merchant_name,omitempty"`
	Category        string          `json:"category,omitempty"`
	
	// Validity
	EarnedAt        time.Time       `json:"earned_at"`
	AvailableAt     time.Time       `json:"available_at"`
	ExpiresAt       *time.Time      `json:"expires_at,omitempty"`
	RedeemedAt      *time.Time      `json:"redeemed_at,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
}

// Redemption represents a reward redemption
type Redemption struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            string          `json:"type"` // cashback, voucher, transfer, donation
	
	// Redemption details
	PointsUsed      decimal.Decimal `json:"points_used"`
	CashbackUsed    decimal.Decimal `json:"cashback_used"`
	Value           decimal.Decimal `json:"value"`
	Currency        string          `json:"currency"`
	
	// Destination
	DestinationType string          `json:"destination_type"` // account, voucher, charity
	DestinationID   string          `json:"destination_id,omitempty"`
	
	Status          string          `json:"status"` // pending, completed, failed
	
	CreatedAt       time.Time       `json:"created_at"`
}

// Partner represents a rewards partner
type Partner struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Category        string          `json:"category"`
	LogoURL         string          `json:"logo_url,omitempty"`
	Website         string          `json:"website,omitempty"`
	
	// Cashback/discount rates
	CashbackRate    decimal.Decimal `json:"cashback_rate"`
	DiscountRate    decimal.Decimal `json:"discount_rate,omitempty"`
	
	// Offers
	Offers          []PartnerOffer  `json:"offers,omitempty"`
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

type PartnerOffer struct {
	ID              uuid.UUID       `json:"id"`
	Title           string          `json:"title"`
	Description     string          `json:"description"`
	DiscountType    string          `json:"discount_type"` // percentage, fixed
	DiscountValue   decimal.Decimal `json:"discount_value"`
	MinPurchase     decimal.Decimal `json:"min_purchase,omitempty"`
	Code            string          `json:"code,omitempty"`
	ValidFrom       time.Time       `json:"valid_from"`
	ValidUntil      time.Time       `json:"valid_until"`
	IsActive        bool            `json:"is_active"`
}

// Referral represents a referral
type Referral struct {
	ID              uuid.UUID       `json:"id"`
	ReferrerID      uuid.UUID       `json:"referrer_id"`
	RefereeID       uuid.UUID       `json:"referee_id"`
	RefereeEmail    string          `json:"referee_email"`
	Status          string          `json:"status"` // pending, completed, expired
	
	// Rewards
	ReferrerReward  decimal.Decimal `json:"referrer_reward"`
	RefereeReward   decimal.Decimal `json:"referee_reward"`
	
	CompletedAt     *time.Time      `json:"completed_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Request/Response types
type EarnRewardRequest struct {
	TransactionID   uuid.UUID       `json:"transaction_id" binding:"required"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	MerchantName    string          `json:"merchant_name" binding:"required"`
	Category        string          `json:"category,omitempty"`
	Currency        string          `json:"currency" binding:"required"`
}

type RedeemPointsRequest struct {
	Points          decimal.Decimal `json:"points" binding:"required"`
	Type            string          `json:"type" binding:"required"` // cashback, voucher, transfer
	DestinationID   string          `json:"destination_id,omitempty"`
}

type RedeemCashbackRequest struct {
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	AccountID       uuid.UUID       `json:"account_id" binding:"required"`
}

type CreateReferralRequest struct {
	Email           string          `json:"email" binding:"required"`
}

type ApplyReferralCodeRequest struct {
	Code            string          `json:"code" binding:"required"`
}
