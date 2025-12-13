package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ProductType represents telecom product types
type ProductType string

const (
	ProductTypeAirtime ProductType = "airtime"
	ProductTypeData    ProductType = "data"
	ProductTypeESIM    ProductType = "esim"
	ProductTypeBundle  ProductType = "bundle"
)

type TransactionStatus string

const (
	TransactionStatusPending   TransactionStatus = "pending"
	TransactionStatusProcessing TransactionStatus = "processing"
	TransactionStatusCompleted TransactionStatus = "completed"
	TransactionStatusFailed    TransactionStatus = "failed"
)

// Network represents a mobile network operator
type Network struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Code            string          `json:"code"`
	Country         string          `json:"country"`
	LogoURL         string          `json:"logo_url,omitempty"`
	
	// Supported products
	SupportsAirtime bool            `json:"supports_airtime"`
	SupportsData    bool            `json:"supports_data"`
	SupportsESIM    bool            `json:"supports_esim"`
	
	// Validation
	PhonePrefix     []string        `json:"phone_prefix"`
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

// DataPlan represents a data plan
type DataPlan struct {
	ID              uuid.UUID       `json:"id"`
	NetworkID       uuid.UUID       `json:"network_id"`
	NetworkName     string          `json:"network_name"`
	Name            string          `json:"name"`
	Description     string          `json:"description,omitempty"`
	
	// Plan details
	DataAmount      string          `json:"data_amount"` // e.g., "1GB", "5GB"
	DataBytes       int64           `json:"data_bytes"`
	Validity        int             `json:"validity"` // Days
	
	// Pricing
	Price           decimal.Decimal `json:"price"`
	Currency        string          `json:"currency"`
	
	// Type
	PlanType        string          `json:"plan_type"` // daily, weekly, monthly, social
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ESIMPlan represents an eSIM data plan
type ESIMPlan struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Description     string          `json:"description,omitempty"`
	
	// Coverage
	Countries       []string        `json:"countries"`
	Region          string          `json:"region"` // africa, europe, asia, global
	
	// Plan details
	DataAmount      string          `json:"data_amount"`
	DataBytes       int64           `json:"data_bytes"`
	Validity        int             `json:"validity"` // Days
	
	// Pricing
	Price           decimal.Decimal `json:"price"`
	Currency        string          `json:"currency"`
	
	// Features
	VoiceMinutes    int             `json:"voice_minutes,omitempty"`
	SMSCount        int             `json:"sms_count,omitempty"`
	Hotspot         bool            `json:"hotspot"`
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

// AirtimeTransaction represents an airtime purchase
type AirtimeTransaction struct {
	ID              uuid.UUID         `json:"id"`
	UserID          uuid.UUID         `json:"user_id"`
	NetworkID       uuid.UUID         `json:"network_id"`
	NetworkName     string            `json:"network_name"`
	
	// Recipient
	PhoneNumber     string            `json:"phone_number"`
	
	// Amount
	Amount          decimal.Decimal   `json:"amount"`
	Currency        string            `json:"currency"`
	
	// Status
	Status          TransactionStatus `json:"status"`
	StatusMessage   string            `json:"status_message,omitempty"`
	Reference       string            `json:"reference"`
	ExternalRef     string            `json:"external_ref,omitempty"`
	
	CompletedAt     *time.Time        `json:"completed_at,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
}

// DataTransaction represents a data purchase
type DataTransaction struct {
	ID              uuid.UUID         `json:"id"`
	UserID          uuid.UUID         `json:"user_id"`
	NetworkID       uuid.UUID         `json:"network_id"`
	NetworkName     string            `json:"network_name"`
	PlanID          uuid.UUID         `json:"plan_id"`
	PlanName        string            `json:"plan_name"`
	
	// Recipient
	PhoneNumber     string            `json:"phone_number"`
	
	// Plan details
	DataAmount      string            `json:"data_amount"`
	Validity        int               `json:"validity"`
	
	// Amount
	Amount          decimal.Decimal   `json:"amount"`
	Currency        string            `json:"currency"`
	
	// Status
	Status          TransactionStatus `json:"status"`
	StatusMessage   string            `json:"status_message,omitempty"`
	Reference       string            `json:"reference"`
	ExternalRef     string            `json:"external_ref,omitempty"`
	
	CompletedAt     *time.Time        `json:"completed_at,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
}

// ESIMPurchase represents an eSIM purchase
type ESIMPurchase struct {
	ID              uuid.UUID         `json:"id"`
	UserID          uuid.UUID         `json:"user_id"`
	PlanID          uuid.UUID         `json:"plan_id"`
	PlanName        string            `json:"plan_name"`
	
	// eSIM details
	ICCID           string            `json:"iccid,omitempty"`
	ActivationCode  string            `json:"activation_code,omitempty"`
	QRCode          string            `json:"qr_code,omitempty"`
	
	// Plan details
	DataAmount      string            `json:"data_amount"`
	Validity        int               `json:"validity"`
	Countries       []string          `json:"countries"`
	
	// Amount
	Amount          decimal.Decimal   `json:"amount"`
	Currency        string            `json:"currency"`
	
	// Status
	Status          string            `json:"status"` // pending, active, expired, cancelled
	ActivatedAt     *time.Time        `json:"activated_at,omitempty"`
	ExpiresAt       *time.Time        `json:"expires_at,omitempty"`
	
	// Usage
	DataUsed        int64             `json:"data_used"`
	DataRemaining   int64             `json:"data_remaining"`
	
	Reference       string            `json:"reference"`
	CreatedAt       time.Time         `json:"created_at"`
}

// SavedBeneficiary represents a saved phone number
type SavedBeneficiary struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	NetworkID       uuid.UUID       `json:"network_id"`
	NetworkName     string          `json:"network_name"`
	PhoneNumber     string          `json:"phone_number"`
	Nickname        string          `json:"nickname,omitempty"`
	
	// Auto-recharge settings
	AutoRecharge    bool            `json:"auto_recharge"`
	RechargeAmount  decimal.Decimal `json:"recharge_amount,omitempty"`
	RechargeDay     int             `json:"recharge_day,omitempty"` // Day of month
	
	LastRecharge    *time.Time      `json:"last_recharge,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Request/Response types
type BuyAirtimeRequest struct {
	NetworkID       uuid.UUID       `json:"network_id" binding:"required"`
	PhoneNumber     string          `json:"phone_number" binding:"required"`
	Amount          decimal.Decimal `json:"amount" binding:"required"`
}

type BuyDataRequest struct {
	NetworkID       uuid.UUID       `json:"network_id" binding:"required"`
	PlanID          uuid.UUID       `json:"plan_id" binding:"required"`
	PhoneNumber     string          `json:"phone_number" binding:"required"`
}

type BuyESIMRequest struct {
	PlanID          uuid.UUID       `json:"plan_id" binding:"required"`
}

type SaveBeneficiaryRequest struct {
	NetworkID       uuid.UUID       `json:"network_id" binding:"required"`
	PhoneNumber     string          `json:"phone_number" binding:"required"`
	Nickname        string          `json:"nickname,omitempty"`
	AutoRecharge    bool            `json:"auto_recharge"`
	RechargeAmount  decimal.Decimal `json:"recharge_amount,omitempty"`
	RechargeDay     int             `json:"recharge_day,omitempty"`
}

type ValidatePhoneRequest struct {
	PhoneNumber     string          `json:"phone_number" binding:"required"`
}

type ValidatePhoneResponse struct {
	Valid           bool            `json:"valid"`
	NetworkID       uuid.UUID       `json:"network_id,omitempty"`
	NetworkName     string          `json:"network_name,omitempty"`
	PhoneNumber     string          `json:"phone_number"`
	Message         string          `json:"message,omitempty"`
}
