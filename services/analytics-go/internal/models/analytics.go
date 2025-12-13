package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// TransactionCategory represents spending categories
type TransactionCategory string

const (
	CategoryGroceries     TransactionCategory = "groceries"
	CategoryDining        TransactionCategory = "dining"
	CategoryTransport     TransactionCategory = "transport"
	CategoryEntertainment TransactionCategory = "entertainment"
	CategoryShopping      TransactionCategory = "shopping"
	CategoryUtilities     TransactionCategory = "utilities"
	CategoryHealthcare    TransactionCategory = "healthcare"
	CategoryEducation     TransactionCategory = "education"
	CategoryTravel        TransactionCategory = "travel"
	CategorySubscriptions TransactionCategory = "subscriptions"
	CategoryTransfers     TransactionCategory = "transfers"
	CategoryIncome        TransactionCategory = "income"
	CategoryOther         TransactionCategory = "other"
)

// Transaction represents a financial transaction for analytics
type Transaction struct {
	ID              uuid.UUID           `json:"id"`
	UserID          uuid.UUID           `json:"user_id"`
	AccountID       uuid.UUID           `json:"account_id"`
	Type            string              `json:"type"` // debit, credit
	Amount          decimal.Decimal     `json:"amount"`
	Currency        string              `json:"currency"`
	Category        TransactionCategory `json:"category"`
	MerchantName    string              `json:"merchant_name,omitempty"`
	MerchantID      string              `json:"merchant_id,omitempty"`
	Description     string              `json:"description,omitempty"`
	Reference       string              `json:"reference,omitempty"`
	TransactionDate time.Time           `json:"transaction_date"`
	CreatedAt       time.Time           `json:"created_at"`
}

// SpendingAnalytics represents spending analytics for a period
type SpendingAnalytics struct {
	UserID          uuid.UUID                    `json:"user_id"`
	Period          string                       `json:"period"` // daily, weekly, monthly, yearly
	StartDate       time.Time                    `json:"start_date"`
	EndDate         time.Time                    `json:"end_date"`
	
	// Totals
	TotalSpending   decimal.Decimal              `json:"total_spending"`
	TotalIncome     decimal.Decimal              `json:"total_income"`
	NetCashFlow     decimal.Decimal              `json:"net_cash_flow"`
	
	// By category
	SpendingByCategory map[TransactionCategory]decimal.Decimal `json:"spending_by_category"`
	
	// By merchant
	TopMerchants    []MerchantSpending           `json:"top_merchants"`
	
	// Trends
	DailySpending   []DailySpending              `json:"daily_spending,omitempty"`
	
	// Comparison
	PreviousPeriod  *PeriodComparison            `json:"previous_period,omitempty"`
}

type MerchantSpending struct {
	MerchantName    string          `json:"merchant_name"`
	TotalSpent      decimal.Decimal `json:"total_spent"`
	TransactionCount int            `json:"transaction_count"`
	Category        TransactionCategory `json:"category"`
}

type DailySpending struct {
	Date            time.Time       `json:"date"`
	Amount          decimal.Decimal `json:"amount"`
}

type PeriodComparison struct {
	TotalSpending   decimal.Decimal `json:"total_spending"`
	PercentChange   decimal.Decimal `json:"percent_change"`
	Direction       string          `json:"direction"` // up, down, same
}

// Budget represents a user's budget
type Budget struct {
	ID              uuid.UUID           `json:"id"`
	UserID          uuid.UUID           `json:"user_id"`
	Name            string              `json:"name"`
	Category        TransactionCategory `json:"category"`
	Amount          decimal.Decimal     `json:"amount"`
	Spent           decimal.Decimal     `json:"spent"`
	Remaining       decimal.Decimal     `json:"remaining"`
	Period          string              `json:"period"` // weekly, monthly
	StartDate       time.Time           `json:"start_date"`
	EndDate         time.Time           `json:"end_date"`
	AlertThreshold  decimal.Decimal     `json:"alert_threshold"` // Percentage (e.g., 80 for 80%)
	IsActive        bool                `json:"is_active"`
	CreatedAt       time.Time           `json:"created_at"`
	UpdatedAt       time.Time           `json:"updated_at"`
}

// BudgetAlert represents a budget alert
type BudgetAlert struct {
	ID              uuid.UUID       `json:"id"`
	BudgetID        uuid.UUID       `json:"budget_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            string          `json:"type"` // threshold_reached, exceeded, reset
	Message         string          `json:"message"`
	PercentUsed     decimal.Decimal `json:"percent_used"`
	IsRead          bool            `json:"is_read"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Insight represents a financial insight
type Insight struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            string          `json:"type"` // spending_spike, unusual_transaction, savings_opportunity, recurring_charge
	Title           string          `json:"title"`
	Description     string          `json:"description"`
	Category        TransactionCategory `json:"category,omitempty"`
	Amount          decimal.Decimal `json:"amount,omitempty"`
	ActionType      string          `json:"action_type,omitempty"` // create_budget, review_subscription, etc.
	ActionData      string          `json:"action_data,omitempty"`
	IsRead          bool            `json:"is_read"`
	CreatedAt       time.Time       `json:"created_at"`
}

// RecurringTransaction represents a detected recurring transaction
type RecurringTransaction struct {
	ID              uuid.UUID           `json:"id"`
	UserID          uuid.UUID           `json:"user_id"`
	MerchantName    string              `json:"merchant_name"`
	Category        TransactionCategory `json:"category"`
	Amount          decimal.Decimal     `json:"amount"`
	Frequency       string              `json:"frequency"` // weekly, monthly, yearly
	LastCharged     time.Time           `json:"last_charged"`
	NextExpected    time.Time           `json:"next_expected"`
	IsSubscription  bool                `json:"is_subscription"`
	Status          string              `json:"status"` // active, paused, cancelled
	CreatedAt       time.Time           `json:"created_at"`
}

// Request/Response types
type CreateBudgetRequest struct {
	Name            string              `json:"name" binding:"required"`
	Category        TransactionCategory `json:"category" binding:"required"`
	Amount          decimal.Decimal     `json:"amount" binding:"required"`
	Period          string              `json:"period" binding:"required"`
	AlertThreshold  decimal.Decimal     `json:"alert_threshold,omitempty"`
}

type UpdateBudgetRequest struct {
	Name            string              `json:"name,omitempty"`
	Amount          decimal.Decimal     `json:"amount,omitempty"`
	AlertThreshold  decimal.Decimal     `json:"alert_threshold,omitempty"`
}

type GetAnalyticsRequest struct {
	Period          string              `json:"period"` // daily, weekly, monthly, yearly
	StartDate       *time.Time          `json:"start_date,omitempty"`
	EndDate         *time.Time          `json:"end_date,omitempty"`
}

type RecordTransactionRequest struct {
	AccountID       uuid.UUID           `json:"account_id" binding:"required"`
	Type            string              `json:"type" binding:"required"`
	Amount          decimal.Decimal     `json:"amount" binding:"required"`
	Currency        string              `json:"currency" binding:"required"`
	Category        TransactionCategory `json:"category" binding:"required"`
	MerchantName    string              `json:"merchant_name,omitempty"`
	Description     string              `json:"description,omitempty"`
}
