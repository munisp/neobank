package models

import (
	"time"

	"github.com/google/uuid"
)

// KYB Status enum
type KYBStatus string

const (
	KYBStatusPending              KYBStatus = "pending"
	KYBStatusInProgress           KYBStatus = "in_progress"
	KYBStatusUnderReview          KYBStatus = "under_review"
	KYBStatusApproved             KYBStatus = "approved"
	KYBStatusRejected             KYBStatus = "rejected"
	KYBStatusRequiresResubmission KYBStatus = "requires_resubmission"
)

// Business Type enum
type BusinessType string

const (
	BusinessTypeSoleProprietorship BusinessType = "sole_proprietorship"
	BusinessTypePartnership        BusinessType = "partnership"
	BusinessTypeLimitedLiability   BusinessType = "limited_liability"
	BusinessTypeCorporation        BusinessType = "corporation"
	BusinessTypeNonProfit          BusinessType = "non_profit"
)

// KYBApplication represents a KYB application
type KYBApplication struct {
	ID                   uuid.UUID    `json:"application_id" db:"id"`
	UserID               uuid.UUID    `json:"user_id" db:"user_id"`
	BusinessName         string       `json:"business_name" db:"business_name"`
	Status               KYBStatus    `json:"status" db:"status"`
	CreatedAt            time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time    `json:"updated_at" db:"updated_at"`
	CompletionPercentage int          `json:"completion_percentage" db:"completion_percentage"`
	CACVerified          bool         `json:"cac_verified" db:"cac_verified"`
	UBOsVerified         bool         `json:"ubos_verified" db:"ubos_verified"`
	FinancialVerified    bool         `json:"financial_verified" db:"financial_verified"`
	ExpiresAt            time.Time    `json:"expires_at" db:"expires_at"`
	ReviewedAt           *time.Time   `json:"reviewed_at,omitempty" db:"reviewed_at"`
	ReviewedBy           *uuid.UUID   `json:"reviewed_by,omitempty" db:"reviewed_by"`
	ReviewNotes          string       `json:"review_notes,omitempty" db:"review_notes"`
}

// BusinessInfo represents business information for KYB
type BusinessInfo struct {
	ID                     uuid.UUID    `json:"id" db:"id"`
	ApplicationID          uuid.UUID    `json:"application_id" db:"application_id"`
	BusinessName           string       `json:"business_name" db:"business_name"`
	BusinessType           BusinessType `json:"business_type" db:"business_type"`
	RegistrationNumber     string       `json:"registration_number" db:"registration_number"`
	TaxID                  string       `json:"tax_id" db:"tax_id"`
	IncorporationDate      string       `json:"incorporation_date" db:"incorporation_date"`
	CountryOfIncorporation string       `json:"country_of_incorporation" db:"country_of_incorporation"`
	Industry               string       `json:"industry" db:"industry"`
	Website                string       `json:"website,omitempty" db:"website"`
	PhoneNumber            string       `json:"phone_number" db:"phone_number"`
	Email                  string       `json:"email" db:"email"`
	StreetAddress          string       `json:"street_address" db:"street_address"`
	City                   string       `json:"city" db:"city"`
	State                  string       `json:"state" db:"state"`
	PostalCode             string       `json:"postal_code" db:"postal_code"`
	Country                string       `json:"country" db:"country"`
	CreatedAt              time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time    `json:"updated_at" db:"updated_at"`
}

