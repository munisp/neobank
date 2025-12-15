package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/investments-service/internal/config"
	"github.com/neobank/investments-service/internal/database"
	"github.com/neobank/investments-service/internal/models"
	"github.com/neobank/investments-service/pkg/kafka"
	"github.com/shopspring/decimal"
)

type TradingHandler struct {
	db        *database.InMemoryDB
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewTradingHandler(db *database.InMemoryDB, cfg *config.Config) *TradingHandler {
	return &TradingHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// GetStocks returns all available stocks
// GET /stocks
func (h *TradingHandler) GetStocks(c *gin.Context) {
	exchange := models.Exchange(c.Query("exchange"))
	sector := c.Query("sector")
	country := c.Query("country")
	
	stocks, err := h.db.GetStocks(c.Request.Context(), exchange)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stocks"})
		return
	}
	
	// Filter by sector and country if provided
	var filtered []*models.Stock
	for _, s := range stocks {
		if (sector == "" || s.Sector == sector) && (country == "" || s.Country == country) {
			filtered = append(filtered, s)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"stocks": filtered,
		"count":  len(filtered),
	})
}

// GetStock returns a specific stock by symbol
// GET /stocks/:symbol
func (h *TradingHandler) GetStock(c *gin.Context) {
	symbol := c.Param("symbol")
	exchange := models.Exchange(c.Query("exchange"))
	
	stock, err := h.db.GetStockBySymbol(c.Request.Context(), symbol, exchange)
	if err != nil || stock == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "stock not found"})
		return
	}
	
	c.JSON(http.StatusOK, stock)
}

// GetETFs returns all available ETFs
// GET /etfs
func (h *TradingHandler) GetETFs(c *gin.Context) {
	exchange := models.Exchange(c.Query("exchange"))
	category := c.Query("category")
	
	etfs, err := h.db.GetETFs(c.Request.Context(), exchange)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get ETFs"})
		return
	}
	
	// Filter by category if provided
	var filtered []*models.ETF
	for _, e := range etfs {
		if category == "" || e.Category == category {
			filtered = append(filtered, e)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"etfs":  filtered,
		"count": len(filtered),
	})
}

// GetCommodities returns all available commodities
// GET /commodities
func (h *TradingHandler) GetCommodities(c *gin.Context) {
	category := c.Query("category")
	
	commodities, err := h.db.GetCommodities(c.Request.Context(), category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get commodities"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"commodities": commodities,
		"count":       len(commodities),
	})
}

// GetCommodity returns a specific commodity
// GET /commodities/:symbol
func (h *TradingHandler) GetCommodity(c *gin.Context) {
	symbol := c.Param("symbol")
	
	commodity, err := h.db.GetCommodityBySymbol(c.Request.Context(), symbol)
	if err != nil || commodity == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "commodity not found"})
		return
	}
	
	c.JSON(http.StatusOK, commodity)
}

