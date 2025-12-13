package compliance

import (
	"time"

	"github.com/neobank/kyc-kyb-service/internal/models"
)

// RiskScoringService handles multi-factor risk assessment
type RiskScoringService struct {
	industryRiskMapping map[string]float64
	countryRiskScores   map[string]float64
}

// NewRiskScoringService creates a new risk scoring service
func NewRiskScoringService() *RiskScoringService {
	return &RiskScoringService{
		industryRiskMapping: loadIndustryRiskMapping(),
		countryRiskScores:   loadCountryRiskScores(),
	}
}

// RiskWeights defines the weights for each risk factor
type RiskWeights struct {
	BusinessAge float64
	Industry    float64
	Geographic  float64
	Financial   float64
	UBO         float64
	Document    float64
	Regulatory  float64
}

// DefaultWeights returns the default risk weights
func DefaultWeights() RiskWeights {
	return RiskWeights{
		BusinessAge: 0.10,
		Industry:    0.20,
		Geographic:  0.15,
		Financial:   0.25,
		UBO:         0.15,
		Document:    0.10,
		Regulatory:  0.05,
	}
}

// CalculateBusinessRisk calculates comprehensive business risk score
func (s *RiskScoringService) CalculateBusinessRisk(
	businessInfo *models.BusinessInfo,
	cacVerification *models.CACVerification,
	financialInfo *models.FinancialInfo,
	ubos []*models.UBO,
	documents []*models.KYBDocument,
) *models.BusinessRiskAssessment {
	weights := DefaultWeights()

	// Calculate individual risk factors
	businessAgeRisk := s.calculateBusinessAgeRisk(businessInfo)
	industryRisk := s.calculateIndustryRisk(businessInfo)
	geographicRisk := s.calculateGeographicRisk(businessInfo)
	financialRisk := s.calculateFinancialRisk(financialInfo)
	uboRisk := s.calculateUBORisk(ubos)
	documentRisk := s.calculateDocumentRisk(documents)
	regulatoryRisk := s.calculateRegulatoryRisk(cacVerification)

	// Calculate weighted total risk score
	totalRiskScore := businessAgeRisk*weights.BusinessAge +
		industryRisk*weights.Industry +
		geographicRisk*weights.Geographic +
		financialRisk*weights.Financial +
		uboRisk*weights.UBO +
		documentRisk*weights.Document +
		regulatoryRisk*weights.Regulatory

	// Determine risk level
	riskLevel := s.getRiskLevel(totalRiskScore)

	// Make decision
	decision, reason := s.makeDecision(totalRiskScore, riskLevel, ubos)

	// Generate recommendations
	recommendations := s.generateRecommendations(totalRiskScore, riskLevel, businessAgeRisk, industryRisk, financialRisk, uboRisk, documentRisk)

	// Identify risk factors
	riskFactors := s.identifyRiskFactors(businessAgeRisk, industryRisk, geographicRisk, financialRisk, uboRisk, documentRisk, regulatoryRisk)

	return &models.BusinessRiskAssessment{
		RiskScore:       totalRiskScore,
		RiskLevel:       riskLevel,
		RiskFactors:     riskFactors,
		BusinessAgeRisk: businessAgeRisk,
		IndustryRisk:    industryRisk,
		GeographicRisk:  geographicRisk,
		FinancialRisk:   financialRisk,
		UBORisk:         uboRisk,
		DocumentRisk:    documentRisk,
		RegulatoryRisk:  regulatoryRisk,
		Decision:        decision,
		DecisionReason:  reason,
		Recommendations: recommendations,
		AssessedAt:      time.Now(),
	}
}

func (s *RiskScoringService) calculateBusinessAgeRisk(info *models.BusinessInfo) float64 {
	if info == nil || info.IncorporationDate == "" {
		return 80.0
	}

	incDate, err := time.Parse("2006-01-02", info.IncorporationDate)
	if err != nil {
		return 70.0
	}

	ageYears := float64(time.Since(incDate).Hours()) / (24 * 365.25)

	switch {
	case ageYears < 1:
		return 80.0
	case ageYears < 2:
		return 60.0
	case ageYears < 3:
		return 40.0
	case ageYears < 5:
		return 25.0
	default:
		return 10.0
	}
}

func (s *RiskScoringService) calculateIndustryRisk(info *models.BusinessInfo) float64 {
	if info == nil {
		return 50.0
	}

	if risk, ok := s.industryRiskMapping[info.Industry]; ok {
		return risk
	}
	return 40.0 // Default medium risk
}

