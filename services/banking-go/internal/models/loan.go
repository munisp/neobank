package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// LoanStatus represents the status of a loan application
type LoanStatus string

const (
	LoanStatusPending     LoanStatus = "pending"
	LoanStatusUnderReview LoanStatus = "under_review"
	LoanStatusApproved    LoanStatus = "approved"
	LoanStatusRejected    LoanStatus = "rejected"
	LoanStatusDisbursed   LoanStatus = "disbursed"
	LoanStatusActive      LoanStatus = "active"
	LoanStatusPaidOff     LoanStatus = "paid_off"
	LoanStatusDefaulted   LoanStatus = "defaulted"
)

// LoanType represents the type of loan
type LoanType string

const (
	LoanTypePersonal   LoanType = "personal"
	LoanTypeBusiness   LoanType = "business"
	LoanTypeMortgage   LoanType = "mortgage"
	LoanTypeAuto       LoanType = "auto"
	LoanTypeEducation  LoanType = "education"
	LoanTypeEmergency  LoanType = "emergency"
)

// LoanApplication represents a loan application
type LoanApplication struct {
	ID                uuid.UUID       `json:"id"`
	UserID            uuid.UUID       `json:"user_id"`
	LoanType          LoanType        `json:"loan_type"`
	Amount            decimal.Decimal `json:"amount"`
	Currency          string          `json:"currency"`
	TermMonths        int             `json:"term_months"`
	InterestRate      decimal.Decimal `json:"interest_rate"`
	Purpose           string          `json:"purpose"`
	Status            LoanStatus      `json:"status"`
	ApprovedAmount    decimal.Decimal `json:"approved_amount,omitempty"`
	MonthlyPayment    decimal.Decimal `json:"monthly_payment,omitempty"`
	TotalInterest     decimal.Decimal `json:"total_interest,omitempty"`
	TotalRepayment    decimal.Decimal `json:"total_repayment,omitempty"`
	CreditScore       int             `json:"credit_score,omitempty"`
	RiskScore         decimal.Decimal `json:"risk_score,omitempty"`
	CollateralType    string          `json:"collateral_type,omitempty"`
	CollateralValue   decimal.Decimal `json:"collateral_value,omitempty"`
	EmploymentStatus  string          `json:"employment_status"`
	MonthlyIncome     decimal.Decimal `json:"monthly_income"`
	ExistingDebts     decimal.Decimal `json:"existing_debts"`
	DebtToIncomeRatio decimal.Decimal `json:"debt_to_income_ratio,omitempty"`
	ReviewNotes       string          `json:"review_notes,omitempty"`
	RejectionReason   string          `json:"rejection_reason,omitempty"`
	DisbursementDate  *time.Time      `json:"disbursement_date,omitempty"`
	FirstPaymentDate  *time.Time      `json:"first_payment_date,omitempty"`
	MaturityDate      *time.Time      `json:"maturity_date,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// LoanRepayment represents a loan repayment record
type LoanRepayment struct {
	ID            uuid.UUID       `json:"id"`
	LoanID        uuid.UUID       `json:"loan_id"`
	PaymentNumber int             `json:"payment_number"`
	DueDate       time.Time       `json:"due_date"`
	PrincipalDue  decimal.Decimal `json:"principal_due"`
	InterestDue   decimal.Decimal `json:"interest_due"`
	TotalDue      decimal.Decimal `json:"total_due"`
	PrincipalPaid decimal.Decimal `json:"principal_paid"`
	InterestPaid  decimal.Decimal `json:"interest_paid"`
	TotalPaid     decimal.Decimal `json:"total_paid"`
	LateFee       decimal.Decimal `json:"late_fee"`
	Status        string          `json:"status"` // pending, paid, overdue, partial
	PaidAt        *time.Time      `json:"paid_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
}

// LoanSchedule represents the full repayment schedule
type LoanSchedule struct {
	LoanID           uuid.UUID       `json:"loan_id"`
	TotalPayments    int             `json:"total_payments"`
	MonthlyPayment   decimal.Decimal `json:"monthly_payment"`
	TotalPrincipal   decimal.Decimal `json:"total_principal"`
	TotalInterest    decimal.Decimal `json:"total_interest"`
	TotalRepayment   decimal.Decimal `json:"total_repayment"`
	Payments         []LoanRepayment `json:"payments"`
	OutstandingBalance decimal.Decimal `json:"outstanding_balance"`
	NextPaymentDate  *time.Time      `json:"next_payment_date,omitempty"`
	NextPaymentAmount decimal.Decimal `json:"next_payment_amount,omitempty"`
}

// CreateLoanRequest represents a loan application request
type CreateLoanRequest struct {
	LoanType         LoanType        `json:"loan_type" binding:"required"`
	Amount           decimal.Decimal `json:"amount" binding:"required"`
	Currency         string          `json:"currency" binding:"required"`
	TermMonths       int             `json:"term_months" binding:"required,min=1,max=360"`
	Purpose          string          `json:"purpose" binding:"required"`
	CollateralType   string          `json:"collateral_type,omitempty"`
	CollateralValue  decimal.Decimal `json:"collateral_value,omitempty"`
	EmploymentStatus string          `json:"employment_status" binding:"required"`
	MonthlyIncome    decimal.Decimal `json:"monthly_income" binding:"required"`
	ExistingDebts    decimal.Decimal `json:"existing_debts"`
}

// LoanDecisionRequest represents a loan approval/rejection request
type LoanDecisionRequest struct {
	Decision        string          `json:"decision" binding:"required,oneof=approve reject"`
	ApprovedAmount  decimal.Decimal `json:"approved_amount,omitempty"`
	InterestRate    decimal.Decimal `json:"interest_rate,omitempty"`
	Notes           string          `json:"notes,omitempty"`
	RejectionReason string          `json:"rejection_reason,omitempty"`
}

// MakePaymentRequest represents a loan payment request
type MakePaymentRequest struct {
	Amount        decimal.Decimal `json:"amount" binding:"required"`
	PaymentMethod string          `json:"payment_method" binding:"required"`
	Reference     string          `json:"reference,omitempty"`
}

// LoanSummary represents a summary of user's loans
type LoanSummary struct {
	TotalLoans          int             `json:"total_loans"`
	ActiveLoans         int             `json:"active_loans"`
	TotalBorrowed       decimal.Decimal `json:"total_borrowed"`
	TotalOutstanding    decimal.Decimal `json:"total_outstanding"`
	TotalPaid           decimal.Decimal `json:"total_paid"`
	NextPaymentDate     *time.Time      `json:"next_payment_date,omitempty"`
	NextPaymentAmount   decimal.Decimal `json:"next_payment_amount,omitempty"`
	OverduePayments     int             `json:"overdue_payments"`
	OverdueAmount       decimal.Decimal `json:"overdue_amount"`
}
