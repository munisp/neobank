package models

import (
	"time"

	"github.com/google/uuid"
)

// KYC Status enum
type KYCStatus string

const (
	KYCStatusPending              KYCStatus = "pending"
	KYCStatusInProgress           KYCStatus = "in_progress"
	KYCStatusUnderReview          KYCStatus = "under_review"
	KYCStatusApproved             KYCStatus = "approved"
	KYCStatusRejected             KYCStatus = "rejected"
	KYCStatusRequiresResubmission KYCStatus = "requires_resubmission"
)

// KYC Tier enum
type KYCTier string

const (
	KYCTierBasic    KYCTier = "basic"
	KYCTierEnhanced KYCTier = "enhanced"
	KYCTierPremium  KYCTier = "premium"
)

// Document Type enum
type DocumentType string

const (
	DocumentTypePassport       DocumentType = "passport"
	DocumentTypeDriversLicense DocumentType = "drivers_license"
	DocumentTypeNationalID     DocumentType = "national_id"
	DocumentTypeUtilityBill    DocumentType = "utility_bill"
	DocumentTypeBankStatement  DocumentType = "bank_statement"
	DocumentTypeSelfie         DocumentType = "selfie"
	DocumentTypeBVNSlip        DocumentType = "bvn_slip"
)

// Document Status enum
type DocumentStatus string

const (
	DocumentStatusPending  DocumentStatus = "pending"
	DocumentStatusVerified DocumentStatus = "verified"
	DocumentStatusRejected DocumentStatus = "rejected"
)

// Risk Level enum
type RiskLevel string

const (
	RiskLevelLow      RiskLevel = "low"
	RiskLevelMedium   RiskLevel = "medium"
	RiskLevelHigh     RiskLevel = "high"
	RiskLevelCritical RiskLevel = "critical"
)

// KYCApplication represents a KYC application
type KYCApplication struct {
	ID                   uuid.UUID      `json:"application_id" db:"id"`
	UserID               uuid.UUID      `json:"user_id" db:"user_id"`
	Tier                 KYCTier        `json:"tier" db:"tier"`
	Status               KYCStatus      `json:"status" db:"status"`
	CreatedAt            time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at" db:"updated_at"`
	CompletionPercentage int            `json:"completion_percentage" db:"completion_percentage"`
	RequiredDocuments    []DocumentType `json:"required_documents" db:"required_documents"`
	SubmittedDocuments   []DocumentType `json:"submitted_documents" db:"submitted_documents"`
	ExpiresAt            time.Time      `json:"expires_at" db:"expires_at"`
	ReviewedAt           *time.Time     `json:"reviewed_at,omitempty" db:"reviewed_at"`
	ReviewedBy           *uuid.UUID     `json:"reviewed_by,omitempty" db:"reviewed_by"`
	ReviewNotes          string         `json:"review_notes,omitempty" db:"review_notes"`
}

