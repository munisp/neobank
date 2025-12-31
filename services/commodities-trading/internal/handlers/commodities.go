package handlers

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/commodities-trading/internal/kafka"
	"github.com/neobank/commodities-trading/internal/models"
	"github.com/neobank/commodities-trading/internal/providers"
	"github.com/shopspring/decimal"
)

// CommoditiesHandler handles commodity trading endpoints
type CommoditiesHandler struct {
	twelveData *providers.TwelveDataProvider
	afex       *providers.AFEXProvider
	agridex    *providers.AgriDexProvider
	producer   *kafka.Producer
	orders     map[string]*models.CommodityOrder
	positions  map[string][]models.CommodityPosition
	alerts     map[string][]models.PriceAlert
	mu         sync.RWMutex
}

// NewCommoditiesHandler creates a new handler
func NewCommoditiesHandler() *CommoditiesHandler {
	return &CommoditiesHandler{
		twelveData: providers.NewTwelveDataProvider(),
		afex:       providers.NewAFEXProvider(),
		agridex:    providers.NewAgriDexProvider(),
		producer:   kafka.NewProducer(),
		orders:     make(map[string]*models.CommodityOrder),
		positions:  make(map[string][]models.CommodityPosition),
		alerts:     make(map[string][]models.PriceAlert),
	}
}

// GetAllCommodities returns all available commodities from all providers
func (h *CommoditiesHandler) GetAllCommodities(c *gin.Context) {
	category := c.Query("category")
	provider := c.Query("provider")

	var allCommodities []models.Commodity

	// Get from Twelve Data (global commodities)
	if provider == "" || provider == "twelve_data" {
		allCommodities = append(allCommodities, h.twelveData.GetSupportedCommodities()...)
	}

	// Get from AFEX (African agricultural)
	if provider == "" || provider == "afex" {
		afexCommodities, _ := h.afex.GetAllQuotes()
		allCommodities = append(allCommodities, afexCommodities...)
	}

	// Get from AgriDex (blockchain-settled)
	if provider == "" || provider == "agridex" {
		agridexCommodities, _ := h.agridex.GetAllQuotes()
		allCommodities = append(allCommodities, agridexCommodities...)
	}

	// Filter by category if specified
	if category != "" {
		var filtered []models.Commodity
		for _, comm := range allCommodities {
			if string(comm.Category) == category {
				filtered = append(filtered, comm)
			}
		}
		allCommodities = filtered
	}

	c.JSON(http.StatusOK, gin.H{
		"commodities": allCommodities,
		"count":       len(allCommodities),
		"providers":   []string{"twelve_data", "afex", "agridex"},
	})
}

// GetCommodityQuote returns real-time quote for a specific commodity
func (h *CommoditiesHandler) GetCommodityQuote(c *gin.Context) {
	symbol := c.Param("symbol")

	var commodity *models.Commodity
	var err error

	// Determine provider based on symbol prefix
	switch {
	case len(symbol) > 5 && symbol[:5] == "AFEX:":
		commodity, err = h.afex.GetQuote(symbol)
	case len(symbol) > 5 && symbol[:5] == "AGDX:":
		commodity, err = h.agridex.GetQuote(symbol)
	default:
		commodity, err = h.twelveData.GetQuote(symbol)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, commodity)
}

// GetHistoricalData returns historical price data
func (h *CommoditiesHandler) GetHistoricalData(c *gin.Context) {
	symbol := c.Param("symbol")
	interval := c.DefaultQuery("interval", "1day")
	outputSize := 30

	prices, err := h.twelveData.GetHistoricalData(symbol, interval, outputSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"symbol":   symbol,
		"interval": interval,
		"prices":   prices,
	})
}

// CreateOrderRequest represents order creation request
type CreateOrderRequest struct {
	Symbol        string  `json:"symbol" binding:"required"`
	OrderType     string  `json:"order_type" binding:"required"` // market, limit
	Side          string  `json:"side" binding:"required"`       // buy, sell
	Quantity      float64 `json:"quantity" binding:"required"`
	Price         float64 `json:"price,omitempty"`
	PaymentMethod string  `json:"payment_method"` // fiat, stablecoin
	Currency      string  `json:"currency"`
}

