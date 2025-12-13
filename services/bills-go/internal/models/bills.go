package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// BillCategory represents bill categories
type BillCategory string

const (
	BillCategoryElectricity   BillCategory = "electricity"
	BillCategoryWater         BillCategory = "water"
	BillCategoryGas           BillCategory = "gas"
	BillCategoryInternet      BillCategory = "internet"
	BillCategoryTV            BillCategory = "tv"
	BillCategoryPhone         BillCategory = "phone"
	BillCategoryInsurance     BillCategory = "insurance"
	BillCategoryRent          BillCategory = "rent"
	BillCategoryEducation     BillCategory = "education"
	BillCategoryGovernment    BillCategory = "government"
	BillCategoryOther         BillCategory = "other"
)

type PaymentStatus string

const (
	PaymentStatusPending   PaymentStatus = "pending"
	PaymentStatusProcessing PaymentStatus = "processing"
	PaymentStatusCompleted PaymentStatus = "completed"
	PaymentStatusFailed    PaymentStatus = "failed"
	PaymentStatusRefunded  PaymentStatus = "refunded"
)

// Biller represents a bill provider
type Biller struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Category        BillCategory    `json:"category"`
	Code            string          `json:"code"`
	LogoURL         string          `json:"logo_url,omitempty"`
	Country         string          `json:"country"`
	
	// Validation
	RequiredFields  []string        `json:"required_fields"`
	ValidationRegex string          `json:"validation_regex,omitempty"`
	
	// Fees
	ServiceFee      decimal.Decimal `json:"service_fee"`
	FeeType         string          `json:"fee_type"` // fixed, percentage
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

// BillPayment represents a bill payment
type BillPayment struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	BillerID        uuid.UUID       `json:"biller_id"`
	BillerName      string          `json:"biller_name"`
	Category        BillCategory    `json:"category"`
	
	// Customer details
	CustomerID      string          `json:"customer_id"`
	CustomerName    string          `json:"customer_name,omitempty"`
	CustomerEmail   string          `json:"customer_email,omitempty"`
	CustomerPhone   string          `json:"customer_phone,omitempty"`
	
	// Payment details
	Amount          decimal.Decimal `json:"amount"`
	ServiceFee      decimal.Decimal `json:"service_fee"`
	TotalAmount     decimal.Decimal `json:"total_amount"`
	Currency        string          `json:"currency"`
	
	// Reference
	Reference       string          `json:"reference"`
	ExternalRef     string          `json:"external_ref,omitempty"`
	
	Status          PaymentStatus   `json:"status"`
	StatusMessage   string          `json:"status_message,omitempty"`
	
	// Scheduling
	IsScheduled     bool            `json:"is_scheduled"`
	ScheduledDate   *time.Time      `json:"scheduled_date,omitempty"`
	
	PaidAt          *time.Time      `json:"paid_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Subscription represents a detected or managed subscription
type Subscription struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Name            string          `json:"name"`
	Category        string          `json:"category"`
	
	// Provider details
	ProviderName    string          `json:"provider_name"`
	ProviderLogo    string          `json:"provider_logo,omitempty"`
	
	// Billing details
	Amount          decimal.Decimal `json:"amount"`
	Currency        string          `json:"currency"`
	Frequency       string          `json:"frequency"` // weekly, monthly, yearly
	
	// Dates
	StartDate       time.Time       `json:"start_date"`
	NextBillingDate time.Time       `json:"next_billing_date"`
	LastBilledDate  *time.Time      `json:"last_billed_date,omitempty"`
	
	// Status
	Status          string          `json:"status"` // active, paused, cancelled
	AutoRenew       bool            `json:"auto_renew"`
	
	// Detection
	IsDetected      bool            `json:"is_detected"` // Auto-detected vs manually added
	CardID          *uuid.UUID      `json:"card_id,omitempty"`
	
	// Notifications
	NotifyBefore    int             `json:"notify_before"` // Days before billing
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// SavedBiller represents a saved biller for quick payments
type SavedBiller struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	BillerID        uuid.UUID       `json:"biller_id"`
	BillerName      string          `json:"biller_name"`
	Category        BillCategory    `json:"category"`
	
	// Saved customer details
	CustomerID      string          `json:"customer_id"`
	CustomerName    string          `json:"customer_name,omitempty"`
	Nickname        string          `json:"nickname,omitempty"`
	
	// Auto-pay settings
	AutoPay         bool            `json:"auto_pay"`
	AutoPayAmount   decimal.Decimal `json:"auto_pay_amount,omitempty"`
	AutoPayDay      int             `json:"auto_pay_day,omitempty"` // Day of month
	
	LastPayment     *time.Time      `json:"last_payment,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ScheduledPayment represents a scheduled bill payment
