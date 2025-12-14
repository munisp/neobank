package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"neobank/escrow-go/internal/models"
)

type PostgresDB struct {
	db *sql.DB
}

func NewPostgresDB(connStr string) (*PostgresDB, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &PostgresDB{db: db}, nil
}

func (p *PostgresDB) Close() error {
	return p.db.Close()
}

func (p *PostgresDB) Migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS escrows (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			reference_number VARCHAR(50) UNIQUE NOT NULL,
			type VARCHAR(50) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'created',
			title VARCHAR(500) NOT NULL,
			description TEXT,
			buyer_id UUID NOT NULL,
			seller_id UUID NOT NULL,
			broker_id UUID,
			amount DECIMAL(20,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			fee_amount DECIMAL(20,2) DEFAULT 0,
			fee_percentage DECIMAL(5,2) DEFAULT 2.5,
			fee_paid_by VARCHAR(20) DEFAULT 'buyer',
			funded_amount DECIMAL(20,2) DEFAULT 0,
			released_amount DECIMAL(20,2) DEFAULT 0,
			refunded_amount DECIMAL(20,2) DEFAULT 0,
			inspection_days INTEGER DEFAULT 3,
			inspection_start TIMESTAMP,
			inspection_end TIMESTAMP,
			auto_release BOOLEAN DEFAULT false,
			auto_release_at TIMESTAMP,
			expires_at TIMESTAMP,
			item_details JSONB,
			shipping_details JSONB,
			terms TEXT,
			special_conditions TEXT,
			buyer_approved BOOLEAN DEFAULT false,
			seller_approved BOOLEAN DEFAULT false,
			buyer_approved_at TIMESTAMP,
			seller_approved_at TIMESTAMP,
			risk_score DECIMAL(5,2) DEFAULT 0,
			requires_kyc BOOLEAN DEFAULT false,
			kyc_verified BOOLEAN DEFAULT false,
			insurance_enabled BOOLEAN DEFAULT false,
			insurance_amount DECIMAL(20,2) DEFAULT 0,
			insurance_premium DECIMAL(20,2) DEFAULT 0,
			metadata JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			funded_at TIMESTAMP,
			completed_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS milestones (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
			title VARCHAR(500) NOT NULL,
			description TEXT,
			amount DECIMAL(20,2) NOT NULL,
			percentage DECIMAL(5,2),
			sequence INTEGER NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'pending',
			due_date TIMESTAMP,
			completed_at TIMESTAMP,
			approved_at TIMESTAMP,
			released_at TIMESTAMP,
			deliverables JSONB,
			evidence JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS disputes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
			milestone_id UUID REFERENCES milestones(id),
			initiated_by UUID NOT NULL,
			initiator_role VARCHAR(20) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'open',
			reason VARCHAR(500) NOT NULL,
			description TEXT,
			resolution VARCHAR(50),
			resolution_notes TEXT,
			arbitrator_id UUID,
			buyer_amount DECIMAL(20,2) DEFAULT 0,
			seller_amount DECIMAL(20,2) DEFAULT 0,
			evidence_deadline TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			resolved_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS evidence (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
			submitted_by UUID NOT NULL,
			type VARCHAR(50) NOT NULL,
			title VARCHAR(500) NOT NULL,
			description TEXT,
			file_url TEXT,
			file_type VARCHAR(50),
			file_size BIGINT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS escrow_events (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
			event_type VARCHAR(100) NOT NULL,
			actor_id UUID NOT NULL,
			actor_role VARCHAR(20) NOT NULL,
			description TEXT,
			metadata JSONB,
			ip_address VARCHAR(50),
			user_agent TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS escrow_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(200) NOT NULL,
			type VARCHAR(50) NOT NULL,
			description TEXT,
			default_inspection_days INTEGER DEFAULT 3,
			default_fee_percentage DECIMAL(5,2) DEFAULT 2.5,
			default_fee_paid_by VARCHAR(20) DEFAULT 'buyer',
			requires_kyc BOOLEAN DEFAULT false,
			requires_shipping BOOLEAN DEFAULT false,
			terms TEXT,
			milestone_templates JSONB,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_escrows_buyer_id ON escrows(buyer_id)`,
		`CREATE INDEX IF NOT EXISTS idx_escrows_seller_id ON escrows(seller_id)`,
		`CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status)`,
		`CREATE INDEX IF NOT EXISTS idx_escrows_type ON escrows(type)`,
		`CREATE INDEX IF NOT EXISTS idx_escrows_reference ON escrows(reference_number)`,
		`CREATE INDEX IF NOT EXISTS idx_milestones_escrow_id ON milestones(escrow_id)`,
		`CREATE INDEX IF NOT EXISTS idx_disputes_escrow_id ON disputes(escrow_id)`,
		`CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow_id ON escrow_events(escrow_id)`,
	}

	for _, migration := range migrations {
		if _, err := p.db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}

func (p *PostgresDB) CreateEscrow(ctx context.Context, escrow *models.Escrow) error {
	itemDetailsJSON, _ := json.Marshal(escrow.ItemDetails)
	shippingDetailsJSON, _ := json.Marshal(escrow.ShippingDetails)
	metadataJSON, _ := json.Marshal(escrow.Metadata)

	query := `
		INSERT INTO escrows (
			id, reference_number, type, status, title, description,
			buyer_id, seller_id, broker_id, amount, currency,
			fee_amount, fee_percentage, fee_paid_by,
			inspection_days, auto_release, expires_at,
			item_details, shipping_details, terms, special_conditions,
			requires_kyc, insurance_enabled, insurance_amount, insurance_premium,
			metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
		)`

	_, err := p.db.ExecContext(ctx, query,
		escrow.ID, escrow.ReferenceNumber, escrow.Type, escrow.Status,
		escrow.Title, escrow.Description, escrow.BuyerID, escrow.SellerID,
		escrow.BrokerID, escrow.Amount, escrow.Currency,
		escrow.FeeAmount, escrow.FeePercentage, escrow.FeePaidBy,
		escrow.InspectionDays, escrow.AutoRelease, escrow.ExpiresAt,
		itemDetailsJSON, shippingDetailsJSON, escrow.Terms, escrow.SpecialConditions,
		escrow.RequiresKYC, escrow.InsuranceEnabled, escrow.InsuranceAmount, escrow.InsurancePremium,
		metadataJSON, escrow.CreatedAt, escrow.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetEscrow(ctx context.Context, id uuid.UUID) (*models.Escrow, error) {
	query := `
		SELECT id, reference_number, type, status, title, description,
			buyer_id, seller_id, broker_id, amount, currency,
			fee_amount, fee_percentage, fee_paid_by,
			funded_amount, released_amount, refunded_amount,
			inspection_days, inspection_start, inspection_end,
			auto_release, auto_release_at, expires_at,
			item_details, shipping_details, terms, special_conditions,
			buyer_approved, seller_approved, buyer_approved_at, seller_approved_at,
			risk_score, requires_kyc, kyc_verified,
			insurance_enabled, insurance_amount, insurance_premium,
			metadata, created_at, updated_at, funded_at, completed_at
		FROM escrows WHERE id = $1`

	var escrow models.Escrow
	var itemDetailsJSON, shippingDetailsJSON, metadataJSON []byte

	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&escrow.ID, &escrow.ReferenceNumber, &escrow.Type, &escrow.Status,
		&escrow.Title, &escrow.Description, &escrow.BuyerID, &escrow.SellerID,
		&escrow.BrokerID, &escrow.Amount, &escrow.Currency,
		&escrow.FeeAmount, &escrow.FeePercentage, &escrow.FeePaidBy,
		&escrow.FundedAmount, &escrow.ReleasedAmount, &escrow.RefundedAmount,
		&escrow.InspectionDays, &escrow.InspectionStart, &escrow.InspectionEnd,
		&escrow.AutoRelease, &escrow.AutoReleaseAt, &escrow.ExpiresAt,
		&itemDetailsJSON, &shippingDetailsJSON, &escrow.Terms, &escrow.SpecialConditions,
		&escrow.BuyerApproved, &escrow.SellerApproved, &escrow.BuyerApprovedAt, &escrow.SellerApprovedAt,
		&escrow.RiskScore, &escrow.RequiresKYC, &escrow.KYCVerified,
		&escrow.InsuranceEnabled, &escrow.InsuranceAmount, &escrow.InsurancePremium,
		&metadataJSON, &escrow.CreatedAt, &escrow.UpdatedAt, &escrow.FundedAt, &escrow.CompletedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if len(itemDetailsJSON) > 0 {
		json.Unmarshal(itemDetailsJSON, &escrow.ItemDetails)
	}
	if len(shippingDetailsJSON) > 0 {
		json.Unmarshal(shippingDetailsJSON, &escrow.ShippingDetails)
	}
	if len(metadataJSON) > 0 {
		json.Unmarshal(metadataJSON, &escrow.Metadata)
	}

	return &escrow, nil
}

func (p *PostgresDB) GetEscrowByReference(ctx context.Context, ref string) (*models.Escrow, error) {
	query := `SELECT id FROM escrows WHERE reference_number = $1`
	var id uuid.UUID
	err := p.db.QueryRowContext(ctx, query, ref).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p.GetEscrow(ctx, id)
}

func (p *PostgresDB) UpdateEscrow(ctx context.Context, escrow *models.Escrow) error {
	itemDetailsJSON, _ := json.Marshal(escrow.ItemDetails)
	shippingDetailsJSON, _ := json.Marshal(escrow.ShippingDetails)
	metadataJSON, _ := json.Marshal(escrow.Metadata)

	query := `
		UPDATE escrows SET
			status = $2, title = $3, description = $4,
			funded_amount = $5, released_amount = $6, refunded_amount = $7,
			inspection_start = $8, inspection_end = $9,
			auto_release_at = $10, item_details = $11, shipping_details = $12,
			terms = $13, special_conditions = $14,
			buyer_approved = $15, seller_approved = $16,
			buyer_approved_at = $17, seller_approved_at = $18,
			risk_score = $19, kyc_verified = $20,
			metadata = $21, updated_at = $22, funded_at = $23, completed_at = $24
		WHERE id = $1`

	_, err := p.db.ExecContext(ctx, query,
		escrow.ID, escrow.Status, escrow.Title, escrow.Description,
		escrow.FundedAmount, escrow.ReleasedAmount, escrow.RefundedAmount,
		escrow.InspectionStart, escrow.InspectionEnd,
		escrow.AutoReleaseAt, itemDetailsJSON, shippingDetailsJSON,
		escrow.Terms, escrow.SpecialConditions,
		escrow.BuyerApproved, escrow.SellerApproved,
		escrow.BuyerApprovedAt, escrow.SellerApprovedAt,
		escrow.RiskScore, escrow.KYCVerified,
		metadataJSON, time.Now(), escrow.FundedAt, escrow.CompletedAt,
	)

	return err
}

func (p *PostgresDB) ListEscrows(ctx context.Context, userID uuid.UUID, role string, status string, escrowType string, limit, offset int) ([]*models.Escrow, int64, error) {
	var args []interface{}
	var conditions []string
	argNum := 1

	if role == "buyer" {
		conditions = append(conditions, fmt.Sprintf("buyer_id = $%d", argNum))
		args = append(args, userID)
		argNum++
	} else if role == "seller" {
		conditions = append(conditions, fmt.Sprintf("seller_id = $%d", argNum))
		args = append(args, userID)
		argNum++
	} else {
		conditions = append(conditions, fmt.Sprintf("(buyer_id = $%d OR seller_id = $%d)", argNum, argNum+1))
		args = append(args, userID, userID)
		argNum += 2
	}

	if status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argNum))
		args = append(args, status)
		argNum++
	}

	if escrowType != "" {
		conditions = append(conditions, fmt.Sprintf("type = $%d", argNum))
		args = append(args, escrowType)
		argNum++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + conditions[0]
		for i := 1; i < len(conditions); i++ {
			whereClause += " AND " + conditions[i]
		}
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM escrows %s", whereClause)
	var total int64
	p.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, reference_number, type, status, title, description,
			buyer_id, seller_id, amount, currency, funded_amount,
			created_at, updated_at
		FROM escrows %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, whereClause, argNum, argNum+1)

	args = append(args, limit, offset)

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var escrows []*models.Escrow
	for rows.Next() {
		var e models.Escrow
		err := rows.Scan(
			&e.ID, &e.ReferenceNumber, &e.Type, &e.Status, &e.Title, &e.Description,
			&e.BuyerID, &e.SellerID, &e.Amount, &e.Currency, &e.FundedAmount,
			&e.CreatedAt, &e.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		escrows = append(escrows, &e)
	}

	return escrows, total, nil
}

func (p *PostgresDB) CreateMilestone(ctx context.Context, milestone *models.Milestone) error {
	deliverablesJSON, _ := json.Marshal(milestone.Deliverables)
	evidenceJSON, _ := json.Marshal(milestone.Evidence)

	query := `
		INSERT INTO milestones (
			id, escrow_id, title, description, amount, percentage,
			sequence, status, due_date, deliverables, evidence,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`

	_, err := p.db.ExecContext(ctx, query,
		milestone.ID, milestone.EscrowID, milestone.Title, milestone.Description,
		milestone.Amount, milestone.Percentage, milestone.Sequence, milestone.Status,
		milestone.DueDate, deliverablesJSON, evidenceJSON,
		milestone.CreatedAt, milestone.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetMilestones(ctx context.Context, escrowID uuid.UUID) ([]*models.Milestone, error) {
	query := `
		SELECT id, escrow_id, title, description, amount, percentage,
			sequence, status, due_date, completed_at, approved_at, released_at,
			deliverables, evidence, created_at, updated_at
		FROM milestones WHERE escrow_id = $1 ORDER BY sequence`

	rows, err := p.db.QueryContext(ctx, query, escrowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var milestones []*models.Milestone
	for rows.Next() {
		var m models.Milestone
		var deliverablesJSON, evidenceJSON []byte

		err := rows.Scan(
			&m.ID, &m.EscrowID, &m.Title, &m.Description, &m.Amount, &m.Percentage,
			&m.Sequence, &m.Status, &m.DueDate, &m.CompletedAt, &m.ApprovedAt, &m.ReleasedAt,
			&deliverablesJSON, &evidenceJSON, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(deliverablesJSON) > 0 {
			json.Unmarshal(deliverablesJSON, &m.Deliverables)
		}
		if len(evidenceJSON) > 0 {
			json.Unmarshal(evidenceJSON, &m.Evidence)
		}

		milestones = append(milestones, &m)
	}

	return milestones, nil
}

func (p *PostgresDB) UpdateMilestone(ctx context.Context, milestone *models.Milestone) error {
	deliverablesJSON, _ := json.Marshal(milestone.Deliverables)
	evidenceJSON, _ := json.Marshal(milestone.Evidence)

	query := `
		UPDATE milestones SET
			status = $2, completed_at = $3, approved_at = $4, released_at = $5,
			deliverables = $6, evidence = $7, updated_at = $8
		WHERE id = $1`

	_, err := p.db.ExecContext(ctx, query,
		milestone.ID, milestone.Status, milestone.CompletedAt, milestone.ApprovedAt,
		milestone.ReleasedAt, deliverablesJSON, evidenceJSON, time.Now(),
	)

	return err
}

func (p *PostgresDB) CreateDispute(ctx context.Context, dispute *models.Dispute) error {
	query := `
		INSERT INTO disputes (
			id, escrow_id, milestone_id, initiated_by, initiator_role,
			status, reason, description, evidence_deadline,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

	_, err := p.db.ExecContext(ctx, query,
		dispute.ID, dispute.EscrowID, dispute.MilestoneID, dispute.InitiatedBy,
		dispute.InitiatorRole, dispute.Status, dispute.Reason, dispute.Description,
		dispute.EvidenceDeadline, dispute.CreatedAt, dispute.UpdatedAt,
	)

	return err
}

func (p *PostgresDB) GetDispute(ctx context.Context, id uuid.UUID) (*models.Dispute, error) {
	query := `
		SELECT id, escrow_id, milestone_id, initiated_by, initiator_role,
			status, reason, description, resolution, resolution_notes,
			arbitrator_id, buyer_amount, seller_amount, evidence_deadline,
			created_at, updated_at, resolved_at
		FROM disputes WHERE id = $1`

	var d models.Dispute
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&d.ID, &d.EscrowID, &d.MilestoneID, &d.InitiatedBy, &d.InitiatorRole,
		&d.Status, &d.Reason, &d.Description, &d.Resolution, &d.ResolutionNotes,
		&d.ArbitratorID, &d.BuyerAmount, &d.SellerAmount, &d.EvidenceDeadline,
		&d.CreatedAt, &d.UpdatedAt, &d.ResolvedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &d, err
}

func (p *PostgresDB) GetDisputeByEscrow(ctx context.Context, escrowID uuid.UUID) (*models.Dispute, error) {
	query := `SELECT id FROM disputes WHERE escrow_id = $1 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1`
	var id uuid.UUID
	err := p.db.QueryRowContext(ctx, query, escrowID).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p.GetDispute(ctx, id)
}

func (p *PostgresDB) UpdateDispute(ctx context.Context, dispute *models.Dispute) error {
	query := `
		UPDATE disputes SET
			status = $2, resolution = $3, resolution_notes = $4,
			arbitrator_id = $5, buyer_amount = $6, seller_amount = $7,
			updated_at = $8, resolved_at = $9
		WHERE id = $1`

	_, err := p.db.ExecContext(ctx, query,
		dispute.ID, dispute.Status, dispute.Resolution, dispute.ResolutionNotes,
		dispute.ArbitratorID, dispute.BuyerAmount, dispute.SellerAmount,
		time.Now(), dispute.ResolvedAt,
	)

	return err
}

func (p *PostgresDB) CreateEvidence(ctx context.Context, evidence *models.Evidence) error {
	query := `
		INSERT INTO evidence (
			id, dispute_id, submitted_by, type, title, description,
			file_url, file_type, file_size, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

	_, err := p.db.ExecContext(ctx, query,
		evidence.ID, evidence.DisputeID, evidence.SubmittedBy, evidence.Type,
		evidence.Title, evidence.Description, evidence.FileURL, evidence.FileType,
		evidence.FileSize, evidence.CreatedAt,
	)

	return err
}

func (p *PostgresDB) GetEvidenceByDispute(ctx context.Context, disputeID uuid.UUID) ([]*models.Evidence, error) {
	query := `
		SELECT id, dispute_id, submitted_by, type, title, description,
			file_url, file_type, file_size, created_at
		FROM evidence WHERE dispute_id = $1 ORDER BY created_at`

	rows, err := p.db.QueryContext(ctx, query, disputeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var evidences []*models.Evidence
	for rows.Next() {
		var e models.Evidence
		err := rows.Scan(
			&e.ID, &e.DisputeID, &e.SubmittedBy, &e.Type, &e.Title, &e.Description,
			&e.FileURL, &e.FileType, &e.FileSize, &e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		evidences = append(evidences, &e)
	}

	return evidences, nil
}

func (p *PostgresDB) CreateEvent(ctx context.Context, event *models.EscrowEvent) error {
	metadataJSON, _ := json.Marshal(event.Metadata)

	query := `
		INSERT INTO escrow_events (
			id, escrow_id, event_type, actor_id, actor_role,
			description, metadata, ip_address, user_agent, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

	_, err := p.db.ExecContext(ctx, query,
		event.ID, event.EscrowID, event.EventType, event.ActorID, event.ActorRole,
		event.Description, metadataJSON, event.IPAddress, event.UserAgent, event.CreatedAt,
	)

	return err
}

func (p *PostgresDB) GetEvents(ctx context.Context, escrowID uuid.UUID) ([]*models.EscrowEvent, error) {
	query := `
		SELECT id, escrow_id, event_type, actor_id, actor_role,
			description, metadata, ip_address, user_agent, created_at
		FROM escrow_events WHERE escrow_id = $1 ORDER BY created_at DESC`

	rows, err := p.db.QueryContext(ctx, query, escrowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.EscrowEvent
	for rows.Next() {
		var e models.EscrowEvent
		var metadataJSON []byte

		err := rows.Scan(
			&e.ID, &e.EscrowID, &e.EventType, &e.ActorID, &e.ActorRole,
			&e.Description, &metadataJSON, &e.IPAddress, &e.UserAgent, &e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &e.Metadata)
		}

		events = append(events, &e)
	}

	return events, nil
}

func (p *PostgresDB) GetStats(ctx context.Context, userID *uuid.UUID) (*models.EscrowStats, error) {
	var stats models.EscrowStats
	var whereClause string
	var args []interface{}

	if userID != nil {
		whereClause = "WHERE buyer_id = $1 OR seller_id = $1"
		args = append(args, *userID)
	}

	query := fmt.Sprintf(`
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status IN ('created', 'funded', 'in_progress', 'delivered', 'inspection')) as active,
			COUNT(*) FILTER (WHERE status = 'completed') as completed,
			COUNT(*) FILTER (WHERE status = 'disputed') as disputed,
			COALESCE(SUM(amount), 0) as volume,
			COALESCE(SUM(fee_amount), 0) as fees,
			COALESCE(AVG(amount), 0) as avg_amount
		FROM escrows %s`, whereClause)

	err := p.db.QueryRowContext(ctx, query, args...).Scan(
		&stats.TotalEscrows, &stats.ActiveEscrows, &stats.CompletedEscrows,
		&stats.DisputedEscrows, &stats.TotalVolume, &stats.TotalFees, &stats.AverageAmount,
	)

	if stats.TotalEscrows > 0 {
		stats.DisputeRate = float64(stats.DisputedEscrows) / float64(stats.TotalEscrows) * 100
	}

	return &stats, err
}

func (p *PostgresDB) GetTemplates(ctx context.Context) ([]*models.EscrowTemplate, error) {
	query := `
		SELECT id, name, type, description, default_inspection_days,
			default_fee_percentage, default_fee_paid_by, requires_kyc,
			requires_shipping, terms, milestone_templates, is_active,
			created_at, updated_at
		FROM escrow_templates WHERE is_active = true ORDER BY name`

	rows, err := p.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*models.EscrowTemplate
	for rows.Next() {
		var t models.EscrowTemplate
		var milestoneTemplatesJSON []byte

		err := rows.Scan(
			&t.ID, &t.Name, &t.Type, &t.Description, &t.DefaultInspectionDays,
			&t.DefaultFeePercentage, &t.DefaultFeePaidBy, &t.RequiresKYC,
			&t.RequiresShipping, &t.Terms, &milestoneTemplatesJSON, &t.IsActive,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(milestoneTemplatesJSON) > 0 {
			json.Unmarshal(milestoneTemplatesJSON, &t.MilestoneTemplates)
		}

		templates = append(templates, &t)
	}

	return templates, nil
}
