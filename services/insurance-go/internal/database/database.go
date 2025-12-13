package database

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/insurance-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu        sync.RWMutex
	products  map[uuid.UUID]*models.InsuranceProduct
	policies  map[uuid.UUID]*models.InsurancePolicy
	claims    map[uuid.UUID]*models.InsuranceClaim
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		products: make(map[uuid.UUID]*models.InsuranceProduct),
		policies: make(map[uuid.UUID]*models.InsurancePolicy),
		claims:   make(map[uuid.UUID]*models.InsuranceClaim),
	}
	db.seedProducts()
	return db
}

func (db *InMemoryDB) seedProducts() {
	products := []models.InsuranceProduct{
		// Travel Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeTravel,
			Name:           "Travel Basic",
			Description:    "Essential travel coverage for domestic and international trips",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(1000000),
			Deductible:     decimal.NewFromInt(5000),
			PremiumMonthly: decimal.NewFromFloat(2500),
			PremiumAnnual:  decimal.NewFromFloat(25000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Medical Expenses", Description: "Emergency medical treatment abroad", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Trip Cancellation", Description: "Reimbursement for cancelled trips", Limit: decimal.NewFromInt(200000), Covered: true},
				{Name: "Baggage Loss", Description: "Lost or delayed baggage", Limit: decimal.NewFromInt(100000), Covered: true},
				{Name: "Flight Delay", Description: "Compensation for flight delays", Limit: decimal.NewFromInt(50000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions", "Extreme sports", "War zones"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeTravel,
			Name:           "Travel Premium",
			Description:    "Comprehensive travel coverage with higher limits",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(5000000),
			Deductible:     decimal.NewFromInt(2500),
			PremiumMonthly: decimal.NewFromFloat(7500),
			PremiumAnnual:  decimal.NewFromFloat(75000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Medical Expenses", Description: "Emergency medical treatment abroad", Limit: decimal.NewFromInt(3000000), Covered: true},
				{Name: "Trip Cancellation", Description: "Reimbursement for cancelled trips", Limit: decimal.NewFromInt(1000000), Covered: true},
				{Name: "Baggage Loss", Description: "Lost or delayed baggage", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Flight Delay", Description: "Compensation for flight delays", Limit: decimal.NewFromInt(200000), Covered: true},
				{Name: "Emergency Evacuation", Description: "Medical evacuation", Limit: decimal.NewFromInt(2000000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions", "War zones"},
		},
		// Device Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeDevice,
			Name:           "Device Protect Basic",
			Description:    "Protection for smartphones and tablets",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(500000),
			Deductible:     decimal.NewFromInt(10000),
			PremiumMonthly: decimal.NewFromFloat(1500),
			PremiumAnnual:  decimal.NewFromFloat(15000),
			Currency:       "NGN",
			WaitingPeriod:  14,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Accidental Damage", Description: "Drops, spills, and cracks", Limit: decimal.NewFromInt(300000), Covered: true},
				{Name: "Screen Damage", Description: "Cracked or broken screens", Limit: decimal.NewFromInt(150000), Covered: true},
				{Name: "Theft", Description: "Stolen devices", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Cosmetic damage", "Software issues", "Devices over 2 years old"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeDevice,
			Name:           "Device Protect Premium",
			Description:    "Comprehensive protection for all devices",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(1500000),
			Deductible:     decimal.NewFromInt(5000),
			PremiumMonthly: decimal.NewFromFloat(3500),
			PremiumAnnual:  decimal.NewFromFloat(35000),
			Currency:       "NGN",
			WaitingPeriod:  7,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Accidental Damage", Description: "Drops, spills, and cracks", Limit: decimal.NewFromInt(1000000), Covered: true},
				{Name: "Screen Damage", Description: "Cracked or broken screens", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Theft", Description: "Stolen devices", Limit: decimal.NewFromInt(1500000), Covered: true},
				{Name: "Water Damage", Description: "Liquid damage", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Worldwide Coverage", Description: "Protection anywhere in the world", Limit: decimal.NewFromInt(1500000), Covered: true},
			},
			Exclusions: []string{"Cosmetic damage", "Software issues"},
		},
		// Life Insurance Products
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeLife,
			Name:           "Term Life Basic",
			Description:    "Affordable term life insurance",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(10000000),
			Deductible:     decimal.Zero,
			PremiumMonthly: decimal.NewFromFloat(5000),
			PremiumAnnual:  decimal.NewFromFloat(50000),
			Currency:       "NGN",
			MinAge:         18,
			MaxAge:         60,
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Death Benefit", Description: "Payout to beneficiaries", Limit: decimal.NewFromInt(10000000), Covered: true},
				{Name: "Accidental Death", Description: "Additional payout for accidental death", Limit: decimal.NewFromInt(5000000), Covered: true},
			},
			Exclusions: []string{"Suicide within first 2 years", "Death from illegal activities"},
		},
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeLife,
			Name:           "Term Life Premium",
			Description:    "Comprehensive life insurance with critical illness",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(50000000),
			Deductible:     decimal.Zero,
			PremiumMonthly: decimal.NewFromFloat(15000),
			PremiumAnnual:  decimal.NewFromFloat(150000),
			Currency:       "NGN",
			MinAge:         18,
			MaxAge:         65,
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Death Benefit", Description: "Payout to beneficiaries", Limit: decimal.NewFromInt(50000000), Covered: true},
				{Name: "Accidental Death", Description: "Additional payout for accidental death", Limit: decimal.NewFromInt(25000000), Covered: true},
				{Name: "Critical Illness", Description: "Payout on diagnosis of critical illness", Limit: decimal.NewFromInt(25000000), Covered: true},
				{Name: "Disability", Description: "Payout for permanent disability", Limit: decimal.NewFromInt(25000000), Covered: true},
			},
			Exclusions: []string{"Suicide within first 2 years"},
		},
		// Health Insurance
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypeHealth,
			Name:           "Health Basic",
			Description:    "Essential health coverage",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(5000000),
			Deductible:     decimal.NewFromInt(25000),
			PremiumMonthly: decimal.NewFromFloat(10000),
			PremiumAnnual:  decimal.NewFromFloat(100000),
			Currency:       "NGN",
			WaitingPeriod:  30,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Hospitalization", Description: "Inpatient treatment", Limit: decimal.NewFromInt(3000000), Covered: true},
				{Name: "Outpatient", Description: "Doctor visits and tests", Limit: decimal.NewFromInt(500000), Covered: true},
				{Name: "Surgery", Description: "Surgical procedures", Limit: decimal.NewFromInt(2000000), Covered: true},
				{Name: "Maternity", Description: "Pregnancy and childbirth", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Pre-existing conditions (first 12 months)", "Cosmetic surgery"},
		},
		// Purchase Protection
		{
			ID:             uuid.New(),
			Type:           models.InsuranceTypePurchase,
			Name:           "Purchase Protection",
			Description:    "Protection for your purchases",
			Provider:       "NeoBank Insurance",
			CoverageAmount: decimal.NewFromInt(500000),
			Deductible:     decimal.NewFromInt(2500),
			PremiumMonthly: decimal.NewFromFloat(500),
			PremiumAnnual:  decimal.NewFromFloat(5000),
			Currency:       "NGN",
			WaitingPeriod:  0,
			IsActive:       true,
			CoverageDetails: []models.CoverageItem{
				{Name: "Damage Protection", Description: "Accidental damage to purchases", Limit: decimal.NewFromInt(250000), Covered: true},
				{Name: "Theft Protection", Description: "Stolen items", Limit: decimal.NewFromInt(250000), Covered: true},
				{Name: "Extended Warranty", Description: "Extended manufacturer warranty", Limit: decimal.NewFromInt(500000), Covered: true},
			},
			Exclusions: []string{"Items over 90 days old", "Used items"},
		},
	}
	
	for i := range products {
		products[i].CreatedAt = time.Now()
		db.products[products[i].ID] = &products[i]
	}
}

// Product operations
func (db *InMemoryDB) GetProducts(ctx context.Context, insuranceType models.InsuranceType) ([]*models.InsuranceProduct, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var products []*models.InsuranceProduct
	for _, p := range db.products {
		if p.IsActive && (insuranceType == "" || p.Type == insuranceType) {
			products = append(products, p)
		}
	}
	return products, nil
}

func (db *InMemoryDB) GetProduct(ctx context.Context, id uuid.UUID) (*models.InsuranceProduct, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.products[id], nil
}

// Policy operations
func (db *InMemoryDB) CreatePolicy(ctx context.Context, policy *models.InsurancePolicy) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.policies[policy.ID] = policy
	return nil
}

func (db *InMemoryDB) GetPolicy(ctx context.Context, id uuid.UUID) (*models.InsurancePolicy, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.policies[id], nil
}

func (db *InMemoryDB) GetUserPolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var policies []*models.InsurancePolicy
	for _, p := range db.policies {
		if p.UserID == userID {
			policies = append(policies, p)
		}
	}
	return policies, nil
}

