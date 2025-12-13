package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Stock Exchanges - African Focus
type Exchange string

const (
	ExchangeNGX   Exchange = "NGX"   // Nigerian Stock Exchange
	ExchangeJSE   Exchange = "JSE"   // Johannesburg Stock Exchange
	ExchangeNSE   Exchange = "NSE"   // Nairobi Securities Exchange
	ExchangeGSE   Exchange = "GSE"   // Ghana Stock Exchange
	ExchangeEGX   Exchange = "EGX"   // Egyptian Exchange
	ExchangeCASA  Exchange = "CASA"  // Casablanca Stock Exchange
	ExchangeBVRM  Exchange = "BRVM"  // Bourse Regionale des Valeurs Mobilieres (West Africa)
	ExchangeUSE   Exchange = "USE"   // Uganda Securities Exchange
	ExchangeDSE   Exchange = "DSE"   // Dar es Salaam Stock Exchange
	ExchangeZSE   Exchange = "ZSE"   // Zimbabwe Stock Exchange
	ExchangeBSE   Exchange = "BSE"   // Botswana Stock Exchange
	ExchangeLuSE  Exchange = "LuSE"  // Lusaka Stock Exchange
	ExchangeNYSE  Exchange = "NYSE"  // New York Stock Exchange
	ExchangeNASDAQ Exchange = "NASDAQ"
	ExchangeLSE   Exchange = "LSE"   // London Stock Exchange
)

type AssetType string

const (
	AssetTypeStock     AssetType = "stock"
	AssetTypeETF       AssetType = "etf"
	AssetTypeCommodity AssetType = "commodity"
	AssetTypeBond      AssetType = "bond"
	AssetTypeREIT      AssetType = "reit"
)

type OrderType string

const (
	OrderTypeMarket    OrderType = "market"
	OrderTypeLimit     OrderType = "limit"
	OrderTypeStopLoss  OrderType = "stop_loss"
	OrderTypeStopLimit OrderType = "stop_limit"
)

type OrderSide string

const (
	OrderSideBuy  OrderSide = "buy"
	OrderSideSell OrderSide = "sell"
)

type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusExecuted  OrderStatus = "executed"
	OrderStatusPartial   OrderStatus = "partial"
	OrderStatusCancelled OrderStatus = "cancelled"
	OrderStatusRejected  OrderStatus = "rejected"
	OrderStatusExpired   OrderStatus = "expired"
)

