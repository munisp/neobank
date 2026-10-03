package database

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/neobank/investments-service/internal/models"
)

// Store is the persistence contract for this service.
// InMemoryDB is for tests/local dev only; PostgresDB is the production store.
type Store interface {
	GetStocks(ctx context.Context, exchange models.Exchange) ([]*models.Stock, error)
	GetStockBySymbol(ctx context.Context, symbol string, exchange models.Exchange) (*models.Stock, error)
	GetStock(ctx context.Context, id uuid.UUID) (*models.Stock, error)
	GetETFs(ctx context.Context, exchange models.Exchange) ([]*models.ETF, error)
	GetETF(ctx context.Context, id uuid.UUID) (*models.ETF, error)
	GetCommodities(ctx context.Context, category string) ([]*models.Commodity, error)
	GetCommodity(ctx context.Context, id uuid.UUID) (*models.Commodity, error)
	GetCommodityBySymbol(ctx context.Context, symbol string) (*models.Commodity, error)
	CreatePortfolio(ctx context.Context, portfolio *models.Portfolio) error
	GetPortfolio(ctx context.Context, id uuid.UUID) (*models.Portfolio, error)
	GetUserPortfolios(ctx context.Context, userID uuid.UUID) ([]*models.Portfolio, error)
	UpdatePortfolio(ctx context.Context, portfolio *models.Portfolio) error
	CreateHolding(ctx context.Context, holding *models.Holding) error
	GetHolding(ctx context.Context, id uuid.UUID) (*models.Holding, error)
	GetPortfolioHoldings(ctx context.Context, portfolioID uuid.UUID) ([]*models.Holding, error)
	GetUserHoldingBySymbol(ctx context.Context, userID uuid.UUID, symbol string) (*models.Holding, error)
	UpdateHolding(ctx context.Context, holding *models.Holding) error
	DeleteHolding(ctx context.Context, id uuid.UUID) error
	CreateOrder(ctx context.Context, order *models.Order) error
	GetOrder(ctx context.Context, id uuid.UUID) (*models.Order, error)
	GetUserOrders(ctx context.Context, userID uuid.UUID, status models.OrderStatus) ([]*models.Order, error)
	UpdateOrder(ctx context.Context, order *models.Order) error
	CreateWatchlist(ctx context.Context, watchlist *models.Watchlist) error
	GetWatchlist(ctx context.Context, id uuid.UUID) (*models.Watchlist, error)
	GetUserWatchlists(ctx context.Context, userID uuid.UUID) ([]*models.Watchlist, error)
	UpdateWatchlist(ctx context.Context, watchlist *models.Watchlist) error
	DeleteWatchlist(ctx context.Context, id uuid.UUID) error
	CreatePriceAlert(ctx context.Context, alert *models.PriceAlert) error
	GetUserPriceAlerts(ctx context.Context, userID uuid.UUID) ([]*models.PriceAlert, error)
	UpdatePriceAlert(ctx context.Context, alert *models.PriceAlert) error
	DeletePriceAlert(ctx context.Context, id uuid.UUID) error
	CreateDividend(ctx context.Context, dividend *models.Dividend) error
	GetUserDividends(ctx context.Context, userID uuid.UUID) ([]*models.Dividend, error)
	CreateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error
	GetRecurringInvestment(ctx context.Context, id uuid.UUID) (*models.RecurringInvestment, error)
	GetUserRecurringInvestments(ctx context.Context, userID uuid.UUID) ([]*models.RecurringInvestment, error)
	UpdateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error
	DeleteRecurringInvestment(ctx context.Context, id uuid.UUID) error
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