func (db *InMemoryDB) GetUserActivePolicies(ctx context.Context, userID uuid.UUID) ([]*models.InsurancePolicy, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var policies []*models.InsurancePolicy
	for _, p := range db.policies {
		if p.UserID == userID && p.Status == models.PolicyStatusActive {
			policies = append(policies, p)
		}
	}
	return policies, nil
}

func (db *InMemoryDB) UpdatePolicy(ctx context.Context, policy *models.InsurancePolicy) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.policies[policy.ID] = policy
	return nil
}

// Claim operations
func (db *InMemoryDB) CreateClaim(ctx context.Context, claim *models.InsuranceClaim) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.claims[claim.ID] = claim
	return nil
}

func (db *InMemoryDB) GetClaim(ctx context.Context, id uuid.UUID) (*models.InsuranceClaim, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.claims[id], nil
}

func (db *InMemoryDB) GetUserClaims(ctx context.Context, userID uuid.UUID) ([]*models.InsuranceClaim, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var claims []*models.InsuranceClaim
	for _, c := range db.claims {
		if c.UserID == userID {
			claims = append(claims, c)
		}
	}
	return claims, nil
}

func (db *InMemoryDB) GetPolicyClaims(ctx context.Context, policyID uuid.UUID) ([]*models.InsuranceClaim, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var claims []*models.InsuranceClaim
	for _, c := range db.claims {
		if c.PolicyID == policyID {
			claims = append(claims, c)
		}
	}
	return claims, nil
}

func (db *InMemoryDB) UpdateClaim(ctx context.Context, claim *models.InsuranceClaim) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.claims[claim.ID] = claim
	return nil
}

// Helper functions
func GeneratePolicyNumber() string {
	return fmt.Sprintf("POL-%d-%s", time.Now().Unix(), uuid.New().String()[:8])
}

func GenerateClaimNumber() string {
	return fmt.Sprintf("CLM-%d-%s", time.Now().Unix(), uuid.New().String()[:8])
}
