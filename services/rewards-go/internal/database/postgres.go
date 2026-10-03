package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neobank/rewards-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "rewards_service"

func NewPostgresDB(ctx context.Context, databaseURL string) (*PostgresDB, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	db := &PostgresDB{pool: pool}
	if err := db.ensureSchema(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if err := db.seedReferenceData(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("seed reference data: %w", err)
	}
	return db, nil
}

func (db *PostgresDB) ensureSchema(ctx context.Context) error {
	stmts := []string{
		fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schemaName),
	}
	for _, table := range []string{"partners", "programs", "redemptions", "referrals", "rewards", "user_rewards"} {
		stmts = append(stmts,
			fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.%s (
				id UUID PRIMARY KEY,
				data JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`, schemaName, table),
			fmt.Sprintf(`CREATE INDEX IF NOT EXISTS %s_data_gin ON %s.%s USING GIN (data)`, table, schemaName, table),
		)
	}
	for _, s := range stmts {
		if _, err := db.pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("ensure schema: %w", err)
		}
	}
	return nil
}

func (db *PostgresDB) Close(ctx context.Context) error {
	db.pool.Close()
	return nil
}

// -- generic helpers ---------------------------------------------------------

func (db *PostgresDB) upsert(ctx context.Context, table string, id uuid.UUID, doc any) error {
	b, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	_, err = db.pool.Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s.%s (id, data, created_at, updated_at)
			VALUES ($1, $2, now(), now())
			ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, schemaName, table),
		id, b)
	return err
}

func (db *PostgresDB) get(ctx context.Context, table string, id uuid.UUID, out any) (bool, error) {
	var b []byte
	err := db.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT data FROM %s.%s WHERE id = $1`, schemaName, table), id).Scan(&b)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(b, out)
}

// pgGet mirrors the `v, ok := m[k]` map-read idiom.
func pgGet[T any](ctx context.Context, db *PostgresDB, table string, id uuid.UUID) (*T, bool) {
	var v T
	found, err := db.get(ctx, table, id, &v)
	if err != nil || !found {
		return nil, false
	}
	return &v, true
}

func (db *PostgresDB) list(ctx context.Context, table, where string, args ...any) ([][]byte, error) {
	q := fmt.Sprintf(`SELECT data FROM %s.%s`, schemaName, table)
	if where != "" {
		q += " WHERE " + where
	}
	rows, err := db.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out [][]byte
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func unmarshalAll[T any](blobs [][]byte) ([]*T, error) {
	out := make([]*T, 0, len(blobs))
	for _, b := range blobs {
		var v T
		if err := json.Unmarshal(b, &v); err != nil {
			return nil, err
		}
		out = append(out, &v)
	}
	return out, nil
}

func (db *PostgresDB) seedReferenceData(ctx context.Context) error {
	db.seedPrograms(ctx)
	db.seedPartners(ctx)
	return nil
}

func (db *PostgresDB) seedPrograms(ctx context.Context) {

	now := time.Now()
	programs := []models.RewardProgram{
		{
			ID:             uuid.New(),
			Name:           "NeoBank Rewards",
			Description:    "Earn points on every transaction",
			Type:           models.RewardTypePoints,
			EarnRate:       decimal.NewFromFloat(0.01),
			MinTransaction: decimal.NewFromInt(100),
			MaxEarnPerDay:  decimal.NewFromInt(10000),
			BonusCategories: []models.BonusCategory{
				{Category: "groceries", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "fuel", Multiplier: decimal.NewFromFloat(1.5)},
				{Category: "dining", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "travel", Multiplier: decimal.NewFromFloat(3.0)},
			},
			StartDate: now,
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:             uuid.New(),
			Name:           "Cashback Plus",
			Description:    "Get cashback on qualifying purchases",
			Type:           models.RewardTypeCashback,
			EarnRate:       decimal.NewFromFloat(0.01),
			MinTransaction: decimal.NewFromInt(500),
			MaxEarnPerDay:  decimal.NewFromInt(5000),
			BonusCategories: []models.BonusCategory{
				{Category: "online_shopping", Multiplier: decimal.NewFromFloat(2.0)},
				{Category: "entertainment", Multiplier: decimal.NewFromFloat(1.5)},
			},
			StartDate: now,
			IsActive:  true,
			CreatedAt: now,
		},
	}
	
	for i := range programs {
		_ = db.upsert(ctx, "programs", programs[i].ID, &programs[i])
	}

}

func (db *PostgresDB) seedPartners(ctx context.Context) {

	now := time.Now()
	partners := []models.Partner{
		{
			ID:           uuid.New(),
			Name:         "Jumia",
			Category:     "E-commerce",
			Website:      "https://jumia.com.ng",
			CashbackRate: decimal.NewFromFloat(5.0),
			DiscountRate: decimal.NewFromFloat(10.0),
			Offers: []models.PartnerOffer{
				{
					ID:            uuid.New(),
					Title:         "10% Off Electronics",
					Description:   "Get 10% off all electronics",
					DiscountType:  "percentage",
					DiscountValue: decimal.NewFromFloat(10.0),
					MinPurchase:   decimal.NewFromInt(10000),
					ValidFrom:     now,
					ValidUntil:    now.AddDate(0, 3, 0),
					IsActive:      true,
				},
			},
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:           uuid.New(),
			Name:         "Uber",
			Category:     "Transport",
			Website:      "https://uber.com",
			CashbackRate: decimal.NewFromFloat(3.0),
			Offers: []models.PartnerOffer{
				{
					ID:            uuid.New(),
					Title:         "N500 Off First Ride",
					Description:   "Get N500 off your first ride",
					DiscountType:  "fixed",
					DiscountValue: decimal.NewFromFloat(500),
					ValidFrom:     now,
					ValidUntil:    now.AddDate(0, 1, 0),
					IsActive:      true,
				},
			},
			IsActive:  true,
			CreatedAt: now,
		},
		{
			ID:           uuid.New(),
			Name:         "Netflix",
			Category:     "Entertainment",
			Website:      "https://netflix.com",
			CashbackRate: decimal.NewFromFloat(2.0),
			IsActive:     true,
			CreatedAt:    now,
		},
		{
			ID:           uuid.New(),
			Name:         "Shoprite",
			Category:     "Groceries",
			Website:      "https://shoprite.com.ng",
			CashbackRate: decimal.NewFromFloat(4.0),
			IsActive:     true,
			CreatedAt:    now,
		},
		{
			ID:           uuid.New(),
			Name:         "Total Energies",
			Category:     "Fuel",
			Website:      "https://totalenergies.com.ng",
			CashbackRate: decimal.NewFromFloat(2.5),
			IsActive:     true,
			CreatedAt:    now,
		},
	}
	
	for i := range partners {
		_ = db.upsert(ctx, "partners", partners[i].ID, &partners[i])
	}

}

func (db *PostgresDB) GetPrograms(ctx context.Context) ([]*models.RewardProgram, error) {
	blobs_programs, err := db.list(ctx, "programs", "")
	if err != nil { return nil, err }
	allItems_programs, err := unmarshalAll[models.RewardProgram](blobs_programs)
	if err != nil { return nil, err }

	
	var programs []*models.RewardProgram
	for _, p := range allItems_programs {
		if p.IsActive {
			programs = append(programs, p)
		}
	}
	return programs, nil

}

func (db *PostgresDB) GetUserRewards(ctx context.Context, userID uuid.UUID) (*models.UserRewards, error) {
	blobs_userRewards, err := db.list(ctx, "user_rewards", "")
	if err != nil { return nil, err }
	allItems_userRewards, err := unmarshalAll[models.UserRewards](blobs_userRewards)
	if err != nil { return nil, err }

	
	for _, ur := range allItems_userRewards {
		if ur.UserID == userID {
			return ur, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) CreateUserRewards(ctx context.Context, userRewards *models.UserRewards) error {

	if err := db.upsert(ctx, "user_rewards", userRewards.ID, userRewards); err != nil { return err }
	return nil

}

func (db *PostgresDB) UpdateUserRewards(ctx context.Context, userRewards *models.UserRewards) error {

	if err := db.upsert(ctx, "user_rewards", userRewards.ID, userRewards); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateReward(ctx context.Context, reward *models.Reward) error {

	if err := db.upsert(ctx, "rewards", reward.ID, reward); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserRewardHistory(ctx context.Context, userID uuid.UUID) ([]*models.Reward, error) {
	blobs_rewards, err := db.list(ctx, "rewards", "")
	if err != nil { return nil, err }
	allItems_rewards, err := unmarshalAll[models.Reward](blobs_rewards)
	if err != nil { return nil, err }

	
	var rewards []*models.Reward
	for _, r := range allItems_rewards {
		if r.UserID == userID {
			rewards = append(rewards, r)
		}
	}
	return rewards, nil

}

func (db *PostgresDB) CreateRedemption(ctx context.Context, redemption *models.Redemption) error {

	if err := db.upsert(ctx, "redemptions", redemption.ID, redemption); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserRedemptions(ctx context.Context, userID uuid.UUID) ([]*models.Redemption, error) {
	blobs_redemptions, err := db.list(ctx, "redemptions", "")
	if err != nil { return nil, err }
	allItems_redemptions, err := unmarshalAll[models.Redemption](blobs_redemptions)
	if err != nil { return nil, err }

	
	var redemptions []*models.Redemption
	for _, r := range allItems_redemptions {
		if r.UserID == userID {
			redemptions = append(redemptions, r)
		}
	}
	return redemptions, nil

}

func (db *PostgresDB) GetPartners(ctx context.Context) ([]*models.Partner, error) {
	blobs_partners, err := db.list(ctx, "partners", "")
	if err != nil { return nil, err }
	allItems_partners, err := unmarshalAll[models.Partner](blobs_partners)
	if err != nil { return nil, err }

	
	var partners []*models.Partner
	for _, p := range allItems_partners {
		if p.IsActive {
			partners = append(partners, p)
		}
	}
	return partners, nil

}

func (db *PostgresDB) GetPartner(ctx context.Context, id uuid.UUID) (*models.Partner, error) {

	v, _ := pgGet[models.Partner](ctx, db, "partners", id)
	return v, nil

}

func (db *PostgresDB) CreateReferral(ctx context.Context, referral *models.Referral) error {

	if err := db.upsert(ctx, "referrals", referral.ID, referral); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserReferrals(ctx context.Context, userID uuid.UUID) ([]*models.Referral, error) {
	blobs_referrals, err := db.list(ctx, "referrals", "")
	if err != nil { return nil, err }
	allItems_referrals, err := unmarshalAll[models.Referral](blobs_referrals)
	if err != nil { return nil, err }

	
	var referrals []*models.Referral
	for _, r := range allItems_referrals {
		if r.ReferrerID == userID {
			referrals = append(referrals, r)
		}
	}
	return referrals, nil

}

func (db *PostgresDB) GetReferralByCode(ctx context.Context, code string) (*models.Referral, *models.UserRewards, error) {
	blobs_userRewards, err := db.list(ctx, "user_rewards", "")
	if err != nil { return nil, nil, err }
	allItems_userRewards, err := unmarshalAll[models.UserRewards](blobs_userRewards)
	if err != nil { return nil, nil, err }

	
	for _, ur := range allItems_userRewards {
		if ur.ReferralCode == code {
			return nil, ur, nil
		}
	}
	return nil, nil, nil

}