// Stock represents a tradeable stock
type Stock struct {
	ID          uuid.UUID       `json:"id"`
	Symbol      string          `json:"symbol"`
	Name        string          `json:"name"`
	Exchange    Exchange        `json:"exchange"`
	AssetType   AssetType       `json:"asset_type"`
	Currency    string          `json:"currency"`
	Sector      string          `json:"sector"`
	Industry    string          `json:"industry"`
	Country     string          `json:"country"`
	Description string          `json:"description"`
	LogoURL     string          `json:"logo_url"`
	
	// Pricing
	CurrentPrice    decimal.Decimal `json:"current_price"`
	OpenPrice       decimal.Decimal `json:"open_price"`
	HighPrice       decimal.Decimal `json:"high_price"`
	LowPrice        decimal.Decimal `json:"low_price"`
	ClosePrice      decimal.Decimal `json:"close_price"`
	PreviousClose   decimal.Decimal `json:"previous_close"`
	Change          decimal.Decimal `json:"change"`
	ChangePercent   decimal.Decimal `json:"change_percent"`
	Volume          int64           `json:"volume"`
	AvgVolume       int64           `json:"avg_volume"`
	MarketCap       decimal.Decimal `json:"market_cap"`
	
	// Fundamentals
	PERatio         decimal.Decimal `json:"pe_ratio"`
	EPS             decimal.Decimal `json:"eps"`
	DividendYield   decimal.Decimal `json:"dividend_yield"`
	Beta            decimal.Decimal `json:"beta"`
	Week52High      decimal.Decimal `json:"week_52_high"`
	Week52Low       decimal.Decimal `json:"week_52_low"`
	
	// Trading Info
	MinOrderSize    decimal.Decimal `json:"min_order_size"`
	MaxOrderSize    decimal.Decimal `json:"max_order_size"`
	LotSize         int             `json:"lot_size"`
	IsFractional    bool            `json:"is_fractional"`
	IsTradeable     bool            `json:"is_tradeable"`
	TradingHours    string          `json:"trading_hours"`
	
	LastUpdated     time.Time       `json:"last_updated"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ETF represents an Exchange Traded Fund
type ETF struct {
	ID              uuid.UUID       `json:"id"`
	Symbol          string          `json:"symbol"`
	Name            string          `json:"name"`
	Exchange        Exchange        `json:"exchange"`
	Currency        string          `json:"currency"`
	Category        string          `json:"category"`
	Description     string          `json:"description"`
	
	// Pricing
	NAV             decimal.Decimal `json:"nav"`
	CurrentPrice    decimal.Decimal `json:"current_price"`
	Change          decimal.Decimal `json:"change"`
	ChangePercent   decimal.Decimal `json:"change_percent"`
	
	// Fund Info
	ExpenseRatio    decimal.Decimal `json:"expense_ratio"`
	AUM             decimal.Decimal `json:"aum"`
	Inception       time.Time       `json:"inception"`
	Holdings        int             `json:"holdings"`
	DividendYield   decimal.Decimal `json:"dividend_yield"`
	
	// Top Holdings
	TopHoldings     []ETFHolding    `json:"top_holdings"`
	
	IsTradeable     bool            `json:"is_tradeable"`
	LastUpdated     time.Time       `json:"last_updated"`
	CreatedAt       time.Time       `json:"created_at"`
}

type ETFHolding struct {
	Symbol     string          `json:"symbol"`
	Name       string          `json:"name"`
	Weight     decimal.Decimal `json:"weight"`
}

// Commodity represents a tradeable commodity
type Commodity struct {
	ID              uuid.UUID       `json:"id"`
	Symbol          string          `json:"symbol"`
	Name            string          `json:"name"`
	Category        string          `json:"category"` // precious_metals, energy, agriculture
	Unit            string          `json:"unit"`     // oz, barrel, bushel
	Currency        string          `json:"currency"`
	
	// Pricing
	CurrentPrice    decimal.Decimal `json:"current_price"`
	BidPrice        decimal.Decimal `json:"bid_price"`
	AskPrice        decimal.Decimal `json:"ask_price"`
	OpenPrice       decimal.Decimal `json:"open_price"`
	HighPrice       decimal.Decimal `json:"high_price"`
	LowPrice        decimal.Decimal `json:"low_price"`
	Change          decimal.Decimal `json:"change"`
	ChangePercent   decimal.Decimal `json:"change_percent"`
	
	// Trading Info
	MinOrderSize    decimal.Decimal `json:"min_order_size"`
	Spread          decimal.Decimal `json:"spread"`
	IsTradeable     bool            `json:"is_tradeable"`
	
	LastUpdated     time.Time       `json:"last_updated"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Portfolio represents a user's investment portfolio
type Portfolio struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Name            string          `json:"name"`
	Currency        string          `json:"currency"`
	
	// Values
	TotalValue      decimal.Decimal `json:"total_value"`
	TotalCost       decimal.Decimal `json:"total_cost"`
	TotalGain       decimal.Decimal `json:"total_gain"`
	TotalGainPercent decimal.Decimal `json:"total_gain_percent"`
	DayGain         decimal.Decimal `json:"day_gain"`
	DayGainPercent  decimal.Decimal `json:"day_gain_percent"`
	
	// Cash
	CashBalance     decimal.Decimal `json:"cash_balance"`
	BuyingPower     decimal.Decimal `json:"buying_power"`
	
	// Holdings
	Holdings        []Holding       `json:"holdings"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Holding represents a position in a portfolio
type Holding struct {
	ID              uuid.UUID       `json:"id"`
	PortfolioID     uuid.UUID       `json:"portfolio_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Symbol          string          `json:"symbol"`
	Name            string          `json:"name"`
	AssetType       AssetType       `json:"asset_type"`
	Exchange        Exchange        `json:"exchange"`
	
	// Position
	Quantity        decimal.Decimal `json:"quantity"`
	AvgCostBasis    decimal.Decimal `json:"avg_cost_basis"`
	TotalCost       decimal.Decimal `json:"total_cost"`
	
	// Current Value
	CurrentPrice    decimal.Decimal `json:"current_price"`
	MarketValue     decimal.Decimal `json:"market_value"`
	UnrealizedGain  decimal.Decimal `json:"unrealized_gain"`
	UnrealizedGainPercent decimal.Decimal `json:"unrealized_gain_percent"`
	DayGain         decimal.Decimal `json:"day_gain"`
	DayGainPercent  decimal.Decimal `json:"day_gain_percent"`
	
	// Allocation
	PortfolioWeight decimal.Decimal `json:"portfolio_weight"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Order represents a trade order
type Order struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	PortfolioID     uuid.UUID       `json:"portfolio_id"`
	Symbol          string          `json:"symbol"`
	AssetType       AssetType       `json:"asset_type"`
	Exchange        Exchange        `json:"exchange"`
	
	// Order Details
	Side            OrderSide       `json:"side"`
	Type            OrderType       `json:"type"`
	Status          OrderStatus     `json:"status"`
	
	// Quantities
	Quantity        decimal.Decimal `json:"quantity"`
	FilledQuantity  decimal.Decimal `json:"filled_quantity"`
	RemainingQty    decimal.Decimal `json:"remaining_qty"`
	
	// Prices
	LimitPrice      decimal.Decimal `json:"limit_price,omitempty"`
	StopPrice       decimal.Decimal `json:"stop_price,omitempty"`
	AvgFillPrice    decimal.Decimal `json:"avg_fill_price"`
	
	// Costs
	TotalAmount     decimal.Decimal `json:"total_amount"`
	Commission      decimal.Decimal `json:"commission"`
	Fees            decimal.Decimal `json:"fees"`
	
	// Timing
	TimeInForce     string          `json:"time_in_force"` // day, gtc, ioc, fok
	ExpiresAt       *time.Time      `json:"expires_at,omitempty"`
	ExecutedAt      *time.Time      `json:"executed_at,omitempty"`
	
	// Metadata
	Notes           string          `json:"notes,omitempty"`
	RejectionReason string          `json:"rejection_reason,omitempty"`
	
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Watchlist represents a user's watchlist
type Watchlist struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	Name        string          `json:"name"`
	Symbols     []WatchlistItem `json:"symbols"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type WatchlistItem struct {
	Symbol      string          `json:"symbol"`
	AssetType   AssetType       `json:"asset_type"`
	Exchange    Exchange        `json:"exchange"`
	AddedAt     time.Time       `json:"added_at"`
	AlertPrice  decimal.Decimal `json:"alert_price,omitempty"`
}

// PriceAlert represents a price alert
type PriceAlert struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	Symbol      string          `json:"symbol"`
	AssetType   AssetType       `json:"asset_type"`
	Condition   string          `json:"condition"` // above, below, percent_change
	TargetPrice decimal.Decimal `json:"target_price"`
	IsTriggered bool            `json:"is_triggered"`
	TriggeredAt *time.Time      `json:"triggered_at,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// Dividend represents a dividend payment
type Dividend struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	HoldingID       uuid.UUID       `json:"holding_id"`
	Symbol          string          `json:"symbol"`
	Amount          decimal.Decimal `json:"amount"`
	AmountPerShare  decimal.Decimal `json:"amount_per_share"`
	Shares          decimal.Decimal `json:"shares"`
	ExDate          time.Time       `json:"ex_date"`
	PayDate         time.Time       `json:"pay_date"`
	Status          string          `json:"status"` // pending, paid
	CreatedAt       time.Time       `json:"created_at"`
}

// RecurringInvestment represents a recurring investment plan
type RecurringInvestment struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	PortfolioID     uuid.UUID       `json:"portfolio_id"`
	Symbol          string          `json:"symbol"`
	AssetType       AssetType       `json:"asset_type"`
	Amount          decimal.Decimal `json:"amount"`
	Frequency       string          `json:"frequency"` // daily, weekly, biweekly, monthly
	DayOfWeek       int             `json:"day_of_week,omitempty"`
	DayOfMonth      int             `json:"day_of_month,omitempty"`
	IsActive        bool            `json:"is_active"`
	NextExecution   time.Time       `json:"next_execution"`
	LastExecution   *time.Time      `json:"last_execution,omitempty"`
	TotalInvested   decimal.Decimal `json:"total_invested"`
	ExecutionCount  int             `json:"execution_count"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Request/Response types
type PlaceOrderRequest struct {
	Symbol      string          `json:"symbol" binding:"required"`
	AssetType   AssetType       `json:"asset_type" binding:"required"`
	Exchange    Exchange        `json:"exchange" binding:"required"`
	Side        OrderSide       `json:"side" binding:"required"`
	Type        OrderType       `json:"type" binding:"required"`
	Quantity    decimal.Decimal `json:"quantity" binding:"required"`
	LimitPrice  decimal.Decimal `json:"limit_price,omitempty"`
	StopPrice   decimal.Decimal `json:"stop_price,omitempty"`
	TimeInForce string          `json:"time_in_force"`
	Notes       string          `json:"notes,omitempty"`
}

type CreateWatchlistRequest struct {
	Name    string   `json:"name" binding:"required"`
	Symbols []string `json:"symbols"`
}

type CreateRecurringRequest struct {
	Symbol      string          `json:"symbol" binding:"required"`
	AssetType   AssetType       `json:"asset_type" binding:"required"`
	Amount      decimal.Decimal `json:"amount" binding:"required"`
	Frequency   string          `json:"frequency" binding:"required"`
	DayOfWeek   int             `json:"day_of_week,omitempty"`
	DayOfMonth  int             `json:"day_of_month,omitempty"`
}

type CreateAlertRequest struct {
	Symbol      string          `json:"symbol" binding:"required"`
	AssetType   AssetType       `json:"asset_type" binding:"required"`
	Condition   string          `json:"condition" binding:"required"`
	TargetPrice decimal.Decimal `json:"target_price" binding:"required"`
}

type DepositRequest struct {
	Amount   decimal.Decimal `json:"amount" binding:"required"`
	Currency string          `json:"currency" binding:"required"`
}

type WithdrawRequest struct {
	Amount   decimal.Decimal `json:"amount" binding:"required"`
	Currency string          `json:"currency" binding:"required"`
}
