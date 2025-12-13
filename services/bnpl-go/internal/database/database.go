package database

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/bnpl-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu        sync.RWMutex
	plans     map[uuid.UUID]*models.BNPLPlan
	purchases map[uuid.UUID]*models.BNPLPurchase
	limits    map[uuid.UUID]*models.BNPLLimit
	merchants map[uuid.UUID]*models.BNPLMerchant
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		plans:     make(map[uuid.UUID]*models.BNPLPlan),
		purchases: make(map[uuid.UUID]*models.BNPLPurchase),
		limits:    make(map[uuid.UUID]*models.BNPLLimit),
		merchants: make(map[uuid.UUID]*models.BNPLMerchant),
	}
	db.seedPlans()
	db.seedMerchants()
	return db
}

func (db *InMemoryDB) seedPlans() {
	plans := []models.BNPLPlan{
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay3,
			Name:          "Pay in 3",
			Description:   "Split your purchase into 3 interest-free payments",
			Installments:  3,
			InterestRate:  decimal.Zero,
			ProcessingFee: decimal.NewFromFloat(1.5),
			MinAmount:     decimal.NewFromInt(5000),
			MaxAmount:     decimal.NewFromInt(500000),
			Currency:      "NGN",
			FrequencyDays: 14,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay4,
			Name:          "Pay in 4",
			Description:   "Split your purchase into 4 interest-free payments",
			Installments:  4,
			InterestRate:  decimal.Zero,
			ProcessingFee: decimal.NewFromFloat(2.0),
			MinAmount:     decimal.NewFromInt(10000),
			MaxAmount:     decimal.NewFromInt(1000000),
			Currency:      "NGN",
			FrequencyDays: 14,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay6,
			Name:          "Pay in 6",
			Description:   "Split your purchase into 6 monthly payments",
			Installments:  6,
			InterestRate:  decimal.NewFromFloat(12.0),
			ProcessingFee: decimal.NewFromFloat(2.5),
			MinAmount:     decimal.NewFromInt(20000),
			MaxAmount:     decimal.NewFromInt(1500000),
			Currency:      "NGN",
			FrequencyDays: 30,
			IsActive:      true,
		},
		{
			ID:            uuid.New(),
			Type:          models.BNPLPlanPay12,
			Name:          "Pay in 12",
			Description:   "Split your purchase into 12 monthly payments",
			Installments:  12,
			InterestRate:  decimal.NewFromFloat(15.0),
			ProcessingFee: decimal.NewFromFloat(3.0),
			MinAmount:     decimal.NewFromInt(50000),
			MaxAmount:     decimal.NewFromInt(2000000),
			Currency:      "NGN",
			FrequencyDays: 30,
			IsActive:      true,
		},
	}
	
	for i := range plans {
		db.plans[plans[i].ID] = &plans[i]
	}
}

func (db *InMemoryDB) seedMerchants() {
	merchants := []models.BNPLMerchant{
		{ID: uuid.New(), Name: "Jumia", Category: "E-commerce", Website: "https://jumia.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Konga", Category: "E-commerce", Website: "https://konga.com", IsActive: true},
		{ID: uuid.New(), Name: "Slot", Category: "Electronics", Website: "https://slot.ng", IsActive: true},
		{ID: uuid.New(), Name: "Spar", Category: "Supermarket", Website: "https://spar.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Shoprite", Category: "Supermarket", Website: "https://shoprite.com.ng", IsActive: true},
		{ID: uuid.New(), Name: "Game", Category: "Electronics", Website: "https://game.co.za", IsActive: true},
		{ID: uuid.New(), Name: "Hubmart", Category: "Supermarket", Website: "https://hubmart.com", IsActive: true},
		{ID: uuid.New(), Name: "Payporte", Category: "Fashion", Website: "https://payporte.com", IsActive: true},
	}
	
	for i := range merchants {
		db.merchants[merchants[i].ID] = &merchants[i]
	}
}

