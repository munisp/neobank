package database

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/savings-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu              sync.RWMutex
	vaults          map[uuid.UUID]*models.Vault
	vaultTxns       map[uuid.UUID]*models.VaultTransaction
	flexibleSavings map[uuid.UUID]*models.FlexibleSavings
	fixedDeposits   map[uuid.UUID]*models.FixedDeposit
	groupSavings    map[uuid.UUID]*models.GroupSavings
	salaryAdvances  map[uuid.UUID]*models.SalaryAdvance
	interestTiers   []models.InterestTier
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		vaults:          make(map[uuid.UUID]*models.Vault),
		vaultTxns:       make(map[uuid.UUID]*models.VaultTransaction),
		flexibleSavings: make(map[uuid.UUID]*models.FlexibleSavings),
		fixedDeposits:   make(map[uuid.UUID]*models.FixedDeposit),
		groupSavings:    make(map[uuid.UUID]*models.GroupSavings),
		salaryAdvances:  make(map[uuid.UUID]*models.SalaryAdvance),
	}
	db.seedInterestTiers()
	return db
}

func (db *InMemoryDB) seedInterestTiers() {
	db.interestTiers = []models.InterestTier{
		{MinBalance: decimal.Zero, MaxBalance: decimal.NewFromInt(100000), Rate: decimal.NewFromFloat(4.0)},
		{MinBalance: decimal.NewFromInt(100000), MaxBalance: decimal.NewFromInt(500000), Rate: decimal.NewFromFloat(6.0)},
		{MinBalance: decimal.NewFromInt(500000), MaxBalance: decimal.NewFromInt(1000000), Rate: decimal.NewFromFloat(8.0)},
		{MinBalance: decimal.NewFromInt(1000000), MaxBalance: decimal.NewFromInt(5000000), Rate: decimal.NewFromFloat(10.0)},
		{MinBalance: decimal.NewFromInt(5000000), MaxBalance: decimal.NewFromInt(999999999999), Rate: decimal.NewFromFloat(12.0)},
	}
}

func (db *InMemoryDB) GetInterestTiers() []models.InterestTier {
	return db.interestTiers
}

func (db *InMemoryDB) GetInterestRateForBalance(balance decimal.Decimal) decimal.Decimal {
	for _, tier := range db.interestTiers {
		if balance.GreaterThanOrEqual(tier.MinBalance) && balance.LessThan(tier.MaxBalance) {
			return tier.Rate
		}
	}
	return decimal.NewFromFloat(4.0)
}

// Vault operations
func (db *InMemoryDB) CreateVault(ctx context.Context, vault *models.Vault) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.vaults[vault.ID] = vault
	return nil
}

func (db *InMemoryDB) GetVault(ctx context.Context, id uuid.UUID) (*models.Vault, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.vaults[id], nil
}

func (db *InMemoryDB) GetUserVaults(ctx context.Context, userID uuid.UUID) ([]*models.Vault, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var vaults []*models.Vault
	for _, v := range db.vaults {
		if v.UserID == userID {
			vaults = append(vaults, v)
		}
	}
	return vaults, nil
}

func (db *InMemoryDB) GetUserVaultsByType(ctx context.Context, userID uuid.UUID, vaultType models.VaultType) ([]*models.Vault, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var vaults []*models.Vault
	for _, v := range db.vaults {
		if v.UserID == userID && v.Type == vaultType {
			vaults = append(vaults, v)
		}
	}
	return vaults, nil
}

func (db *InMemoryDB) UpdateVault(ctx context.Context, vault *models.Vault) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.vaults[vault.ID] = vault
	return nil
}

func (db *InMemoryDB) DeleteVault(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.vaults, id)
	return nil
}

// Vault Transaction operations
func (db *InMemoryDB) CreateVaultTransaction(ctx context.Context, txn *models.VaultTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.vaultTxns[txn.ID] = txn
	return nil
}

func (db *InMemoryDB) GetVaultTransactions(ctx context.Context, vaultID uuid.UUID) ([]*models.VaultTransaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var txns []*models.VaultTransaction
	for _, t := range db.vaultTxns {
		if t.VaultID == vaultID {
			txns = append(txns, t)
		}
	}
	return txns, nil
}

// Flexible Savings operations
func (db *InMemoryDB) CreateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.flexibleSavings[savings.ID] = savings
	return nil
}

func (db *InMemoryDB) GetFlexibleSavings(ctx context.Context, id uuid.UUID) (*models.FlexibleSavings, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.flexibleSavings[id], nil
}

func (db *InMemoryDB) GetUserFlexibleSavings(ctx context.Context, userID uuid.UUID) (*models.FlexibleSavings, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, s := range db.flexibleSavings {
		if s.UserID == userID {
			return s, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) UpdateFlexibleSavings(ctx context.Context, savings *models.FlexibleSavings) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.flexibleSavings[savings.ID] = savings
	return nil
}

// Fixed Deposit operations
func (db *InMemoryDB) CreateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.fixedDeposits[deposit.ID] = deposit
	return nil
}

