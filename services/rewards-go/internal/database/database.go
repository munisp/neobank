package database

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/rewards-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu          sync.RWMutex
	programs    map[uuid.UUID]*models.RewardProgram
	userRewards map[uuid.UUID]*models.UserRewards
	rewards     map[uuid.UUID]*models.Reward
	redemptions map[uuid.UUID]*models.Redemption
	partners    map[uuid.UUID]*models.Partner
	referrals   map[uuid.UUID]*models.Referral
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		programs:    make(map[uuid.UUID]*models.RewardProgram),
		userRewards: make(map[uuid.UUID]*models.UserRewards),
		rewards:     make(map[uuid.UUID]*models.Reward),
		redemptions: make(map[uuid.UUID]*models.Redemption),
		partners:    make(map[uuid.UUID]*models.Partner),
		referrals:   make(map[uuid.UUID]*models.Referral),
	}
	db.seedPrograms()
	db.seedPartners()
	return db
}

func (db *InMemoryDB) seedPrograms() {
	now := time.Now()
	programs := []models.RewardProgram{
		{
			ID:             uuid.New(),
			Name:           "NeoBank Rewards",
			Description:    "Earn points on every transaction",
			Type:           models.RewardTypePoints,
			EarnRate:       decimal.NewFromFloat(0.01),
			MinTransaction: decimal.NewFromInt(100),
			MaxEarnPerDay:  decimal.NewFromInt(10000),
			BonusCategories: []models.BonusCategory{
				{Category: "groceries", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "fuel", Multiplier: decimal.NewFromFloat(1.5)},
				{Category: "dining", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "travel", Multiplier: decimal.NewFromFloat(3.0)},
			},
			StartDate: now,
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:             uuid.New(),
			Name:           "Cashback Plus",
			Description:    "Get cashback on qualifying purchases",
			Type:           models.RewardTypeCashback,
			EarnRate:       decimal.NewFromFloat(0.01),
			MinTransaction: decimal.NewFromInt(500),
			MaxEarnPerDay:  decimal.NewFromInt(5000),
			BonusCategories: []models.BonusCategory{
				{Category: "online_shopping", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "entertainment", Multiplier: decimal.NewFromFloat(1.5)},
			},
			StartDate: now,
			IsActive:  true,
			CreatedAt: now,
		},
	}
	
	for i := range programs {
		db.programs[programs[i].ID] = &programs[i]
	}
}

func (db *InMemoryDB) seedPartners() {
	now := time.Now()
	partners := []models.Partner{
		{
			ID:           uuid.New(),
			Name:         "Jumia",
			Category:     "E-commerce",
			Website:      "https://jumia.com.ng",
			CashbackRate: decimal.NewFromFloat(5.0),
			DiscountRate: decimal.NewFromFloat(10.0),
			Offers: []models.PartnerOffer{
				{
					ID:            uuid.New(),
					Title:         "10% Off Electronics",
					Description:   "Get 10% off all electronics",
					DiscountType:  "percentage",
					DiscountValue: decimal.NewFromFloat(10.0),
					MinPurchase:   decimal.NewFromInt(10000),
					ValidFrom:     now,
					ValidUntil:    now.AddDate(0, 3, 0),
					IsActive:      true,
				},
			},
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:           uuid.New(),
			Name:         "Uber",
			Category:     "Transport",
			Website:      "https://uber.com",
			CashbackRate: decimal.NewFromFloat(3.0),
			Offers: []models.PartnerOffer{
				{
					ID:            uuid.New(),
					Title:         "N500 Off First Ride",
					Description:   "Get N500 off your first ride",
					DiscountType:  "fixed",
					DiscountValue: decimal.NewFromFloat(500),
					ValidFrom:     now,
					ValidUntil:    now.AddDate(0, 1, 0),
					IsActive:      true,
				},
			},
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:           uuid.New(),
			Name:         "Netflix",
			Category:     "Entertainment",
			Website:      "https://netflix.com",
			CashbackRate: decimal.NewFromFloat(2.0),
			IsActive:     true,
			CreatedAt:    now,
		},
		{
			ID:           uuid.New(),
			Name:         "Shoprite",
			Category:     "Groceries",
			Website:      "https://shoprite.com.ng",
			CashbackRate: decimal.NewFromFloat(4.0),
			IsActive:     true,
			CreatedAt:    now,
		},
		{
			ID:           uuid.New(),
			Name:         "Total Energies",
			Category:     "Fuel",
			Website:      "https://totalenergies.com.ng",
			CashbackRate: decimal.NewFromFloat(2.5),
			IsActive:     true,
			CreatedAt:    now,
		},
	}
	
	for i := range partners {
		db.partners[partners[i].ID] = &partners[i]
	}
}

