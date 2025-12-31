package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// CommodityCategory represents the type of commodity
type CommodityCategory string

const (
	CategoryPreciousMetals CommodityCategory = "precious_metals"
	CategoryEnergy         CommodityCategory = "energy"
	CategoryAgriculture    CommodityCategory = "agriculture"
	CategoryMinerals       CommodityCategory = "minerals"
	CategoryLivestock      CommodityCategory = "livestock"
)

// Commodity represents a tradeable commodity
type Commodity struct {
	Symbol      string            `json:"symbol"`
	Name        string            `json:"name"`
	Category    CommodityCategory `json:"category"`
	Unit        string            `json:"unit"`
	Currency    string            `json:"currency"`
	Price       decimal.Decimal   `json:"price"`
	Change24h   decimal.Decimal   `json:"change_24h"`
	ChangePerc  decimal.Decimal   `json:"change_percentage"`
	High24h     decimal.Decimal   `json:"high_24h"`
	Low24h      decimal.Decimal   `json:"low_24h"`
	Volume      decimal.Decimal   `json:"volume"`
	MarketCap   decimal.Decimal   `json:"market_cap,omitempty"`
	Exchange    string            `json:"exchange"`
	Provider    string            `json:"provider"`
	LastUpdated time.Time         `json:"last_updated"`
}

// CommodityQuote represents a real-time price quote
type CommodityQuote struct {
	Symbol    string          `json:"symbol"`
	Bid       decimal.Decimal `json:"bid"`
	Ask       decimal.Decimal `json:"ask"`
	Spread    decimal.Decimal `json:"spread"`
	Timestamp time.Time       `json:"timestamp"`
}

// CommodityOrder represents a buy/sell order
type CommodityOrder struct {
	ID            string          `json:"id"`
	UserID        string          `json:"user_id"`
	Symbol        string          `json:"symbol"`
	OrderType     string          `json:"order_type"` // market, limit, stop
	Side          string          `json:"side"`       // buy, sell
	Quantity      decimal.Decimal `json:"quantity"`
	Unit          string          `json:"unit"`
	Price         decimal.Decimal `json:"price,omitempty"`
	StopPrice     decimal.Decimal `json:"stop_price,omitempty"`
	FilledQty     decimal.Decimal `json:"filled_quantity"`
	AvgFillPrice  decimal.Decimal `json:"avg_fill_price"`
	Status        string          `json:"status"` // pending, filled, partial, cancelled
	PaymentMethod string          `json:"payment_method"`
	Currency      string          `json:"currency"`
	TotalValue    decimal.Decimal `json:"total_value"`
	Commission    decimal.Decimal `json:"commission"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	FilledAt      *time.Time      `json:"filled_at,omitempty"`
}

// CommodityPosition represents user's holdings
type CommodityPosition struct {
	UserID        string          `json:"user_id"`
	Symbol        string          `json:"symbol"`
	Name          string          `json:"name"`
	Category      CommodityCategory `json:"category"`
	Quantity      decimal.Decimal `json:"quantity"`
	Unit          string          `json:"unit"`
	AvgCost       decimal.Decimal `json:"avg_cost"`
	CurrentPrice  decimal.Decimal `json:"current_price"`
	MarketValue   decimal.Decimal `json:"market_value"`
	UnrealizedPnL decimal.Decimal `json:"unrealized_pnl"`
	PnLPercentage decimal.Decimal `json:"pnl_percentage"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// CommodityPortfolio represents user's commodity portfolio
type CommodityPortfolio struct {
	UserID         string              `json:"user_id"`
	TotalValue     decimal.Decimal     `json:"total_value"`
	TotalCost      decimal.Decimal     `json:"total_cost"`
	TotalPnL       decimal.Decimal     `json:"total_pnl"`
	PnLPercentage  decimal.Decimal     `json:"pnl_percentage"`
	Positions      []CommodityPosition `json:"positions"`
	LastUpdated    time.Time           `json:"last_updated"`
}

// PriceAlert represents a price alert configuration
type PriceAlert struct {
	ID        string          `json:"id"`
	UserID    string          `json:"user_id"`
	Symbol    string          `json:"symbol"`
	Condition string          `json:"condition"` // above, below
	Price     decimal.Decimal `json:"price"`
	Active    bool            `json:"active"`
	Triggered bool            `json:"triggered"`
	CreatedAt time.Time       `json:"created_at"`
}

// MarketData represents aggregated market data
type MarketData struct {
	Symbol        string          `json:"symbol"`
	Open          decimal.Decimal `json:"open"`
	High          decimal.Decimal `json:"high"`
	Low           decimal.Decimal `json:"low"`
	Close         decimal.Decimal `json:"close"`
	Volume        decimal.Decimal `json:"volume"`
	VWAP          decimal.Decimal `json:"vwap"`
	Timestamp     time.Time       `json:"timestamp"`
	TradingDay    string          `json:"trading_day"`
}

// HistoricalPrice represents historical price data
type HistoricalPrice struct {
	Symbol    string          `json:"symbol"`
	Date      string          `json:"date"`
	Open      decimal.Decimal `json:"open"`
	High      decimal.Decimal `json:"high"`
	Low       decimal.Decimal `json:"low"`
	Close     decimal.Decimal `json:"close"`
	Volume    decimal.Decimal `json:"volume"`
}
