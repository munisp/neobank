package database

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/analytics-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu           sync.RWMutex
	transactions map[uuid.UUID]*models.Transaction
	budgets      map[uuid.UUID]*models.Budget
	alerts       map[uuid.UUID]*models.BudgetAlert
	insights     map[uuid.UUID]*models.Insight
	recurring    map[uuid.UUID]*models.RecurringTransaction
}

func NewInMemoryDB() *InMemoryDB {
	return &InMemoryDB{
		transactions: make(map[uuid.UUID]*models.Transaction),
		budgets:      make(map[uuid.UUID]*models.Budget),
		alerts:       make(map[uuid.UUID]*models.BudgetAlert),
		insights:     make(map[uuid.UUID]*models.Insight),
		recurring:    make(map[uuid.UUID]*models.RecurringTransaction),
	}
}

// Transaction operations
func (db *InMemoryDB) CreateTransaction(ctx context.Context, tx *models.Transaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.transactions[tx.ID] = tx
	return nil
}

func (db *InMemoryDB) GetUserTransactions(ctx context.Context, userID uuid.UUID, startDate, endDate time.Time) ([]*models.Transaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var transactions []*models.Transaction
	for _, tx := range db.transactions {
		if tx.UserID == userID {
			if !tx.TransactionDate.Before(startDate) && !tx.TransactionDate.After(endDate) {
				transactions = append(transactions, tx)
			}
		}
	}
	return transactions, nil
}

func (db *InMemoryDB) GetUserTransactionsByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory, startDate, endDate time.Time) ([]*models.Transaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var transactions []*models.Transaction
	for _, tx := range db.transactions {
		if tx.UserID == userID && tx.Category == category {
			if !tx.TransactionDate.Before(startDate) && !tx.TransactionDate.After(endDate) {
				transactions = append(transactions, tx)
			}
		}
	}
	return transactions, nil
}

// Budget operations
func (db *InMemoryDB) CreateBudget(ctx context.Context, budget *models.Budget) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.budgets[budget.ID] = budget
	return nil
}

func (db *InMemoryDB) GetBudget(ctx context.Context, id uuid.UUID) (*models.Budget, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.budgets[id], nil
}

func (db *InMemoryDB) GetUserBudgets(ctx context.Context, userID uuid.UUID) ([]*models.Budget, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var budgets []*models.Budget
	for _, b := range db.budgets {
		if b.UserID == userID && b.IsActive {
			budgets = append(budgets, b)
		}
	}
	return budgets, nil
}

func (db *InMemoryDB) GetUserBudgetByCategory(ctx context.Context, userID uuid.UUID, category models.TransactionCategory) (*models.Budget, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, b := range db.budgets {
		if b.UserID == userID && b.Category == category && b.IsActive {
			return b, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) UpdateBudget(ctx context.Context, budget *models.Budget) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.budgets[budget.ID] = budget
	return nil
}

func (db *InMemoryDB) DeleteBudget(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.budgets, id)
	return nil
}

// Alert operations
func (db *InMemoryDB) CreateAlert(ctx context.Context, alert *models.BudgetAlert) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.alerts[alert.ID] = alert
	return nil
}

func (db *InMemoryDB) GetUserAlerts(ctx context.Context, userID uuid.UUID) ([]*models.BudgetAlert, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var alerts []*models.BudgetAlert
	for _, a := range db.alerts {
		if a.UserID == userID {
			alerts = append(alerts, a)
		}
	}
	return alerts, nil
}

func (db *InMemoryDB) MarkAlertRead(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	
	if alert, ok := db.alerts[id]; ok {
		alert.IsRead = true
	}
	return nil
}

// Insight operations
func (db *InMemoryDB) CreateInsight(ctx context.Context, insight *models.Insight) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.insights[insight.ID] = insight
	return nil
}

func (db *InMemoryDB) GetUserInsights(ctx context.Context, userID uuid.UUID) ([]*models.Insight, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var insights []*models.Insight
	for _, i := range db.insights {
		if i.UserID == userID {
			insights = append(insights, i)
		}
	}
	return insights, nil
}

