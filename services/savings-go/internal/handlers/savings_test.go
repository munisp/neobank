package handlers

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestVaultInterestRateCalculation(t *testing.T) {
	tests := []struct {
		name         string
		vaultType    string
		termDays     int
		expectedRate decimal.Decimal
	}{
		{
			name:         "goal vault",
			vaultType:    "goal",
			termDays:     0,
			expectedRate: decimal.NewFromFloat(6.0),
		},
		{
			name:         "flexible vault",
			vaultType:    "flexible",
			termDays:     0,
			expectedRate: decimal.NewFromFloat(4.0),
		},
		{
			name:         "fixed 30 days",
			vaultType:    "fixed",
			termDays:     30,
			expectedRate: decimal.NewFromFloat(6.0),
		},
		{
			name:         "fixed 90 days",
			vaultType:    "fixed",
			termDays:     90,
			expectedRate: decimal.NewFromFloat(8.0),
		},
		{
			name:         "fixed 180 days",
			vaultType:    "fixed",
			termDays:     180,
			expectedRate: decimal.NewFromFloat(10.0),
		},
		{
			name:         "fixed 365 days",
			vaultType:    "fixed",
			termDays:     365,
			expectedRate: decimal.NewFromFloat(12.0),
		},
		{
			name:         "emergency vault",
			vaultType:    "emergency",
			termDays:     0,
			expectedRate: decimal.NewFromFloat(5.5),
		},
		{
			name:         "kids vault",
			vaultType:    "kids",
			termDays:     0,
			expectedRate: decimal.NewFromFloat(7.0),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getInterestRate(tt.vaultType, tt.termDays)
			if !result.Equal(tt.expectedRate) {
				t.Errorf("getInterestRate(%s, %d) = %v, want %v", tt.vaultType, tt.termDays, result, tt.expectedRate)
			}
		})
	}
}

func TestProgressCalculation(t *testing.T) {
	tests := []struct {
		name         string
		balance      decimal.Decimal
		targetAmount decimal.Decimal
		expected     decimal.Decimal
	}{
		{
			name:         "50% progress",
			balance:      decimal.NewFromFloat(5000),
			targetAmount: decimal.NewFromFloat(10000),
			expected:     decimal.NewFromFloat(50),
		},
		{
			name:         "100% progress",
			balance:      decimal.NewFromFloat(10000),
			targetAmount: decimal.NewFromFloat(10000),
			expected:     decimal.NewFromFloat(100),
		},
		{
			name:         "over 100% progress",
			balance:      decimal.NewFromFloat(15000),
			targetAmount: decimal.NewFromFloat(10000),
			expected:     decimal.NewFromFloat(150),
		},
		{
			name:         "zero balance",
			balance:      decimal.Zero,
			targetAmount: decimal.NewFromFloat(10000),
			expected:     decimal.Zero,
		},
		{
			name:         "zero target (no progress tracking)",
			balance:      decimal.NewFromFloat(5000),
			targetAmount: decimal.Zero,
			expected:     decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateProgress(tt.balance, tt.targetAmount)
			if !result.Equal(tt.expected) {
				t.Errorf("calculateProgress(%v, %v) = %v, want %v", tt.balance, tt.targetAmount, result, tt.expected)
			}
		})
	}
}

func TestMaturityAmountCalculation(t *testing.T) {
	tests := []struct {
		name         string
		principal    decimal.Decimal
		rate         decimal.Decimal
		termDays     int
		expected     decimal.Decimal
	}{
		{
			name:         "30 day fixed deposit at 6%",
			principal:    decimal.NewFromFloat(100000),
			rate:         decimal.NewFromFloat(6.0),
			termDays:     30,
			expected:     decimal.NewFromFloat(100493.15), // Approximate
		},
		{
			name:         "365 day fixed deposit at 12%",
			principal:    decimal.NewFromFloat(100000),
			rate:         decimal.NewFromFloat(12.0),
			termDays:     365,
			expected:     decimal.NewFromFloat(112000), // Simple interest for 1 year
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateMaturityAmount(tt.principal, tt.rate, tt.termDays)
			// Allow 1% tolerance for rounding differences
			diff := result.Sub(tt.expected).Abs()
			tolerance := tt.expected.Mul(decimal.NewFromFloat(0.01))
			if diff.GreaterThan(tolerance) {
				t.Errorf("calculateMaturityAmount(%v, %v, %d) = %v, want approximately %v", tt.principal, tt.rate, tt.termDays, result, tt.expected)
			}
		})
	}
}

