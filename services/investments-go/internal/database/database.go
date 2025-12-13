package database

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/investments-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu                  sync.RWMutex
	stocks              map[uuid.UUID]*models.Stock
	etfs                map[uuid.UUID]*models.ETF
	commodities         map[uuid.UUID]*models.Commodity
	portfolios          map[uuid.UUID]*models.Portfolio
	holdings            map[uuid.UUID]*models.Holding
	orders              map[uuid.UUID]*models.Order
	watchlists          map[uuid.UUID]*models.Watchlist
	priceAlerts         map[uuid.UUID]*models.PriceAlert
	dividends           map[uuid.UUID]*models.Dividend
	recurringInvestments map[uuid.UUID]*models.RecurringInvestment
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		stocks:              make(map[uuid.UUID]*models.Stock),
		etfs:                make(map[uuid.UUID]*models.ETF),
		commodities:         make(map[uuid.UUID]*models.Commodity),
		portfolios:          make(map[uuid.UUID]*models.Portfolio),
		holdings:            make(map[uuid.UUID]*models.Holding),
		orders:              make(map[uuid.UUID]*models.Order),
		watchlists:          make(map[uuid.UUID]*models.Watchlist),
		priceAlerts:         make(map[uuid.UUID]*models.PriceAlert),
		dividends:           make(map[uuid.UUID]*models.Dividend),
		recurringInvestments: make(map[uuid.UUID]*models.RecurringInvestment),
	}
	db.seedData()
	return db
}