func (db *InMemoryDB) MarkInsightRead(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	
	if insight, ok := db.insights[id]; ok {
		insight.IsRead = true
	}
	return nil
}

// Recurring transaction operations
func (db *InMemoryDB) CreateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.recurring[recurring.ID] = recurring
	return nil
}

func (db *InMemoryDB) GetUserRecurringTransactions(ctx context.Context, userID uuid.UUID) ([]*models.RecurringTransaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var recurring []*models.RecurringTransaction
	for _, r := range db.recurring {
		if r.UserID == userID {
			recurring = append(recurring, r)
		}
	}
	return recurring, nil
}

func (db *InMemoryDB) UpdateRecurringTransaction(ctx context.Context, recurring *models.RecurringTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.recurring[recurring.ID] = recurring
	return nil
}

// Helper functions
func CalculateSpendingByCategory(transactions []*models.Transaction) map[models.TransactionCategory]decimal.Decimal {
	spending := make(map[models.TransactionCategory]decimal.Decimal)
	
	for _, tx := range transactions {
		if tx.Type == "debit" {
			if current, ok := spending[tx.Category]; ok {
				spending[tx.Category] = current.Add(tx.Amount)
			} else {
				spending[tx.Category] = tx.Amount
			}
		}
	}
	
	return spending
}

func CalculateTopMerchants(transactions []*models.Transaction, limit int) []models.MerchantSpending {
	merchantMap := make(map[string]*models.MerchantSpending)
	
	for _, tx := range transactions {
		if tx.Type == "debit" && tx.MerchantName != "" {
			if m, ok := merchantMap[tx.MerchantName]; ok {
				m.TotalSpent = m.TotalSpent.Add(tx.Amount)
				m.TransactionCount++
			} else {
				merchantMap[tx.MerchantName] = &models.MerchantSpending{
					MerchantName:     tx.MerchantName,
					TotalSpent:       tx.Amount,
					TransactionCount: 1,
					Category:         tx.Category,
				}
			}
		}
	}
	
	var merchants []models.MerchantSpending
	for _, m := range merchantMap {
		merchants = append(merchants, *m)
	}
	
	// Sort by total spent (simple bubble sort for small lists)
	for i := 0; i < len(merchants)-1; i++ {
		for j := 0; j < len(merchants)-i-1; j++ {
			if merchants[j].TotalSpent.LessThan(merchants[j+1].TotalSpent) {
				merchants[j], merchants[j+1] = merchants[j+1], merchants[j]
			}
		}
	}
	
	if len(merchants) > limit {
		merchants = merchants[:limit]
	}
	
	return merchants
}

func CalculateDailySpending(transactions []*models.Transaction, startDate, endDate time.Time) []models.DailySpending {
	dailyMap := make(map[string]decimal.Decimal)
	
	for _, tx := range transactions {
		if tx.Type == "debit" {
			dateKey := tx.TransactionDate.Format("2006-01-02")
			if current, ok := dailyMap[dateKey]; ok {
				dailyMap[dateKey] = current.Add(tx.Amount)
			} else {
				dailyMap[dateKey] = tx.Amount
			}
		}
	}
	
	var daily []models.DailySpending
	for date := startDate; !date.After(endDate); date = date.AddDate(0, 0, 1) {
		dateKey := date.Format("2006-01-02")
		amount := decimal.Zero
		if a, ok := dailyMap[dateKey]; ok {
			amount = a
		}
		daily = append(daily, models.DailySpending{
			Date:   date,
			Amount: amount,
		})
	}
	
	return daily
}

func GetPeriodDates(period string) (time.Time, time.Time) {
	now := time.Now()
	var startDate, endDate time.Time
	
	switch period {
	case "daily":
		startDate = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 0, 1).Add(-time.Second)
	case "weekly":
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		startDate = time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 0, 7).Add(-time.Second)
	case "monthly":
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, 0).Add(-time.Second)
	case "yearly":
		startDate = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(1, 0, 0).Add(-time.Second)
	default:
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, 0).Add(-time.Second)
	}
	
	return startDate, endDate
}
