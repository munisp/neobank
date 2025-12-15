package service

import (
	"testing"
)

func TestTransferValidation(t *testing.T) {
	tests := []struct {
		name        string
		fromAccount string
		toAccount   string
		amount      float64
		wantErr     bool
	}{
		{
			name:        "valid transfer",
			fromAccount: "ACC001",
			toAccount:   "ACC002",
			amount:      100.00,
			wantErr:     false,
		},
		{
			name:        "same account transfer",
			fromAccount: "ACC001",
			toAccount:   "ACC001",
			amount:      100.00,
			wantErr:     true,
		},
		{
			name:        "negative amount",
			fromAccount: "ACC001",
			toAccount:   "ACC002",
			amount:      -100.00,
			wantErr:     true,
		},
		{
			name:        "zero amount",
			fromAccount: "ACC001",
			toAccount:   "ACC002",
			amount:      0,
			wantErr:     true,
		},
		{
			name:        "empty from account",
			fromAccount: "",
			toAccount:   "ACC002",
			amount:      100.00,
			wantErr:     true,
		},
		{
			name:        "empty to account",
			fromAccount: "ACC001",
			toAccount:   "",
			amount:      100.00,
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTransfer(tt.fromAccount, tt.toAccount, tt.amount)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateTransfer() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func validateTransfer(fromAccount, toAccount string, amount float64) error {
	if fromAccount == "" {
		return &ValidationError{Field: "from_account", Message: "from account is required"}
	}
	if toAccount == "" {
		return &ValidationError{Field: "to_account", Message: "to account is required"}
	}
	if fromAccount == toAccount {
		return &ValidationError{Field: "to_account", Message: "cannot transfer to same account"}
	}
	if amount <= 0 {
		return &ValidationError{Field: "amount", Message: "amount must be positive"}
	}
	return nil
}

type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}

func TestAccountNumberValidation(t *testing.T) {
	tests := []struct {
		name    string
		account string
		valid   bool
	}{
		{"valid 10 digit", "1234567890", true},
		{"valid with prefix", "ACC1234567890", true},
		{"too short", "12345", false},
		{"empty", "", false},
		{"with spaces", "123 456 7890", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidAccountNumber(tt.account)
			if got != tt.valid {
				t.Errorf("isValidAccountNumber(%q) = %v, want %v", tt.account, got, tt.valid)
			}
		})
	}
}

func isValidAccountNumber(account string) bool {
	if account == "" {
		return false
	}
	if len(account) < 10 {
		return false
	}
	for _, c := range account {
		if c == ' ' {
			return false
		}
	}
	return true
}

func TestAmountFormatting(t *testing.T) {
	tests := []struct {
		amount   float64
		currency string
		expected string
	}{
		{1000.00, "NGN", "NGN 1,000.00"},
		{1234567.89, "NGN", "NGN 1,234,567.89"},
		{0.50, "NGN", "NGN 0.50"},
		{1000000.00, "USD", "USD 1,000,000.00"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			got := formatAmount(tt.amount, tt.currency)
			if got != tt.expected {
				t.Errorf("formatAmount(%v, %q) = %q, want %q", tt.amount, tt.currency, got, tt.expected)
			}
		})
	}
}

func formatAmount(amount float64, currency string) string {
	intPart := int64(amount)
	decPart := int64((amount - float64(intPart)) * 100)
	
	intStr := formatWithCommas(intPart)
	
	return currency + " " + intStr + "." + padLeft(decPart, 2)
}

func formatWithCommas(n int64) string {
	if n < 1000 {
		return intToString(n)
	}
	
	result := ""
	for n > 0 {
		if result != "" {
			result = "," + result
		}
		chunk := n % 1000
		n = n / 1000
		if n > 0 {
			result = padLeft(chunk, 3) + result
		} else {
			result = intToString(chunk) + result
		}
	}
	return result
}

func intToString(n int64) string {
	if n == 0 {
		return "0"
	}
	result := ""
	for n > 0 {
		result = string(rune('0'+n%10)) + result
		n = n / 10
	}
	return result
}

func padLeft(n int64, width int) string {
	s := intToString(n)
	for len(s) < width {
		s = "0" + s
	}
	return s
}