// CreateOrder creates a new commodity order
func (h *CommoditiesHandler) CreateOrder(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get current price
	var currentPrice decimal.Decimal
	switch {
	case len(req.Symbol) > 5 && req.Symbol[:5] == "AFEX:":
		comm, _ := h.afex.GetQuote(req.Symbol)
		if comm != nil {
			currentPrice = comm.Price
		}
	case len(req.Symbol) > 5 && req.Symbol[:5] == "AGDX:":
		comm, _ := h.agridex.GetQuote(req.Symbol)
		if comm != nil {
			currentPrice = comm.Price
		}
	default:
		comm, _ := h.twelveData.GetQuote(req.Symbol)
		if comm != nil {
			currentPrice = comm.Price
		}
	}

	orderID := uuid.New().String()
	quantity := decimal.NewFromFloat(req.Quantity)
	price := currentPrice
	if req.OrderType == "limit" {
		price = decimal.NewFromFloat(req.Price)
	}

	commission := price.Mul(quantity).Mul(decimal.NewFromFloat(0.005)) // 0.5% commission
	totalValue := price.Mul(quantity).Add(commission)

	order := &models.CommodityOrder{
		ID:            orderID,
		UserID:        userID,
		Symbol:        req.Symbol,
		OrderType:     req.OrderType,
		Side:          req.Side,
		Quantity:      quantity,
		Price:         price,
		FilledQty:     decimal.Zero,
		AvgFillPrice:  decimal.Zero,
		Status:        "pending",
		PaymentMethod: req.PaymentMethod,
		Currency:      req.Currency,
		TotalValue:    totalValue,
		Commission:    commission,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Store order
	h.mu.Lock()
	h.orders[orderID] = order
	h.mu.Unlock()

	// Publish event
	h.producer.PublishOrderCreated(userID, orderID, req.Symbol, req.Side, req.Quantity, price.InexactFloat64())

	// Simulate immediate fill for market orders
	if req.OrderType == "market" {
		go h.simulateFill(order)
	}

	c.JSON(http.StatusCreated, order)
}

func (h *CommoditiesHandler) simulateFill(order *models.CommodityOrder) {
	time.Sleep(500 * time.Millisecond) // Simulate execution delay

	h.mu.Lock()
	defer h.mu.Unlock()

	order.FilledQty = order.Quantity
	order.AvgFillPrice = order.Price
	order.Status = "filled"
	now := time.Now()
	order.FilledAt = &now
	order.UpdatedAt = now

	// Update position
	h.updatePosition(order)

	// Publish fill event
	h.producer.PublishOrderFilled(order.UserID, order.ID, order.Symbol, order.Quantity.InexactFloat64(), order.AvgFillPrice.InexactFloat64())
}

func (h *CommoditiesHandler) updatePosition(order *models.CommodityOrder) {
	positions := h.positions[order.UserID]
	
	var found bool
	for i, pos := range positions {
		if pos.Symbol == order.Symbol {
			if order.Side == "buy" {
				// Add to position
				totalCost := pos.AvgCost.Mul(pos.Quantity).Add(order.AvgFillPrice.Mul(order.FilledQty))
				newQty := pos.Quantity.Add(order.FilledQty)
				positions[i].Quantity = newQty
				positions[i].AvgCost = totalCost.Div(newQty)
			} else {
				// Reduce position
				positions[i].Quantity = pos.Quantity.Sub(order.FilledQty)
			}
			positions[i].UpdatedAt = time.Now()
			found = true
			break
		}
	}

	if !found && order.Side == "buy" {
		positions = append(positions, models.CommodityPosition{
			UserID:    order.UserID,
			Symbol:    order.Symbol,
			Quantity:  order.FilledQty,
			AvgCost:   order.AvgFillPrice,
			UpdatedAt: time.Now(),
		})
	}

	h.positions[order.UserID] = positions
}

// GetOrders returns user's orders
func (h *CommoditiesHandler) GetOrders(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	status := c.Query("status")

	h.mu.RLock()
	defer h.mu.RUnlock()

	var userOrders []*models.CommodityOrder
	for _, order := range h.orders {
		if order.UserID == userID {
			if status == "" || order.Status == status {
				userOrders = append(userOrders, order)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"orders": userOrders,
		"count":  len(userOrders),
	})
}

// GetPortfolio returns user's commodity portfolio
func (h *CommoditiesHandler) GetPortfolio(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	h.mu.RLock()
	positions := h.positions[userID]
	h.mu.RUnlock()

	// Calculate current values and P&L
	var totalValue, totalCost decimal.Decimal
	for i := range positions {
		// Get current price
		var currentPrice decimal.Decimal
		switch {
		case len(positions[i].Symbol) > 5 && positions[i].Symbol[:5] == "AFEX:":
			comm, _ := h.afex.GetQuote(positions[i].Symbol)
			if comm != nil {
				currentPrice = comm.Price
			}
		case len(positions[i].Symbol) > 5 && positions[i].Symbol[:5] == "AGDX:":
			comm, _ := h.agridex.GetQuote(positions[i].Symbol)
			if comm != nil {
				currentPrice = comm.Price
			}
		default:
			comm, _ := h.twelveData.GetQuote(positions[i].Symbol)
			if comm != nil {
				currentPrice = comm.Price
			}
		}

		positions[i].CurrentPrice = currentPrice
		positions[i].MarketValue = currentPrice.Mul(positions[i].Quantity)
		cost := positions[i].AvgCost.Mul(positions[i].Quantity)
		positions[i].UnrealizedPnL = positions[i].MarketValue.Sub(cost)
		if !cost.IsZero() {
			positions[i].PnLPercentage = positions[i].UnrealizedPnL.Div(cost).Mul(decimal.NewFromInt(100))
		}

		totalValue = totalValue.Add(positions[i].MarketValue)
		totalCost = totalCost.Add(cost)
	}

	portfolio := models.CommodityPortfolio{
		UserID:      userID,
		TotalValue:  totalValue,
		TotalCost:   totalCost,
		TotalPnL:    totalValue.Sub(totalCost),
		Positions:   positions,
		LastUpdated: time.Now(),
	}

	if !totalCost.IsZero() {
		portfolio.PnLPercentage = portfolio.TotalPnL.Div(totalCost).Mul(decimal.NewFromInt(100))
	}

	c.JSON(http.StatusOK, portfolio)
}

// CreatePriceAlertRequest represents alert creation request
type CreatePriceAlertRequest struct {
	Symbol    string  `json:"symbol" binding:"required"`
	Condition string  `json:"condition" binding:"required"` // above, below
	Price     float64 `json:"price" binding:"required"`
}

// CreatePriceAlert creates a new price alert
func (h *CommoditiesHandler) CreatePriceAlert(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	var req CreatePriceAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	alert := models.PriceAlert{
		ID:        uuid.New().String(),
		UserID:    userID,
		Symbol:    req.Symbol,
		Condition: req.Condition,
		Price:     decimal.NewFromFloat(req.Price),
		Active:    true,
		Triggered: false,
		CreatedAt: time.Now(),
	}

	h.mu.Lock()
	h.alerts[userID] = append(h.alerts[userID], alert)
	h.mu.Unlock()

	c.JSON(http.StatusCreated, alert)
}

// GetPriceAlerts returns user's price alerts
func (h *CommoditiesHandler) GetPriceAlerts(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	h.mu.RLock()
	alerts := h.alerts[userID]
	h.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"alerts": alerts,
		"count":  len(alerts),
	})
}

