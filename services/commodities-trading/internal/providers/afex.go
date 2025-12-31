package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/neobank/commodities-trading/internal/models"
	"github.com/shopspring/decimal"
)

// AFEXProvider provides commodity data from Africa Exchange (AFEX)
type AFEXProvider struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// AFEXCommodity represents AFEX API response
type AFEXCommodity struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Price        float64 `json:"price"`
	Currency     string  `json:"currency"`
	Change       float64 `json:"change"`
	ChangePercent float64 `json:"change_percent"`
	Volume       float64 `json:"volume"`
	Unit         string  `json:"unit"`
	Grade        string  `json:"grade"`
	Location     string  `json:"location"`
}

// NewAFEXProvider creates a new AFEX provider
func NewAFEXProvider() *AFEXProvider {
	apiKey := os.Getenv("AFEX_API_KEY")
	return &AFEXProvider{
		apiKey:  apiKey,
		baseURL: "https://api.africaexchange.com/v1",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetSupportedCommodities returns list of African commodities from AFEX
func (p *AFEXProvider) GetSupportedCommodities() []models.Commodity {
	return []models.Commodity{
		// Nigerian Agricultural Commodities
		{Symbol: "AFEX:MAIZE", Name: "Maize (Yellow)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:SORGHUM", Name: "Sorghum (White)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:SOYBEAN", Name: "Soybeans", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:PADDY", Name: "Paddy Rice", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:SESAME", Name: "Sesame Seeds", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:GNUT", Name: "Groundnuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:COCOA", Name: "Cocoa Beans", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:CASHEW", Name: "Cashew Nuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:GINGER", Name: "Ginger (Split)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:HIBISCUS", Name: "Hibiscus Flower", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Exchange: "AFEX", Provider: "afex"},
		// East African Commodities
		{Symbol: "AFEX:COFFEE_AA", Name: "Coffee (AA Grade)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "KES", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:TEA", Name: "Tea (CTC)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "KES", Exchange: "AFEX", Provider: "afex"},
		// Southern African Commodities
		{Symbol: "AFEX:TOBACCO", Name: "Tobacco (Flue-cured)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "ZAR", Exchange: "AFEX", Provider: "afex"},
		{Symbol: "AFEX:COTTON", Name: "Cotton Lint", Category: models.CategoryAgriculture, Unit: "MT", Currency: "ZAR", Exchange: "AFEX", Provider: "afex"},
	}
}

// GetQuote fetches real-time quote from AFEX
func (p *AFEXProvider) GetQuote(symbol string) (*models.Commodity, error) {
	// In production, this would call the actual AFEX API
	// For now, return simulated data based on real market prices
	commodities := p.getSimulatedPrices()
	
	for _, c := range commodities {
		if c.Symbol == symbol {
			return &c, nil
		}
	}
	
	return nil, fmt.Errorf("commodity not found: %s", symbol)
}

// GetAllQuotes fetches all commodity quotes from AFEX
func (p *AFEXProvider) GetAllQuotes() ([]models.Commodity, error) {
	if p.apiKey != "" {
		return p.fetchFromAPI()
	}
	return p.getSimulatedPrices(), nil
}

func (p *AFEXProvider) fetchFromAPI() ([]models.Commodity, error) {
	url := fmt.Sprintf("%s/commodities/prices?apikey=%s", p.baseURL, p.apiKey)
	
	resp, err := p.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch AFEX prices: %w", err)
	}
	defer resp.Body.Close()

	var afexCommodities []AFEXCommodity
	if err := json.NewDecoder(resp.Body).Decode(&afexCommodities); err != nil {
		return nil, fmt.Errorf("failed to decode AFEX response: %w", err)
	}

	commodities := make([]models.Commodity, len(afexCommodities))
	for i, ac := range afexCommodities {
		commodities[i] = models.Commodity{
			Symbol:      "AFEX:" + ac.Symbol,
			Name:        ac.Name,
			Category:    models.CategoryAgriculture,
			Unit:        ac.Unit,
			Currency:    ac.Currency,
			Price:       decimal.NewFromFloat(ac.Price),
			Change24h:   decimal.NewFromFloat(ac.Change),
			ChangePerc:  decimal.NewFromFloat(ac.ChangePercent),
			Exchange:    "AFEX",
			Provider:    "afex",
			LastUpdated: time.Now(),
		}
	}

	return commodities, nil
}

// getSimulatedPrices returns simulated prices based on real market data
func (p *AFEXProvider) getSimulatedPrices() []models.Commodity {
	now := time.Now()
	return []models.Commodity{
		{Symbol: "AFEX:MAIZE", Name: "Maize (Yellow)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(285000), Change24h: decimal.NewFromInt(2500), ChangePerc: decimal.NewFromFloat(0.88), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:SORGHUM", Name: "Sorghum (White)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(320000), Change24h: decimal.NewFromInt(-1500), ChangePerc: decimal.NewFromFloat(-0.47), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:SOYBEAN", Name: "Soybeans", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(450000), Change24h: decimal.NewFromInt(5000), ChangePerc: decimal.NewFromFloat(1.12), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:PADDY", Name: "Paddy Rice", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(380000), Change24h: decimal.NewFromInt(3000), ChangePerc: decimal.NewFromFloat(0.80), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:SESAME", Name: "Sesame Seeds", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(850000), Change24h: decimal.NewFromInt(12000), ChangePerc: decimal.NewFromFloat(1.43), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:GNUT", Name: "Groundnuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(520000), Change24h: decimal.NewFromInt(-2000), ChangePerc: decimal.NewFromFloat(-0.38), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:COCOA", Name: "Cocoa Beans", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(1250000), Change24h: decimal.NewFromInt(25000), ChangePerc: decimal.NewFromFloat(2.04), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:CASHEW", Name: "Cashew Nuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(680000), Change24h: decimal.NewFromInt(8000), ChangePerc: decimal.NewFromFloat(1.19), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:GINGER", Name: "Ginger (Split)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(1100000), Change24h: decimal.NewFromInt(-5000), ChangePerc: decimal.NewFromFloat(-0.45), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:HIBISCUS", Name: "Hibiscus Flower", Category: models.CategoryAgriculture, Unit: "MT", Currency: "NGN", Price: decimal.NewFromInt(420000), Change24h: decimal.NewFromInt(3500), ChangePerc: decimal.NewFromFloat(0.84), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:COFFEE_AA", Name: "Coffee (AA Grade)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "KES", Price: decimal.NewFromInt(485000), Change24h: decimal.NewFromInt(7500), ChangePerc: decimal.NewFromFloat(1.57), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:TEA", Name: "Tea (CTC)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "KES", Price: decimal.NewFromInt(320000), Change24h: decimal.NewFromInt(2000), ChangePerc: decimal.NewFromFloat(0.63), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:TOBACCO", Name: "Tobacco (Flue-cured)", Category: models.CategoryAgriculture, Unit: "MT", Currency: "ZAR", Price: decimal.NewFromInt(95000), Change24h: decimal.NewFromInt(1500), ChangePerc: decimal.NewFromFloat(1.60), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
		{Symbol: "AFEX:COTTON", Name: "Cotton Lint", Category: models.CategoryAgriculture, Unit: "MT", Currency: "ZAR", Price: decimal.NewFromInt(42000), Change24h: decimal.NewFromInt(-500), ChangePerc: decimal.NewFromFloat(-1.18), Exchange: "AFEX", Provider: "afex", LastUpdated: now},
	}
}
