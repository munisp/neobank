package config

import (
	"os"
)

type Config struct {
	Port        string
	JWTSecret   string
	Environment string
	
	// BNPL limits
	DefaultLimit    float64
	MaxLimit        float64
	MinPurchase     float64
	MaxPurchase     float64
	
	// Fees
	LateFeePercent  float64
	LateFeeFixed    float64
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8085"),
		JWTSecret:       getEnv("JWT_SECRET", "neobank-bnpl-secret-key"),
		Environment:     getEnv("ENVIRONMENT", "development"),
		DefaultLimit:    500000,
		MaxLimit:        5000000,
		MinPurchase:     5000,
		MaxPurchase:     2000000,
		LateFeePercent:  0.02,
		LateFeeFixed:    500,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
