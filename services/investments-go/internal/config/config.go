package config

import (
	"os"
)

type Config struct {
	Port              string
	JWTSecret         string
	Environment       string
	
	// Trading fees
	StockCommission   float64
	ETFCommission     float64
	CommoditySpread   float64
	
	// Limits
	MaxOrderValue     float64
	MinOrderValue     float64
	MaxDailyTrades    int
	
	// Market data providers
	MarketDataURL     string
	MarketDataAPIKey  string
}

func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8082"),
		JWTSecret:         getEnv("JWT_SECRET", "neobank-investments-secret-key"),
		Environment:       getEnv("ENVIRONMENT", "development"),
		StockCommission:   0.001,  // 0.1%
		ETFCommission:     0.0005, // 0.05%
		CommoditySpread:   0.002,  // 0.2%
		MaxOrderValue:     10000000,
		MinOrderValue:     1,
		MaxDailyTrades:    100,
		MarketDataURL:     getEnv("MARKET_DATA_URL", "https://api.marketdata.example.com"),
		MarketDataAPIKey:  getEnv("MARKET_DATA_API_KEY", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
