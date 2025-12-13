package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// TOTPConfig holds TOTP configuration
type TOTPConfig struct {
	Issuer     string
	AccountName string
	SecretSize int
	Period     int // Time step in seconds (default 30)
	Digits     int // Number of digits (default 6)
}

// DefaultTOTPConfig returns default TOTP configuration
func DefaultTOTPConfig() TOTPConfig {
	return TOTPConfig{
		Issuer:     "NeoBank",
		SecretSize: 20,
		Period:     30,
		Digits:     6,
	}
}

// TOTPService provides TOTP-based two-factor authentication
type TOTPService struct {
	config TOTPConfig
}

// NewTOTPService creates a new TOTP service
func NewTOTPService(config TOTPConfig) *TOTPService {
	if config.Period == 0 {
		config.Period = 30
	}
	if config.Digits == 0 {
		config.Digits = 6
	}
	if config.SecretSize == 0 {
		config.SecretSize = 20
	}
	return &TOTPService{config: config}
}

// GenerateSecret generates a new TOTP secret
func (s *TOTPService) GenerateSecret() (string, error) {
	secret := make([]byte, s.config.SecretSize)
	_, err := rand.Read(secret)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret), nil
}

// GenerateCode generates a TOTP code for the given secret and time
func (s *TOTPService) GenerateCode(secret string, t time.Time) (string, error) {
	// Decode the secret
	secretBytes, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return "", fmt.Errorf("failed to decode secret: %w", err)
	}

	// Calculate the counter (time step)
	counter := uint64(t.Unix()) / uint64(s.config.Period)

	// Generate HOTP
	code := s.hotp(secretBytes, counter)

	// Format with leading zeros
	return fmt.Sprintf("%0*d", s.config.Digits, code), nil
}

// ValidateCode validates a TOTP code against the secret
// It checks the current time step and one step before/after for clock drift tolerance
func (s *TOTPService) ValidateCode(secret, code string) bool {
	now := time.Now()

	// Check current time step and adjacent steps for clock drift tolerance
	for _, offset := range []int{-1, 0, 1} {
		t := now.Add(time.Duration(offset*s.config.Period) * time.Second)
		expectedCode, err := s.GenerateCode(secret, t)
		if err != nil {
			continue
		}
		if hmac.Equal([]byte(expectedCode), []byte(code)) {
			return true
		}
	}

	return false
}

// GetProvisioningURI generates a URI for QR code generation
func (s *TOTPService) GetProvisioningURI(secret, accountName string) string {
	return fmt.Sprintf(
		"otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d",
		s.config.Issuer,
		accountName,
		secret,
		s.config.Issuer,
		s.config.Digits,
		s.config.Period,
	)
}

// hotp generates an HOTP code using HMAC-SHA1
func (s *TOTPService) hotp(secret []byte, counter uint64) int {
	// Convert counter to bytes (big-endian)
	counterBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(counterBytes, counter)

	// Generate HMAC-SHA1
	h := hmac.New(sha1.New, secret)
	h.Write(counterBytes)
	hash := h.Sum(nil)

	// Dynamic truncation
	offset := hash[len(hash)-1] & 0x0f
	truncatedHash := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7fffffff

	// Get the specified number of digits
	mod := uint32(1)
	for i := 0; i < s.config.Digits; i++ {
		mod *= 10
	}

	return int(truncatedHash % mod)
}

// GenerateBackupCodes generates a set of backup codes for account recovery
func (s *TOTPService) GenerateBackupCodes(count int) ([]string, error) {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		code := make([]byte, 4)
		_, err := rand.Read(code)
		if err != nil {
			return nil, fmt.Errorf("failed to generate backup code: %w", err)
		}
		// Format as 8-character alphanumeric code
		codes[i] = fmt.Sprintf("%08X", binary.BigEndian.Uint32(code))
	}
	return codes, nil
}

// HashBackupCode hashes a backup code for storage
func (s *TOTPService) HashBackupCode(code string) string {
	h := sha1.New()
	h.Write([]byte(code))
	return fmt.Sprintf("%x", h.Sum(nil))
}

// ValidateBackupCode validates a backup code against stored hashes
func (s *TOTPService) ValidateBackupCode(code string, hashedCodes []string) (bool, int) {
	hashedInput := s.HashBackupCode(code)
	for i, hashedCode := range hashedCodes {
		if hmac.Equal([]byte(hashedInput), []byte(hashedCode)) {
			return true, i
		}
	}
	return false, -1
}