func (s *RiskScoringService) calculateGeographicRisk(info *models.BusinessInfo) float64 {
	if info == nil {
		return 50.0
	}

	// Check country risk
	countryRisk := 30.0 // Default for Nigeria
	if risk, ok := s.countryRiskScores[info.Country]; ok {
		countryRisk = risk
	}

	// Check for high-risk regions in Nigeria
	highRiskRegions := []string{"borno", "yobe", "adamawa"}
	for _, region := range highRiskRegions {
		if containsIgnoreCase(info.State, region) {
			countryRisk = 60.0
			break
		}
	}

	return countryRisk
}

func (s *RiskScoringService) calculateFinancialRisk(info *models.FinancialInfo) float64 {
	if info == nil {
		return 80.0
	}

	risk := 0.0

	// Revenue-based risk
	switch {
	case info.AnnualRevenue < 1000000: // Less than 1M
		risk += 30
	case info.AnnualRevenue < 10000000: // Less than 10M
		risk += 20
	case info.AnnualRevenue < 100000000: // Less than 100M
		risk += 10
	default:
		risk += 5
	}

	// Employee count risk
	switch {
	case info.NumberOfEmployees < 5:
		risk += 20
	case info.NumberOfEmployees < 20:
		risk += 10
	default:
		risk += 5
	}

	// Transaction volume risk
	if info.ExpectedTransactionVolume > info.AnnualRevenue*2 {
		risk += 30 // Suspicious if expected transactions far exceed revenue
	}

	return min(100, risk)
}

func (s *RiskScoringService) calculateUBORisk(ubos []*models.UBO) float64 {
	if len(ubos) == 0 {
		return 70.0
	}

	totalRisk := 0.0
	for _, ubo := range ubos {
		uboRisk := 5.0 // Base risk

		if ubo.SanctionsStatus {
			uboRisk += 100 // Critical
		}
		if ubo.PEPStatus {
			uboRisk += 50 // High
		}

		// Ownership concentration risk
		if ubo.OwnershipPercentage > 75 {
			uboRisk += 15
		}

		totalRisk += uboRisk
	}

	avgRisk := totalRisk / float64(len(ubos))
	return min(100, avgRisk)
}

func (s *RiskScoringService) calculateDocumentRisk(docs []*models.KYBDocument) float64 {
	if len(docs) == 0 {
		return 80.0
	}

	verifiedCount := 0
	for _, doc := range docs {
		if doc.Status == models.DocumentStatusVerified {
			verifiedCount++
		}
	}

	verificationRate := float64(verifiedCount) / float64(len(docs)) * 100

	switch {
	case verificationRate >= 90:
		return 10.0
	case verificationRate >= 75:
		return 30.0
	case verificationRate >= 60:
		return 50.0
	case verificationRate >= 40:
		return 70.0
	default:
		return 90.0
	}
}

func (s *RiskScoringService) calculateRegulatoryRisk(cac *models.CACVerification) float64 {
	if cac == nil {
		return 75.0
	}

	risk := 0.0

	if !cac.Verified {
		risk += 80
	}

	switch cac.Status {
	case "ACTIVE":
		risk += 5
	case "INACTIVE", "SUSPENDED":
		risk += 60
	case "STRUCK_OFF", "DISSOLVED", "IN_LIQUIDATION":
		risk += 100
	default:
		risk += 40
	}

	return min(100, risk)
}

func (s *RiskScoringService) getRiskLevel(score float64) models.RiskLevel {
	switch {
	case score <= 20:
		return models.RiskLevelLow
	case score <= 40:
		return models.RiskLevelLow
	case score <= 60:
		return models.RiskLevelMedium
	case score <= 80:
		return models.RiskLevelHigh
	default:
		return models.RiskLevelCritical
	}
}

func (s *RiskScoringService) makeDecision(score float64, level models.RiskLevel, ubos []*models.UBO) (string, string) {
	// Check for automatic rejection
	for _, ubo := range ubos {
		if ubo.SanctionsStatus {
			return "AUTO_REJECT", "UBO matched on sanctions list"
		}
	}

	switch level {
	case models.RiskLevelLow:
		return "AUTO_APPROVE", "Low risk profile - all checks passed"
	case models.RiskLevelMedium:
		return "MANUAL_REVIEW", "Medium risk - requires manual review"
	case models.RiskLevelHigh:
		return "ENHANCED_DUE_DILIGENCE", "High risk - enhanced due diligence required"
	default:
		return "ENHANCED_DUE_DILIGENCE", "Very high risk - comprehensive review required"
	}
}

