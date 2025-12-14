package models

import (
	"time"

	"github.com/google/uuid"
)

type EscrowType string

const (
	EscrowTypeP2P         EscrowType = "p2p"
	EscrowTypeMarketplace EscrowType = "marketplace"
	EscrowTypeRealEstate  EscrowType = "real_estate"
	EscrowTypeVehicle     EscrowType = "vehicle"
	EscrowTypeService     EscrowType = "service"
	EscrowTypeMilestone   EscrowType = "milestone"
	EscrowTypeMA          EscrowType = "m_and_a"
	EscrowTypeCrypto      EscrowType = "crypto"
	EscrowTypeFreelance   EscrowType = "freelance"
	EscrowTypeGeneral     EscrowType = "general"
)

type EscrowStatus string

const (
	EscrowStatusCreated    EscrowStatus = "created"
	EscrowStatusPending    EscrowStatus = "pending"
	EscrowStatusFunded     EscrowStatus = "funded"
	EscrowStatusInProgress EscrowStatus = "in_progress"
	EscrowStatusDelivered  EscrowStatus = "delivered"
	EscrowStatusInspection EscrowStatus = "inspection"
	EscrowStatusApproved   EscrowStatus = "approved"
	EscrowStatusDisputed   EscrowStatus = "disputed"
	EscrowStatusResolved   EscrowStatus = "resolved"
	EscrowStatusCompleted  EscrowStatus = "completed"
	EscrowStatusCancelled  EscrowStatus = "cancelled"
	EscrowStatusRefunded   EscrowStatus = "refunded"
	EscrowStatusExpired    EscrowStatus = "expired"
)

type DisputeStatus string

const (
	DisputeStatusOpen       DisputeStatus = "open"
	DisputeStatusUnderReview DisputeStatus = "under_review"
	DisputeStatusEvidence   DisputeStatus = "awaiting_evidence"
	DisputeStatusMediation  DisputeStatus = "mediation"
	DisputeStatusResolved   DisputeStatus = "resolved"
	DisputeStatusEscalated  DisputeStatus = "escalated"
)

type DisputeResolution string

const (
	ResolutionBuyerFavor   DisputeResolution = "buyer_favor"
	ResolutionSellerFavor  DisputeResolution = "seller_favor"
	ResolutionSplit        DisputeResolution = "split"
	ResolutionMutual       DisputeResolution = "mutual_agreement"
	ResolutionRefund       DisputeResolution = "full_refund"
	ResolutionPartialRefund DisputeResolution = "partial_refund"
)

type PartyRole string

const (
	RoleBuyer      PartyRole = "buyer"
	RoleSeller     PartyRole = "seller"
	RoleBroker     PartyRole = "broker"
	RoleArbitrator PartyRole = "arbitrator"
	RoleAgent      PartyRole = "agent"      // Escrow agent/trustee
	RoleTrustee    PartyRole = "trustee"    // Legal trustee
	RoleWitness    PartyRole = "witness"    // Transaction witness
	RoleGuarantor  PartyRole = "guarantor"  // Payment guarantor
	RoleInspector  PartyRole = "inspector"  // Third-party inspector
	RoleLawyer     PartyRole = "lawyer"     // Legal representative
)

// PartyStatus represents the status of a party in the escrow
type PartyStatus string

const (
	PartyStatusPending   PartyStatus = "pending"    // Invited but not confirmed
	PartyStatusActive    PartyStatus = "active"     // Confirmed and participating
	PartyStatusFunded    PartyStatus = "funded"     // Has contributed funds (for buyers)
	PartyStatusApproved  PartyStatus = "approved"   // Has given approval
	PartyStatusWithdrawn PartyStatus = "withdrawn"  // Withdrew from escrow
	PartyStatusRemoved   PartyStatus = "removed"    // Removed by admin/agent
)

// ApprovalType defines what type of approval is required
type ApprovalType string

const (
	ApprovalTypeAll       ApprovalType = "all"        // All parties must approve
	ApprovalTypeMajority  ApprovalType = "majority"   // >50% must approve
	ApprovalTypeThreshold ApprovalType = "threshold"  // N of M must approve
	ApprovalTypeAny       ApprovalType = "any"        // Any one party can approve
	ApprovalTypeWeighted  ApprovalType = "weighted"   // Based on contribution percentage
)

