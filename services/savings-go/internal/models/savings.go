package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// VaultType represents the type of savings vault
type VaultType string

const (
	VaultTypeGoal      VaultType = "goal"       // Goal-based savings
	VaultTypeFlexible  VaultType = "flexible"   // Flexible savings
	VaultTypeFixed     VaultType = "fixed"      // Fixed-term deposit
	VaultTypeRoundUp   VaultType = "round_up"   // Round-up savings
	VaultTypeEmergency VaultType = "emergency"  // Emergency fund
	VaultTypeKids      VaultType = "kids"       // Kids savings
	VaultTypeGroup     VaultType = "group"      // Group savings (Ajo/Esusu)
)

type VaultStatus string

const (
	VaultStatusActive    VaultStatus = "active"
	VaultStatusLocked    VaultStatus = "locked"
	VaultStatusCompleted VaultStatus = "completed"
	VaultStatusClosed    VaultStatus = "closed"
)

// Vault represents a savings vault
type Vault struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Name            string          `json:"name"`
	Description     string          `json:"description,omitempty"`
	Type            VaultType       `json:"type"`
	Status          VaultStatus     `json:"status"`
	Currency        string          `json:"currency"`
	
	// Balances
	Balance         decimal.Decimal `json:"balance"`
	TargetAmount    decimal.Decimal `json:"target_amount,omitempty"`
	Progress        decimal.Decimal `json:"progress"` // Percentage
	
	// Interest
	InterestRate    decimal.Decimal `json:"interest_rate"`
	AccruedInterest decimal.Decimal `json:"accrued_interest"`
	InterestPaid    decimal.Decimal `json:"interest_paid"`
	
	// Fixed term settings
	TermDays        int             `json:"term_days,omitempty"`
	MaturityDate    *time.Time      `json:"maturity_date,omitempty"`
	EarlyWithdrawalPenalty decimal.Decimal `json:"early_withdrawal_penalty,omitempty"`
	
	// Round-up settings
	RoundUpEnabled  bool            `json:"round_up_enabled"`
	RoundUpMultiplier int           `json:"round_up_multiplier"` // 1x, 2x, 5x, 10x
	
	// Auto-save settings
	AutoSaveEnabled bool            `json:"auto_save_enabled"`
	AutoSaveAmount  decimal.Decimal `json:"auto_save_amount,omitempty"`
	AutoSaveFrequency string        `json:"auto_save_frequency,omitempty"` // daily, weekly, monthly
	NextAutoSave    *time.Time      `json:"next_auto_save,omitempty"`
	
	// Goal settings
	TargetDate      *time.Time      `json:"target_date,omitempty"`
	ImageURL        string          `json:"image_url,omitempty"`
	
	// Metadata
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// VaultTransaction represents a transaction in a vault
type VaultTransaction struct {
	ID              uuid.UUID       `json:"id"`
	VaultID         uuid.UUID       `json:"vault_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            string          `json:"type"` // deposit, withdrawal, interest, round_up, auto_save
	Amount          decimal.Decimal `json:"amount"`
	BalanceAfter    decimal.Decimal `json:"balance_after"`
	Description     string          `json:"description,omitempty"`
	Reference       string          `json:"reference,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// FlexibleSavings represents a flexible savings account with tiered interest
type FlexibleSavings struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Currency        string          `json:"currency"`
	Balance         decimal.Decimal `json:"balance"`
	
	// Interest tiers (higher balance = higher rate)
	CurrentTier     int             `json:"current_tier"`
	InterestRate    decimal.Decimal `json:"interest_rate"`
	AccruedInterest decimal.Decimal `json:"accrued_interest"`
	
	// Withdrawal limits
	MonthlyWithdrawals int          `json:"monthly_withdrawals"`
	MaxMonthlyWithdrawals int       `json:"max_monthly_withdrawals"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// FixedDeposit represents a fixed-term deposit
type FixedDeposit struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Currency        string          `json:"currency"`
	Principal       decimal.Decimal `json:"principal"`
	InterestRate    decimal.Decimal `json:"interest_rate"`
	TermDays        int             `json:"term_days"`
	
	// Calculated values
	MaturityAmount  decimal.Decimal `json:"maturity_amount"`
	InterestEarned  decimal.Decimal `json:"interest_earned"`
	
	// Dates
	StartDate       time.Time       `json:"start_date"`
	MaturityDate    time.Time       `json:"maturity_date"`
	
	// Status
	Status          string          `json:"status"` // active, matured, withdrawn
	AutoRenew       bool            `json:"auto_renew"`
	
	// Early withdrawal
	EarlyWithdrawalAllowed bool     `json:"early_withdrawal_allowed"`
	EarlyWithdrawalPenalty decimal.Decimal `json:"early_withdrawal_penalty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// GroupSavings represents a group savings scheme (Ajo/Esusu/Stokvel)
type GroupSavings struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Description     string          `json:"description,omitempty"`
	CreatorID       uuid.UUID       `json:"creator_id"`
	Currency        string          `json:"currency"`
	
	// Contribution settings
	ContributionAmount decimal.Decimal `json:"contribution_amount"`
	Frequency       string          `json:"frequency"` // weekly, biweekly, monthly
	
	// Pool info
	TotalPool       decimal.Decimal `json:"total_pool"`
	CurrentRound    int             `json:"current_round"`
	TotalRounds     int             `json:"total_rounds"`
	
	// Members
	Members         []GroupMember   `json:"members"`
	MaxMembers      int             `json:"max_members"`
	
	// Payout
	PayoutOrder     []uuid.UUID     `json:"payout_order"`
	NextPayoutDate  *time.Time      `json:"next_payout_date,omitempty"`
	NextPayoutMember uuid.UUID      `json:"next_payout_member,omitempty"`
	
	// Status
	Status          string          `json:"status"` // forming, active, completed
	StartDate       *time.Time      `json:"start_date,omitempty"`
	EndDate         *time.Time      `json:"end_date,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type GroupMember struct {
	UserID          uuid.UUID       `json:"user_id"`
	Name            string          `json:"name"`
	Role            string          `json:"role"` // admin, member
	JoinedAt        time.Time       `json:"joined_at"`
	TotalContributed decimal.Decimal `json:"total_contributed"`
	PayoutReceived  bool            `json:"payout_received"`
	PayoutRound     int             `json:"payout_round,omitempty"`
}

// SalaryAdvance represents a salary advance request
type SalaryAdvance struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Amount          decimal.Decimal `json:"amount"`
	Fee             decimal.Decimal `json:"fee"`
	NetAmount       decimal.Decimal `json:"net_amount"`
	
	// Repayment
	RepaymentDate   time.Time       `json:"repayment_date"`
	RepaymentAmount decimal.Decimal `json:"repayment_amount"`
	
	// Status
	Status          string          `json:"status"` // pending, approved, disbursed, repaid, defaulted
	
	// Employer info
	EmployerID      uuid.UUID       `json:"employer_id,omitempty"`
	EmployerName    string          `json:"employer_name,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// InterestTier represents interest rate tiers
type InterestTier struct {
	MinBalance      decimal.Decimal `json:"min_balance"`
	MaxBalance      decimal.Decimal `json:"max_balance"`
	Rate            decimal.Decimal `json:"rate"`
}

// Request/Response types
type CreateVaultRequest struct {
	Name            string          `json:"name" binding:"required"`
	Description     string          `json:"description,omitempty"`
	Type            VaultType       `json:"type" binding:"required"`
	Currency        string          `json:"currency" binding:"required"`
	TargetAmount    decimal.Decimal `json:"target_amount,omitempty"`
	TargetDate      *time.Time      `json:"target_date,omitempty"`
	TermDays        int             `json:"term_days,omitempty"`
	InitialDeposit  decimal.Decimal `json:"initial_deposit,omitempty"`
	ImageURL        string          `json:"image_url,omitempty"`
}

type DepositToVaultRequest struct {
	Amount      decimal.Decimal `json:"amount" binding:"required"`
	Description string          `json:"description,omitempty"`
}

type WithdrawFromVaultRequest struct {
	Amount      decimal.Decimal `json:"amount" binding:"required"`
	Description string          `json:"description,omitempty"`
}

type SetAutoSaveRequest struct {
	Enabled     bool            `json:"enabled"`
	Amount      decimal.Decimal `json:"amount,omitempty"`
	Frequency   string          `json:"frequency,omitempty"`
}

type SetRoundUpRequest struct {
	Enabled     bool `json:"enabled"`
	Multiplier  int  `json:"multiplier,omitempty"` // 1, 2, 5, 10
}

type CreateFixedDepositRequest struct {
	Amount      decimal.Decimal `json:"amount" binding:"required"`
	Currency    string          `json:"currency" binding:"required"`
	TermDays    int             `json:"term_days" binding:"required"`
	AutoRenew   bool            `json:"auto_renew"`
}

type CreateGroupSavingsRequest struct {
	Name               string          `json:"name" binding:"required"`
	Description        string          `json:"description,omitempty"`
	Currency           string          `json:"currency" binding:"required"`
	ContributionAmount decimal.Decimal `json:"contribution_amount" binding:"required"`
	Frequency          string          `json:"frequency" binding:"required"`
	MaxMembers         int             `json:"max_members" binding:"required"`
}

type JoinGroupRequest struct {
	GroupID uuid.UUID `json:"group_id" binding:"required"`
}

type RequestSalaryAdvanceRequest struct {
	Amount decimal.Decimal `json:"amount" binding:"required"`
}