func (db *InMemoryDB) GetFixedDeposit(ctx context.Context, id uuid.UUID) (*models.FixedDeposit, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.fixedDeposits[id], nil
}

func (db *InMemoryDB) GetUserFixedDeposits(ctx context.Context, userID uuid.UUID) ([]*models.FixedDeposit, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var deposits []*models.FixedDeposit
	for _, d := range db.fixedDeposits {
		if d.UserID == userID {
			deposits = append(deposits, d)
		}
	}
	return deposits, nil
}

func (db *InMemoryDB) UpdateFixedDeposit(ctx context.Context, deposit *models.FixedDeposit) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.fixedDeposits[deposit.ID] = deposit
	return nil
}

// Group Savings operations
func (db *InMemoryDB) CreateGroupSavings(ctx context.Context, group *models.GroupSavings) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.groupSavings[group.ID] = group
	return nil
}

func (db *InMemoryDB) GetGroupSavings(ctx context.Context, id uuid.UUID) (*models.GroupSavings, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.groupSavings[id], nil
}

func (db *InMemoryDB) GetAllGroupSavings(ctx context.Context) ([]*models.GroupSavings, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var groups []*models.GroupSavings
	for _, g := range db.groupSavings {
		groups = append(groups, g)
	}
	return groups, nil
}

func (db *InMemoryDB) GetUserGroupSavings(ctx context.Context, userID uuid.UUID) ([]*models.GroupSavings, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var groups []*models.GroupSavings
	for _, g := range db.groupSavings {
		for _, m := range g.Members {
			if m.UserID == userID {
				groups = append(groups, g)
				break
			}
		}
	}
	return groups, nil
}

func (db *InMemoryDB) UpdateGroupSavings(ctx context.Context, group *models.GroupSavings) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.groupSavings[group.ID] = group
	return nil
}

// Salary Advance operations
func (db *InMemoryDB) CreateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.salaryAdvances[advance.ID] = advance
	return nil
}

func (db *InMemoryDB) GetSalaryAdvance(ctx context.Context, id uuid.UUID) (*models.SalaryAdvance, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.salaryAdvances[id], nil
}

func (db *InMemoryDB) GetUserSalaryAdvances(ctx context.Context, userID uuid.UUID) ([]*models.SalaryAdvance, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var advances []*models.SalaryAdvance
	for _, a := range db.salaryAdvances {
		if a.UserID == userID {
			advances = append(advances, a)
		}
	}
	return advances, nil
}

func (db *InMemoryDB) GetUserActiveSalaryAdvance(ctx context.Context, userID uuid.UUID) (*models.SalaryAdvance, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, a := range db.salaryAdvances {
		if a.UserID == userID && (a.Status == "pending" || a.Status == "approved" || a.Status == "disbursed") {
			return a, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) UpdateSalaryAdvance(ctx context.Context, advance *models.SalaryAdvance) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.salaryAdvances[advance.ID] = advance
	return nil
}

// Calculate fixed deposit interest
func CalculateFixedDepositInterest(principal decimal.Decimal, rate decimal.Decimal, days int) decimal.Decimal {
	dailyRate := rate.Div(decimal.NewFromInt(36500))
	interest := principal.Mul(dailyRate).Mul(decimal.NewFromInt(int64(days)))
	return interest.Round(2)
}

// Calculate maturity amount
func CalculateMaturityAmount(principal decimal.Decimal, rate decimal.Decimal, days int) decimal.Decimal {
	interest := CalculateFixedDepositInterest(principal, rate, days)
	return principal.Add(interest)
}

// Get fixed deposit rates based on term
func GetFixedDepositRate(termDays int) decimal.Decimal {
	switch {
	case termDays <= 30:
		return decimal.NewFromFloat(6.0)
	case termDays <= 90:
		return decimal.NewFromFloat(8.0)
	case termDays <= 180:
		return decimal.NewFromFloat(10.0)
	case termDays <= 365:
		return decimal.NewFromFloat(12.0)
	default:
		return decimal.NewFromFloat(14.0)
	}
}

// Calculate salary advance fee
func CalculateSalaryAdvanceFee(amount decimal.Decimal, daysUntilPayday int) decimal.Decimal {
	baseFee := decimal.NewFromFloat(0.02) // 2% base fee
	if daysUntilPayday > 14 {
		baseFee = decimal.NewFromFloat(0.03) // 3% for longer advances
	}
	return amount.Mul(baseFee).Round(2)
}

// Helper to calculate next auto-save date
func CalculateNextAutoSaveDate(frequency string) time.Time {
	now := time.Now()
	switch frequency {
	case "daily":
		return now.AddDate(0, 0, 1)
	case "weekly":
		return now.AddDate(0, 0, 7)
	case "biweekly":
		return now.AddDate(0, 0, 14)
	case "monthly":
		return now.AddDate(0, 1, 0)
	default:
		return now.AddDate(0, 1, 0)
	}
}
