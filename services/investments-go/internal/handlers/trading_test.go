package handlers

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestOrderValidation(t *testing.T) {
	tests := []struct {
		name        string
		quantity    decimal.Decimal
		price       decimal.Decimal
		buyingPower decimal.Decimal
		wantErr     bool
		errMsg      string
	}{
		{
			name:        "valid buy order",
			quantity:    decimal.NewFromFloat(10),
			price:       decimal.NewFromFloat(100),
			buyingPower: decimal.NewFromFloat(2000),
			wantErr:     false,
		},
		{
			name:        "insufficient buying power",
			quantity:    decimal.NewFromFloat(100),
			price:       decimal.NewFromFloat(100),
			buyingPower: decimal.NewFromFloat(5000),
			wantErr:     true,
			errMsg:      "insufficient buying power",
		},
		{
			name:        "zero quantity",
			quantity:    decimal.Zero,
			price:       decimal.NewFromFloat(100),
			buyingPower: decimal.NewFromFloat(10000),
			wantErr:     true,
			errMsg:      "quantity must be positive",
		},
		{
			name:        "negative price",
			quantity:    decimal.NewFromFloat(10),
			price:       decimal.NewFromFloat(-100),
			buyingPower: decimal.NewFromFloat(10000),
			wantErr:     true,
			errMsg:      "price must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateBuyOrder(tt.quantity, tt.price, tt.buyingPower)
			if tt.wantErr {
				if err == nil {
					t.Errorf("validateBuyOrder() expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("validateBuyOrder() unexpected error: %v", err)
				}
			}
		})
	}
}

func TestCommissionCalculation(t *testing.T) {
	tests := []struct {
		name           string
		orderValue     decimal.Decimal
		commissionRate float64
		expected       decimal.Decimal
	}{
		{
			name:           "stock commission 0.5%",
			orderValue:     decimal.NewFromFloat(10000),
			commissionRate: 0.005,
			expected:       decimal.NewFromFloat(50),
		},
		{
			name:           "ETF commission 0.3%",
			orderValue:     decimal.NewFromFloat(5000),
			commissionRate: 0.003,
			expected:       decimal.NewFromFloat(15),
		},
		{
			name:           "zero order value",
			orderValue:     decimal.Zero,
			commissionRate: 0.005,
			expected:       decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateCommission(tt.orderValue, tt.commissionRate)
			if !result.Equal(tt.expected) {
				t.Errorf("calculateCommission() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestPortfolioValueCalculation(t *testing.T) {
	tests := []struct {
		name        string
		cashBalance decimal.Decimal
		holdings    []holdingValue
		expected    decimal.Decimal
	}{
		{
			name:        "cash only",
			cashBalance: decimal.NewFromFloat(10000),
			holdings:    []holdingValue{},
			expected:    decimal.NewFromFloat(10000),
		},
		{
			name:        "cash plus holdings",
			cashBalance: decimal.NewFromFloat(5000),
			holdings: []holdingValue{
				{marketValue: decimal.NewFromFloat(3000)},
				{marketValue: decimal.NewFromFloat(2000)},
			},
			expected: decimal.NewFromFloat(10000),
		},
		{
			name:        "holdings only",
			cashBalance: decimal.Zero,
			holdings: []holdingValue{
				{marketValue: decimal.NewFromFloat(7500)},
			},
			expected: decimal.NewFromFloat(7500),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculatePortfolioValue(tt.cashBalance, tt.holdings)
			if !result.Equal(tt.expected) {
				t.Errorf("calculatePortfolioValue() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestGainCalculation(t *testing.T) {
	tests := []struct {
		name          string
		currentValue  decimal.Decimal
		totalCost     decimal.Decimal
		expectedGain  decimal.Decimal
		expectedPct   decimal.Decimal
	}{
		{
			name:          "positive gain",
			currentValue:  decimal.NewFromFloat(12000),
			totalCost:     decimal.NewFromFloat(10000),
			expectedGain:  decimal.NewFromFloat(2000),
			expectedPct:   decimal.NewFromFloat(20),
		},
		{
			name:          "negative gain (loss)",
			currentValue:  decimal.NewFromFloat(8000),
			totalCost:     decimal.NewFromFloat(10000),
			expectedGain:  decimal.NewFromFloat(-2000),
			expectedPct:   decimal.NewFromFloat(-20),
		},
		{
			name:          "no change",
			currentValue:  decimal.NewFromFloat(10000),
			totalCost:     decimal.NewFromFloat(10000),
			expectedGain:  decimal.Zero,
			expectedPct:   decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gain, pct := calculateGain(tt.currentValue, tt.totalCost)
			if !gain.Equal(tt.expectedGain) {
				t.Errorf("calculateGain() gain = %v, want %v", gain, tt.expectedGain)
			}
			if !pct.Equal(tt.expectedPct) {
				t.Errorf("calculateGain() pct = %v, want %v", pct, tt.expectedPct)
			}
		})
	}
}

// Helper types and functions for testing
type holdingValue struct {
	marketValue decimal.Decimal
}

func validateBuyOrder(quantity, price, buyingPower decimal.Decimal) error {
	if quantity.LessThanOrEqual(decimal.Zero) {
		return &ValidationError{msg: "quantity must be positive"}
	}
	if price.LessThanOrEqual(decimal.Zero) {
		return &ValidationError{msg: "price must be positive"}
	}
	totalCost := quantity.Mul(price)
	if totalCost.GreaterThan(buyingPower) {
		return &ValidationError{msg: "insufficient buying power"}
	}
	return nil
}

func calculateCommission(orderValue decimal.Decimal, rate float64) decimal.Decimal {
	return orderValue.Mul(decimal.NewFromFloat(rate))
}

func calculatePortfolioValue(cashBalance decimal.Decimal, holdings []holdingValue) decimal.Decimal {
	total := cashBalance
	for _, h := range holdings {
		total = total.Add(h.marketValue)
	}
	return total
}

func calculateGain(currentValue, totalCost decimal.Decimal) (decimal.Decimal, decimal.Decimal) {
	gain := currentValue.Sub(totalCost)
	var pct decimal.Decimal
	if !totalCost.IsZero() {
		pct = gain.Div(totalCost).Mul(decimal.NewFromInt(100))
	}
	return gain, pct
}

type ValidationError struct {
	msg string
}

func (e *ValidationError) Error() string {
	return e.msg
}