// Plan operations
func (db *InMemoryDB) GetPlans(ctx context.Context) ([]*models.BNPLPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var plans []*models.BNPLPlan
	for _, p := range db.plans {
		if p.IsActive {
			plans = append(plans, p)
		}
	}
	return plans, nil
}

func (db *InMemoryDB) GetPlan(ctx context.Context, id uuid.UUID) (*models.BNPLPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.plans[id], nil
}

func (db *InMemoryDB) GetPlanByType(ctx context.Context, planType models.BNPLPlanType) (*models.BNPLPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, p := range db.plans {
		if p.Type == planType && p.IsActive {
			return p, nil
		}
	}
	return nil, nil
}

// Purchase operations
func (db *InMemoryDB) CreatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.purchases[purchase.ID] = purchase
	return nil
}

func (db *InMemoryDB) GetPurchase(ctx context.Context, id uuid.UUID) (*models.BNPLPurchase, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.purchases[id], nil
}

func (db *InMemoryDB) GetUserPurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var purchases []*models.BNPLPurchase
	for _, p := range db.purchases {
		if p.UserID == userID {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil
}

func (db *InMemoryDB) GetUserActivePurchases(ctx context.Context, userID uuid.UUID) ([]*models.BNPLPurchase, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var purchases []*models.BNPLPurchase
	for _, p := range db.purchases {
		if p.UserID == userID && p.Status == models.BNPLStatusActive {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil
}

func (db *InMemoryDB) UpdatePurchase(ctx context.Context, purchase *models.BNPLPurchase) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.purchases[purchase.ID] = purchase
	return nil
}

// Limit operations
func (db *InMemoryDB) GetUserLimit(ctx context.Context, userID uuid.UUID) (*models.BNPLLimit, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, l := range db.limits {
		if l.UserID == userID {
			return l, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) CreateLimit(ctx context.Context, limit *models.BNPLLimit) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.limits[limit.ID] = limit
	return nil
}

func (db *InMemoryDB) UpdateLimit(ctx context.Context, limit *models.BNPLLimit) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.limits[limit.ID] = limit
	return nil
}

// Merchant operations
func (db *InMemoryDB) GetMerchants(ctx context.Context) ([]*models.BNPLMerchant, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var merchants []*models.BNPLMerchant
	for _, m := range db.merchants {
		if m.IsActive {
			merchants = append(merchants, m)
		}
	}
	return merchants, nil
}

// Helper functions
func CalculateInstallments(amount decimal.Decimal, plan *models.BNPLPlan) ([]models.Installment, decimal.Decimal, decimal.Decimal) {
	processingFee := amount.Mul(plan.ProcessingFee).Div(decimal.NewFromInt(100))
	
	var interestAmount decimal.Decimal
	if plan.InterestRate.GreaterThan(decimal.Zero) {
		monthlyRate := plan.InterestRate.Div(decimal.NewFromInt(1200))
		interestAmount = amount.Mul(monthlyRate).Mul(decimal.NewFromInt(int64(plan.Installments)))
	}
	
	totalAmount := amount.Add(processingFee).Add(interestAmount)
	installmentAmount := totalAmount.Div(decimal.NewFromInt(int64(plan.Installments))).Round(2)
	
	var installments []models.Installment
	now := time.Now()
	
	for i := 1; i <= plan.Installments; i++ {
		dueDate := now.AddDate(0, 0, plan.FrequencyDays*i)
		
		principal := amount.Div(decimal.NewFromInt(int64(plan.Installments))).Round(2)
		interest := interestAmount.Div(decimal.NewFromInt(int64(plan.Installments))).Round(2)
		
		installments = append(installments, models.Installment{
			ID:        uuid.New(),
			Number:    i,
			Amount:    installmentAmount,
			Principal: principal,
			Interest:  interest,
			DueDate:   dueDate,
			Status:    models.InstallmentStatusPending,
		})
	}
	
	return installments, processingFee, interestAmount
}
