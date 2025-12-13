package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// AccountType represents the type of account
type AccountType string

const (
	AccountTypePersonal AccountType = "personal"
	AccountTypeJoint    AccountType = "joint"
	AccountTypeKids     AccountType = "kids"
	AccountTypeBusiness AccountType = "business"
)

type AccountStatus string

const (
	AccountStatusActive    AccountStatus = "active"
	AccountStatusPending   AccountStatus = "pending"
	AccountStatusFrozen    AccountStatus = "frozen"
	AccountStatusClosed    AccountStatus = "closed"
)

// Account represents a bank account
type Account struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            AccountType     `json:"type"`
	Status          AccountStatus   `json:"status"`
	AccountNumber   string          `json:"account_number"`
	Currency        string          `json:"currency"`
	Balance         decimal.Decimal `json:"balance"`
	AvailableBalance decimal.Decimal `json:"available_balance"`
	
	// Account details
	Name            string          `json:"name"`
	Nickname        string          `json:"nickname,omitempty"`
	
	// For joint accounts
	JointDetails    *JointAccountDetails `json:"joint_details,omitempty"`
	
	// For kids accounts
	KidsDetails     *KidsAccountDetails  `json:"kids_details,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// JointAccount represents a joint account with multiple owners
type JointAccountDetails struct {
	Owners          []JointOwner    `json:"owners"`
	RequireAllApproval bool         `json:"require_all_approval"`
	SpendingLimit   decimal.Decimal `json:"spending_limit,omitempty"`
}

type JointOwner struct {
	UserID          uuid.UUID       `json:"user_id"`
	Name            string          `json:"name"`
	Email           string          `json:"email"`
	Phone           string          `json:"phone,omitempty"`
	Role            string          `json:"role"` // primary, secondary
	Status          string          `json:"status"` // pending, accepted, declined
	JoinedAt        *time.Time      `json:"joined_at,omitempty"`
	Permissions     []string        `json:"permissions"`
}

// KidsAccount represents a kids/junior account
type KidsAccountDetails struct {
	ChildName       string          `json:"child_name"`
	ChildDOB        time.Time       `json:"child_dob"`
	ParentID        uuid.UUID       `json:"parent_id"`
	ParentName      string          `json:"parent_name"`
	
	// Spending controls
	SpendingLimit   decimal.Decimal `json:"spending_limit"`
	DailyLimit      decimal.Decimal `json:"daily_limit"`
	WeeklyLimit     decimal.Decimal `json:"weekly_limit"`
	MonthlyLimit    decimal.Decimal `json:"monthly_limit"`
	
	// Category restrictions
	AllowedCategories []string      `json:"allowed_categories"`
	BlockedCategories []string      `json:"blocked_categories"`
	BlockedMerchants  []string      `json:"blocked_merchants"`
	
	// Notifications
	NotifyOnSpend   bool            `json:"notify_on_spend"`
	NotifyThreshold decimal.Decimal `json:"notify_threshold"`
	
	// Tasks and rewards
	Tasks           []KidsTask      `json:"tasks,omitempty"`
	TotalEarned     decimal.Decimal `json:"total_earned"`
}

type KidsTask struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	Description     string          `json:"description,omitempty"`
	Reward          decimal.Decimal `json:"reward"`
	DueDate         *time.Time      `json:"due_date,omitempty"`
	Status          string          `json:"status"` // pending, completed, approved, rejected
	CompletedAt     *time.Time      `json:"completed_at,omitempty"`
	ApprovedAt      *time.Time      `json:"approved_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// AccountInvitation represents an invitation to join a joint account
type AccountInvitation struct {
	ID              uuid.UUID       `json:"id"`
	AccountID       uuid.UUID       `json:"account_id"`
	InviterID       uuid.UUID       `json:"inviter_id"`
	InviterName     string          `json:"inviter_name"`
	InviteeEmail    string          `json:"invitee_email"`
	InviteeName     string          `json:"invitee_name,omitempty"`
	Status          string          `json:"status"` // pending, accepted, declined, expired
	ExpiresAt       time.Time       `json:"expires_at"`
	CreatedAt       time.Time       `json:"created_at"`
}

// SpendingControl represents spending controls for an account
type SpendingControl struct {
	ID              uuid.UUID       `json:"id"`
	AccountID       uuid.UUID       `json:"account_id"`
	Type            string          `json:"type"` // daily, weekly, monthly, per_transaction
	Limit           decimal.Decimal `json:"limit"`
	CurrentSpend    decimal.Decimal `json:"current_spend"`
	ResetAt         time.Time       `json:"reset_at"`
	IsActive        bool            `json:"is_active"`
}

// Request/Response types
type CreateJointAccountRequest struct {
	Name            string          `json:"name" binding:"required"`
	Currency        string          `json:"currency" binding:"required"`
	InviteeEmail    string          `json:"invitee_email" binding:"required"`
	InviteeName     string          `json:"invitee_name,omitempty"`
	RequireAllApproval bool         `json:"require_all_approval"`
}

type CreateKidsAccountRequest struct {
	ChildName       string          `json:"child_name" binding:"required"`
	ChildDOB        time.Time       `json:"child_dob" binding:"required"`
	Currency        string          `json:"currency" binding:"required"`
	InitialDeposit  decimal.Decimal `json:"initial_deposit,omitempty"`
	DailyLimit      decimal.Decimal `json:"daily_limit,omitempty"`
	WeeklyLimit     decimal.Decimal `json:"weekly_limit,omitempty"`
	MonthlyLimit    decimal.Decimal `json:"monthly_limit,omitempty"`
}

type InviteToJointAccountRequest struct {
	Email           string          `json:"email" binding:"required"`
	Name            string          `json:"name,omitempty"`
}

type RespondToInvitationRequest struct {
	Accept          bool            `json:"accept"`
}

type SetSpendingLimitRequest struct {
	Type            string          `json:"type" binding:"required"`
	Limit           decimal.Decimal `json:"limit" binding:"required"`
}

type CreateTaskRequest struct {
	Name            string          `json:"name" binding:"required"`
	Description     string          `json:"description,omitempty"`
	Reward          decimal.Decimal `json:"reward" binding:"required"`
	DueDate         *time.Time      `json:"due_date,omitempty"`
}

type CompleteTaskRequest struct {
	TaskID          uuid.UUID       `json:"task_id" binding:"required"`
}

type ApproveTaskRequest struct {
	TaskID          uuid.UUID       `json:"task_id" binding:"required"`
	Approved        bool            `json:"approved"`
}

type TransferToKidsRequest struct {
	Amount          decimal.Decimal `json:"amount" binding:"required"`
	Description     string          `json:"description,omitempty"`
}

type SetCategoryRestrictionsRequest struct {
	AllowedCategories []string      `json:"allowed_categories,omitempty"`
	BlockedCategories []string      `json:"blocked_categories,omitempty"`
	BlockedMerchants  []string      `json:"blocked_merchants,omitempty"`
}