// PlaceOrder places a new trade order
// POST /orders
func (h *TradingHandler) PlaceOrder(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.PlaceOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get user's portfolio
	portfolios, _ := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	var portfolio *models.Portfolio
	if len(portfolios) == 0 {
		// Create default portfolio
		portfolio = &models.Portfolio{
			ID:          uuid.New(),
			UserID:      userID.(uuid.UUID),
			Name:        "Default Portfolio",
			Currency:    "NGN",
			CashBalance: decimal.NewFromFloat(1000000), // Demo balance
			BuyingPower: decimal.NewFromFloat(1000000),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		h.db.CreatePortfolio(c.Request.Context(), portfolio)
	} else {
		portfolio = portfolios[0]
	}
	
	// Get current price based on asset type
	var currentPrice decimal.Decimal
	var assetName string
	
	switch req.AssetType {
	case models.AssetTypeStock:
		stock, _ := h.db.GetStockBySymbol(c.Request.Context(), req.Symbol, req.Exchange)
		if stock == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "stock not found"})
			return
		}
		currentPrice = stock.CurrentPrice
		assetName = stock.Name
	case models.AssetTypeETF:
		etfs, _ := h.db.GetETFs(c.Request.Context(), req.Exchange)
		for _, e := range etfs {
			if e.Symbol == req.Symbol {
				currentPrice = e.CurrentPrice
				assetName = e.Name
				break
			}
		}
	case models.AssetTypeCommodity:
		commodity, _ := h.db.GetCommodityBySymbol(c.Request.Context(), req.Symbol)
		if commodity == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "commodity not found"})
			return
		}
		currentPrice = commodity.CurrentPrice
		assetName = commodity.Name
	}
	
	if currentPrice.IsZero() {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	
	// Calculate order value
	orderValue := currentPrice.Mul(req.Quantity)
	
	// Calculate commission
	var commission decimal.Decimal
	switch req.AssetType {
	case models.AssetTypeStock:
		commission = orderValue.Mul(decimal.NewFromFloat(h.cfg.StockCommission))
	case models.AssetTypeETF:
		commission = orderValue.Mul(decimal.NewFromFloat(h.cfg.ETFCommission))
	case models.AssetTypeCommodity:
		commission = orderValue.Mul(decimal.NewFromFloat(h.cfg.CommoditySpread))
	}
	
	totalAmount := orderValue.Add(commission)
	
	// Validate order
	if req.Side == models.OrderSideBuy {
		if portfolio.BuyingPower.LessThan(totalAmount) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient buying power"})
			return
		}
	} else {
		// Check if user has enough shares to sell
		holding, _ := h.db.GetUserHoldingBySymbol(c.Request.Context(), userID.(uuid.UUID), req.Symbol)
		if holding == nil || holding.Quantity.LessThan(req.Quantity) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient shares"})
			return
		}
	}
	
	// Create order
	now := time.Now()
	order := &models.Order{
		ID:             uuid.New(),
		UserID:         userID.(uuid.UUID),
		PortfolioID:    portfolio.ID,
		Symbol:         req.Symbol,
		AssetType:      req.AssetType,
		Exchange:       req.Exchange,
		Side:           req.Side,
		Type:           req.Type,
		Status:         models.OrderStatusPending,
		Quantity:       req.Quantity,
		FilledQuantity: decimal.Zero,
		RemainingQty:   req.Quantity,
		LimitPrice:     req.LimitPrice,
		StopPrice:      req.StopPrice,
		AvgFillPrice:   decimal.Zero,
		TotalAmount:    totalAmount,
		Commission:     commission,
		Fees:           decimal.Zero,
		TimeInForce:    req.TimeInForce,
		Notes:          req.Notes,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	
	if req.TimeInForce == "" {
		order.TimeInForce = "day"
	}
	
	if err := h.db.CreateOrder(c.Request.Context(), order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}
	
	// Execute market orders immediately
	if req.Type == models.OrderTypeMarket {
		h.executeOrder(c, order, portfolio, currentPrice, assetName)
	}
	
	c.JSON(http.StatusCreated, order)
}