func TestEarlyWithdrawalPenalty(t *testing.T) {
	tests := []struct {
		name        string
		amount      decimal.Decimal
		penaltyRate decimal.Decimal
		expected    decimal.Decimal
	}{
		{
			name:        "0.5% penalty on 10000",
			amount:      decimal.NewFromFloat(10000),
			penaltyRate: decimal.NewFromFloat(0.5),
			expected:    decimal.NewFromFloat(50),
		},
		{
			name:        "1% penalty on 50000",
			amount:      decimal.NewFromFloat(50000),
			penaltyRate: decimal.NewFromFloat(1.0),
			expected:    decimal.NewFromFloat(500),
		},
		{
			name:        "no penalty",
			amount:      decimal.NewFromFloat(10000),
			penaltyRate: decimal.Zero,
			expected:    decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateEarlyWithdrawalPenalty(tt.amount, tt.penaltyRate)
			if !result.Equal(tt.expected) {
				t.Errorf("calculateEarlyWithdrawalPenalty(%v, %v) = %v, want %v", tt.amount, tt.penaltyRate, result, tt.expected)
			}
		})
	}
}

func TestWithdrawalValidation(t *testing.T) {
	tests := []struct {
		name    string
		amount  decimal.Decimal
		balance decimal.Decimal
		status  string
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid withdrawal",
			amount:  decimal.NewFromFloat(5000),
			balance: decimal.NewFromFloat(10000),
			status:  "active",
			wantErr: false,
		},
		{
			name:    "insufficient balance",
			amount:  decimal.NewFromFloat(15000),
			balance: decimal.NewFromFloat(10000),
			status:  "active",
			wantErr: true,
			errMsg:  "insufficient balance",
		},
		{
			name:    "closed vault",
			amount:  decimal.NewFromFloat(5000),
			balance: decimal.NewFromFloat(10000),
			status:  "closed",
			wantErr: true,
			errMsg:  "vault is closed",
		},
		{
			name:    "zero amount",
			amount:  decimal.Zero,
			balance: decimal.NewFromFloat(10000),
			status:  "active",
			wantErr: true,
			errMsg:  "amount must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateWithdrawal(tt.amount, tt.balance, tt.status)
			if tt.wantErr {
				if err == nil {
					t.Errorf("validateWithdrawal() expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("validateWithdrawal() unexpected error: %v", err)
				}
			}
		})
	}
}

// Helper functions for testing
func getInterestRate(vaultType string, termDays int) decimal.Decimal {
	switch vaultType {
	case "goal":
		return decimal.NewFromFloat(6.0)
	case "flexible":
		return decimal.NewFromFloat(4.0)
	case "fixed":
		return getFixedDepositRate(termDays)
	case "round_up":
		return decimal.NewFromFloat(5.0)
	case "emergency":
		return decimal.NewFromFloat(5.5)
	case "kids":
		return decimal.NewFromFloat(7.0)
	default:
		return decimal.NewFromFloat(4.0)
	}
}

func getFixedDepositRate(termDays int) decimal.Decimal {
	switch {
	case termDays <= 30:
		return decimal.NewFromFloat(6.0)
	case termDays <= 90:
		return decimal.NewFromFloat(8.0)
	case termDays <= 180:
		return decimal.NewFromFloat(10.0)
	default:
		return decimal.NewFromFloat(12.0)
	}
}

func calculateProgress(balance, targetAmount decimal.Decimal) decimal.Decimal {
	if targetAmount.IsZero() {
		return decimal.Zero
	}
	return balance.Div(targetAmount).Mul(decimal.NewFromInt(100))
}

func calculateMaturityAmount(principal, rate decimal.Decimal, termDays int) decimal.Decimal {
	dailyRate := rate.Div(decimal.NewFromInt(365)).Div(decimal.NewFromInt(100))
	interest := principal.Mul(dailyRate).Mul(decimal.NewFromInt(int64(termDays)))
	return principal.Add(interest)
}

func calculateEarlyWithdrawalPenalty(amount, penaltyRate decimal.Decimal) decimal.Decimal {
	return amount.Mul(penaltyRate).Div(decimal.NewFromInt(100))
}

func validateWithdrawal(amount, balance decimal.Decimal, status string) error {
	if status == "closed" {
		return &ValidationError{msg: "vault is closed"}
	}
	if amount.LessThanOrEqual(decimal.Zero) {
		return &ValidationError{msg: "amount must be positive"}
	}
	if amount.GreaterThan(balance) {
		return &ValidationError{msg: "insufficient balance"}
	}
	return nil
}

type ValidationError struct {
	msg string
}

func (e *ValidationError) Error() string {
	return e.msg
}