func (s *RiskScoringService) generateRecommendations(totalScore float64, level models.RiskLevel, businessAge, industry, financial, ubo, document float64) []string {
	recommendations := make([]string, 0)

	if financial > 60 {
		recommendations = append(recommendations, "Request additional financial documentation")
		recommendations = append(recommendations, "Consider requiring personal guarantees from directors")
	}

	if ubo > 50 {
		recommendations = append(recommendations, "Conduct enhanced UBO screening")
		recommendations = append(recommendations, "Request source of wealth documentation")
	}

	if industry > 70 {
		recommendations = append(recommendations, "Apply enhanced monitoring for high-risk industry")
		recommendations = append(recommendations, "Implement transaction monitoring controls")
	}

	if document > 50 {
		recommendations = append(recommendations, "Request additional supporting documents")
		recommendations = append(recommendations, "Verify documents through independent sources")
	}

	if level == models.RiskLevelHigh || level == models.RiskLevelCritical {
		recommendations = append(recommendations, "Escalate to senior compliance officer")
		recommendations = append(recommendations, "Consider declining or imposing strict conditions")
	}

	return recommendations
}

func (s *RiskScoringService) identifyRiskFactors(businessAge, industry, geographic, financial, ubo, document, regulatory float64) []string {
	factors := make([]string, 0)

	if businessAge > 60 {
		factors = append(factors, "New business (less than 2 years)")
	}
	if industry > 60 {
		factors = append(factors, "High-risk industry")
	}
	if geographic > 50 {
		factors = append(factors, "High-risk geographic location")
	}
	if financial > 60 {
		factors = append(factors, "Financial concerns identified")
	}
	if ubo > 50 {
		factors = append(factors, "UBO screening concerns")
	}
	if document > 50 {
		factors = append(factors, "Document verification incomplete")
	}
	if regulatory > 50 {
		factors = append(factors, "Regulatory compliance concerns")
	}

	return factors
}

func loadIndustryRiskMapping() map[string]float64 {
	return map[string]float64{
		"banking":                 40.0,
		"fintech":                 50.0,
		"cryptocurrency":          90.0,
		"gambling":                85.0,
		"money_services":          80.0,
		"precious_metals":         70.0,
		"real_estate":             60.0,
		"import_export":           55.0,
		"retail":                  25.0,
		"manufacturing":           20.0,
		"technology":              30.0,
		"healthcare":              25.0,
		"education":               15.0,
		"agriculture":             20.0,
		"construction":            35.0,
		"transportation":          30.0,
		"hospitality":             40.0,
		"professional_services":   20.0,
		"non_profit":              45.0,
	}
}

func loadCountryRiskScores() map[string]float64 {
	return map[string]float64{
		// African Countries (Primary Markets)
		"NG": 30.0,  // Nigeria
		"ZA": 30.0,  // South Africa
		"KE": 35.0,  // Kenya
		"GH": 35.0,  // Ghana
		"EG": 35.0,  // Egypt
		"MA": 30.0,  // Morocco
		"UG": 40.0,  // Uganda
		"TZ": 40.0,  // Tanzania
		"ZW": 50.0,  // Zimbabwe
		"BW": 25.0,  // Botswana
		"ZM": 40.0,  // Zambia
		"RW": 30.0,  // Rwanda
		"ET": 45.0,  // Ethiopia
		"SN": 35.0,  // Senegal
		"CI": 40.0,  // Cote d'Ivoire
		"CM": 45.0,  // Cameroon
		"AO": 50.0,  // Angola
		"MZ": 45.0,  // Mozambique
		"NA": 25.0,  // Namibia
		"MU": 20.0,  // Mauritius
		// Major International Markets
		"US": 15.0,
		"GB": 15.0,
		"DE": 15.0,
		"FR": 15.0,
		"NL": 15.0,
		"CH": 10.0,
		"SG": 15.0,
		"HK": 20.0,
		"JP": 15.0,
		"AU": 15.0,
		"CA": 15.0,
		// Higher Risk Jurisdictions
		"AE": 40.0,  // UAE
		"CN": 45.0,  // China
		"RU": 80.0,  // Russia
		"IR": 95.0,  // Iran
		"KP": 100.0, // North Korea
		"SY": 95.0,  // Syria
		"VE": 70.0,  // Venezuela
		"MM": 75.0,  // Myanmar
	}
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0)
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
