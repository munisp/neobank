package compliance

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/neobank/kyc-kyb-service/internal/config"
)

// BiometricService handles biometric verification (face match, liveness)
type BiometricService struct {
	apiKey              string
	baseURL             string
	httpClient          *http.Client
	similarityThreshold float64
}

// NewBiometricService creates a new biometric verification service
func NewBiometricService(cfg *config.ComplianceConfig) (*BiometricService, error) {
	if cfg.BiometricAPIKey == "" {
		return nil, fmt.Errorf("BIOMETRIC_API_KEY is required")
	}

	return &BiometricService{
		apiKey:              cfg.BiometricAPIKey,
		baseURL:             cfg.BiometricURL,
		similarityThreshold: 0.85,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}, nil
}

// FaceCompareRequest represents a face comparison request
type FaceCompareRequest struct {
	SourceImage         string  `json:"source_image"`
	TargetImage         string  `json:"target_image"`
	SimilarityThreshold float64 `json:"similarity_threshold"`
}

// FaceCompareResponse represents the face comparison response
type FaceCompareResponse struct {
	Similarity float64 `json:"similarity"`
	Confidence float64 `json:"confidence"`
	IsMatch    bool    `json:"is_match"`
}

// LivenessRequest represents a liveness verification request
type LivenessRequest struct {
	Video     string `json:"video"`
	CheckType string `json:"check_type"`
}

// LivenessResponse represents the liveness verification response
type LivenessResponse struct {
	IsLive     bool    `json:"is_live"`
	Confidence float64 `json:"confidence"`
}

// BiometricResult represents the result of biometric verification
type BiometricResult struct {
	FaceMatchScore  float64   `json:"face_match_score"`
	LivenessScore   float64   `json:"liveness_score"`
	IsMatch         bool      `json:"is_match"`
	IsLive          bool      `json:"is_live"`
	Verified        bool      `json:"verified"`
	VerificationRef string    `json:"verification_ref"`
	VerifiedAt      time.Time `json:"verified_at"`
}

// VerifyFaceMatch compares a selfie with an ID document photo
func (s *BiometricService) VerifyFaceMatch(ctx context.Context, selfiePath, idDocPath string) (*BiometricResult, error) {
	// Read and encode selfie
	selfieData, err := os.ReadFile(selfiePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read selfie: %w", err)
	}
	selfieBase64 := base64.StdEncoding.EncodeToString(selfieData)

	// Read and encode ID document
	idDocData, err := os.ReadFile(idDocPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read ID document: %w", err)
	}
	idDocBase64 := base64.StdEncoding.EncodeToString(idDocData)

	req := FaceCompareRequest{
		SourceImage:         selfieBase64,
		TargetImage:         idDocBase64,
		SimilarityThreshold: s.similarityThreshold,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/face/compare", bytes.NewReader(body))
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

	var compareResp FaceCompareResponse
	if err := json.NewDecoder(resp.Body).Decode(&compareResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &BiometricResult{
		FaceMatchScore: compareResp.Similarity,
		IsMatch:        compareResp.IsMatch,
		VerifiedAt:     time.Now(),
	}

	return result, nil
}

// VerifyLiveness performs liveness detection on a video
func (s *BiometricService) VerifyLiveness(ctx context.Context, videoPath string) (*BiometricResult, error) {
	// Read and encode video
	videoData, err := os.ReadFile(videoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read video: %w", err)
	}
	videoBase64 := base64.StdEncoding.EncodeToString(videoData)

	req := LivenessRequest{
		Video:     videoBase64,
		CheckType: "active",
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/liveness/verify", bytes.NewReader(body))
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

	var livenessResp LivenessResponse
	if err := json.NewDecoder(resp.Body).Decode(&livenessResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &BiometricResult{
		LivenessScore: livenessResp.Confidence,
		IsLive:        livenessResp.IsLive,
		VerifiedAt:    time.Now(),
	}

	return result, nil
}

// FullBiometricVerification performs both face match and liveness verification
func (s *BiometricService) FullBiometricVerification(ctx context.Context, selfiePath, idDocPath, videoPath string) (*BiometricResult, error) {
	// Perform face match
	faceResult, err := s.VerifyFaceMatch(ctx, selfiePath, idDocPath)
	if err != nil {
		return nil, fmt.Errorf("face match failed: %w", err)
	}

	// Perform liveness check if video provided
	if videoPath != "" {
		livenessResult, err := s.VerifyLiveness(ctx, videoPath)
		if err != nil {
			return nil, fmt.Errorf("liveness check failed: %w", err)
		}
		faceResult.LivenessScore = livenessResult.LivenessScore
		faceResult.IsLive = livenessResult.IsLive
	}

	// Determine overall verification status
	faceResult.Verified = faceResult.IsMatch && (videoPath == "" || faceResult.IsLive)

	return faceResult, nil
}