type ScheduledPayment struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	BillerID        uuid.UUID       `json:"biller_id"`
	BillerName      string          `json:"biller_name"`
	
	// Customer details
	CustomerID      string          `json:"customer_id"`
	CustomerName    string          `json:"customer_name,omitempty"`
	
	// Payment details
	Amount          decimal.Decimal `json:"amount"`
	Currency        string          `json:"currency"`
	
	// Schedule
	Frequency       string          `json:"frequency"` // once, weekly, monthly
	ScheduledDate   time.Time       `json:"scheduled_date"`
	NextRunDate     time.Time       `json:"next_run_date"`
	
	Status          string          `json:"status"` // active, paused, completed, cancelled
	
	// Execution history
	LastRunDate     *time.Time      `json:"last_run_date,omitempty"`
	LastRunStatus   string          `json:"last_run_status,omitempty"`
	RunCount        int             `json:"run_count"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Request/Response types
type ValidateCustomerRequest struct {
	BillerID        uuid.UUID       `json:"biller_id" binding:"required"`
	CustomerID      string          `json:"customer_id" binding:"required"`
}

type ValidateCustomerResponse struct {
	Valid           bool            `json:"valid"`
	CustomerName    string          `json:"customer_name,omitempty"`
	CustomerEmail   string          `json:"customer_email,omitempty"`
	OutstandingAmount decimal.Decimal `json:"outstanding_amount,omitempty"`
	Message         string          `json:"message,omitempty"`
}

type PayBillRequest struct {
	BillerID        uuid.UUID       `json:"biller_id" binding:"required"`
	CustomerID      string          `json:"customer_id" binding:"required"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	CustomerName    string          `json:"customer_name,omitempty"`
	CustomerEmail   string          `json:"customer_email,omitempty"`
	CustomerPhone   string          `json:"customer_phone,omitempty"`
	ScheduledDate   *time.Time      `json:"scheduled_date,omitempty"`
}

type SaveBillerRequest struct {
	BillerID        uuid.UUID       `json:"biller_id" binding:"required"`
	CustomerID      string          `json:"customer_id" binding:"required"`
	CustomerName    string          `json:"customer_name,omitempty"`
	Nickname        string          `json:"nickname,omitempty"`
	AutoPay         bool            `json:"auto_pay"`
	AutoPayAmount   decimal.Decimal `json:"auto_pay_amount,omitempty"`
	AutoPayDay      int             `json:"auto_pay_day,omitempty"`
}

type CreateSubscriptionRequest struct {
	Name            string          `json:"name" binding:"required"`
	ProviderName    string          `json:"provider_name" binding:"required"`
	Category        string          `json:"category" binding:"required"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	Currency        string          `json:"currency" binding:"required"`
	Frequency       string          `json:"frequency" binding:"required"`
	StartDate       time.Time       `json:"start_date" binding:"required"`
	NotifyBefore    int             `json:"notify_before,omitempty"`
}

type SchedulePaymentRequest struct {
	BillerID        uuid.UUID       `json:"biller_id" binding:"required"`
	CustomerID      string          `json:"customer_id" binding:"required"`
	CustomerName    string          `json:"customer_name,omitempty"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	Frequency       string          `json:"frequency" binding:"required"`
	ScheduledDate   time.Time       `json:"scheduled_date" binding:"required"`
}