func (h *TradingHandler) executeOrder(c *gin.Context, order *models.Order, portfolio *models.Portfolio, price decimal.Decimal, assetName string) {
	now := time.Now()
	order.Status = models.OrderStatusExecuted
	order.FilledQuantity = order.Quantity
	order.RemainingQty = decimal.Zero
	order.AvgFillPrice = price
	order.ExecutedAt = &now
	order.UpdatedAt = now
	
	h.db.UpdateOrder(c.Request.Context(), order)
	
	// Update portfolio and holdings
	if order.Side == models.OrderSideBuy {
		// Deduct from buying power
		portfolio.BuyingPower = portfolio.BuyingPower.Sub(order.TotalAmount)
		portfolio.CashBalance = portfolio.CashBalance.Sub(order.TotalAmount)
		
		// Add or update holding
		holding, _ := h.db.GetUserHoldingBySymbol(c.Request.Context(), order.UserID, order.Symbol)
		if holding == nil {
			holding = &models.Holding{
				ID:           uuid.New(),
				PortfolioID:  portfolio.ID,
				UserID:       order.UserID,
				Symbol:       order.Symbol,
				Name:         assetName,
				AssetType:    order.AssetType,
				Exchange:     order.Exchange,
				Quantity:     order.Quantity,
				AvgCostBasis: price,
				TotalCost:    order.TotalAmount,
				CurrentPrice: price,
				MarketValue:  order.TotalAmount,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			h.db.CreateHolding(c.Request.Context(), holding)
		} else {
			// Update average cost basis
			totalShares := holding.Quantity.Add(order.Quantity)
			totalCost := holding.TotalCost.Add(order.TotalAmount)
			holding.Quantity = totalShares
			holding.TotalCost = totalCost
			holding.AvgCostBasis = totalCost.Div(totalShares)
			holding.CurrentPrice = price
			holding.MarketValue = totalShares.Mul(price)
			holding.UpdatedAt = now
			h.db.UpdateHolding(c.Request.Context(), holding)
		}
	} else {
		// Add to buying power
		sellValue := order.Quantity.Mul(price).Sub(order.Commission)
		portfolio.BuyingPower = portfolio.BuyingPower.Add(sellValue)
		portfolio.CashBalance = portfolio.CashBalance.Add(sellValue)
		
		// Update holding
		holding, _ := h.db.GetUserHoldingBySymbol(c.Request.Context(), order.UserID, order.Symbol)
		if holding != nil {
			holding.Quantity = holding.Quantity.Sub(order.Quantity)
			if holding.Quantity.IsZero() {
				h.db.DeleteHolding(c.Request.Context(), holding.ID)
			} else {
				holding.MarketValue = holding.Quantity.Mul(price)
				holding.TotalCost = holding.Quantity.Mul(holding.AvgCostBasis)
				holding.UpdatedAt = now
				h.db.UpdateHolding(c.Request.Context(), holding)
			}
		}
	}
	
	portfolio.UpdatedAt = now
	h.db.UpdatePortfolio(c.Request.Context(), portfolio)
	
	// Publish investment event to Kafka for lakehouse analytics
	h.publisher.PublishInvestment(c.Request.Context(), map[string]interface{}{
		"order_id":      order.ID.String(),
		"user_id":       order.UserID.String(),
		"portfolio_id":  portfolio.ID.String(),
		"symbol":        order.Symbol,
		"asset_type":    string(order.AssetType),
		"exchange":      string(order.Exchange),
		"side":          string(order.Side),
		"quantity":      order.Quantity.String(),
		"price":         price.String(),
		"total_amount":  order.TotalAmount.String(),
		"commission":    order.Commission.String(),
		"status":        string(order.Status),
		"executed_at":   now.Format(time.RFC3339),
	})
}

// GetOrders returns user's orders
// GET /orders
func (h *TradingHandler) GetOrders(c *gin.Context) {
	userID, _ := c.Get("user_id")
	status := models.OrderStatus(c.Query("status"))
	
	orders, err := h.db.GetUserOrders(c.Request.Context(), userID.(uuid.UUID), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get orders"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"count":  len(orders),
	})
}

// GetOrder returns a specific order
// GET /orders/:id
func (h *TradingHandler) GetOrder(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order ID"})
		return
	}
	
	order, err := h.db.GetOrder(c.Request.Context(), orderID)
	if err != nil || order == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	
	c.JSON(http.StatusOK, order)
}

// CancelOrder cancels a pending order
// POST /orders/:id/cancel
func (h *TradingHandler) CancelOrder(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order ID"})
		return
	}
	
	order, err := h.db.GetOrder(c.Request.Context(), orderID)
	if err != nil || order == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	
	if order.Status != models.OrderStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only pending orders can be cancelled"})
		return
	}
	
	order.Status = models.OrderStatusCancelled
	order.UpdatedAt = time.Now()
	
	if err := h.db.UpdateOrder(c.Request.Context(), order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel order"})
		return
	}
	
	c.JSON(http.StatusOK, order)
}

// GetPortfolio returns user's portfolio
// GET /portfolio
func (h *TradingHandler) GetPortfolio(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	portfolios, err := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get portfolio"})
		return
	}
	
	if len(portfolios) == 0 {
		// Create default portfolio
		portfolio := &models.Portfolio{
			ID:          uuid.New(),
			UserID:      userID.(uuid.UUID),
			Name:        "Default Portfolio",
			Currency:    "NGN",
			CashBalance: decimal.NewFromFloat(0),
			BuyingPower: decimal.NewFromFloat(0),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		h.db.CreatePortfolio(c.Request.Context(), portfolio)
		portfolios = []*models.Portfolio{portfolio}
	}
	
	portfolio := portfolios[0]
	
	// Get holdings
	holdings, _ := h.db.GetPortfolioHoldings(c.Request.Context(), portfolio.ID)
	
	// Calculate portfolio values
	totalValue := portfolio.CashBalance
	totalCost := decimal.Zero
	
	for _, h := range holdings {
		totalValue = totalValue.Add(h.MarketValue)
		totalCost = totalCost.Add(h.TotalCost)
	}
	
	portfolio.Holdings = make([]models.Holding, len(holdings))
	for i, h := range holdings {
		portfolio.Holdings[i] = *h
	}
	
	portfolio.TotalValue = totalValue
	portfolio.TotalCost = totalCost
	portfolio.TotalGain = totalValue.Sub(totalCost)
	if !totalCost.IsZero() {
		portfolio.TotalGainPercent = portfolio.TotalGain.Div(totalCost).Mul(decimal.NewFromInt(100))
	}
	
	c.JSON(http.StatusOK, portfolio)
}

