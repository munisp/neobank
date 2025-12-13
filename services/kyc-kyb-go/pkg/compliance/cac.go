package compliance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/neobank/kyc-kyb-service/internal/config"
	"github.com/neobank/kyc-kyb-service/internal/models"
)

// CACService handles Corporate Affairs Commission (Nigeria) verification
type CACService struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewCACService creates a new CAC verification service
func NewCACService(cfg *config.ComplianceConfig) (*CACService, error) {
	if cfg.CACVerificationAPIKey == "" {
		return nil, fmt.Errorf("CAC_API_KEY is required")
	}

	return &CACService{
		apiKey:  cfg.CACVerificationAPIKey,
		baseURL: cfg.CACVerificationURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// CACVerificationRequest represents a CAC verification request
type CACVerificationRequest struct {
	RCNumber string `json:"rc_number"`
}

// CACVerificationResponse represents the CAC verification response
type CACVerificationResponse struct {
	Success bool `json:"success"`
	Data    struct {
		CompanyName      string `json:"company_name"`
		RCNumber         string `json:"rc_number"`
		RegistrationDate string `json:"registration_date"`
		CompanyType      string `json:"company_type"`
		Status           string `json:"status"`
		Address          string `json:"address"`
		Directors        []struct {
			Name     string `json:"name"`
			Position string `json:"position"`
		} `json:"directors"`
		ShareCapital     float64 `json:"share_capital"`
		BusinessActivity string  `json:"business_activity"`
	} `json:"data"`
	ReferenceID string `json:"reference_id"`
}

// VerifyBusiness verifies a business with CAC using RC number
func (s *CACService) VerifyBusiness(ctx context.Context, rcNumber string) (*models.CACVerification, error) {
	req := CACVerificationRequest{
		RCNumber: rcNumber,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/company/verify", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+s.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var cacResp CACVerificationResponse
	if err := json.NewDecoder(resp.Body).Decode(&cacResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Build result
	result := &models.CACVerification{
		Verified:         cacResp.Success && cacResp.Data.Status == "ACTIVE",
		CompanyName:      cacResp.Data.CompanyName,
		RCNumber:         cacResp.Data.RCNumber,
		RegistrationDate: cacResp.Data.RegistrationDate,
		CompanyType:      cacResp.Data.CompanyType,
		Status:           cacResp.Data.Status,
		Address:          cacResp.Data.Address,
		Provider:         "CAC Nigeria",
		ReferenceID:      cacResp.ReferenceID,
		VerifiedAt:       time.Now(),
	}

	// Convert directors
	directors := make([]models.Director, len(cacResp.Data.Directors))
	for i, d := range cacResp.Data.Directors {
		directors[i] = models.Director{
			Name:     d.Name,
			Position: d.Position,
		}
	}
	result.Directors = directors

	return result, nil
}

// VerifyTIN verifies a Tax Identification Number
func (s *CACService) VerifyTIN(ctx context.Context, tin string) (bool, error) {
	req := map[string]string{"tin": tin}

	body, err := json.Marshal(req)
	if err != nil {
		return false, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/tin/verify", bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+s.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return false, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil
	}

	var tinResp struct {
		Valid bool `json:"valid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tinResp); err != nil {
		return false, fmt.Errorf("failed to decode response: %w", err)
	}

	return tinResp.Valid, nil
}
