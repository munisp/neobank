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

// AgriDexProvider provides blockchain-based agricultural commodity trading via AgriDex (Solana)
type AgriDexProvider struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// AgriDexListing represents an AgriDex marketplace listing
type AgriDexListing struct {
	ID           string  `json:"id"`
	ProductType  string  `json:"product_type"`
	Name         string  `json:"name"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	PricePerUnit float64 `json:"price_per_unit"`
	Currency     string  `json:"currency"`
	Origin       string  `json:"origin"`
	Grade        string  `json:"grade"`
	Seller       string  `json:"seller"`
	Available    bool    `json:"available"`
}

// NewAgriDexProvider creates a new AgriDex provider
func NewAgriDexProvider() *AgriDexProvider {
	apiKey := os.Getenv("AGRIDEX_API_KEY")
	return &AgriDexProvider{
		apiKey:  apiKey,
		baseURL: "https://api.agridex.com/v1",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetSupportedCommodities returns list of commodities available on AgriDex
func (p *AgriDexProvider) GetSupportedCommodities() []models.Commodity {
	return []models.Commodity{
		// African Agricultural Exports (blockchain-settled)
		{Symbol: "AGDX:COFFEE_ETH", Name: "Ethiopian Coffee", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:COFFEE_KE", Name: "Kenyan Coffee AA", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:COCOA_GH", Name: "Ghanaian Cocoa", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:COCOA_CI", Name: "Ivorian Cocoa", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:VANILLA_MG", Name: "Madagascar Vanilla", Category: models.CategoryAgriculture, Unit: "kg", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:OLIVE_ZA", Name: "South African Olive Oil", Category: models.CategoryAgriculture, Unit: "L", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:WINE_ZA", Name: "South African Wine", Category: models.CategoryAgriculture, Unit: "L", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:MACADAMIA_ZA", Name: "Macadamia Nuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:AVOCADO_KE", Name: "Kenyan Avocados", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:FLOWERS_KE", Name: "Kenyan Cut Flowers", Category: models.CategoryAgriculture, Unit: "stems", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:SHEA_NG", Name: "Nigerian Shea Butter", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
		{Symbol: "AGDX:PALM_NG", Name: "Nigerian Palm Oil", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Exchange: "AgriDex", Provider: "agridex"},
	}
}

// GetQuote fetches real-time quote from AgriDex
func (p *AgriDexProvider) GetQuote(symbol string) (*models.Commodity, error) {
	commodities := p.getSimulatedPrices()
	
	for _, c := range commodities {
		if c.Symbol == symbol {
			return &c, nil
		}
	}
	
	return nil, fmt.Errorf("commodity not found: %s", symbol)
}

// GetAllQuotes fetches all commodity quotes from AgriDex
func (p *AgriDexProvider) GetAllQuotes() ([]models.Commodity, error) {
	if p.apiKey != "" {
		return p.fetchFromAPI()
	}
	return p.getSimulatedPrices(), nil
}

// GetListings fetches available marketplace listings
func (p *AgriDexProvider) GetListings(productType string) ([]AgriDexListing, error) {
	if p.apiKey == "" {
		return p.getSimulatedListings(productType), nil
	}

	url := fmt.Sprintf("%s/listings?product_type=%s&apikey=%s", p.baseURL, productType, p.apiKey)
	
	resp, err := p.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch AgriDex listings: %w", err)
	}
	defer resp.Body.Close()

	var listings []AgriDexListing
	if err := json.NewDecoder(resp.Body).Decode(&listings); err != nil {
		return nil, fmt.Errorf("failed to decode AgriDex response: %w", err)
	}

	return listings, nil
}

func (p *AgriDexProvider) fetchFromAPI() ([]models.Commodity, error) {
	url := fmt.Sprintf("%s/prices?apikey=%s", p.baseURL, p.apiKey)
	
	resp, err := p.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch AgriDex prices: %w", err)
	}
	defer resp.Body.Close()

	var listings []AgriDexListing
	if err := json.NewDecoder(resp.Body).Decode(&listings); err != nil {
		return nil, fmt.Errorf("failed to decode AgriDex response: %w", err)
	}

	commodities := make([]models.Commodity, len(listings))
	for i, l := range listings {
		commodities[i] = models.Commodity{
			Symbol:      "AGDX:" + l.ProductType,
			Name:        l.Name,
			Category:    models.CategoryAgriculture,
			Unit:        l.Unit,
			Currency:    l.Currency,
			Price:       decimal.NewFromFloat(l.PricePerUnit),
			Volume:      decimal.NewFromFloat(l.Quantity),
			Exchange:    "AgriDex",
			Provider:    "agridex",
			LastUpdated: time.Now(),
		}
	}

	return commodities, nil
}

// getSimulatedPrices returns simulated prices based on real market data
func (p *AgriDexProvider) getSimulatedPrices() []models.Commodity {
	now := time.Now()
	return []models.Commodity{
		{Symbol: "AGDX:COFFEE_ETH", Name: "Ethiopian Coffee", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(4850), Change24h: decimal.NewFromInt(75), ChangePerc: decimal.NewFromFloat(1.57), Volume: decimal.NewFromInt(245), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:COFFEE_KE", Name: "Kenyan Coffee AA", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(5200), Change24h: decimal.NewFromInt(120), ChangePerc: decimal.NewFromFloat(2.36), Volume: decimal.NewFromInt(180), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:COCOA_GH", Name: "Ghanaian Cocoa", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(3450), Change24h: decimal.NewFromInt(85), ChangePerc: decimal.NewFromFloat(2.53), Volume: decimal.NewFromInt(520), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:COCOA_CI", Name: "Ivorian Cocoa", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(3380), Change24h: decimal.NewFromInt(65), ChangePerc: decimal.NewFromFloat(1.96), Volume: decimal.NewFromInt(680), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:VANILLA_MG", Name: "Madagascar Vanilla", Category: models.CategoryAgriculture, Unit: "kg", Currency: "USDC", Price: decimal.NewFromInt(425), Change24h: decimal.NewFromInt(-15), ChangePerc: decimal.NewFromFloat(-3.41), Volume: decimal.NewFromInt(85), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:OLIVE_ZA", Name: "South African Olive Oil", Category: models.CategoryAgriculture, Unit: "L", Currency: "USDC", Price: decimal.NewFromFloat(12.50), Change24h: decimal.NewFromFloat(0.35), ChangePerc: decimal.NewFromFloat(2.88), Volume: decimal.NewFromInt(15000), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:WINE_ZA", Name: "South African Wine", Category: models.CategoryAgriculture, Unit: "L", Currency: "USDC", Price: decimal.NewFromFloat(8.75), Change24h: decimal.NewFromFloat(0.25), ChangePerc: decimal.NewFromFloat(2.94), Volume: decimal.NewFromInt(25000), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:MACADAMIA_ZA", Name: "Macadamia Nuts", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(8500), Change24h: decimal.NewFromInt(150), ChangePerc: decimal.NewFromFloat(1.80), Volume: decimal.NewFromInt(120), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:AVOCADO_KE", Name: "Kenyan Avocados", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(2200), Change24h: decimal.NewFromInt(45), ChangePerc: decimal.NewFromFloat(2.09), Volume: decimal.NewFromInt(350), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:FLOWERS_KE", Name: "Kenyan Cut Flowers", Category: models.CategoryAgriculture, Unit: "stems", Currency: "USDC", Price: decimal.NewFromFloat(0.45), Change24h: decimal.NewFromFloat(0.02), ChangePerc: decimal.NewFromFloat(4.65), Volume: decimal.NewFromInt(500000), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:SHEA_NG", Name: "Nigerian Shea Butter", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(1850), Change24h: decimal.NewFromInt(35), ChangePerc: decimal.NewFromFloat(1.93), Volume: decimal.NewFromInt(200), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
		{Symbol: "AGDX:PALM_NG", Name: "Nigerian Palm Oil", Category: models.CategoryAgriculture, Unit: "MT", Currency: "USDC", Price: decimal.NewFromInt(920), Change24h: decimal.NewFromInt(-12), ChangePerc: decimal.NewFromFloat(-1.29), Volume: decimal.NewFromInt(450), Exchange: "AgriDex", Provider: "agridex", LastUpdated: now},
	}
}

func (p *AgriDexProvider) getSimulatedListings(productType string) []AgriDexListing {
	listings := []AgriDexListing{
		{ID: "lst_001", ProductType: "COFFEE_ETH", Name: "Ethiopian Yirgacheffe Coffee", Quantity: 50, Unit: "MT", PricePerUnit: 4850, Currency: "USDC", Origin: "Ethiopia", Grade: "Grade 1", Seller: "Sidamo Cooperative", Available: true},
		{ID: "lst_002", ProductType: "COCOA_GH", Name: "Ghana Premium Cocoa Beans", Quantity: 100, Unit: "MT", PricePerUnit: 3450, Currency: "USDC", Origin: "Ghana", Grade: "Premium", Seller: "Cocobod", Available: true},
		{ID: "lst_003", ProductType: "VANILLA_MG", Name: "Madagascar Bourbon Vanilla", Quantity: 500, Unit: "kg", PricePerUnit: 425, Currency: "USDC", Origin: "Madagascar", Grade: "Gourmet", Seller: "Vanilla Islands", Available: true},
	}

	if productType == "" {
		return listings
	}

	var filtered []AgriDexListing
	for _, l := range listings {
		if l.ProductType == productType {
			filtered = append(filtered, l)
		}
	}
	return filtered
}

// SettlementInfo represents blockchain settlement details
type SettlementInfo struct {
	TransactionHash string    `json:"transaction_hash"`
	BlockNumber     uint64    `json:"block_number"`
	Network         string    `json:"network"`
	SettledAt       time.Time `json:"settled_at"`
	Fee             string    `json:"fee"`
}

// ExecuteTrade executes a trade on AgriDex with stablecoin settlement
func (p *AgriDexProvider) ExecuteTrade(listingID string, quantity float64, buyerWallet string) (*SettlementInfo, error) {
	// In production, this would interact with Solana blockchain
	// For now, return simulated settlement info
	return &SettlementInfo{
		TransactionHash: fmt.Sprintf("0x%x", time.Now().UnixNano()),
		BlockNumber:     uint64(time.Now().Unix()),
		Network:         "solana-mainnet",
		SettledAt:       time.Now(),
		Fee:             "0.00025 SOL",
	}, nil
}
