package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// BNPLPlanType represents the type of BNPL plan
type BNPLPlanType string

const (
	BNPLPlanPay3  BNPLPlanType = "pay_in_3"  // Pay in 3 installments
	BNPLPlanPay4  BNPLPlanType = "pay_in_4"  // Pay in 4 installments
	BNPLPlanPay6  BNPLPlanType = "pay_in_6"  // Pay in 6 installments
	BNPLPlanPay12 BNPLPlanType = "pay_in_12" // Pay in 12 installments
)

type BNPLStatus string

const (
	BNPLStatusPending   BNPLStatus = "pending"
	BNPLStatusActive    BNPLStatus = "active"
	BNPLStatusCompleted BNPLStatus = "completed"
	BNPLStatusDefaulted BNPLStatus = "defaulted"
	BNPLStatusCancelled BNPLStatus = "cancelled"
)

type InstallmentStatus string

const (
	InstallmentStatusPending  InstallmentStatus = "pending"
	InstallmentStatusPaid     InstallmentStatus = "paid"
	InstallmentStatusOverdue  InstallmentStatus = "overdue"
	InstallmentStatusSkipped  InstallmentStatus = "skipped"
)

// BNPLPlan represents a BNPL plan configuration
type BNPLPlan struct {
	ID              uuid.UUID       `json:"id"`
	Type            BNPLPlanType    `json:"type"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	Installments    int             `json:"installments"`
	InterestRate    decimal.Decimal `json:"interest_rate"` // Annual rate
	ProcessingFee   decimal.Decimal `json:"processing_fee"` // Percentage
	MinAmount       decimal.Decimal `json:"min_amount"`
	MaxAmount       decimal.Decimal `json:"max_amount"`
	Currency        string          `json:"currency"`
	FrequencyDays   int             `json:"frequency_days"` // Days between installments
	IsActive        bool            `json:"is_active"`
}

// BNPLPurchase represents a BNPL purchase
type BNPLPurchase struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	PlanID          uuid.UUID       `json:"plan_id"`
	PlanType        BNPLPlanType    `json:"plan_type"`
	Status          BNPLStatus      `json:"status"`
	
	// Purchase details
	MerchantName    string          `json:"merchant_name"`
	MerchantID      string          `json:"merchant_id,omitempty"`
	Description     string          `json:"description"`
	Category        string          `json:"category,omitempty"`
	
	// Amounts
	PurchaseAmount  decimal.Decimal `json:"purchase_amount"`
	TotalAmount     decimal.Decimal `json:"total_amount"` // Including fees/interest
	ProcessingFee   decimal.Decimal `json:"processing_fee"`
	InterestAmount  decimal.Decimal `json:"interest_amount"`
	Currency        string          `json:"currency"`
	
	// Installments
	TotalInstallments int           `json:"total_installments"`
	PaidInstallments  int           `json:"paid_installments"`
	InstallmentAmount decimal.Decimal `json:"installment_amount"`
	Installments    []Installment   `json:"installments"`
	
	// Dates
	PurchaseDate    time.Time       `json:"purchase_date"`
	NextPaymentDate *time.Time      `json:"next_payment_date,omitempty"`
	CompletedDate   *time.Time      `json:"completed_date,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Installment represents a single installment payment
type Installment struct {
	ID              uuid.UUID         `json:"id"`
	PurchaseID      uuid.UUID         `json:"purchase_id"`
	Number          int               `json:"number"`
	Amount          decimal.Decimal   `json:"amount"`
	Principal       decimal.Decimal   `json:"principal"`
	Interest        decimal.Decimal   `json:"interest"`
	DueDate         time.Time         `json:"due_date"`
	Status          InstallmentStatus `json:"status"`
	PaidDate        *time.Time        `json:"paid_date,omitempty"`
	PaidAmount      decimal.Decimal   `json:"paid_amount,omitempty"`
	LateFee         decimal.Decimal   `json:"late_fee,omitempty"`
}

// BNPLLimit represents user's BNPL spending limit
type BNPLLimit struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	TotalLimit      decimal.Decimal `json:"total_limit"`
	UsedLimit       decimal.Decimal `json:"used_limit"`
	AvailableLimit  decimal.Decimal `json:"available_limit"`
	Currency        string          `json:"currency"`
	CreditScore     int             `json:"credit_score"`
	LastAssessment  time.Time       `json:"last_assessment"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// BNPLMerchant represents a BNPL-enabled merchant
type BNPLMerchant struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Category        string          `json:"category"`
	LogoURL         string          `json:"logo_url,omitempty"`
	Website         string          `json:"website,omitempty"`
	MaxDiscount     decimal.Decimal `json:"max_discount,omitempty"`
	IsActive        bool            `json:"is_active"`
}

// Request/Response types
type CreateBNPLPurchaseRequest struct {
	PlanType        BNPLPlanType    `json:"plan_type" binding:"required"`
	MerchantName    string          `json:"merchant_name" binding:"required"`
	MerchantID      string          `json:"merchant_id,omitempty"`
	Description     string          `json:"description" binding:"required"`
	Category        string          `json:"category,omitempty"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	Currency        string          `json:"currency" binding:"required"`
}

type PayInstallmentRequest struct {
	InstallmentID uuid.UUID `json:"installment_id" binding:"required"`
}

type EarlyPayoffRequest struct {
	PurchaseID uuid.UUID `json:"purchase_id" binding:"required"`
}

type BNPLEligibilityResponse struct {
	Eligible        bool            `json:"eligible"`
	AvailableLimit  decimal.Decimal `json:"available_limit"`
	MaxPurchase     decimal.Decimal `json:"max_purchase"`
	AvailablePlans  []BNPLPlan      `json:"available_plans"`
	Reason          string          `json:"reason,omitempty"`
}

type BNPLQuoteResponse struct {
	PlanType          BNPLPlanType    `json:"plan_type"`
	PurchaseAmount    decimal.Decimal `json:"purchase_amount"`
	ProcessingFee     decimal.Decimal `json:"processing_fee"`
	InterestAmount    decimal.Decimal `json:"interest_amount"`
	TotalAmount       decimal.Decimal `json:"total_amount"`
	InstallmentAmount decimal.Decimal `json:"installment_amount"`
	Installments      int             `json:"installments"`
	FirstPaymentDate  time.Time       `json:"first_payment_date"`
	LastPaymentDate   time.Time       `json:"last_payment_date"`
}