func (db *InMemoryDB) seedData() {
	// Seed African stocks
	africanStocks := []models.Stock{
		// Nigerian Stock Exchange (NGX)
		{ID: uuid.New(), Symbol: "DANGCEM", Name: "Dangote Cement PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Basic Materials", Industry: "Cement", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(290.50), MarketCap: decimal.NewFromFloat(4950000000000), PERatio: decimal.NewFromFloat(12.5), DividendYield: decimal.NewFromFloat(4.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "GTCO", Name: "Guaranty Trust Holding Company", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Financial Services", Industry: "Banks", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(45.80), MarketCap: decimal.NewFromFloat(1350000000000), PERatio: decimal.NewFromFloat(4.8), DividendYield: decimal.NewFromFloat(8.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "ZENITHBANK", Name: "Zenith Bank PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Financial Services", Industry: "Banks", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(38.25), MarketCap: decimal.NewFromFloat(1200000000000), PERatio: decimal.NewFromFloat(3.9), DividendYield: decimal.NewFromFloat(9.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "MTNN", Name: "MTN Nigeria Communications", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Communication Services", Industry: "Telecom", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(285.00), MarketCap: decimal.NewFromFloat(5800000000000), PERatio: decimal.NewFromFloat(15.2), DividendYield: decimal.NewFromFloat(5.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "AIRTELAFRI", Name: "Airtel Africa PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Communication Services", Industry: "Telecom", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(1850.00), MarketCap: decimal.NewFromFloat(6950000000000), PERatio: decimal.NewFromFloat(18.5), DividendYield: decimal.NewFromFloat(3.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "BUACEMENT", Name: "BUA Cement PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Basic Materials", Industry: "Cement", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(95.50), MarketCap: decimal.NewFromFloat(3230000000000), PERatio: decimal.NewFromFloat(22.1), DividendYield: decimal.NewFromFloat(2.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "NESTLE", Name: "Nestle Nigeria PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Consumer Defensive", Industry: "Food Products", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(1150.00), MarketCap: decimal.NewFromFloat(912000000000), PERatio: decimal.NewFromFloat(28.5), DividendYield: decimal.NewFromFloat(4.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "SEPLAT", Name: "Seplat Energy PLC", Exchange: models.ExchangeNGX, AssetType: models.AssetTypeStock, Currency: "NGN", Sector: "Energy", Industry: "Oil & Gas", Country: "Nigeria", CurrentPrice: decimal.NewFromFloat(2850.00), MarketCap: decimal.NewFromFloat(1680000000000), PERatio: decimal.NewFromFloat(8.2), DividendYield: decimal.NewFromFloat(6.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		
		// Johannesburg Stock Exchange (JSE)
		{ID: uuid.New(), Symbol: "NPN", Name: "Naspers Limited", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Technology", Industry: "Internet Content", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(3250.00), MarketCap: decimal.NewFromFloat(1420000000000), PERatio: decimal.NewFromFloat(35.2), DividendYield: decimal.NewFromFloat(0.3), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "SOL", Name: "Sasol Limited", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Energy", Industry: "Oil & Gas", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(185.50), MarketCap: decimal.NewFromFloat(116000000000), PERatio: decimal.NewFromFloat(6.8), DividendYield: decimal.NewFromFloat(5.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "SBK", Name: "Standard Bank Group", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Financial Services", Industry: "Banks", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(195.80), MarketCap: decimal.NewFromFloat(310000000000), PERatio: decimal.NewFromFloat(8.5), DividendYield: decimal.NewFromFloat(5.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "FSR", Name: "FirstRand Limited", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Financial Services", Industry: "Banks", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(72.50), MarketCap: decimal.NewFromFloat(405000000000), PERatio: decimal.NewFromFloat(11.2), DividendYield: decimal.NewFromFloat(4.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "MTN", Name: "MTN Group Limited", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Communication Services", Industry: "Telecom", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(125.30), MarketCap: decimal.NewFromFloat(228000000000), PERatio: decimal.NewFromFloat(12.8), DividendYield: decimal.NewFromFloat(4.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "AGL", Name: "Anglo American PLC", Exchange: models.ExchangeJSE, AssetType: models.AssetTypeStock, Currency: "ZAR", Sector: "Basic Materials", Industry: "Mining", Country: "South Africa", CurrentPrice: decimal.NewFromFloat(485.00), MarketCap: decimal.NewFromFloat(590000000000), PERatio: decimal.NewFromFloat(9.5), DividendYield: decimal.NewFromFloat(6.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		
		// Nairobi Securities Exchange (NSE)
		{ID: uuid.New(), Symbol: "SCOM", Name: "Safaricom PLC", Exchange: models.ExchangeNSE, AssetType: models.AssetTypeStock, Currency: "KES", Sector: "Communication Services", Industry: "Telecom", Country: "Kenya", CurrentPrice: decimal.NewFromFloat(28.50), MarketCap: decimal.NewFromFloat(1140000000000), PERatio: decimal.NewFromFloat(14.2), DividendYield: decimal.NewFromFloat(6.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "EQTY", Name: "Equity Group Holdings", Exchange: models.ExchangeNSE, AssetType: models.AssetTypeStock, Currency: "KES", Sector: "Financial Services", Industry: "Banks", Country: "Kenya", CurrentPrice: decimal.NewFromFloat(48.25), MarketCap: decimal.NewFromFloat(182000000000), PERatio: decimal.NewFromFloat(5.8), DividendYield: decimal.NewFromFloat(5.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "KCB", Name: "KCB Group PLC", Exchange: models.ExchangeNSE, AssetType: models.AssetTypeStock, Currency: "KES", Sector: "Financial Services", Industry: "Banks", Country: "Kenya", CurrentPrice: decimal.NewFromFloat(38.80), MarketCap: decimal.NewFromFloat(125000000000), PERatio: decimal.NewFromFloat(4.2), DividendYield: decimal.NewFromFloat(7.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "EABL", Name: "East African Breweries", Exchange: models.ExchangeNSE, AssetType: models.AssetTypeStock, Currency: "KES", Sector: "Consumer Defensive", Industry: "Beverages", Country: "Kenya", CurrentPrice: decimal.NewFromFloat(165.00), MarketCap: decimal.NewFromFloat(130500000000), PERatio: decimal.NewFromFloat(18.5), DividendYield: decimal.NewFromFloat(4.2), IsFractional: true, IsTradeable: true, LotSize: 1},
		
		// Ghana Stock Exchange (GSE)
		{ID: uuid.New(), Symbol: "MTNGH", Name: "MTN Ghana", Exchange: models.ExchangeGSE, AssetType: models.AssetTypeStock, Currency: "GHS", Sector: "Communication Services", Industry: "Telecom", Country: "Ghana", CurrentPrice: decimal.NewFromFloat(1.85), MarketCap: decimal.NewFromFloat(24500000000), PERatio: decimal.NewFromFloat(8.5), DividendYield: decimal.NewFromFloat(12.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "GCB", Name: "GCB Bank Limited", Exchange: models.ExchangeGSE, AssetType: models.AssetTypeStock, Currency: "GHS", Sector: "Financial Services", Industry: "Banks", Country: "Ghana", CurrentPrice: decimal.NewFromFloat(5.25), MarketCap: decimal.NewFromFloat(1390000000), PERatio: decimal.NewFromFloat(3.8), DividendYield: decimal.NewFromFloat(8.5), IsFractional: true, IsTradeable: true, LotSize: 1},
		
		// Egyptian Exchange (EGX)
		{ID: uuid.New(), Symbol: "COMI", Name: "Commercial International Bank", Exchange: models.ExchangeEGX, AssetType: models.AssetTypeStock, Currency: "EGP", Sector: "Financial Services", Industry: "Banks", Country: "Egypt", CurrentPrice: decimal.NewFromFloat(85.50), MarketCap: decimal.NewFromFloat(125000000000), PERatio: decimal.NewFromFloat(6.2), DividendYield: decimal.NewFromFloat(4.8), IsFractional: true, IsTradeable: true, LotSize: 1},
		{ID: uuid.New(), Symbol: "HRHO", Name: "Hermes Holding", Exchange: models.ExchangeEGX, AssetType: models.AssetTypeStock, Currency: "EGP", Sector: "Financial Services", Industry: "Investment Banking", Country: "Egypt", CurrentPrice: decimal.NewFromFloat(28.50), MarketCap: decimal.NewFromFloat(42000000000), PERatio: decimal.NewFromFloat(12.5), DividendYield: decimal.NewFromFloat(2.5), IsFractional: true, IsTradeable: true, LotSize: 1},
	}
	
	for i := range africanStocks {
		africanStocks[i].CreatedAt = time.Now()
		africanStocks[i].LastUpdated = time.Now()
		db.stocks[africanStocks[i].ID] = &africanStocks[i]
	}
	
	// Seed commodities
	commodities := []models.Commodity{
		{ID: uuid.New(), Symbol: "XAU", Name: "Gold", Category: "precious_metals", Unit: "oz", Currency: "USD", CurrentPrice: decimal.NewFromFloat(2050.50), BidPrice: decimal.NewFromFloat(2050.00), AskPrice: decimal.NewFromFloat(2051.00), MinOrderSize: decimal.NewFromFloat(0.001), IsTradeable: true},
		{ID: uuid.New(), Symbol: "XAG", Name: "Silver", Category: "precious_metals", Unit: "oz", Currency: "USD", CurrentPrice: decimal.NewFromFloat(24.85), BidPrice: decimal.NewFromFloat(24.80), AskPrice: decimal.NewFromFloat(24.90), MinOrderSize: decimal.NewFromFloat(0.01), IsTradeable: true},
		{ID: uuid.New(), Symbol: "XPT", Name: "Platinum", Category: "precious_metals", Unit: "oz", Currency: "USD", CurrentPrice: decimal.NewFromFloat(985.50), BidPrice: decimal.NewFromFloat(985.00), AskPrice: decimal.NewFromFloat(986.00), MinOrderSize: decimal.NewFromFloat(0.001), IsTradeable: true},
		{ID: uuid.New(), Symbol: "XPD", Name: "Palladium", Category: "precious_metals", Unit: "oz", Currency: "USD", CurrentPrice: decimal.NewFromFloat(1125.00), BidPrice: decimal.NewFromFloat(1124.00), AskPrice: decimal.NewFromFloat(1126.00), MinOrderSize: decimal.NewFromFloat(0.001), IsTradeable: true},
		{ID: uuid.New(), Symbol: "CL", Name: "Crude Oil (WTI)", Category: "energy", Unit: "barrel", Currency: "USD", CurrentPrice: decimal.NewFromFloat(78.50), BidPrice: decimal.NewFromFloat(78.45), AskPrice: decimal.NewFromFloat(78.55), MinOrderSize: decimal.NewFromFloat(0.1), IsTradeable: true},
		{ID: uuid.New(), Symbol: "NG", Name: "Natural Gas", Category: "energy", Unit: "MMBtu", Currency: "USD", CurrentPrice: decimal.NewFromFloat(2.85), BidPrice: decimal.NewFromFloat(2.84), AskPrice: decimal.NewFromFloat(2.86), MinOrderSize: decimal.NewFromFloat(1), IsTradeable: true},
		{ID: uuid.New(), Symbol: "ZC", Name: "Corn", Category: "agriculture", Unit: "bushel", Currency: "USD", CurrentPrice: decimal.NewFromFloat(4.85), BidPrice: decimal.NewFromFloat(4.84), AskPrice: decimal.NewFromFloat(4.86), MinOrderSize: decimal.NewFromFloat(10), IsTradeable: true},
		{ID: uuid.New(), Symbol: "CC", Name: "Cocoa", Category: "agriculture", Unit: "tonne", Currency: "USD", CurrentPrice: decimal.NewFromFloat(4250.00), BidPrice: decimal.NewFromFloat(4248.00), AskPrice: decimal.NewFromFloat(4252.00), MinOrderSize: decimal.NewFromFloat(0.1), IsTradeable: true},
		{ID: uuid.New(), Symbol: "KC", Name: "Coffee", Category: "agriculture", Unit: "lb", Currency: "USD", CurrentPrice: decimal.NewFromFloat(1.95), BidPrice: decimal.NewFromFloat(1.94), AskPrice: decimal.NewFromFloat(1.96), MinOrderSize: decimal.NewFromFloat(100), IsTradeable: true},
	}
	
	for i := range commodities {
		commodities[i].CreatedAt = time.Now()
		commodities[i].LastUpdated = time.Now()
		db.commodities[commodities[i].ID] = &commodities[i]
	}
	
	// Seed ETFs
	etfs := []models.ETF{
		{ID: uuid.New(), Symbol: "NGXETF", Name: "NGX 30 ETF", Exchange: models.ExchangeNGX, Currency: "NGN", Category: "Equity", NAV: decimal.NewFromFloat(125.50), CurrentPrice: decimal.NewFromFloat(125.80), ExpenseRatio: decimal.NewFromFloat(0.45), AUM: decimal.NewFromFloat(15000000000), Holdings: 30, DividendYield: decimal.NewFromFloat(5.2), IsTradeable: true},
		{ID: uuid.New(), Symbol: "SATRIX40", Name: "Satrix 40 ETF", Exchange: models.ExchangeJSE, Currency: "ZAR", Category: "Equity", NAV: decimal.NewFromFloat(72.50), CurrentPrice: decimal.NewFromFloat(72.80), ExpenseRatio: decimal.NewFromFloat(0.35), AUM: decimal.NewFromFloat(28000000000), Holdings: 40, DividendYield: decimal.NewFromFloat(3.8), IsTradeable: true},
		{ID: uuid.New(), Symbol: "NEWGOLD", Name: "NewGold ETF", Exchange: models.ExchangeJSE, Currency: "ZAR", Category: "Commodity", NAV: decimal.NewFromFloat(285.00), CurrentPrice: decimal.NewFromFloat(285.50), ExpenseRatio: decimal.NewFromFloat(0.40), AUM: decimal.NewFromFloat(45000000000), Holdings: 1, DividendYield: decimal.NewFromFloat(0), IsTradeable: true},
		{ID: uuid.New(), Symbol: "AFRETF", Name: "Africa ex-SA ETF", Exchange: models.ExchangeJSE, Currency: "ZAR", Category: "Equity", NAV: decimal.NewFromFloat(45.80), CurrentPrice: decimal.NewFromFloat(46.00), ExpenseRatio: decimal.NewFromFloat(0.65), AUM: decimal.NewFromFloat(8500000000), Holdings: 50, DividendYield: decimal.NewFromFloat(4.5), IsTradeable: true},
	}
	
	for i := range etfs {
		etfs[i].CreatedAt = time.Now()
		etfs[i].LastUpdated = time.Now()
		db.etfs[etfs[i].ID] = &etfs[i]
	}
}

// Stock operations
func (db *InMemoryDB) GetStocks(ctx context.Context, exchange models.Exchange) ([]*models.Stock, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var stocks []*models.Stock
	for _, s := range db.stocks {
		if exchange == "" || s.Exchange == exchange {
			stocks = append(stocks, s)
		}
	}
	return stocks, nil
}

func (db *InMemoryDB) GetStockBySymbol(ctx context.Context, symbol string, exchange models.Exchange) (*models.Stock, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, s := range db.stocks {
		if s.Symbol == symbol && (exchange == "" || s.Exchange == exchange) {
			return s, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) GetStock(ctx context.Context, id uuid.UUID) (*models.Stock, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.stocks[id], nil
}

// ETF operations
func (db *InMemoryDB) GetETFs(ctx context.Context, exchange models.Exchange) ([]*models.ETF, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var etfs []*models.ETF
	for _, e := range db.etfs {
		if exchange == "" || e.Exchange == exchange {
			etfs = append(etfs, e)
		}
	}
	return etfs, nil
}

func (db *InMemoryDB) GetETF(ctx context.Context, id uuid.UUID) (*models.ETF, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.etfs[id], nil
}

// Commodity operations
func (db *InMemoryDB) GetCommodities(ctx context.Context, category string) ([]*models.Commodity, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var commodities []*models.Commodity
	for _, c := range db.commodities {
		if category == "" || c.Category == category {
			commodities = append(commodities, c)
		}
	}
	return commodities, nil
}

func (db *InMemoryDB) GetCommodity(ctx context.Context, id uuid.UUID) (*models.Commodity, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.commodities[id], nil
}

func (db *InMemoryDB) GetCommodityBySymbol(ctx context.Context, symbol string) (*models.Commodity, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, c := range db.commodities {
		if c.Symbol == symbol {
			return c, nil
		}
	}
	return nil, nil
}

// Portfolio operations
func (db *InMemoryDB) CreatePortfolio(ctx context.Context, portfolio *models.Portfolio) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.portfolios[portfolio.ID] = portfolio
	return nil
}

func (db *InMemoryDB) GetPortfolio(ctx context.Context, id uuid.UUID) (*models.Portfolio, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.portfolios[id], nil
}

func (db *InMemoryDB) GetUserPortfolios(ctx context.Context, userID uuid.UUID) ([]*models.Portfolio, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var portfolios []*models.Portfolio
	for _, p := range db.portfolios {
		if p.UserID == userID {
			portfolios = append(portfolios, p)
		}
	}
	return portfolios, nil
}

func (db *InMemoryDB) UpdatePortfolio(ctx context.Context, portfolio *models.Portfolio) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.portfolios[portfolio.ID] = portfolio
	return nil
}

// Holding operations
func (db *InMemoryDB) CreateHolding(ctx context.Context, holding *models.Holding) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.holdings[holding.ID] = holding
	return nil
}

func (db *InMemoryDB) GetHolding(ctx context.Context, id uuid.UUID) (*models.Holding, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.holdings[id], nil
}

func (db *InMemoryDB) GetPortfolioHoldings(ctx context.Context, portfolioID uuid.UUID) ([]*models.Holding, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var holdings []*models.Holding
	for _, h := range db.holdings {
		if h.PortfolioID == portfolioID {
			holdings = append(holdings, h)
		}
	}
	return holdings, nil
}

func (db *InMemoryDB) GetUserHoldingBySymbol(ctx context.Context, userID uuid.UUID, symbol string) (*models.Holding, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, h := range db.holdings {
		if h.UserID == userID && h.Symbol == symbol {
			return h, nil
		}
	}
	return nil, nil
}

func (db *InMemoryDB) UpdateHolding(ctx context.Context, holding *models.Holding) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.holdings[holding.ID] = holding
	return nil
}

func (db *InMemoryDB) DeleteHolding(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.holdings, id)
	return nil
}

// Order operations
func (db *InMemoryDB) CreateOrder(ctx context.Context, order *models.Order) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.orders[order.ID] = order
	return nil
}

func (db *InMemoryDB) GetOrder(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.orders[id], nil
}

func (db *InMemoryDB) GetUserOrders(ctx context.Context, userID uuid.UUID, status models.OrderStatus) ([]*models.Order, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var orders []*models.Order
	for _, o := range db.orders {
		if o.UserID == userID && (status == "" || o.Status == status) {
			orders = append(orders, o)
		}
	}
	return orders, nil
}

func (db *InMemoryDB) UpdateOrder(ctx context.Context, order *models.Order) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.orders[order.ID] = order
	return nil
}

// Watchlist operations
func (db *InMemoryDB) CreateWatchlist(ctx context.Context, watchlist *models.Watchlist) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.watchlists[watchlist.ID] = watchlist
	return nil
}

func (db *InMemoryDB) GetWatchlist(ctx context.Context, id uuid.UUID) (*models.Watchlist, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.watchlists[id], nil
}

func (db *InMemoryDB) GetUserWatchlists(ctx context.Context, userID uuid.UUID) ([]*models.Watchlist, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var watchlists []*models.Watchlist
	for _, w := range db.watchlists {
		if w.UserID == userID {
			watchlists = append(watchlists, w)
		}
	}
	return watchlists, nil
}

func (db *InMemoryDB) UpdateWatchlist(ctx context.Context, watchlist *models.Watchlist) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.watchlists[watchlist.ID] = watchlist
	return nil
}

func (db *InMemoryDB) DeleteWatchlist(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.watchlists, id)
	return nil
}

// Price Alert operations
func (db *InMemoryDB) CreatePriceAlert(ctx context.Context, alert *models.PriceAlert) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.priceAlerts[alert.ID] = alert
	return nil
}

func (db *InMemoryDB) GetUserPriceAlerts(ctx context.Context, userID uuid.UUID) ([]*models.PriceAlert, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var alerts []*models.PriceAlert
	for _, a := range db.priceAlerts {
		if a.UserID == userID {
			alerts = append(alerts, a)
		}
	}
	return alerts, nil
}

func (db *InMemoryDB) UpdatePriceAlert(ctx context.Context, alert *models.PriceAlert) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.priceAlerts[alert.ID] = alert
	return nil
}

func (db *InMemoryDB) DeletePriceAlert(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.priceAlerts, id)
	return nil
}

// Dividend operations
func (db *InMemoryDB) CreateDividend(ctx context.Context, dividend *models.Dividend) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.dividends[dividend.ID] = dividend
	return nil
}

func (db *InMemoryDB) GetUserDividends(ctx context.Context, userID uuid.UUID) ([]*models.Dividend, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var dividends []*models.Dividend
	for _, d := range db.dividends {
		if d.UserID == userID {
			dividends = append(dividends, d)
		}
	}
	return dividends, nil
}

// Recurring Investment operations
func (db *InMemoryDB) CreateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.recurringInvestments[recurring.ID] = recurring
	return nil
}

func (db *InMemoryDB) GetRecurringInvestment(ctx context.Context, id uuid.UUID) (*models.RecurringInvestment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.recurringInvestments[id], nil
}

func (db *InMemoryDB) GetUserRecurringInvestments(ctx context.Context, userID uuid.UUID) ([]*models.RecurringInvestment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var recurring []*models.RecurringInvestment
	for _, r := range db.recurringInvestments {
		if r.UserID == userID {
			recurring = append(recurring, r)
		}
	}
	return recurring, nil
}

func (db *InMemoryDB) UpdateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.recurringInvestments[recurring.ID] = recurring
	return nil
}

func (db *InMemoryDB) DeleteRecurringInvestment(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.recurringInvestments, id)
	return nil
}
