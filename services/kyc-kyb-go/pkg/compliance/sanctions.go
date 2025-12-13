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
)

// SanctionsService handles sanctions screening against OFAC, UN, EU, UK lists
type SanctionsService struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewSanctionsService creates a new sanctions screening service
func NewSanctionsService(cfg *config.ComplianceConfig) (*SanctionsService, error) {
	if cfg.SanctionsAPIKey == "" {
		return nil, fmt.Errorf("SANCTIONS_API_KEY is required")
	}

	return &SanctionsService{
		apiKey:  cfg.SanctionsAPIKey,
		baseURL: cfg.SanctionsURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// SanctionsScreeningRequest represents a sanctions screening request
type SanctionsScreeningRequest struct {
	Name        string   `json:"name"`
	Country     string   `json:"country,omitempty"`
	DateOfBirth string   `json:"date_of_birth,omitempty"`
	Sources     []string `json:"sources"`
}

// SanctionsScreeningResponse represents the sanctions screening response
type SanctionsScreeningResponse struct {
	ReferenceID string           `json:"reference_id"`
	Matches     []SanctionsMatch `json:"matches"`
}

// SanctionsMatch represents a single sanctions match
type SanctionsMatch struct {
	Name       string   `json:"name"`
	Source     string   `json:"source"`
	MatchScore float64  `json:"match_score"`
	ListType   string   `json:"list_type"`
	Countries  []string `json:"countries"`
	Programs   []string `json:"programs"`
}

// SanctionsResult represents the result of sanctions screening
type SanctionsResult struct {
	IsSanctioned    bool             `json:"is_sanctioned"`
	SanctionedLists []string         `json:"sanctioned_lists"`
	Matches         []SanctionsMatch `json:"matches"`
	ReferenceID     string           `json:"reference_id"`
	ScreenedAt      time.Time        `json:"screened_at"`
}

// ScreenPerson screens a person against sanctions lists
func (s *SanctionsService) ScreenPerson(ctx context.Context, fullName, dateOfBirth, country string) (*SanctionsResult, error) {
	req := SanctionsScreeningRequest{
		Name:        fullName,
		Country:     country,
		DateOfBirth: dateOfBirth,
		Sources:     []string{"OFAC", "UN", "EU", "UK_HMT"},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/sanctions/search", bytes.NewReader(body))
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

	var screeningResp SanctionsScreeningResponse
	if err := json.NewDecoder(resp.Body).Decode(&screeningResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &SanctionsResult{
		ReferenceID: screeningResp.ReferenceID,
		Matches:     screeningResp.Matches,
		ScreenedAt:  time.Now(),
	}

	// Check for high-confidence matches
	sanctionedLists := make(map[string]bool)
	for _, match := range screeningResp.Matches {
		if match.MatchScore > 0.85 {
			result.IsSanctioned = true
			sanctionedLists[match.Source] = true
		}
	}

	for list := range sanctionedLists {
		result.SanctionedLists = append(result.SanctionedLists, list)
	}

	return result, nil
}

// ScreenBusiness screens a business against sanctions lists
func (s *SanctionsService) ScreenBusiness(ctx context.Context, businessName, registrationNumber, country string) (*SanctionsResult, error) {
	req := SanctionsScreeningRequest{
		Name:    businessName,
		Country: country,
		Sources: []string{"OFAC", "UN", "EU", "UK_HMT"},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/sanctions/search", bytes.NewReader(body))
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

	var screeningResp SanctionsScreeningResponse
	if err := json.NewDecoder(resp.Body).Decode(&screeningResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &SanctionsResult{
		ReferenceID: screeningResp.ReferenceID,
		Matches:     screeningResp.Matches,
		ScreenedAt:  time.Now(),
	}

	sanctionedLists := make(map[string]bool)
	for _, match := range screeningResp.Matches {
		if match.MatchScore > 0.85 {
			result.IsSanctioned = true
			sanctionedLists[match.Source] = true
		}
	}

	for list := range sanctionedLists {
		result.SanctionedLists = append(result.SanctionedLists, list)
	}

	return result, nil
}
