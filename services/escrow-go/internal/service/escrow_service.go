package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"neobank/escrow-go/internal/database"
	"neobank/escrow-go/internal/models"
)

type EscrowService struct {
	db            *database.PostgresDB
	kafkaPublisher KafkaPublisher
}

type KafkaPublisher interface {
	Publish(topic string, key string, value []byte) error
}

func NewEscrowService(db *database.PostgresDB, kafka KafkaPublisher) *EscrowService {
	return &EscrowService{
		db:            db,
		kafkaPublisher: kafka,
	}
}

type CreateEscrowRequest struct {
	Type              models.EscrowType `json:"type"`
	Title             string            `json:"title"`
	Description       string            `json:"description"`
	BuyerID           uuid.UUID         `json:"buyer_id"`
	SellerID          uuid.UUID         `json:"seller_id"`
	BrokerID          *uuid.UUID        `json:"broker_id,omitempty"`
	Amount            float64           `json:"amount"`
	Currency          string            `json:"currency"`
	FeePercentage     float64           `json:"fee_percentage"`
	FeePaidBy         string            `json:"fee_paid_by"`
	InspectionDays    int               `json:"inspection_days"`
	AutoRelease       bool              `json:"auto_release"`
	ExpiresInDays     int               `json:"expires_in_days"`
	ItemDetails       *models.ItemDetails     `json:"item_details,omitempty"`
	ShippingDetails   *models.ShippingDetails `json:"shipping_details,omitempty"`
	Terms             string            `json:"terms"`
	SpecialConditions string            `json:"special_conditions"`
	RequiresKYC       bool              `json:"requires_kyc"`
	InsuranceEnabled  bool              `json:"insurance_enabled"`
	Milestones        []MilestoneInput  `json:"milestones,omitempty"`
}

