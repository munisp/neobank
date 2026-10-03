package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/rewards-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetPrograms(ctx context.Context) ([]*models.RewardProgram, error)
	GetUserRewards(ctx context.Context, userID uuid.UUID) (*models.UserRewards, error)
	CreateUserRewards(ctx context.Context, userRewards *models.UserRewards) error
	UpdateUserRewards(ctx context.Context, userRewards *models.UserRewards) error
	CreateReward(ctx context.Context, reward *models.Reward) error
	GetUserRewardHistory(ctx context.Context, userID uuid.UUID) ([]*models.Reward, error)
	CreateRedemption(ctx context.Context, redemption *models.Redemption) error
	GetUserRedemptions(ctx context.Context, userID uuid.UUID) ([]*models.Redemption, error)
	GetPartners(ctx context.Context) ([]*models.Partner, error)
	GetPartner(ctx context.Context, id uuid.UUID) (*models.Partner, error)
	CreateReferral(ctx context.Context, referral *models.Referral) error
	GetUserReferrals(ctx context.Context, userID uuid.UUID) ([]*models.Referral, error)
	GetReferralByCode(ctx context.Context, code string) (*models.Referral, *models.UserRewards, error)
	Close(ctx context.Context) error
}

// Compile-time conformance assertions.
var (
	_ Store = (*InMemoryDB)(nil)
	_ Store = (*PostgresDB)(nil)
)

// Close is a no-op for the in-memory store.
func (db *InMemoryDB) Close(ctx context.Context) error { return nil }

// NewStore selects the persistence backend. An empty databaseURL yields the
// in-memory store (dev/test only) plus an explanatory error for logging.
func NewStore(ctx context.Context, databaseURL string) (Store, error) {
	if databaseURL == "" {
		log.Println("WARNING: DATABASE_URL not set — using in-memory store; data will NOT persist")
		return NewInMemoryDB(), errors.New("DATABASE_URL not configured; using non-persistent in-memory store")
	}
	return NewPostgresDB(ctx, databaseURL)
}