// GetHoldings returns user's holdings
// GET /holdings
func (h *TradingHandler) GetHoldings(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	portfolios, _ := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	if len(portfolios) == 0 {
		c.JSON(http.StatusOK, gin.H{"holdings": []models.Holding{}, "count": 0})
		return
	}
	
	holdings, err := h.db.GetPortfolioHoldings(c.Request.Context(), portfolios[0].ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get holdings"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"holdings": holdings,
		"count":    len(holdings),
	})
}

// DepositFunds deposits funds to portfolio
// POST /portfolio/deposit
func (h *TradingHandler) DepositFunds(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.DepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	portfolios, _ := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	var portfolio *models.Portfolio
	if len(portfolios) == 0 {
		portfolio = &models.Portfolio{
			ID:          uuid.New(),
			UserID:      userID.(uuid.UUID),
			Name:        "Default Portfolio",
			Currency:    req.Currency,
			CashBalance: decimal.Zero,
			BuyingPower: decimal.Zero,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		h.db.CreatePortfolio(c.Request.Context(), portfolio)
	} else {
		portfolio = portfolios[0]
	}
	
	portfolio.CashBalance = portfolio.CashBalance.Add(req.Amount)
	portfolio.BuyingPower = portfolio.BuyingPower.Add(req.Amount)
	portfolio.UpdatedAt = time.Now()
	
	if err := h.db.UpdatePortfolio(c.Request.Context(), portfolio); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to deposit funds"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":      "Deposit successful",
		"cash_balance": portfolio.CashBalance,
		"buying_power": portfolio.BuyingPower,
	})
}

// WithdrawFunds withdraws funds from portfolio
// POST /portfolio/withdraw
func (h *TradingHandler) WithdrawFunds(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.WithdrawRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	portfolios, _ := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	if len(portfolios) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no portfolio found"})
		return
	}
	
	portfolio := portfolios[0]
	
	if portfolio.CashBalance.LessThan(req.Amount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient funds"})
		return
	}
	
	portfolio.CashBalance = portfolio.CashBalance.Sub(req.Amount)
	portfolio.BuyingPower = portfolio.BuyingPower.Sub(req.Amount)
	portfolio.UpdatedAt = time.Now()
	
	if err := h.db.UpdatePortfolio(c.Request.Context(), portfolio); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to withdraw funds"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":      "Withdrawal successful",
		"cash_balance": portfolio.CashBalance,
		"buying_power": portfolio.BuyingPower,
	})
}

// CreateWatchlist creates a new watchlist
// POST /watchlists
func (h *TradingHandler) CreateWatchlist(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateWatchlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	now := time.Now()
	watchlist := &models.Watchlist{
		ID:        uuid.New(),
		UserID:    userID.(uuid.UUID),
		Name:      req.Name,
		Symbols:   make([]models.WatchlistItem, 0),
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	for _, symbol := range req.Symbols {
		watchlist.Symbols = append(watchlist.Symbols, models.WatchlistItem{
			Symbol:  symbol,
			AddedAt: now,
		})
	}
	
	if err := h.db.CreateWatchlist(c.Request.Context(), watchlist); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create watchlist"})
		return
	}
	
	c.JSON(http.StatusCreated, watchlist)
}

// GetWatchlists returns user's watchlists
// GET /watchlists
func (h *TradingHandler) GetWatchlists(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	watchlists, err := h.db.GetUserWatchlists(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get watchlists"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"watchlists": watchlists,
		"count":      len(watchlists),
	})
}

