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

// TwelveDataProvider provides real-time commodity data from Twelve Data API
type TwelveDataProvider struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// TwelveDataQuote represents the API response
type TwelveDataQuote struct {
	Symbol        string `json:"symbol"`
	Name          string `json:"name"`
	Exchange      string `json:"exchange"`
	Currency      string `json:"currency"`
	Datetime      string `json:"datetime"`
	Open          string `json:"open"`
	High          string `json:"high"`
	Low           string `json:"low"`
	Close         string `json:"close"`
	Volume        string `json:"volume"`
	PreviousClose string `json:"previous_close"`
	Change        string `json:"change"`
	PercentChange string `json:"percent_change"`
}

// NewTwelveDataProvider creates a new Twelve Data provider
func NewTwelveDataProvider() *TwelveDataProvider {
	apiKey := os.Getenv("TWELVE_DATA_API_KEY")
	if apiKey == "" {
		apiKey = "demo" // Demo key for testing
	}
	return &TwelveDataProvider{
		apiKey:  apiKey,
		baseURL: "https://api.twelvedata.com",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetSupportedCommodities returns list of supported commodities
func (p *TwelveDataProvider) GetSupportedCommodities() []models.Commodity {
	return []models.Commodity{
		// Precious Metals
		{Symbol: "XAU/USD", Name: "Gold", Category: models.CategoryPreciousMetals, Unit: "oz", Currency: "USD", Exchange: "FOREX", Provider: "twelve_data"},
		{Symbol: "XAG/USD", Name: "Silver", Category: models.CategoryPreciousMetals, Unit: "oz", Currency: "USD", Exchange: "FOREX", Provider: "twelve_data"},
		{Symbol: "XPT/USD", Name: "Platinum", Category: models.CategoryPreciousMetals, Unit: "oz", Currency: "USD", Exchange: "FOREX", Provider: "twelve_data"},
		{Symbol: "XPD/USD", Name: "Palladium", Category: models.CategoryPreciousMetals, Unit: "oz", Currency: "USD", Exchange: "FOREX", Provider: "twelve_data"},
		// Energy
		{Symbol: "CL", Name: "Crude Oil WTI", Category: models.CategoryEnergy, Unit: "barrel", Currency: "USD", Exchange: "NYMEX", Provider: "twelve_data"},
		{Symbol: "BZ", Name: "Brent Crude Oil", Category: models.CategoryEnergy, Unit: "barrel", Currency: "USD", Exchange: "ICE", Provider: "twelve_data"},
		{Symbol: "NG", Name: "Natural Gas", Category: models.CategoryEnergy, Unit: "MMBtu", Currency: "USD", Exchange: "NYMEX", Provider: "twelve_data"},
		{Symbol: "HO", Name: "Heating Oil", Category: models.CategoryEnergy, Unit: "gallon", Currency: "USD", Exchange: "NYMEX", Provider: "twelve_data"},
		// Agriculture
		{Symbol: "ZC", Name: "Corn", Category: models.CategoryAgriculture, Unit: "bushel", Currency: "USD", Exchange: "CBOT", Provider: "twelve_data"},
		{Symbol: "ZW", Name: "Wheat", Category: models.CategoryAgriculture, Unit: "bushel", Currency: "USD", Exchange: "CBOT", Provider: "twelve_data"},
		{Symbol: "ZS", Name: "Soybeans", Category: models.CategoryAgriculture, Unit: "bushel", Currency: "USD", Exchange: "CBOT", Provider: "twelve_data"},
		{Symbol: "KC", Name: "Coffee", Category: models.CategoryAgriculture, Unit: "lb", Currency: "USD", Exchange: "ICE", Provider: "twelve_data"},
		{Symbol: "CC", Name: "Cocoa", Category: models.CategoryAgriculture, Unit: "tonne", Currency: "USD", Exchange: "ICE", Provider: "twelve_data"},
		{Symbol: "CT", Name: "Cotton", Category: models.CategoryAgriculture, Unit: "lb", Currency: "USD", Exchange: "ICE", Provider: "twelve_data"},
		{Symbol: "SB", Name: "Sugar", Category: models.CategoryAgriculture, Unit: "lb", Currency: "USD", Exchange: "ICE", Provider: "twelve_data"},
		// Minerals
		{Symbol: "HG", Name: "Copper", Category: models.CategoryMinerals, Unit: "lb", Currency: "USD", Exchange: "COMEX", Provider: "twelve_data"},
		// Livestock
		{Symbol: "LE", Name: "Live Cattle", Category: models.CategoryLivestock, Unit: "lb", Currency: "USD", Exchange: "CME", Provider: "twelve_data"},
		{Symbol: "HE", Name: "Lean Hogs", Category: models.CategoryLivestock, Unit: "lb", Currency: "USD", Exchange: "CME", Provider: "twelve_data"},
	}
}

// GetQuote fetches real-time quote for a commodity
func (p *TwelveDataProvider) GetQuote(symbol string) (*models.Commodity, error) {
	url := fmt.Sprintf("%s/quote?symbol=%s&apikey=%s", p.baseURL, symbol, p.apiKey)
	
	resp, err := p.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch quote: %w", err)
	}
	defer resp.Body.Close()

	var quote TwelveDataQuote
	if err := json.NewDecoder(resp.Body).Decode(&quote); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	price, _ := decimal.NewFromString(quote.Close)
	change, _ := decimal.NewFromString(quote.Change)
	changePerc, _ := decimal.NewFromString(quote.PercentChange)
	high, _ := decimal.NewFromString(quote.High)
	low, _ := decimal.NewFromString(quote.Low)
	volume, _ := decimal.NewFromString(quote.Volume)

	return &models.Commodity{
		Symbol:      quote.Symbol,
		Name:        quote.Name,
		Currency:    quote.Currency,
		Price:       price,
		Change24h:   change,
		ChangePerc:  changePerc,
		High24h:     high,
		Low24h:      low,
		Volume:      volume,
		Exchange:    quote.Exchange,
		Provider:    "twelve_data",
		LastUpdated: time.Now(),
	}, nil
}

// GetHistoricalData fetches historical price data
func (p *TwelveDataProvider) GetHistoricalData(symbol string, interval string, outputSize int) ([]models.HistoricalPrice, error) {
	url := fmt.Sprintf("%s/time_series?symbol=%s&interval=%s&outputsize=%d&apikey=%s",
		p.baseURL, symbol, interval, outputSize, p.apiKey)
	
	resp, err := p.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch historical data: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Values []struct {
			Datetime string `json:"datetime"`
			Open     string `json:"open"`
			High     string `json:"high"`
			Low      string `json:"low"`
			Close    string `json:"close"`
			Volume   string `json:"volume"`
		} `json:"values"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	prices := make([]models.HistoricalPrice, len(result.Values))
	for i, v := range result.Values {
		open, _ := decimal.NewFromString(v.Open)
		high, _ := decimal.NewFromString(v.High)
		low, _ := decimal.NewFromString(v.Low)
		close, _ := decimal.NewFromString(v.Close)
		volume, _ := decimal.NewFromString(v.Volume)

		prices[i] = models.HistoricalPrice{
			Symbol: symbol,
			Date:   v.Datetime,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  close,
			Volume: volume,
		}
	}

	return prices, nil
}