// Program operations
func (db *InMemoryDB) GetPrograms(ctx context.Context) ([]*models.RewardProgram, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var programs []*models.RewardProgram
	for _, p := range db.programs {
		if p.IsActive {
			programs = append(programs, p)
		}
	}
	return programs, nil
}

// UserRewards operations
func (db *InMemoryDB) GetUserRewards(ctx context.Context, userID uuid.UUID) (*models.UserRewards, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, ur := range db.userRewards {
		if ur.UserID == userID {
			return ur, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) CreateUserRewards(ctx context.Context, userRewards *models.UserRewards) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.userRewards[userRewards.ID] = userRewards
	return nil
}

func (db *InMemoryDB) UpdateUserRewards(ctx context.Context, userRewards *models.UserRewards) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.userRewards[userRewards.ID] = userRewards
	return nil
}

// Reward operations
func (db *InMemoryDB) CreateReward(ctx context.Context, reward *models.Reward) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.rewards[reward.ID] = reward
	return nil
}

func (db *InMemoryDB) GetUserRewardHistory(ctx context.Context, userID uuid.UUID) ([]*models.Reward, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var rewards []*models.Reward
	for _, r := range db.rewards {
		if r.UserID == userID {
			rewards = append(rewards, r)
		}
	}
	return rewards, nil
}

// Redemption operations
func (db *InMemoryDB) CreateRedemption(ctx context.Context, redemption *models.Redemption) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.redemptions[redemption.ID] = redemption
	return nil
}

func (db *InMemoryDB) GetUserRedemptions(ctx context.Context, userID uuid.UUID) ([]*models.Redemption, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var redemptions []*models.Redemption
	for _, r := range db.redemptions {
		if r.UserID == userID {
			redemptions = append(redemptions, r)
		}
	}
	return redemptions, nil
}

// Partner operations
func (db *InMemoryDB) GetPartners(ctx context.Context) ([]*models.Partner, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var partners []*models.Partner
	for _, p := range db.partners {
		if p.IsActive {
			partners = append(partners, p)
		}
	}
	return partners, nil
}

func (db *InMemoryDB) GetPartner(ctx context.Context, id uuid.UUID) (*models.Partner, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.partners[id], nil
}

// Referral operations
func (db *InMemoryDB) CreateReferral(ctx context.Context, referral *models.Referral) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.referrals[referral.ID] = referral
	return nil
}

func (db *InMemoryDB) GetUserReferrals(ctx context.Context, userID uuid.UUID) ([]*models.Referral, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var referrals []*models.Referral
	for _, r := range db.referrals {
		if r.ReferrerID == userID {
			referrals = append(referrals, r)
		}
	}
	return referrals, nil
}

func (db *InMemoryDB) GetReferralByCode(ctx context.Context, code string) (*models.Referral, *models.UserRewards, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, ur := range db.userRewards {
		if ur.ReferralCode == code {
			return nil, ur, nil
		}
	}
	return nil, nil, nil
}

// Helper functions
func GenerateReferralCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	rand.Seed(time.Now().UnixNano())
	code := make([]byte, 8)
	for i := range code {
		code[i] = charset[rand.Intn(len(charset))]
	}
	return fmt.Sprintf("NEO%s", string(code))
}

func GetTierFromPoints(points decimal.Decimal) (string, decimal.Decimal) {
	tiers := []struct {
		name      string
		threshold decimal.Decimal
	}{
		{"ultra", decimal.NewFromInt(1000000)},
		{"metal", decimal.NewFromInt(500000)},
		{"premium", decimal.NewFromInt(100000)},
		{"plus", decimal.NewFromInt(25000)},
		{"standard", decimal.Zero},
	}
	
	for i, tier := range tiers {
		if points.GreaterThanOrEqual(tier.threshold) {
			nextThreshold := decimal.NewFromInt(999999999)
			if i > 0 {
				nextThreshold = tiers[i-1].threshold
			}
			return tier.name, nextThreshold
		}
	}
	return "standard", decimal.NewFromInt(25000)
}