// PersonalInfo represents personal information for KYC
type PersonalInfo struct {
	ID            uuid.UUID `json:"id" db:"id"`
	ApplicationID uuid.UUID `json:"application_id" db:"application_id"`
	FirstName     string    `json:"first_name" db:"first_name"`
	LastName      string    `json:"last_name" db:"last_name"`
	MiddleName    string    `json:"middle_name,omitempty" db:"middle_name"`
	DateOfBirth   string    `json:"date_of_birth" db:"date_of_birth"`
	Nationality   string    `json:"nationality" db:"nationality"`
	PhoneNumber   string    `json:"phone_number" db:"phone_number"`
	Email         string    `json:"email" db:"email"`
	BVN           string    `json:"bvn,omitempty" db:"bvn"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// AddressInfo represents address information for KYC
type AddressInfo struct {
	ID            uuid.UUID `json:"id" db:"id"`
	ApplicationID uuid.UUID `json:"application_id" db:"application_id"`
	StreetAddress string    `json:"street_address" db:"street_address"`
	City          string    `json:"city" db:"city"`
	State         string    `json:"state" db:"state"`
	PostalCode    string    `json:"postal_code" db:"postal_code"`
	Country       string    `json:"country" db:"country"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// IdentityVerification represents identity document verification
type IdentityVerification struct {
	ID             uuid.UUID    `json:"id" db:"id"`
	ApplicationID  uuid.UUID    `json:"application_id" db:"application_id"`
	DocumentType   DocumentType `json:"document_type" db:"document_type"`
	DocumentNumber string       `json:"document_number" db:"document_number"`
	IssueDate      string       `json:"issue_date" db:"issue_date"`
	ExpiryDate     string       `json:"expiry_date" db:"expiry_date"`
	IssuingCountry string       `json:"issuing_country" db:"issuing_country"`
	Verified       bool         `json:"verified" db:"verified"`
	VerifiedAt     *time.Time   `json:"verified_at,omitempty" db:"verified_at"`
	CreatedAt      time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at" db:"updated_at"`
}

// KYCDocument represents an uploaded document
type KYCDocument struct {
	ID            uuid.UUID      `json:"document_id" db:"id"`
	ApplicationID uuid.UUID      `json:"application_id" db:"application_id"`
	DocumentType  DocumentType   `json:"document_type" db:"document_type"`
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

// BiometricData represents biometric verification data
type BiometricData struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	ApplicationID   uuid.UUID  `json:"application_id" db:"application_id"`
	FaceMatchScore  float64    `json:"face_match_score" db:"face_match_score"`
	LivenessScore   float64    `json:"liveness_score" db:"liveness_score"`
	Verified        bool       `json:"verified" db:"verified"`
	SelfieDocID     *uuid.UUID `json:"selfie_doc_id,omitempty" db:"selfie_doc_id"`
	IDDocID         *uuid.UUID `json:"id_doc_id,omitempty" db:"id_doc_id"`
	VerificationRef string     `json:"verification_ref,omitempty" db:"verification_ref"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// AMLScreeningResult represents AML screening results
type AMLScreeningResult struct {
	ID            uuid.UUID `json:"id" db:"id"`
	ApplicationID uuid.UUID `json:"application_id" db:"application_id"`
	PEPMatch      bool      `json:"pep_match" db:"pep_match"`
	SanctionsMatch bool     `json:"sanctions_match" db:"sanctions_match"`
	AdverseMedia  bool      `json:"adverse_media" db:"adverse_media"`
	RiskScore     float64   `json:"risk_score" db:"risk_score"`
	RiskLevel     RiskLevel `json:"risk_level" db:"risk_level"`
	MatchDetails  []ScreeningMatch `json:"match_details,omitempty" db:"match_details"`
	Provider      string    `json:"provider" db:"provider"`
	ReferenceID   string    `json:"reference_id" db:"reference_id"`
	ScreenedAt    time.Time `json:"screened_at" db:"screened_at"`
}

// ScreeningMatch represents a single screening match
type ScreeningMatch struct {
	Name       string   `json:"name"`
	MatchScore float64  `json:"match_score"`
	MatchType  string   `json:"match_type"`
	Sources    []string `json:"sources"`
	Countries  []string `json:"countries"`
}

// KYCApplicationFull represents a complete KYC application with all related data
type KYCApplicationFull struct {
	Application          KYCApplication        `json:"application"`
	PersonalInfo         *PersonalInfo         `json:"personal_info,omitempty"`
	AddressInfo          *AddressInfo          `json:"address_info,omitempty"`
	IdentityVerification *IdentityVerification `json:"identity_verification,omitempty"`
	Documents            []KYCDocument         `json:"documents,omitempty"`
	BiometricData        *BiometricData        `json:"biometric_data,omitempty"`
	AMLScreening         *AMLScreeningResult   `json:"aml_screening,omitempty"`
}

// Request/Response DTOs

type InitiateKYCRequest struct {
	Tier KYCTier `json:"tier" binding:"required,oneof=basic enhanced premium"`
}

type InitiateKYCResponse struct {
	ApplicationID uuid.UUID      `json:"application_id"`
	Status        KYCStatus      `json:"status"`
	Tier          KYCTier        `json:"tier"`
	RequiredDocs  []DocumentType `json:"required_documents"`
	ExpiresAt     time.Time      `json:"expires_at"`
}

type PersonalInfoRequest struct {
	FirstName   string `json:"first_name" binding:"required,min=2,max=100"`
	LastName    string `json:"last_name" binding:"required,min=2,max=100"`
	MiddleName  string `json:"middle_name,omitempty"`
	DateOfBirth string `json:"date_of_birth" binding:"required"`
	Nationality string `json:"nationality" binding:"required,len=2"`
	PhoneNumber string `json:"phone_number" binding:"required"`
	Email       string `json:"email" binding:"required,email"`
	BVN         string `json:"bvn,omitempty"`
}

type AddressInfoRequest struct {
	StreetAddress string `json:"street_address" binding:"required,min=5,max=500"`
	City          string `json:"city" binding:"required,min=2,max=100"`
	State         string `json:"state" binding:"required,min=2,max=100"`
	PostalCode    string `json:"postal_code" binding:"required"`
	Country       string `json:"country" binding:"required,len=2"`
}

type IdentityVerificationRequest struct {
	DocumentType   DocumentType `json:"document_type" binding:"required"`
	DocumentNumber string       `json:"document_number" binding:"required"`
	IssueDate      string       `json:"issue_date" binding:"required"`
	ExpiryDate     string       `json:"expiry_date" binding:"required"`
	IssuingCountry string       `json:"issuing_country" binding:"required,len=2"`
}

type UpgradeTierRequest struct {
	NewTier KYCTier `json:"new_tier" binding:"required,oneof=enhanced premium"`
}
