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

// AMLService handles Anti-Money Laundering screening
type AMLService struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewAMLService creates a new AML screening service
func NewAMLService(cfg *config.ComplianceConfig) (*AMLService, error) {
	if cfg.ComplyAdvantageAPIKey == "" {
		return nil, fmt.Errorf("COMPLYADVANTAGE_API_KEY is required")
	}

	return &AMLService{
		apiKey:  cfg.ComplyAdvantageAPIKey,
		baseURL: cfg.ComplyAdvantageURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// ScreeningRequest represents a screening request to ComplyAdvantage
type ScreeningRequest struct {
	SearchTerm string            `json:"search_term"`
	Fuzziness  float64           `json:"fuzziness"`
	Filters    ScreeningFilters  `json:"filters"`
	BirthYear  int               `json:"birth_year,omitempty"`
}

type ScreeningFilters struct {
	Types        []string `json:"types"`
	CountryCodes []string `json:"country_codes,omitempty"`
}

// ScreeningResponse represents the response from ComplyAdvantage
type ScreeningResponse struct {
	Data struct {
		ID   string `json:"id"`
		Hits []Hit  `json:"hits"`
	} `json:"data"`
}

type Hit struct {
	Score float64 `json:"score"`
	Doc   struct {
		Name      string   `json:"name"`
		Types     []string `json:"types"`
		Countries []string `json:"countries"`
		Sources   []string `json:"sources"`
	} `json:"doc"`
}

// ScreenCustomer performs AML screening on a customer
func (s *AMLService) ScreenCustomer(ctx context.Context, fullName, dateOfBirth, country string) (*models.AMLScreeningResult, error) {
	// Build request
	req := ScreeningRequest{
		SearchTerm: fullName,
		Fuzziness:  0.8,
		Filters: ScreeningFilters{
			Types:        []string{"person", "sanction", "warning", "fitness-probity", "pep-class-1", "pep-class-2", "pep-class-3"},
			CountryCodes: []string{country},
		},
	}

	// Parse birth year if provided
	if dateOfBirth != "" && len(dateOfBirth) >= 4 {
		var year int
		fmt.Sscanf(dateOfBirth[:4], "%d", &year)
		if year > 0 {
			req.BirthYear = year
		}
	}

	// Make API request
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/searches", bytes.NewReader(body))
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

	var screeningResp ScreeningResponse
	if err := json.NewDecoder(resp.Body).Decode(&screeningResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Process results
	result := &models.AMLScreeningResult{
		Provider:    "ComplyAdvantage",
		ReferenceID: screeningResp.Data.ID,
		ScreenedAt:  time.Now(),
	}

	// Analyze matches
	var maxScore float64
	var pepMatch, sanctionsMatch, adverseMedia bool
	matches := make([]models.ScreeningMatch, 0)

	for _, hit := range screeningResp.Data.Hits {
		if hit.Score > maxScore {
			maxScore = hit.Score
		}

		match := models.ScreeningMatch{
			Name:       hit.Doc.Name,
			MatchScore: hit.Score,
			Sources:    hit.Doc.Sources,
			Countries:  hit.Doc.Countries,
		}

		// Check match types
		for _, t := range hit.Doc.Types {
			match.MatchType = t
			switch t {
			case "pep-class-1", "pep-class-2", "pep-class-3", "pep-class-4":
				if hit.Score > 0.7 {
					pepMatch = true
				}
			case "sanction":
				if hit.Score > 0.7 {
					sanctionsMatch = true
				}
			case "adverse-media", "adverse-media-financial-crime":
				if hit.Score > 0.7 {
					adverseMedia = true
				}
			}
		}

		matches = append(matches, match)
	}

	result.PEPMatch = pepMatch
	result.SanctionsMatch = sanctionsMatch
	result.AdverseMedia = adverseMedia
	result.MatchDetails = matches

	// Calculate risk score (0-100)
	result.RiskScore = maxScore * 100

	// Determine risk level
	switch {
	case sanctionsMatch:
		result.RiskLevel = models.RiskLevelCritical
	case result.RiskScore > 90:
		result.RiskLevel = models.RiskLevelCritical
	case result.RiskScore > 70:
		result.RiskLevel = models.RiskLevelHigh
	case result.RiskScore > 50:
		result.RiskLevel = models.RiskLevelMedium
	default:
		result.RiskLevel = models.RiskLevelLow
	}

	return result, nil
}

// ScreenBusiness performs AML screening on a business
func (s *AMLService) ScreenBusiness(ctx context.Context, businessName, registrationNumber, country string) (*models.AMLScreeningResult, error) {
	req := ScreeningRequest{
		SearchTerm: businessName,
		Fuzziness:  0.7,
		Filters: ScreeningFilters{
			Types:        []string{"company", "sanction", "warning", "fitness-probity"},
			CountryCodes: []string{country},
		},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/searches", bytes.NewReader(body))
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

	var screeningResp ScreeningResponse
	if err := json.NewDecoder(resp.Body).Decode(&screeningResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &models.AMLScreeningResult{
		Provider:    "ComplyAdvantage",
		ReferenceID: screeningResp.Data.ID,
		ScreenedAt:  time.Now(),
	}

	var maxScore float64
	var sanctionsMatch, adverseMedia bool
	matches := make([]models.ScreeningMatch, 0)

	for _, hit := range screeningResp.Data.Hits {
		if hit.Score > maxScore {
			maxScore = hit.Score
		}

		match := models.ScreeningMatch{
			Name:       hit.Doc.Name,
			MatchScore: hit.Score,
			Sources:    hit.Doc.Sources,
			Countries:  hit.Doc.Countries,
		}

		for _, t := range hit.Doc.Types {
			match.MatchType = t
			if t == "sanction" && hit.Score > 0.7 {
				sanctionsMatch = true
			}
			if (t == "adverse-media" || t == "adverse-media-financial-crime") && hit.Score > 0.7 {
				adverseMedia = true
			}
		}

		matches = append(matches, match)
	}

	result.SanctionsMatch = sanctionsMatch
	result.AdverseMedia = adverseMedia
	result.MatchDetails = matches
	result.RiskScore = maxScore * 100

	switch {
	case sanctionsMatch:
		result.RiskLevel = models.RiskLevelCritical
	case result.RiskScore > 90:
		result.RiskLevel = models.RiskLevelCritical
	case result.RiskScore > 70:
		result.RiskLevel = models.RiskLevelHigh
	case result.RiskScore > 50:
		result.RiskLevel = models.RiskLevelMedium
	default:
		result.RiskLevel = models.RiskLevelLow
	}

	return result, nil
}
