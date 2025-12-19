package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ComplianceCheckType represents the type of compliance check
type ComplianceCheckType string

const (
	ComplianceCheckAML       ComplianceCheckType = "aml"
	ComplianceCheckPEP       ComplianceCheckType = "pep"
	ComplianceCheckSanctions ComplianceCheckType = "sanctions"
	ComplianceCheckFraud     ComplianceCheckType = "fraud"
	ComplianceCheckKYC       ComplianceCheckType = "kyc"
)

// ComplianceStatus represents the status of a compliance check
type ComplianceStatus string

const (
	ComplianceStatusPending  ComplianceStatus = "pending"
	ComplianceStatusCleared  ComplianceStatus = "cleared"
	ComplianceStatusFlagged  ComplianceStatus = "flagged"
	ComplianceStatusBlocked  ComplianceStatus = "blocked"
	ComplianceStatusReview   ComplianceStatus = "under_review"
)

// RiskLevel represents the risk level
type RiskLevel string

const (
	RiskLevelLow      RiskLevel = "low"
	RiskLevelMedium   RiskLevel = "medium"
	RiskLevelHigh     RiskLevel = "high"
	RiskLevelCritical RiskLevel = "critical"
)

// ComplianceCheck represents a compliance check record
type ComplianceCheck struct {
	ID            uuid.UUID           `json:"id"`
	UserID        uuid.UUID           `json:"user_id"`
	EntityType    string              `json:"entity_type"` // individual, business
	CheckType     ComplianceCheckType `json:"check_type"`
	Status        ComplianceStatus    `json:"status"`
	RiskLevel     RiskLevel           `json:"risk_level"`
	RiskScore     decimal.Decimal     `json:"risk_score"`
	Notes         string              `json:"notes,omitempty"`
	Findings      []ComplianceFinding `json:"findings,omitempty"`
	DataSources   []string            `json:"data_sources"`
	ReviewedBy    *uuid.UUID          `json:"reviewed_by,omitempty"`
	ReviewNotes   string              `json:"review_notes,omitempty"`
	ExpiresAt     *time.Time          `json:"expires_at,omitempty"`
	CreatedAt     time.Time           `json:"created_at"`
	UpdatedAt     time.Time           `json:"updated_at"`
}

// ComplianceFinding represents a finding from a compliance check
type ComplianceFinding struct {
	ID          uuid.UUID `json:"id"`
	CheckID     uuid.UUID `json:"check_id"`
	Type        string    `json:"type"`
	Severity    string    `json:"severity"` // low, medium, high, critical
	Description string    `json:"description"`
	Source      string    `json:"source"`
	MatchScore  float64   `json:"match_score,omitempty"`
	Details     map[string]interface{} `json:"details,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// TransactionMonitoring represents transaction monitoring record
type TransactionMonitoring struct {
	ID              uuid.UUID       `json:"id"`
	TransactionID   uuid.UUID       `json:"transaction_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Amount          decimal.Decimal `json:"amount"`
	Currency        string          `json:"currency"`
	TransactionType string          `json:"transaction_type"`
	RiskScore       decimal.Decimal `json:"risk_score"`
	RiskFactors     []string        `json:"risk_factors"`
	Status          ComplianceStatus `json:"status"`
	AlertGenerated  bool            `json:"alert_generated"`
	AlertID         *uuid.UUID      `json:"alert_id,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ComplianceAlert represents a compliance alert
type ComplianceAlert struct {
	ID           uuid.UUID        `json:"id"`
	UserID       uuid.UUID        `json:"user_id"`
	AlertType    string           `json:"alert_type"`
	Severity     string           `json:"severity"`
	Description  string           `json:"description"`
	Status       string           `json:"status"` // open, investigating, resolved, escalated
	AssignedTo   *uuid.UUID       `json:"assigned_to,omitempty"`
	Resolution   string           `json:"resolution,omitempty"`
	ResolvedAt   *time.Time       `json:"resolved_at,omitempty"`
	ResolvedBy   *uuid.UUID       `json:"resolved_by,omitempty"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

// SARReport represents a Suspicious Activity Report
type SARReport struct {
	ID              uuid.UUID   `json:"id"`
	UserID          uuid.UUID   `json:"user_id"`
	AlertIDs        []uuid.UUID `json:"alert_ids"`
	ReportType      string      `json:"report_type"`
	NarrativeSummary string     `json:"narrative_summary"`
	SuspiciousActivity string   `json:"suspicious_activity"`
	FilingStatus    string      `json:"filing_status"` // draft, submitted, acknowledged
	FiledAt         *time.Time  `json:"filed_at,omitempty"`
	FiledBy         *uuid.UUID  `json:"filed_by,omitempty"`
	RegulatoryRef   string      `json:"regulatory_ref,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

// RunComplianceCheckRequest represents a request to run compliance checks
type RunComplianceCheckRequest struct {
	UserID     uuid.UUID             `json:"user_id" binding:"required"`
	EntityType string                `json:"entity_type" binding:"required,oneof=individual business"`
	CheckTypes []ComplianceCheckType `json:"check_types" binding:"required,min=1"`
	FullName   string                `json:"full_name" binding:"required"`
	DateOfBirth string               `json:"date_of_birth,omitempty"`
	Nationality string               `json:"nationality,omitempty"`
	IDNumber   string                `json:"id_number,omitempty"`
	BusinessName string              `json:"business_name,omitempty"`
	RegistrationNumber string        `json:"registration_number,omitempty"`
}

// ReviewAlertRequest represents a request to review an alert
type ReviewAlertRequest struct {
	Status     string `json:"status" binding:"required,oneof=investigating resolved escalated"`
	Resolution string `json:"resolution,omitempty"`
	Notes      string `json:"notes,omitempty"`
}

// ComplianceSummary represents a compliance summary for a user
type ComplianceSummary struct {
	UserID           uuid.UUID        `json:"user_id"`
	OverallStatus    ComplianceStatus `json:"overall_status"`
	OverallRiskLevel RiskLevel        `json:"overall_risk_level"`
	LastCheckDate    *time.Time       `json:"last_check_date,omitempty"`
	NextCheckDue     *time.Time       `json:"next_check_due,omitempty"`
	OpenAlerts       int              `json:"open_alerts"`
	TotalChecks      int              `json:"total_checks"`
	ClearedChecks    int              `json:"cleared_checks"`
	FlaggedChecks    int              `json:"flagged_checks"`
	Checks           []ComplianceCheck `json:"checks,omitempty"`
}