// UBO represents an Ultimate Beneficial Owner
type UBO struct {
	ID                  uuid.UUID `json:"ubo_id" db:"id"`
	ApplicationID       uuid.UUID `json:"application_id" db:"application_id"`
	FullName            string    `json:"full_name" db:"full_name"`
	DateOfBirth         string    `json:"date_of_birth" db:"date_of_birth"`
	Nationality         string    `json:"nationality" db:"nationality"`
	OwnershipPercentage float64   `json:"ownership_percentage" db:"ownership_percentage"`
	Position            string    `json:"position" db:"position"`
	IDDocumentType      string    `json:"id_document_type" db:"id_document_type"`
	IDDocumentNumber    string    `json:"id_document_number" db:"id_document_number"`
	StreetAddress       string    `json:"street_address" db:"street_address"`
	City                string    `json:"city" db:"city"`
	State               string    `json:"state" db:"state"`
	PostalCode          string    `json:"postal_code" db:"postal_code"`
	Country             string    `json:"country" db:"country"`
	PEPStatus           bool      `json:"pep_status" db:"pep_status"`
	SanctionsStatus     bool      `json:"sanctions_status" db:"sanctions_status"`
	ScreenedAt          *time.Time `json:"screened_at,omitempty" db:"screened_at"`
	CreatedAt           time.Time `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time `json:"updated_at" db:"updated_at"`
}

// CACVerification represents CAC verification result
type CACVerification struct {
	ID               uuid.UUID   `json:"id" db:"id"`
	ApplicationID    uuid.UUID   `json:"application_id" db:"application_id"`
	Verified         bool        `json:"verified" db:"verified"`
	CompanyName      string      `json:"company_name" db:"company_name"`
	RCNumber         string      `json:"rc_number" db:"rc_number"`
	RegistrationDate string      `json:"registration_date" db:"registration_date"`
	CompanyType      string      `json:"company_type" db:"company_type"`
	Status           string      `json:"status" db:"status"`
	Address          string      `json:"address" db:"address"`
	Directors        []Director  `json:"directors" db:"directors"`
	VerifiedAt       time.Time   `json:"verified_at" db:"verified_at"`
	Provider         string      `json:"provider" db:"provider"`
	ReferenceID      string      `json:"reference_id" db:"reference_id"`
}

// Director represents a company director
type Director struct {
	Name     string `json:"name"`
	Position string `json:"position"`
}

// FinancialInfo represents financial information for KYB
type FinancialInfo struct {
	ID                        uuid.UUID `json:"id" db:"id"`
	ApplicationID             uuid.UUID `json:"application_id" db:"application_id"`
	AnnualRevenue             float64   `json:"annual_revenue" db:"annual_revenue"`
	RevenueCurrency           string    `json:"revenue_currency" db:"revenue_currency"`
	NumberOfEmployees         int       `json:"number_of_employees" db:"number_of_employees"`
	ExpectedTransactionVolume float64   `json:"expected_transaction_volume" db:"expected_transaction_volume"`
	SourceOfFunds             string    `json:"source_of_funds" db:"source_of_funds"`
	BankStatementsUploaded    bool      `json:"bank_statements_uploaded" db:"bank_statements_uploaded"`
	CreatedAt                 time.Time `json:"created_at" db:"created_at"`
	UpdatedAt                 time.Time `json:"updated_at" db:"updated_at"`
}

// KYBDocument represents an uploaded business document
type KYBDocument struct {
	ID            uuid.UUID      `json:"document_id" db:"id"`
	ApplicationID uuid.UUID      `json:"application_id" db:"application_id"`
	DocumentType  string         `json:"document_type" db:"document_type"`
	FileName      string         `json:"file_name" db:"file_name"`
	FilePath      string         `json:"-" db:"file_path"`
	FileURL       string         `json:"file_url" db:"file_url"`
	FileSize      int64          `json:"file_size" db:"file_size"`
	MimeType      string         `json:"mime_type" db:"mime_type"`
	Checksum      string         `json:"-" db:"checksum"`
	Status        DocumentStatus `json:"status" db:"status"`
	OCRData       map[string]any `json:"ocr_data,omitempty" db:"ocr_data"`
	UploadedAt    time.Time      `json:"uploaded_at" db:"uploaded_at"`
	VerifiedAt    *time.Time     `json:"verified_at,omitempty" db:"verified_at"`
}

// BusinessRiskAssessment represents business risk assessment
type BusinessRiskAssessment struct {
	ID            uuid.UUID `json:"id" db:"id"`
	ApplicationID uuid.UUID `json:"application_id" db:"application_id"`
	RiskScore     float64   `json:"risk_score" db:"risk_score"`
	RiskLevel     RiskLevel `json:"risk_level" db:"risk_level"`
	RiskFactors   []string  `json:"risk_factors" db:"risk_factors"`
	
	// Individual risk components
	BusinessAgeRisk    float64 `json:"business_age_risk" db:"business_age_risk"`
	IndustryRisk       float64 `json:"industry_risk" db:"industry_risk"`
	GeographicRisk     float64 `json:"geographic_risk" db:"geographic_risk"`
	FinancialRisk      float64 `json:"financial_risk" db:"financial_risk"`
	UBORisk            float64 `json:"ubo_risk" db:"ubo_risk"`
	DocumentRisk       float64 `json:"document_risk" db:"document_risk"`
	RegulatoryRisk     float64 `json:"regulatory_risk" db:"regulatory_risk"`
	
	Decision           string    `json:"decision" db:"decision"`
	DecisionReason     string    `json:"decision_reason" db:"decision_reason"`
	Recommendations    []string  `json:"recommendations" db:"recommendations"`
	AssessedAt         time.Time `json:"assessed_at" db:"assessed_at"`
}

// KYBApplicationFull represents a complete KYB application with all related data
type KYBApplicationFull struct {
	Application     KYBApplication          `json:"application"`
	BusinessInfo    *BusinessInfo           `json:"business_info,omitempty"`
	CACVerification *CACVerification        `json:"cac_verification,omitempty"`
	UBOs            []UBO                   `json:"ubos,omitempty"`
	FinancialInfo   *FinancialInfo          `json:"financial_info,omitempty"`
	Documents       []KYBDocument           `json:"documents,omitempty"`
	RiskAssessment  *BusinessRiskAssessment `json:"risk_assessment,omitempty"`
}

// Request/Response DTOs

type InitiateKYBRequest struct {
	BusinessName string `json:"business_name" binding:"required,min=2,max=200"`
}

type InitiateKYBResponse struct {
	ApplicationID uuid.UUID `json:"application_id"`
	BusinessName  string    `json:"business_name"`
	Status        KYBStatus `json:"status"`
	ExpiresAt     time.Time `json:"expires_at"`
}

type BusinessInfoRequest struct {
	BusinessName           string       `json:"business_name" binding:"required,min=2,max=200"`
	BusinessType           BusinessType `json:"business_type" binding:"required"`
	RegistrationNumber     string       `json:"registration_number" binding:"required"`
	TaxID                  string       `json:"tax_id" binding:"required"`
	IncorporationDate      string       `json:"incorporation_date" binding:"required"`
	CountryOfIncorporation string       `json:"country_of_incorporation" binding:"required,len=2"`
	Industry               string       `json:"industry" binding:"required"`
	Website                string       `json:"website,omitempty"`
	PhoneNumber            string       `json:"phone_number" binding:"required"`
	Email                  string       `json:"email" binding:"required,email"`
	BusinessAddress        AddressInfoRequest `json:"business_address" binding:"required"`
}

type CACVerificationRequest struct {
	RCNumber string `json:"rc_number" binding:"required"`
}

type UBORequest struct {
	FullName            string  `json:"full_name" binding:"required,min=2,max=200"`
	DateOfBirth         string  `json:"date_of_birth" binding:"required"`
	Nationality         string  `json:"nationality" binding:"required,len=2"`
	OwnershipPercentage float64 `json:"ownership_percentage" binding:"required,min=0,max=100"`
	Position            string  `json:"position" binding:"required"`
	IDDocumentType      string  `json:"id_document_type" binding:"required"`
	IDDocumentNumber    string  `json:"id_document_number" binding:"required"`
	Address             AddressInfoRequest `json:"address" binding:"required"`
}

type FinancialInfoRequest struct {
	AnnualRevenue             float64 `json:"annual_revenue" binding:"required,min=0"`
	RevenueCurrency           string  `json:"revenue_currency" binding:"required,len=3"`
	NumberOfEmployees         int     `json:"number_of_employees" binding:"required,min=1"`
	ExpectedTransactionVolume float64 `json:"expected_transaction_volume" binding:"required,min=0"`
	SourceOfFunds             string  `json:"source_of_funds" binding:"required"`
}

type RiskAssessmentResponse struct {
	RiskScore   float64   `json:"risk_score"`
	RiskLevel   RiskLevel `json:"risk_level"`
	RiskFactors []string  `json:"risk_factors"`
}
