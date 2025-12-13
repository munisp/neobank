package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// InsuranceType represents the type of insurance
type InsuranceType string

const (
	InsuranceTypeTravel    InsuranceType = "travel"
	InsuranceTypeDevice    InsuranceType = "device"
	InsuranceTypeLife      InsuranceType = "life"
	InsuranceTypeHealth    InsuranceType = "health"
	InsuranceTypePurchase  InsuranceType = "purchase"
	InsuranceTypeTicket    InsuranceType = "ticket"
	InsuranceTypePet       InsuranceType = "pet"
	InsuranceTypeCar       InsuranceType = "car"
	InsuranceTypeHome      InsuranceType = "home"
)

type PolicyStatus string

const (
	PolicyStatusActive    PolicyStatus = "active"
	PolicyStatusPending   PolicyStatus = "pending"
	PolicyStatusExpired   PolicyStatus = "expired"
	PolicyStatusCancelled PolicyStatus = "cancelled"
	PolicyStatusClaimed   PolicyStatus = "claimed"
)

type ClaimStatus string

const (
	ClaimStatusSubmitted  ClaimStatus = "submitted"
	ClaimStatusUnderReview ClaimStatus = "under_review"
	ClaimStatusApproved   ClaimStatus = "approved"
	ClaimStatusRejected   ClaimStatus = "rejected"
	ClaimStatusPaid       ClaimStatus = "paid"
)

// InsuranceProduct represents an insurance product
type InsuranceProduct struct {
	ID              uuid.UUID       `json:"id"`
	Type            InsuranceType   `json:"type"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	Provider        string          `json:"provider"`
	
	// Coverage
	CoverageAmount  decimal.Decimal `json:"coverage_amount"`
	Deductible      decimal.Decimal `json:"deductible"`
	CoverageDetails []CoverageItem  `json:"coverage_details"`
	Exclusions      []string        `json:"exclusions"`
	
	// Pricing
	PremiumMonthly  decimal.Decimal `json:"premium_monthly"`
	PremiumAnnual   decimal.Decimal `json:"premium_annual"`
	Currency        string          `json:"currency"`
	
	// Terms
	MinAge          int             `json:"min_age,omitempty"`
	MaxAge          int             `json:"max_age,omitempty"`
	WaitingPeriod   int             `json:"waiting_period_days"`
	
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
}

type CoverageItem struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Limit       decimal.Decimal `json:"limit"`
	Covered     bool            `json:"covered"`
}

// InsurancePolicy represents a user's insurance policy
type InsurancePolicy struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	ProductID       uuid.UUID       `json:"product_id"`
	Type            InsuranceType   `json:"type"`
	PolicyNumber    string          `json:"policy_number"`
	Status          PolicyStatus    `json:"status"`
	
	// Coverage
	CoverageAmount  decimal.Decimal `json:"coverage_amount"`
	Deductible      decimal.Decimal `json:"deductible"`
	
	// Premium
	Premium         decimal.Decimal `json:"premium"`
	PaymentFrequency string         `json:"payment_frequency"` // monthly, annual
	NextPaymentDate *time.Time      `json:"next_payment_date,omitempty"`
	
	// Dates
	StartDate       time.Time       `json:"start_date"`
	EndDate         time.Time       `json:"end_date"`
	
	// Beneficiaries (for life insurance)
	Beneficiaries   []Beneficiary   `json:"beneficiaries,omitempty"`
	
	// Type-specific details
	TravelDetails   *TravelInsuranceDetails   `json:"travel_details,omitempty"`
	DeviceDetails   *DeviceInsuranceDetails   `json:"device_details,omitempty"`
	LifeDetails     *LifeInsuranceDetails     `json:"life_details,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type Beneficiary struct {
	Name         string          `json:"name"`
	Relationship string          `json:"relationship"`
	Percentage   decimal.Decimal `json:"percentage"`
	Phone        string          `json:"phone,omitempty"`
	Email        string          `json:"email,omitempty"`
}

type TravelInsuranceDetails struct {
	TripType        string    `json:"trip_type"` // single, annual
	Destination     string    `json:"destination"`
	DepartureDate   time.Time `json:"departure_date"`
	ReturnDate      time.Time `json:"return_date"`
	TravelersCount  int       `json:"travelers_count"`
	MedicalCoverage decimal.Decimal `json:"medical_coverage"`
	TripCancellation decimal.Decimal `json:"trip_cancellation"`
	BaggageLoss     decimal.Decimal `json:"baggage_loss"`
	FlightDelay     decimal.Decimal `json:"flight_delay"`
}