// GetAgriDexListings returns AgriDex marketplace listings
func (h *CommoditiesHandler) GetAgriDexListings(c *gin.Context) {
	productType := c.Query("product_type")

	listings, err := h.agridex.GetListings(productType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"listings": listings,
		"count":    len(listings),
		"network":  "solana-mainnet",
	})
}

// ExecuteAgriDexTradeRequest represents blockchain trade request
type ExecuteAgriDexTradeRequest struct {
	ListingID    string  `json:"listing_id" binding:"required"`
	Quantity     float64 `json:"quantity" binding:"required"`
	BuyerWallet  string  `json:"buyer_wallet" binding:"required"`
}

// ExecuteAgriDexTrade executes a blockchain-settled trade
func (h *CommoditiesHandler) ExecuteAgriDexTrade(c *gin.Context) {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "demo_user"
	}

	var req ExecuteAgriDexTradeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	settlement, err := h.agridex.ExecuteTrade(req.ListingID, req.Quantity, req.BuyerWallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Publish settlement event
	h.producer.PublishTradeSettled(userID, req.ListingID, settlement.TransactionHash, req.Quantity)

	c.JSON(http.StatusOK, gin.H{
		"status":     "settled",
		"settlement": settlement,
	})
}

// GetCategories returns available commodity categories
func (h *CommoditiesHandler) GetCategories(c *gin.Context) {
	categories := []map[string]interface{}{
		{"id": "precious_metals", "name": "Precious Metals", "icon": "gold", "description": "Gold, Silver, Platinum, Palladium"},
		{"id": "energy", "name": "Energy", "icon": "oil", "description": "Crude Oil, Natural Gas, Heating Oil"},
		{"id": "agriculture", "name": "Agriculture", "icon": "wheat", "description": "Grains, Coffee, Cocoa, Cotton, Sugar"},
		{"id": "minerals", "name": "Industrial Metals", "icon": "copper", "description": "Copper, Aluminum, Zinc"},
		{"id": "livestock", "name": "Livestock", "icon": "cattle", "description": "Live Cattle, Lean Hogs"},
	}

	c.JSON(http.StatusOK, gin.H{
		"categories": categories,
	})
}

// HealthCheck returns service health status
func (h *CommoditiesHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "commodities-trading",
		"version":   "1.0.0",
		"providers": []string{"twelve_data", "afex", "agridex"},
		"timestamp": time.Now(),
	})
}