type MilestoneInput struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Amount      float64  `json:"amount"`
	Percentage  float64  `json:"percentage"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Deliverables []string `json:"deliverables,omitempty"`
}

func (s *EscrowService) CreateEscrow(ctx context.Context, req *CreateEscrowRequest) (*models.Escrow, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount must be greater than 0")
	}
	if req.BuyerID == req.SellerID {
		return nil, fmt.Errorf("buyer and seller cannot be the same")
	}

	escrow := &models.Escrow{
		ID:              uuid.New(),
		ReferenceNumber: generateReferenceNumber(),
		Type:            req.Type,
		Status:          models.EscrowStatusCreated,
		Title:           req.Title,
		Description:     req.Description,
		BuyerID:         req.BuyerID,
		SellerID:        req.SellerID,
		BrokerID:        req.BrokerID,
		Amount:          req.Amount,
		Currency:        defaultCurrency(req.Currency),
		FeePercentage:   defaultFeePercentage(req.FeePercentage),
		FeePaidBy:       defaultFeePaidBy(req.FeePaidBy),
		InspectionDays:  defaultInspectionDays(req.InspectionDays),
		AutoRelease:     req.AutoRelease,
		ItemDetails:     req.ItemDetails,
		ShippingDetails: req.ShippingDetails,
		Terms:           req.Terms,
		SpecialConditions: req.SpecialConditions,
		RequiresKYC:     req.RequiresKYC,
		InsuranceEnabled: req.InsuranceEnabled,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	escrow.FeeAmount = escrow.Amount * escrow.FeePercentage / 100

	if req.ExpiresInDays > 0 {
		expiresAt := time.Now().AddDate(0, 0, req.ExpiresInDays)
		escrow.ExpiresAt = &expiresAt
	}

	if req.InsuranceEnabled {
		escrow.InsuranceAmount = escrow.Amount
		escrow.InsurancePremium = escrow.Amount * 0.01
	}

	escrow.RiskScore = s.calculateRiskScore(escrow)

	if escrow.Amount >= 1000000 || escrow.RiskScore > 70 {
		escrow.RequiresKYC = true
	}

	if err := s.db.CreateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to create escrow: %w", err)
	}

	if len(req.Milestones) > 0 {
		for i, m := range req.Milestones {
			milestone := &models.Milestone{
				ID:          uuid.New(),
				EscrowID:    escrow.ID,
				Title:       m.Title,
				Description: m.Description,
				Amount:      m.Amount,
				Percentage:  m.Percentage,
				Sequence:    i + 1,
				Status:      models.EscrowStatusPending,
				DueDate:     m.DueDate,
				Deliverables: m.Deliverables,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}

			if milestone.Amount == 0 && milestone.Percentage > 0 {
				milestone.Amount = escrow.Amount * milestone.Percentage / 100
			}

			if err := s.db.CreateMilestone(ctx, milestone); err != nil {
				return nil, fmt.Errorf("failed to create milestone: %w", err)
			}
		}
	}

	s.logEvent(ctx, escrow.ID, "escrow_created", escrow.BuyerID, models.RoleBuyer, "Escrow created", nil)
	s.publishEvent("escrow.created", escrow)

	return escrow, nil
}

func (s *EscrowService) GetEscrow(ctx context.Context, id uuid.UUID) (*models.Escrow, error) {
	return s.db.GetEscrow(ctx, id)
}

func (s *EscrowService) GetEscrowByReference(ctx context.Context, ref string) (*models.Escrow, error) {
	return s.db.GetEscrowByReference(ctx, ref)
}

func (s *EscrowService) ListEscrows(ctx context.Context, userID uuid.UUID, role, status, escrowType string, page, pageSize int) ([]*models.Escrow, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize
	return s.db.ListEscrows(ctx, userID, role, status, escrowType, pageSize, offset)
}

func (s *EscrowService) FundEscrow(ctx context.Context, escrowID uuid.UUID, amount float64, userID uuid.UUID) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusCreated && escrow.Status != models.EscrowStatusPending {
		return nil, fmt.Errorf("escrow cannot be funded in current status: %s", escrow.Status)
	}

	if userID != escrow.BuyerID {
		return nil, fmt.Errorf("only buyer can fund the escrow")
	}

	totalRequired := escrow.Amount
	if escrow.FeePaidBy == "buyer" {
		totalRequired += escrow.FeeAmount
	}
	if escrow.InsuranceEnabled {
		totalRequired += escrow.InsurancePremium
	}

	if amount < totalRequired {
		return nil, fmt.Errorf("insufficient amount: required %.2f, received %.2f", totalRequired, amount)
	}

	escrow.FundedAmount = amount
	escrow.Status = models.EscrowStatusFunded
	now := time.Now()
	escrow.FundedAt = &now

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "escrow_funded", userID, models.RoleBuyer, fmt.Sprintf("Escrow funded with %.2f %s", amount, escrow.Currency), nil)
	s.publishEvent("escrow.funded", escrow)

	return escrow, nil
}

func (s *EscrowService) MarkDelivered(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID, trackingNumber string) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusFunded && escrow.Status != models.EscrowStatusInProgress {
		return nil, fmt.Errorf("escrow cannot be marked as delivered in current status: %s", escrow.Status)
	}

	if userID != escrow.SellerID {
		return nil, fmt.Errorf("only seller can mark as delivered")
	}

	escrow.Status = models.EscrowStatusDelivered

	if escrow.ShippingDetails != nil && trackingNumber != "" {
		escrow.ShippingDetails.TrackingNumber = trackingNumber
		now := time.Now()
		escrow.ShippingDetails.ShippedAt = &now
	}

	now := time.Now()
	escrow.InspectionStart = &now
	inspectionEnd := now.AddDate(0, 0, escrow.InspectionDays)
	escrow.InspectionEnd = &inspectionEnd

	if escrow.AutoRelease {
		escrow.AutoReleaseAt = &inspectionEnd
	}

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "escrow_delivered", userID, models.RoleSeller, "Item/service marked as delivered", map[string]interface{}{"tracking_number": trackingNumber})
	s.publishEvent("escrow.delivered", escrow)

	return escrow, nil
}

func (s *EscrowService) StartInspection(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusDelivered {
		return nil, fmt.Errorf("escrow must be in delivered status to start inspection")
	}

	if userID != escrow.BuyerID {
		return nil, fmt.Errorf("only buyer can start inspection")
	}

	escrow.Status = models.EscrowStatusInspection

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "inspection_started", userID, models.RoleBuyer, "Buyer started inspection", nil)
	s.publishEvent("escrow.inspection_started", escrow)

	return escrow, nil
}

func (s *EscrowService) ApproveRelease(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusDelivered && escrow.Status != models.EscrowStatusInspection {
		return nil, fmt.Errorf("escrow cannot be approved in current status: %s", escrow.Status)
	}

	if userID != escrow.BuyerID {
		return nil, fmt.Errorf("only buyer can approve release")
	}

	escrow.BuyerApproved = true
	now := time.Now()
	escrow.BuyerApprovedAt = &now
	escrow.Status = models.EscrowStatusApproved

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "release_approved", userID, models.RoleBuyer, "Buyer approved fund release", nil)
	s.publishEvent("escrow.approved", escrow)

	return s.ReleaseFunds(ctx, escrowID, userID)
}

func (s *EscrowService) ReleaseFunds(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusApproved {
		return nil, fmt.Errorf("escrow must be approved before releasing funds")
	}

	releaseAmount := escrow.Amount
	if escrow.FeePaidBy == "seller" {
		releaseAmount -= escrow.FeeAmount
	}

	escrow.ReleasedAmount = releaseAmount
	escrow.Status = models.EscrowStatusCompleted
	now := time.Now()
	escrow.CompletedAt = &now

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "funds_released", userID, models.RoleBuyer, fmt.Sprintf("Funds released: %.2f %s to seller", releaseAmount, escrow.Currency), nil)
	s.publishEvent("escrow.completed", escrow)

	return escrow, nil
}

func (s *EscrowService) RequestRefund(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID, reason string) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if userID != escrow.BuyerID {
		return nil, fmt.Errorf("only buyer can request refund")
	}

	if escrow.Status == models.EscrowStatusCompleted || escrow.Status == models.EscrowStatusRefunded {
		return nil, fmt.Errorf("escrow is already completed or refunded")
	}

	dispute := &models.Dispute{
		ID:            uuid.New(),
		EscrowID:      escrowID,
		InitiatedBy:   userID,
		InitiatorRole: models.RoleBuyer,
		Status:        models.DisputeStatusOpen,
		Reason:        "Refund Request",
		Description:   reason,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	deadline := time.Now().AddDate(0, 0, 7)
	dispute.EvidenceDeadline = &deadline

	if err := s.db.CreateDispute(ctx, dispute); err != nil {
		return nil, fmt.Errorf("failed to create dispute: %w", err)
	}

	escrow.Status = models.EscrowStatusDisputed
	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "refund_requested", userID, models.RoleBuyer, "Buyer requested refund: "+reason, nil)
	s.publishEvent("escrow.disputed", escrow)

	return escrow, nil
}

func (s *EscrowService) CancelEscrow(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID, reason string) (*models.Escrow, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusCreated && escrow.Status != models.EscrowStatusPending {
		return nil, fmt.Errorf("only unfunded escrows can be cancelled")
	}

	if userID != escrow.BuyerID && userID != escrow.SellerID {
		return nil, fmt.Errorf("only buyer or seller can cancel escrow")
	}

	escrow.Status = models.EscrowStatusCancelled
	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	role := models.RoleBuyer
	if userID == escrow.SellerID {
		role = models.RoleSeller
	}

	s.logEvent(ctx, escrow.ID, "escrow_cancelled", userID, role, "Escrow cancelled: "+reason, nil)
	s.publishEvent("escrow.cancelled", escrow)

	return escrow, nil
}

func (s *EscrowService) InitiateDispute(ctx context.Context, escrowID uuid.UUID, userID uuid.UUID, reason, description string) (*models.Dispute, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if escrow.Status == models.EscrowStatusCompleted || escrow.Status == models.EscrowStatusRefunded || escrow.Status == models.EscrowStatusCancelled {
		return nil, fmt.Errorf("cannot dispute a completed, refunded, or cancelled escrow")
	}

	existingDispute, _ := s.db.GetDisputeByEscrow(ctx, escrowID)
	if existingDispute != nil {
		return nil, fmt.Errorf("an active dispute already exists for this escrow")
	}

	var role models.PartyRole
	if userID == escrow.BuyerID {
		role = models.RoleBuyer
	} else if userID == escrow.SellerID {
		role = models.RoleSeller
	} else {
		return nil, fmt.Errorf("only buyer or seller can initiate dispute")
	}

	dispute := &models.Dispute{
		ID:            uuid.New(),
		EscrowID:      escrowID,
		InitiatedBy:   userID,
		InitiatorRole: role,
		Status:        models.DisputeStatusOpen,
		Reason:        reason,
		Description:   description,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	deadline := time.Now().AddDate(0, 0, 7)
	dispute.EvidenceDeadline = &deadline

	if err := s.db.CreateDispute(ctx, dispute); err != nil {
		return nil, fmt.Errorf("failed to create dispute: %w", err)
	}

	escrow.Status = models.EscrowStatusDisputed
	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "dispute_initiated", userID, role, "Dispute initiated: "+reason, nil)
	s.publishEvent("escrow.disputed", escrow)

	return dispute, nil
}

func (s *EscrowService) GetDispute(ctx context.Context, disputeID uuid.UUID) (*models.Dispute, error) {
	return s.db.GetDispute(ctx, disputeID)
}

func (s *EscrowService) GetDisputeByEscrow(ctx context.Context, escrowID uuid.UUID) (*models.Dispute, error) {
	return s.db.GetDisputeByEscrow(ctx, escrowID)
}

func (s *EscrowService) SubmitEvidence(ctx context.Context, disputeID uuid.UUID, userID uuid.UUID, evidenceType, title, description, fileURL, fileType string, fileSize int64) (*models.Evidence, error) {
	dispute, err := s.db.GetDispute(ctx, disputeID)
	if err != nil {
		return nil, err
	}
	if dispute == nil {
		return nil, fmt.Errorf("dispute not found")
	}

	if dispute.Status == models.DisputeStatusResolved {
		return nil, fmt.Errorf("cannot submit evidence to resolved dispute")
	}

	evidence := &models.Evidence{
		ID:          uuid.New(),
		DisputeID:   disputeID,
		SubmittedBy: userID,
		Type:        evidenceType,
		Title:       title,
		Description: description,
		FileURL:     fileURL,
		FileType:    fileType,
		FileSize:    fileSize,
		CreatedAt:   time.Now(),
	}

	if err := s.db.CreateEvidence(ctx, evidence); err != nil {
		return nil, fmt.Errorf("failed to create evidence: %w", err)
	}

	escrow, _ := s.db.GetEscrow(ctx, dispute.EscrowID)
	if escrow != nil {
		role := models.RoleBuyer
		if userID == escrow.SellerID {
			role = models.RoleSeller
		}
		s.logEvent(ctx, dispute.EscrowID, "evidence_submitted", userID, role, "Evidence submitted: "+title, nil)
	}

	return evidence, nil
}

func (s *EscrowService) GetEvidenceByDispute(ctx context.Context, disputeID uuid.UUID) ([]*models.Evidence, error) {
	return s.db.GetEvidenceByDispute(ctx, disputeID)
}

func (s *EscrowService) ResolveDispute(ctx context.Context, disputeID uuid.UUID, arbitratorID uuid.UUID, resolution models.DisputeResolution, notes string, buyerAmount, sellerAmount float64) (*models.Dispute, error) {
	dispute, err := s.db.GetDispute(ctx, disputeID)
	if err != nil {
		return nil, err
	}
	if dispute == nil {
		return nil, fmt.Errorf("dispute not found")
	}

	if dispute.Status == models.DisputeStatusResolved {
		return nil, fmt.Errorf("dispute is already resolved")
	}

	escrow, err := s.db.GetEscrow(ctx, dispute.EscrowID)
	if err != nil {
		return nil, err
	}

	if buyerAmount+sellerAmount > escrow.FundedAmount {
		return nil, fmt.Errorf("resolution amounts exceed funded amount")
	}

	dispute.Status = models.DisputeStatusResolved
	dispute.Resolution = &resolution
	dispute.ResolutionNotes = notes
	dispute.ArbitratorID = &arbitratorID
	dispute.BuyerAmount = buyerAmount
	dispute.SellerAmount = sellerAmount
	now := time.Now()
	dispute.ResolvedAt = &now

	if err := s.db.UpdateDispute(ctx, dispute); err != nil {
		return nil, fmt.Errorf("failed to update dispute: %w", err)
	}

	escrow.Status = models.EscrowStatusResolved
	escrow.RefundedAmount = buyerAmount
	escrow.ReleasedAmount = sellerAmount
	escrow.CompletedAt = &now

	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrow.ID, "dispute_resolved", arbitratorID, models.RoleArbitrator, fmt.Sprintf("Dispute resolved: %s - Buyer: %.2f, Seller: %.2f", resolution, buyerAmount, sellerAmount), nil)
	s.publishEvent("escrow.resolved", escrow)

	return dispute, nil
}

func (s *EscrowService) CompleteMilestone(ctx context.Context, escrowID uuid.UUID, milestoneID uuid.UUID, userID uuid.UUID, evidence []string) (*models.Milestone, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if userID != escrow.SellerID {
		return nil, fmt.Errorf("only seller can complete milestones")
	}

	milestones, err := s.db.GetMilestones(ctx, escrowID)
	if err != nil {
		return nil, err
	}

	var milestone *models.Milestone
	for _, m := range milestones {
		if m.ID == milestoneID {
			milestone = m
			break
		}
	}

	if milestone == nil {
		return nil, fmt.Errorf("milestone not found")
	}

	if milestone.Status != models.EscrowStatusPending && milestone.Status != models.EscrowStatusInProgress {
		return nil, fmt.Errorf("milestone cannot be completed in current status")
	}

	milestone.Status = models.EscrowStatusDelivered
	milestone.Evidence = evidence
	now := time.Now()
	milestone.CompletedAt = &now

	if err := s.db.UpdateMilestone(ctx, milestone); err != nil {
		return nil, fmt.Errorf("failed to update milestone: %w", err)
	}

	s.logEvent(ctx, escrowID, "milestone_completed", userID, models.RoleSeller, fmt.Sprintf("Milestone completed: %s", milestone.Title), nil)

	return milestone, nil
}

func (s *EscrowService) ApproveMilestone(ctx context.Context, escrowID uuid.UUID, milestoneID uuid.UUID, userID uuid.UUID) (*models.Milestone, error) {
	escrow, err := s.db.GetEscrow(ctx, escrowID)
	if err != nil {
		return nil, err
	}
	if escrow == nil {
		return nil, fmt.Errorf("escrow not found")
	}

	if userID != escrow.BuyerID {
		return nil, fmt.Errorf("only buyer can approve milestones")
	}

	milestones, err := s.db.GetMilestones(ctx, escrowID)
	if err != nil {
		return nil, err
	}

	var milestone *models.Milestone
	for _, m := range milestones {
		if m.ID == milestoneID {
			milestone = m
			break
		}
	}

	if milestone == nil {
		return nil, fmt.Errorf("milestone not found")
	}

	if milestone.Status != models.EscrowStatusDelivered {
		return nil, fmt.Errorf("milestone must be delivered before approval")
	}

	milestone.Status = models.EscrowStatusApproved
	now := time.Now()
	milestone.ApprovedAt = &now
	milestone.ReleasedAt = &now

	if err := s.db.UpdateMilestone(ctx, milestone); err != nil {
		return nil, fmt.Errorf("failed to update milestone: %w", err)
	}

	escrow.ReleasedAmount += milestone.Amount
	if err := s.db.UpdateEscrow(ctx, escrow); err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	s.logEvent(ctx, escrowID, "milestone_approved", userID, models.RoleBuyer, fmt.Sprintf("Milestone approved and released: %s - %.2f %s", milestone.Title, milestone.Amount, escrow.Currency), nil)

	allCompleted := true
	for _, m := range milestones {
		if m.ID == milestoneID {
			continue
		}
		if m.Status != models.EscrowStatusApproved && m.Status != models.EscrowStatusCompleted {
			allCompleted = false
			break
		}
	}

	if allCompleted {
		escrow.Status = models.EscrowStatusCompleted
		escrow.CompletedAt = &now
		s.db.UpdateEscrow(ctx, escrow)
		s.publishEvent("escrow.completed", escrow)
	}

	return milestone, nil
}

func (s *EscrowService) GetMilestones(ctx context.Context, escrowID uuid.UUID) ([]*models.Milestone, error) {
	return s.db.GetMilestones(ctx, escrowID)
}

func (s *EscrowService) GetEvents(ctx context.Context, escrowID uuid.UUID) ([]*models.EscrowEvent, error) {
	return s.db.GetEvents(ctx, escrowID)
}

func (s *EscrowService) GetStats(ctx context.Context, userID *uuid.UUID) (*models.EscrowStats, error) {
	return s.db.GetStats(ctx, userID)
}

func (s *EscrowService) GetTemplates(ctx context.Context) ([]*models.EscrowTemplate, error) {
	return s.db.GetTemplates(ctx)
}

func (s *EscrowService) ProcessAutoReleases(ctx context.Context) error {
	return nil
}

func (s *EscrowService) ProcessExpiredEscrows(ctx context.Context) error {
	return nil
}

func (s *EscrowService) logEvent(ctx context.Context, escrowID uuid.UUID, eventType string, actorID uuid.UUID, actorRole models.PartyRole, description string, metadata map[string]interface{}) {
	event := &models.EscrowEvent{
		ID:          uuid.New(),
		EscrowID:    escrowID,
		EventType:   eventType,
		ActorID:     actorID,
		ActorRole:   actorRole,
		Description: description,
		Metadata:    metadata,
		CreatedAt:   time.Now(),
	}
	s.db.CreateEvent(ctx, event)
}

func (s *EscrowService) publishEvent(topic string, escrow *models.Escrow) {
	if s.kafkaPublisher == nil {
		return
	}
}

func (s *EscrowService) calculateRiskScore(escrow *models.Escrow) float64 {
	score := 0.0

	if escrow.Amount > 10000000 {
		score += 30
	} else if escrow.Amount > 1000000 {
		score += 20
	} else if escrow.Amount > 100000 {
		score += 10
	}

	switch escrow.Type {
	case models.EscrowTypeCrypto:
		score += 25
	case models.EscrowTypeMA:
		score += 20
	case models.EscrowTypeRealEstate:
		score += 15
	case models.EscrowTypeVehicle:
		score += 10
	}

	if escrow.Currency != "NGN" && escrow.Currency != "USD" {
		score += 10
	}

	if score > 100 {
		score = 100
	}

	return score
}

func generateReferenceNumber() string {
	bytes := make([]byte, 6)
	rand.Read(bytes)
	return "ESC-" + strings.ToUpper(hex.EncodeToString(bytes))
}

func defaultCurrency(currency string) string {
	if currency == "" {
		return "NGN"
	}
	return currency
}

func defaultFeePercentage(fee float64) float64 {
	if fee <= 0 {
		return 2.5
	}
	return fee
}

func defaultFeePaidBy(paidBy string) string {
	if paidBy == "" {
		return "buyer"
	}
	return paidBy
}

func defaultInspectionDays(days int) int {
	if days <= 0 {
		return 3
	}
	return days
}