type DeviceInsuranceDetails struct {
	DeviceType      string          `json:"device_type"` // phone, laptop, tablet
	DeviceBrand     string          `json:"device_brand"`
	DeviceModel     string          `json:"device_model"`
	IMEI            string          `json:"imei,omitempty"`
	SerialNumber    string          `json:"serial_number,omitempty"`
	PurchaseDate    time.Time       `json:"purchase_date"`
	PurchasePrice   decimal.Decimal `json:"purchase_price"`
	AccidentalDamage bool           `json:"accidental_damage"`
	Theft           bool            `json:"theft"`
	ScreenDamage    bool            `json:"screen_damage"`
}

type LifeInsuranceDetails struct {
	SumAssured      decimal.Decimal `json:"sum_assured"`
	PolicyTerm      int             `json:"policy_term_years"`
	CriticalIllness bool            `json:"critical_illness"`
	Disability      bool            `json:"disability"`
	Accidental      bool            `json:"accidental"`
}

// InsuranceClaim represents an insurance claim
type InsuranceClaim struct {
	ID              uuid.UUID       `json:"id"`
	PolicyID        uuid.UUID       `json:"policy_id"`
	UserID          uuid.UUID       `json:"user_id"`
	ClaimNumber     string          `json:"claim_number"`
	Type            InsuranceType   `json:"type"`
	Status          ClaimStatus     `json:"status"`
	
	// Claim details
	IncidentDate    time.Time       `json:"incident_date"`
	Description     string          `json:"description"`
	ClaimAmount     decimal.Decimal `json:"claim_amount"`
	ApprovedAmount  decimal.Decimal `json:"approved_amount,omitempty"`
	
	// Documents
	Documents       []ClaimDocument `json:"documents"`
	
	// Processing
	AssignedTo      string          `json:"assigned_to,omitempty"`
	ReviewNotes     string          `json:"review_notes,omitempty"`
	RejectionReason string          `json:"rejection_reason,omitempty"`
	
	// Dates
	SubmittedAt     time.Time       `json:"submitted_at"`
	ReviewedAt      *time.Time      `json:"reviewed_at,omitempty"`
	PaidAt          *time.Time      `json:"paid_at,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type ClaimDocument struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"` // receipt, photo, police_report, medical_report
	URL         string    `json:"url"`
	UploadedAt  time.Time `json:"uploaded_at"`
}

// Request/Response types
type GetQuoteRequest struct {
	Type            InsuranceType   `json:"type" binding:"required"`
	
	// Travel insurance
	Destination     string          `json:"destination,omitempty"`
	DepartureDate   *time.Time      `json:"departure_date,omitempty"`
	ReturnDate      *time.Time      `json:"return_date,omitempty"`
	TravelersCount  int             `json:"travelers_count,omitempty"`
	
	// Device insurance
	DeviceType      string          `json:"device_type,omitempty"`
	DeviceBrand     string          `json:"device_brand,omitempty"`
	DeviceModel     string          `json:"device_model,omitempty"`
	PurchasePrice   decimal.Decimal `json:"purchase_price,omitempty"`
	
	// Life insurance
	Age             int             `json:"age,omitempty"`
	SumAssured      decimal.Decimal `json:"sum_assured,omitempty"`
	PolicyTerm      int             `json:"policy_term,omitempty"`
}

type QuoteResponse struct {
	Type            InsuranceType   `json:"type"`
	Products        []InsuranceProduct `json:"products"`
	RecommendedID   uuid.UUID       `json:"recommended_id,omitempty"`
}

type PurchasePolicyRequest struct {
	ProductID       uuid.UUID       `json:"product_id" binding:"required"`
	PaymentFrequency string         `json:"payment_frequency" binding:"required"`
	
	// Travel details
	TravelDetails   *TravelInsuranceDetails `json:"travel_details,omitempty"`
	
	// Device details
	DeviceDetails   *DeviceInsuranceDetails `json:"device_details,omitempty"`
	
	// Life details
	LifeDetails     *LifeInsuranceDetails   `json:"life_details,omitempty"`
	Beneficiaries   []Beneficiary           `json:"beneficiaries,omitempty"`
}

type SubmitClaimRequest struct {
	PolicyID        uuid.UUID       `json:"policy_id" binding:"required"`
	IncidentDate    time.Time       `json:"incident_date" binding:"required"`
	Description     string          `json:"description" binding:"required"`
	ClaimAmount     decimal.Decimal `json:"claim_amount" binding:"required"`
}

type UploadDocumentRequest struct {
	Name string `json:"name" binding:"required"`
	Type string `json:"type" binding:"required"`
	URL  string `json:"url" binding:"required"`
}
