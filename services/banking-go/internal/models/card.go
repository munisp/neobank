package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// CardType represents the type of card
type CardType string

const (
	CardTypeDebit   CardType = "debit"
	CardTypeCredit  CardType = "credit"
	CardTypeVirtual CardType = "virtual"
	CardTypePrepaid CardType = "prepaid"
)

// CardStatus represents the status of a card
type CardStatus string

const (
	CardStatusPending   CardStatus = "pending"
	CardStatusActive    CardStatus = "active"
	CardStatusFrozen    CardStatus = "frozen"
	CardStatusBlocked   CardStatus = "blocked"
	CardStatusExpired   CardStatus = "expired"
	CardStatusCancelled CardStatus = "cancelled"
)

// CardNetwork represents the card network
type CardNetwork string

const (
	CardNetworkVisa       CardNetwork = "visa"
	CardNetworkMastercard CardNetwork = "mastercard"
	CardNetworkVerve      CardNetwork = "verve"
)

// Card represents a payment card
type Card struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	AccountID       uuid.UUID       `json:"account_id"`
	CardType        CardType        `json:"card_type"`
	CardNetwork     CardNetwork     `json:"card_network"`
	Status          CardStatus      `json:"status"`
	MaskedPAN       string          `json:"masked_pan"`
	LastFourDigits  string          `json:"last_four_digits"`
	ExpiryMonth     int             `json:"expiry_month"`
	ExpiryYear      int             `json:"expiry_year"`
	CardholderName  string          `json:"cardholder_name"`
	BillingAddress  Address         `json:"billing_address"`
	DailyLimit      decimal.Decimal `json:"daily_limit"`
	MonthlyLimit    decimal.Decimal `json:"monthly_limit"`
	TransactionLimit decimal.Decimal `json:"transaction_limit"`
	DailySpent      decimal.Decimal `json:"daily_spent"`
	MonthlySpent    decimal.Decimal `json:"monthly_spent"`
	IsContactless   bool            `json:"is_contactless"`
	IsOnlineEnabled bool            `json:"is_online_enabled"`
	IsATMEnabled    bool            `json:"is_atm_enabled"`
	IsPOSEnabled    bool            `json:"is_pos_enabled"`
	PIN             string          `json:"-"` // Never expose PIN
	CVV             string          `json:"-"` // Never expose CVV
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	ActivatedAt     *time.Time      `json:"activated_at,omitempty"`
	ExpiresAt       time.Time       `json:"expires_at"`
}

// Address represents a billing/shipping address
type Address struct {
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postal_code"`
	Country    string `json:"country"`
}

// CardTransaction represents a card transaction
type CardTransaction struct {
	ID              uuid.UUID       `json:"id"`
	CardID          uuid.UUID       `json:"card_id"`
	Type            string          `json:"type"` // purchase, withdrawal, refund, transfer
	Amount          decimal.Decimal `json:"amount"`
	Currency        string          `json:"currency"`
	MerchantName    string          `json:"merchant_name,omitempty"`
	MerchantCategory string         `json:"merchant_category,omitempty"`
	Description     string          `json:"description"`
	Status          string          `json:"status"` // pending, completed, declined, reversed
	DeclineReason   string          `json:"decline_reason,omitempty"`
	Reference       string          `json:"reference"`
	AuthCode        string          `json:"auth_code,omitempty"`
	Location        string          `json:"location,omitempty"`
	IsOnline        bool            `json:"is_online"`
	CreatedAt       time.Time       `json:"created_at"`
}

// CreateCardRequest represents a card creation request
type CreateCardRequest struct {
	CardType        CardType        `json:"card_type" binding:"required"`
	CardNetwork     CardNetwork     `json:"card_network" binding:"required"`
	AccountID       uuid.UUID       `json:"account_id" binding:"required"`
	CardholderName  string          `json:"cardholder_name" binding:"required"`
	BillingAddress  Address         `json:"billing_address" binding:"required"`
	DailyLimit      decimal.Decimal `json:"daily_limit,omitempty"`
	MonthlyLimit    decimal.Decimal `json:"monthly_limit,omitempty"`
	TransactionLimit decimal.Decimal `json:"transaction_limit,omitempty"`
}

// UpdateCardLimitsRequest represents a request to update card limits
type UpdateCardLimitsRequest struct {
	DailyLimit       *decimal.Decimal `json:"daily_limit,omitempty"`
	MonthlyLimit     *decimal.Decimal `json:"monthly_limit,omitempty"`
	TransactionLimit *decimal.Decimal `json:"transaction_limit,omitempty"`
}

// UpdateCardControlsRequest represents a request to update card controls
type UpdateCardControlsRequest struct {
	IsContactless   *bool `json:"is_contactless,omitempty"`
	IsOnlineEnabled *bool `json:"is_online_enabled,omitempty"`
	IsATMEnabled    *bool `json:"is_atm_enabled,omitempty"`
	IsPOSEnabled    *bool `json:"is_pos_enabled,omitempty"`
}

// SetPINRequest represents a PIN change request
type SetPINRequest struct {
	CurrentPIN string `json:"current_pin,omitempty"`
	NewPIN     string `json:"new_pin" binding:"required,len=4"`
}

// CardSummary represents a summary of user's cards
type CardSummary struct {
	TotalCards     int             `json:"total_cards"`
	ActiveCards    int             `json:"active_cards"`
	TotalSpentToday decimal.Decimal `json:"total_spent_today"`
	TotalSpentMonth decimal.Decimal `json:"total_spent_month"`
	Cards          []Card          `json:"cards"`
}