// Party represents a participant in a multiparty escrow
type Party struct {
	ID          uuid.UUID   `json:"id" db:"id"`
	EscrowID    uuid.UUID   `json:"escrow_id" db:"escrow_id"`
	UserID      uuid.UUID   `json:"user_id" db:"user_id"`
	
	Role        PartyRole   `json:"role" db:"role"`
	Status      PartyStatus `json:"status" db:"status"`
	
	// For buyers: contribution amount and percentage
	ContributionAmount     float64 `json:"contribution_amount" db:"contribution_amount"`
	ContributionPercentage float64 `json:"contribution_percentage" db:"contribution_percentage"`
	AmountFunded           float64 `json:"amount_funded" db:"amount_funded"`
	
	// For sellers: distribution amount and percentage
	DistributionAmount     float64 `json:"distribution_amount" db:"distribution_amount"`
	DistributionPercentage float64 `json:"distribution_percentage" db:"distribution_percentage"`
	AmountReceived         float64 `json:"amount_received" db:"amount_received"`
	
	// Account information
	AccountID   string `json:"account_id" db:"account_id"`
	AccountName string `json:"account_name" db:"account_name"`
	BankCode    string `json:"bank_code" db:"bank_code"`
	
	// Approval tracking
	HasApproved   bool       `json:"has_approved" db:"has_approved"`
	ApprovedAt    *time.Time `json:"approved_at,omitempty" db:"approved_at"`
	ApprovalWeight float64   `json:"approval_weight" db:"approval_weight"` // For weighted voting
	
	// KYC status
	KYCVerified bool `json:"kyc_verified" db:"kyc_verified"`
	
	// Contact info
	Email       string `json:"email" db:"email"`
	Phone       string `json:"phone" db:"phone"`
	
	// Metadata
	Notes       string                 `json:"notes" db:"notes"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	
	InvitedAt   *time.Time `json:"invited_at,omitempty" db:"invited_at"`
	JoinedAt    *time.Time `json:"joined_at,omitempty" db:"joined_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

// ApprovalConfig defines the approval requirements for an escrow
type ApprovalConfig struct {
	ID          uuid.UUID    `json:"id" db:"id"`
	EscrowID    uuid.UUID    `json:"escrow_id" db:"escrow_id"`
	
	// Approval type and thresholds
	ApprovalType      ApprovalType `json:"approval_type" db:"approval_type"`
	RequiredApprovals int          `json:"required_approvals" db:"required_approvals"` // N in N-of-M
	TotalParties      int          `json:"total_parties" db:"total_parties"`           // M in N-of-M
	WeightThreshold   float64      `json:"weight_threshold" db:"weight_threshold"`     // For weighted approval
	
	// Which roles can approve
	ApproverRoles []PartyRole `json:"approver_roles"`
	
	// Approval deadlines
	ApprovalDeadline *time.Time `json:"approval_deadline,omitempty" db:"approval_deadline"`
	AutoApproveAfter *time.Time `json:"auto_approve_after,omitempty" db:"auto_approve_after"`
	
	// Current approval status
	CurrentApprovals int     `json:"current_approvals" db:"current_approvals"`
	CurrentWeight    float64 `json:"current_weight" db:"current_weight"`
	IsApproved       bool    `json:"is_approved" db:"is_approved"`
	
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// FundingContribution tracks individual funding contributions
type FundingContribution struct {
	ID            uuid.UUID `json:"id" db:"id"`
	EscrowID      uuid.UUID `json:"escrow_id" db:"escrow_id"`
	PartyID       uuid.UUID `json:"party_id" db:"party_id"`
	
	Amount        float64   `json:"amount" db:"amount"`
	Currency      string    `json:"currency" db:"currency"`
	
	TransactionID string    `json:"transaction_id" db:"transaction_id"`
	AccountID     string    `json:"account_id" db:"account_id"`
	
	Status        string    `json:"status" db:"status"` // pending, confirmed, failed, refunded
	
	FundedAt      time.Time `json:"funded_at" db:"funded_at"`
	ConfirmedAt   *time.Time `json:"confirmed_at,omitempty" db:"confirmed_at"`
	
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// PayoutDistribution tracks individual payout distributions
type PayoutDistribution struct {
	ID            uuid.UUID `json:"id" db:"id"`
	EscrowID      uuid.UUID `json:"escrow_id" db:"escrow_id"`
	PartyID       uuid.UUID `json:"party_id" db:"party_id"`
	MilestoneID   *uuid.UUID `json:"milestone_id,omitempty" db:"milestone_id"`
	
	GrossAmount   float64   `json:"gross_amount" db:"gross_amount"`
	FeeAmount     float64   `json:"fee_amount" db:"fee_amount"`
	NetAmount     float64   `json:"net_amount" db:"net_amount"`
	Currency      string    `json:"currency" db:"currency"`
	
	TransactionID string    `json:"transaction_id" db:"transaction_id"`
	AccountID     string    `json:"account_id" db:"account_id"`
	
	Status        string    `json:"status" db:"status"` // pending, processing, completed, failed
	
	ReleasedAt    *time.Time `json:"released_at,omitempty" db:"released_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

type Escrow struct {
	ID              uuid.UUID    `json:"id" db:"id"`
	ReferenceNumber string       `json:"reference_number" db:"reference_number"`
	Type            EscrowType   `json:"type" db:"type"`
	Status          EscrowStatus `json:"status" db:"status"`
	
	Title           string `json:"title" db:"title"`
	Description     string `json:"description" db:"description"`
	
	// Legacy single-party fields (for backward compatibility)
	BuyerID         uuid.UUID `json:"buyer_id" db:"buyer_id"`
	SellerID        uuid.UUID `json:"seller_id" db:"seller_id"`
	BrokerID        *uuid.UUID `json:"broker_id,omitempty" db:"broker_id"`
	
	// Multiparty configuration
	IsMultiparty    bool `json:"is_multiparty" db:"is_multiparty"`
	TotalBuyers     int  `json:"total_buyers" db:"total_buyers"`
	TotalSellers    int  `json:"total_sellers" db:"total_sellers"`
	TotalParties    int  `json:"total_parties" db:"total_parties"`
	
	// Agent/Trustee (separate from arbitrator)
	AgentID         *uuid.UUID `json:"agent_id,omitempty" db:"agent_id"`
	TrusteeID       *uuid.UUID `json:"trustee_id,omitempty" db:"trustee_id"`
	
	// Approval configuration
	ApprovalType         ApprovalType `json:"approval_type" db:"approval_type"`
	RequiredBuyerApprovals  int       `json:"required_buyer_approvals" db:"required_buyer_approvals"`
	RequiredSellerApprovals int       `json:"required_seller_approvals" db:"required_seller_approvals"`
	CurrentBuyerApprovals   int       `json:"current_buyer_approvals" db:"current_buyer_approvals"`
	CurrentSellerApprovals  int       `json:"current_seller_approvals" db:"current_seller_approvals"`
	
	// Funding tracking for multiparty
	TotalFundingRequired float64 `json:"total_funding_required" db:"total_funding_required"`
	TotalFundingReceived float64 `json:"total_funding_received" db:"total_funding_received"`
	FundingComplete      bool    `json:"funding_complete" db:"funding_complete"`
	
	// Distribution tracking for multiparty
	TotalDistributed float64 `json:"total_distributed" db:"total_distributed"`
	DistributionComplete bool `json:"distribution_complete" db:"distribution_complete"`
	
	Amount          float64 `json:"amount" db:"amount"`
	Currency        string  `json:"currency" db:"currency"`
	FeeAmount       float64 `json:"fee_amount" db:"fee_amount"`
	FeePercentage   float64 `json:"fee_percentage" db:"fee_percentage"`
	FeePaidBy       string  `json:"fee_paid_by" db:"fee_paid_by"`
	
	FundedAmount    float64 `json:"funded_amount" db:"funded_amount"`
	ReleasedAmount  float64 `json:"released_amount" db:"released_amount"`
	RefundedAmount  float64 `json:"refunded_amount" db:"refunded_amount"`
	
	InspectionDays  int       `json:"inspection_days" db:"inspection_days"`
	InspectionStart *time.Time `json:"inspection_start,omitempty" db:"inspection_start"`
	InspectionEnd   *time.Time `json:"inspection_end,omitempty" db:"inspection_end"`
	
	AutoRelease     bool       `json:"auto_release" db:"auto_release"`
	AutoReleaseAt   *time.Time `json:"auto_release_at,omitempty" db:"auto_release_at"`
	
	ExpiresAt       *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	
	ItemDetails     *ItemDetails     `json:"item_details,omitempty"`
	ShippingDetails *ShippingDetails `json:"shipping_details,omitempty"`
	
	Terms           string `json:"terms" db:"terms"`
	SpecialConditions string `json:"special_conditions" db:"special_conditions"`
	
	BuyerApproved   bool       `json:"buyer_approved" db:"buyer_approved"`
	SellerApproved  bool       `json:"seller_approved" db:"seller_approved"`
	BuyerApprovedAt *time.Time `json:"buyer_approved_at,omitempty" db:"buyer_approved_at"`
	SellerApprovedAt *time.Time `json:"seller_approved_at,omitempty" db:"seller_approved_at"`
	
	RiskScore       float64 `json:"risk_score" db:"risk_score"`
	RequiresKYC     bool    `json:"requires_kyc" db:"requires_kyc"`
	KYCVerified     bool    `json:"kyc_verified" db:"kyc_verified"`
	
	InsuranceEnabled bool    `json:"insurance_enabled" db:"insurance_enabled"`
	InsuranceAmount  float64 `json:"insurance_amount" db:"insurance_amount"`
	InsurancePremium float64 `json:"insurance_premium" db:"insurance_premium"`
	
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
	
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
	FundedAt        *time.Time `json:"funded_at,omitempty" db:"funded_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty" db:"completed_at"`
}

type ItemDetails struct {
	Category    string   `json:"category"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Quantity    int      `json:"quantity"`
	UnitPrice   float64  `json:"unit_price"`
	Condition   string   `json:"condition"`
	Images      []string `json:"images,omitempty"`
	
	VIN         string `json:"vin,omitempty"`
	Make        string `json:"make,omitempty"`
	Model       string `json:"model,omitempty"`
	Year        int    `json:"year,omitempty"`
	Mileage     int    `json:"mileage,omitempty"`
	
	PropertyAddress string `json:"property_address,omitempty"`
	PropertyType    string `json:"property_type,omitempty"`
	TitleNumber     string `json:"title_number,omitempty"`
	
	DomainName      string `json:"domain_name,omitempty"`
	Registrar       string `json:"registrar,omitempty"`
}

type ShippingDetails struct {
	Method          string     `json:"method"`
	Carrier         string     `json:"carrier"`
	TrackingNumber  string     `json:"tracking_number,omitempty"`
	ShippedAt       *time.Time `json:"shipped_at,omitempty"`
	DeliveredAt     *time.Time `json:"delivered_at,omitempty"`
	
	OriginAddress   Address `json:"origin_address"`
	DestinationAddress Address `json:"destination_address"`
	
	EstimatedDelivery *time.Time `json:"estimated_delivery,omitempty"`
	ShippingCost      float64    `json:"shipping_cost"`
	ShippingPaidBy    string     `json:"shipping_paid_by"`
}

type Address struct {
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	Country    string `json:"country"`
	PostalCode string `json:"postal_code"`
}

type Milestone struct {
	ID          uuid.UUID `json:"id" db:"id"`
	EscrowID    uuid.UUID `json:"escrow_id" db:"escrow_id"`
	
	Title       string  `json:"title" db:"title"`
	Description string  `json:"description" db:"description"`
	Amount      float64 `json:"amount" db:"amount"`
	Percentage  float64 `json:"percentage" db:"percentage"`
	
	Sequence    int          `json:"sequence" db:"sequence"`
	Status      EscrowStatus `json:"status" db:"status"`
	
	DueDate     *time.Time `json:"due_date,omitempty" db:"due_date"`
	CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	ApprovedAt  *time.Time `json:"approved_at,omitempty" db:"approved_at"`
	ReleasedAt  *time.Time `json:"released_at,omitempty" db:"released_at"`
	
	Deliverables []string `json:"deliverables,omitempty"`
	Evidence     []string `json:"evidence,omitempty"`
	
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type Dispute struct {
	ID          uuid.UUID     `json:"id" db:"id"`
	EscrowID    uuid.UUID     `json:"escrow_id" db:"escrow_id"`
	MilestoneID *uuid.UUID    `json:"milestone_id,omitempty" db:"milestone_id"`
	
	InitiatedBy uuid.UUID     `json:"initiated_by" db:"initiated_by"`
	InitiatorRole PartyRole   `json:"initiator_role" db:"initiator_role"`
	
	Status      DisputeStatus `json:"status" db:"status"`
	Reason      string        `json:"reason" db:"reason"`
	Description string        `json:"description" db:"description"`
	
	Resolution  *DisputeResolution `json:"resolution,omitempty" db:"resolution"`
	ResolutionNotes string         `json:"resolution_notes" db:"resolution_notes"`
	
	ArbitratorID *uuid.UUID `json:"arbitrator_id,omitempty" db:"arbitrator_id"`
	
	BuyerAmount  float64 `json:"buyer_amount" db:"buyer_amount"`
	SellerAmount float64 `json:"seller_amount" db:"seller_amount"`
	
	EvidenceDeadline *time.Time `json:"evidence_deadline,omitempty" db:"evidence_deadline"`
	
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty" db:"resolved_at"`
}

type Evidence struct {
	ID          uuid.UUID `json:"id" db:"id"`
	DisputeID   uuid.UUID `json:"dispute_id" db:"dispute_id"`
	SubmittedBy uuid.UUID `json:"submitted_by" db:"submitted_by"`
	
	Type        string `json:"type" db:"type"`
	Title       string `json:"title" db:"title"`
	Description string `json:"description" db:"description"`
	FileURL     string `json:"file_url" db:"file_url"`
	FileType    string `json:"file_type" db:"file_type"`
	FileSize    int64  `json:"file_size" db:"file_size"`
	
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type EscrowEvent struct {
	ID        uuid.UUID `json:"id" db:"id"`
	EscrowID  uuid.UUID `json:"escrow_id" db:"escrow_id"`
	
	EventType string    `json:"event_type" db:"event_type"`
	ActorID   uuid.UUID `json:"actor_id" db:"actor_id"`
	ActorRole PartyRole `json:"actor_role" db:"actor_role"`
	
	Description string                 `json:"description" db:"description"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	
	IPAddress   string `json:"ip_address" db:"ip_address"`
	UserAgent   string `json:"user_agent" db:"user_agent"`
	
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type EscrowTemplate struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	Name        string     `json:"name" db:"name"`
	Type        EscrowType `json:"type" db:"type"`
	Description string     `json:"description" db:"description"`
	
	DefaultInspectionDays int     `json:"default_inspection_days" db:"default_inspection_days"`
	DefaultFeePercentage  float64 `json:"default_fee_percentage" db:"default_fee_percentage"`
	DefaultFeePaidBy      string  `json:"default_fee_paid_by" db:"default_fee_paid_by"`
	
	RequiresKYC     bool `json:"requires_kyc" db:"requires_kyc"`
	RequiresShipping bool `json:"requires_shipping" db:"requires_shipping"`
	
	Terms           string `json:"terms" db:"terms"`
	
	MilestoneTemplates []MilestoneTemplate `json:"milestone_templates,omitempty"`
	
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type MilestoneTemplate struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Percentage  float64 `json:"percentage"`
	Sequence    int     `json:"sequence"`
}

type EscrowStats struct {
	TotalEscrows      int64   `json:"total_escrows"`
	ActiveEscrows     int64   `json:"active_escrows"`
	CompletedEscrows  int64   `json:"completed_escrows"`
	DisputedEscrows   int64   `json:"disputed_escrows"`
	TotalVolume       float64 `json:"total_volume"`
	TotalFees         float64 `json:"total_fees"`
	AverageAmount     float64 `json:"average_amount"`
	DisputeRate       float64 `json:"dispute_rate"`
	AverageResolutionDays float64 `json:"average_resolution_days"`
}
