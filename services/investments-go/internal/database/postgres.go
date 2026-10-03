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
	"github.com/neobank/investments-service/internal/models"
)

// PostgresDB is the production persistence backend. Documents are stored as
// JSONB rows (id UUID PK, data JSONB, created_at, updated_at) with GIN indexes.
type PostgresDB struct {
	pool *pgxpool.Pool
}

const schemaName = "investments_service"

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
	for _, table := range []string{"commodities", "dividends", "etfs", "holdings", "orders", "portfolios", "price_alerts", "recurring_investments", "stocks", "watchlists"} {
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
	db.seedData(ctx)
	return nil
}

func (db *PostgresDB) seedData(ctx context.Context) {

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
		_ = db.upsert(ctx, "stocks", africanStocks[i].ID, &africanStocks[i])
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
		_ = db.upsert(ctx, "commodities", commodities[i].ID, &commodities[i])
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
		_ = db.upsert(ctx, "etfs", etfs[i].ID, &etfs[i])
	}

}

func (db *PostgresDB) GetStocks(ctx context.Context, exchange models.Exchange) ([]*models.Stock, error) {
	blobs_stocks, err := db.list(ctx, "stocks", "")
	if err != nil { return nil, err }
	allItems_stocks, err := unmarshalAll[models.Stock](blobs_stocks)
	if err != nil { return nil, err }

	
	var stocks []*models.Stock
	for _, s := range allItems_stocks {
		if exchange == "" || s.Exchange == exchange {
			stocks = append(stocks, s)
		}
	}
	return stocks, nil

}