// AddToWatchlist adds a symbol to watchlist
// POST /watchlists/:id/symbols
func (h *TradingHandler) AddToWatchlist(c *gin.Context) {
	watchlistID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid watchlist ID"})
		return
	}
	
	var req struct {
		Symbol    string          `json:"symbol" binding:"required"`
		AssetType models.AssetType `json:"asset_type"`
		Exchange  models.Exchange  `json:"exchange"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	watchlist, err := h.db.GetWatchlist(c.Request.Context(), watchlistID)
	if err != nil || watchlist == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "watchlist not found"})
		return
	}
	
	// Check if symbol already exists
	for _, item := range watchlist.Symbols {
		if item.Symbol == req.Symbol {
			c.JSON(http.StatusBadRequest, gin.H{"error": "symbol already in watchlist"})
			return
		}
	}
	
	watchlist.Symbols = append(watchlist.Symbols, models.WatchlistItem{
		Symbol:    req.Symbol,
		AssetType: req.AssetType,
		Exchange:  req.Exchange,
		AddedAt:   time.Now(),
	})
	watchlist.UpdatedAt = time.Now()
	
	if err := h.db.UpdateWatchlist(c.Request.Context(), watchlist); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update watchlist"})
		return
	}
	
	c.JSON(http.StatusOK, watchlist)
}

// CreatePriceAlert creates a price alert
// POST /alerts
func (h *TradingHandler) CreatePriceAlert(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	alert := &models.PriceAlert{
		ID:          uuid.New(),
		UserID:      userID.(uuid.UUID),
		Symbol:      req.Symbol,
		AssetType:   req.AssetType,
		Condition:   req.Condition,
		TargetPrice: req.TargetPrice,
		IsTriggered: false,
		CreatedAt:   time.Now(),
	}
	
	if err := h.db.CreatePriceAlert(c.Request.Context(), alert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create alert"})
		return
	}
	
	c.JSON(http.StatusCreated, alert)
}

// GetPriceAlerts returns user's price alerts
// GET /alerts
func (h *TradingHandler) GetPriceAlerts(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	alerts, err := h.db.GetUserPriceAlerts(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get alerts"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"alerts": alerts,
		"count":  len(alerts),
	})
}

// CreateRecurringInvestment creates a recurring investment plan
// POST /recurring
func (h *TradingHandler) CreateRecurringInvestment(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.CreateRecurringRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	portfolios, _ := h.db.GetUserPortfolios(c.Request.Context(), userID.(uuid.UUID))
	var portfolioID uuid.UUID
	if len(portfolios) > 0 {
		portfolioID = portfolios[0].ID
	}
	
	// Calculate next execution date
	now := time.Now()
	var nextExecution time.Time
	switch req.Frequency {
	case "daily":
		nextExecution = now.AddDate(0, 0, 1)
	case "weekly":
		nextExecution = now.AddDate(0, 0, 7)
	case "biweekly":
		nextExecution = now.AddDate(0, 0, 14)
	case "monthly":
		nextExecution = now.AddDate(0, 1, 0)
	default:
		nextExecution = now.AddDate(0, 1, 0)
	}
	
	recurring := &models.RecurringInvestment{
		ID:             uuid.New(),
		UserID:         userID.(uuid.UUID),
		PortfolioID:    portfolioID,
		Symbol:         req.Symbol,
		AssetType:      req.AssetType,
		Amount:         req.Amount,
		Frequency:      req.Frequency,
		DayOfWeek:      req.DayOfWeek,
		DayOfMonth:     req.DayOfMonth,
		IsActive:       true,
		NextExecution:  nextExecution,
		TotalInvested:  decimal.Zero,
		ExecutionCount: 0,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	
	if err := h.db.CreateRecurringInvestment(c.Request.Context(), recurring); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create recurring investment"})
		return
	}
	
	c.JSON(http.StatusCreated, recurring)
}

// GetRecurringInvestments returns user's recurring investments
// GET /recurring
func (h *TradingHandler) GetRecurringInvestments(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	recurring, err := h.db.GetUserRecurringInvestments(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get recurring investments"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"recurring": recurring,
		"count":     len(recurring),
	})
}

// GetDividends returns user's dividend history
// GET /dividends
func (h *TradingHandler) GetDividends(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	dividends, err := h.db.GetUserDividends(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get dividends"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"dividends": dividends,
		"count":     len(dividends),
	})
}

// GetMarketSummary returns market summary for African exchanges
// GET /market/summary
func (h *TradingHandler) GetMarketSummary(c *gin.Context) {
	stocks, _ := h.db.GetStocks(c.Request.Context(), "")
	
	// Group by exchange
	exchangeSummary := make(map[models.Exchange]struct {
		TotalStocks  int             `json:"total_stocks"`
		TotalMarketCap decimal.Decimal `json:"total_market_cap"`
		TopGainers   []*models.Stock `json:"top_gainers"`
		TopLosers    []*models.Stock `json:"top_losers"`
	})
	
	for _, s := range stocks {
		summary := exchangeSummary[s.Exchange]
		summary.TotalStocks++
		summary.TotalMarketCap = summary.TotalMarketCap.Add(s.MarketCap)
		exchangeSummary[s.Exchange] = summary
	}
	
	c.JSON(http.StatusOK, gin.H{
		"exchanges":    exchangeSummary,
		"total_stocks": len(stocks),
	})
}