func (db *PostgresDB) GetStockBySymbol(ctx context.Context, symbol string, exchange models.Exchange) (*models.Stock, error) {
	blobs_stocks, err := db.list(ctx, "stocks", "")
	if err != nil { return nil, err }
	allItems_stocks, err := unmarshalAll[models.Stock](blobs_stocks)
	if err != nil { return nil, err }

	
	for _, s := range allItems_stocks {
		if s.Symbol == symbol && (exchange == "" || s.Exchange == exchange) {
			return s, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) GetStock(ctx context.Context, id uuid.UUID) (*models.Stock, error) {

	v, _ := pgGet[models.Stock](ctx, db, "stocks", id)
	return v, nil

}

func (db *PostgresDB) GetETFs(ctx context.Context, exchange models.Exchange) ([]*models.ETF, error) {
	blobs_etfs, err := db.list(ctx, "etfs", "")
	if err != nil { return nil, err }
	allItems_etfs, err := unmarshalAll[models.ETF](blobs_etfs)
	if err != nil { return nil, err }

	
	var etfs []*models.ETF
	for _, e := range allItems_etfs {
		if exchange == "" || e.Exchange == exchange {
			etfs = append(etfs, e)
		}
	}
	return etfs, nil

}

func (db *PostgresDB) GetETF(ctx context.Context, id uuid.UUID) (*models.ETF, error) {

	v, _ := pgGet[models.ETF](ctx, db, "etfs", id)
	return v, nil

}

func (db *PostgresDB) GetCommodities(ctx context.Context, category string) ([]*models.Commodity, error) {
	blobs_commodities, err := db.list(ctx, "commodities", "")
	if err != nil { return nil, err }
	allItems_commodities, err := unmarshalAll[models.Commodity](blobs_commodities)
	if err != nil { return nil, err }

	
	var commodities []*models.Commodity
	for _, c := range allItems_commodities {
		if category == "" || c.Category == category {
			commodities = append(commodities, c)
		}
	}
	return commodities, nil

}

func (db *PostgresDB) GetCommodity(ctx context.Context, id uuid.UUID) (*models.Commodity, error) {

	v, _ := pgGet[models.Commodity](ctx, db, "commodities", id)
	return v, nil

}

func (db *PostgresDB) GetCommodityBySymbol(ctx context.Context, symbol string) (*models.Commodity, error) {
	blobs_commodities, err := db.list(ctx, "commodities", "")
	if err != nil { return nil, err }
	allItems_commodities, err := unmarshalAll[models.Commodity](blobs_commodities)
	if err != nil { return nil, err }

	
	for _, c := range allItems_commodities {
		if c.Symbol == symbol {
			return c, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) CreatePortfolio(ctx context.Context, portfolio *models.Portfolio) error {

	if err := db.upsert(ctx, "portfolios", portfolio.ID, portfolio); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetPortfolio(ctx context.Context, id uuid.UUID) (*models.Portfolio, error) {

	v, _ := pgGet[models.Portfolio](ctx, db, "portfolios", id)
	return v, nil

}

func (db *PostgresDB) GetUserPortfolios(ctx context.Context, userID uuid.UUID) ([]*models.Portfolio, error) {
	blobs_portfolios, err := db.list(ctx, "portfolios", "")
	if err != nil { return nil, err }
	allItems_portfolios, err := unmarshalAll[models.Portfolio](blobs_portfolios)
	if err != nil { return nil, err }

	
	var portfolios []*models.Portfolio
	for _, p := range allItems_portfolios {
		if p.UserID == userID {
			portfolios = append(portfolios, p)
		}
	}
	return portfolios, nil

}

func (db *PostgresDB) UpdatePortfolio(ctx context.Context, portfolio *models.Portfolio) error {

	if err := db.upsert(ctx, "portfolios", portfolio.ID, portfolio); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateHolding(ctx context.Context, holding *models.Holding) error {

	if err := db.upsert(ctx, "holdings", holding.ID, holding); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetHolding(ctx context.Context, id uuid.UUID) (*models.Holding, error) {

	v, _ := pgGet[models.Holding](ctx, db, "holdings", id)
	return v, nil

}

func (db *PostgresDB) GetPortfolioHoldings(ctx context.Context, portfolioID uuid.UUID) ([]*models.Holding, error) {
	blobs_holdings, err := db.list(ctx, "holdings", "")
	if err != nil { return nil, err }
	allItems_holdings, err := unmarshalAll[models.Holding](blobs_holdings)
	if err != nil { return nil, err }

	
	var holdings []*models.Holding
	for _, h := range allItems_holdings {
		if h.PortfolioID == portfolioID {
			holdings = append(holdings, h)
		}
	}
	return holdings, nil

}

func (db *PostgresDB) GetUserHoldingBySymbol(ctx context.Context, userID uuid.UUID, symbol string) (*models.Holding, error) {
	blobs_holdings, err := db.list(ctx, "holdings", "")
	if err != nil { return nil, err }
	allItems_holdings, err := unmarshalAll[models.Holding](blobs_holdings)
	if err != nil { return nil, err }

	
	for _, h := range allItems_holdings {
		if h.UserID == userID && h.Symbol == symbol {
			return h, nil
		}
	}
	return nil, nil

}

func (db *PostgresDB) UpdateHolding(ctx context.Context, holding *models.Holding) error {

	if err := db.upsert(ctx, "holdings", holding.ID, holding); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteHolding(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.holdings WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateOrder(ctx context.Context, order *models.Order) error {

	if err := db.upsert(ctx, "orders", order.ID, order); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetOrder(ctx context.Context, id uuid.UUID) (*models.Order, error) {

	v, _ := pgGet[models.Order](ctx, db, "orders", id)
	return v, nil

}

func (db *PostgresDB) GetUserOrders(ctx context.Context, userID uuid.UUID, status models.OrderStatus) ([]*models.Order, error) {
	blobs_orders, err := db.list(ctx, "orders", "")
	if err != nil { return nil, err }
	allItems_orders, err := unmarshalAll[models.Order](blobs_orders)
	if err != nil { return nil, err }

	
	var orders []*models.Order
	for _, o := range allItems_orders {
		if o.UserID == userID && (status == "" || o.Status == status) {
			orders = append(orders, o)
		}
	}
	return orders, nil

}

func (db *PostgresDB) UpdateOrder(ctx context.Context, order *models.Order) error {

	if err := db.upsert(ctx, "orders", order.ID, order); err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateWatchlist(ctx context.Context, watchlist *models.Watchlist) error {

	if err := db.upsert(ctx, "watchlists", watchlist.ID, watchlist); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetWatchlist(ctx context.Context, id uuid.UUID) (*models.Watchlist, error) {

	v, _ := pgGet[models.Watchlist](ctx, db, "watchlists", id)
	return v, nil

}

func (db *PostgresDB) GetUserWatchlists(ctx context.Context, userID uuid.UUID) ([]*models.Watchlist, error) {
	blobs_watchlists, err := db.list(ctx, "watchlists", "")
	if err != nil { return nil, err }
	allItems_watchlists, err := unmarshalAll[models.Watchlist](blobs_watchlists)
	if err != nil { return nil, err }

	
	var watchlists []*models.Watchlist
	for _, w := range allItems_watchlists {
		if w.UserID == userID {
			watchlists = append(watchlists, w)
		}
	}
	return watchlists, nil

}

func (db *PostgresDB) UpdateWatchlist(ctx context.Context, watchlist *models.Watchlist) error {

	if err := db.upsert(ctx, "watchlists", watchlist.ID, watchlist); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteWatchlist(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.watchlists WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreatePriceAlert(ctx context.Context, alert *models.PriceAlert) error {

	if err := db.upsert(ctx, "price_alerts", alert.ID, alert); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserPriceAlerts(ctx context.Context, userID uuid.UUID) ([]*models.PriceAlert, error) {
	blobs_priceAlerts, err := db.list(ctx, "price_alerts", "")
	if err != nil { return nil, err }
	allItems_priceAlerts, err := unmarshalAll[models.PriceAlert](blobs_priceAlerts)
	if err != nil { return nil, err }

	
	var alerts []*models.PriceAlert
	for _, a := range allItems_priceAlerts {
		if a.UserID == userID {
			alerts = append(alerts, a)
		}
	}
	return alerts, nil

}

func (db *PostgresDB) UpdatePriceAlert(ctx context.Context, alert *models.PriceAlert) error {

	if err := db.upsert(ctx, "price_alerts", alert.ID, alert); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeletePriceAlert(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.price_alerts WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}

func (db *PostgresDB) CreateDividend(ctx context.Context, dividend *models.Dividend) error {

	if err := db.upsert(ctx, "dividends", dividend.ID, dividend); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetUserDividends(ctx context.Context, userID uuid.UUID) ([]*models.Dividend, error) {
	blobs_dividends, err := db.list(ctx, "dividends", "")
	if err != nil { return nil, err }
	allItems_dividends, err := unmarshalAll[models.Dividend](blobs_dividends)
	if err != nil { return nil, err }

	
	var dividends []*models.Dividend
	for _, d := range allItems_dividends {
		if d.UserID == userID {
			dividends = append(dividends, d)
		}
	}
	return dividends, nil

}

func (db *PostgresDB) CreateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error {

	if err := db.upsert(ctx, "recurring_investments", recurring.ID, recurring); err != nil { return err }
	return nil

}

func (db *PostgresDB) GetRecurringInvestment(ctx context.Context, id uuid.UUID) (*models.RecurringInvestment, error) {

	v, _ := pgGet[models.RecurringInvestment](ctx, db, "recurring_investments", id)
	return v, nil

}

func (db *PostgresDB) GetUserRecurringInvestments(ctx context.Context, userID uuid.UUID) ([]*models.RecurringInvestment, error) {
	blobs_recurringInvestments, err := db.list(ctx, "recurring_investments", "")
	if err != nil { return nil, err }
	allItems_recurringInvestments, err := unmarshalAll[models.RecurringInvestment](blobs_recurringInvestments)
	if err != nil { return nil, err }

	
	var recurring []*models.RecurringInvestment
	for _, r := range allItems_recurringInvestments {
		if r.UserID == userID {
			recurring = append(recurring, r)
		}
	}
	return recurring, nil

}

func (db *PostgresDB) UpdateRecurringInvestment(ctx context.Context, recurring *models.RecurringInvestment) error {

	if err := db.upsert(ctx, "recurring_investments", recurring.ID, recurring); err != nil { return err }
	return nil

}

func (db *PostgresDB) DeleteRecurringInvestment(ctx context.Context, id uuid.UUID) error {

	_, err := db.pool.Exec(ctx, fmt.Sprintf("DELETE FROM %s.recurring_investments WHERE id = $1", schemaName), id)
	if err != nil { return err }
	return nil

}
