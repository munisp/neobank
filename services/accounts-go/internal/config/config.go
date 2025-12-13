package config

import (
	"os"
)

type Config struct {
	Port        string
	JWTSecret   string
	Environment string
	
	// Kids account limits
	DefaultDailyLimit   float64
	DefaultWeeklyLimit  float64
	DefaultMonthlyLimit float64
	MinChildAge         int
	MaxChildAge         int
}

func Load() *Config {
	return &Config{
		Port:                getEnv("PORT", "8086"),
		JWTSecret:           getEnv("JWT_SECRET", "neobank-accounts-secret-key"),
		Environment:         getEnv("ENVIRONMENT", "development"),
		DefaultDailyLimit:   5000,
		DefaultWeeklyLimit:  20000,
		DefaultMonthlyLimit: 50000,
		MinChildAge:         6,
		MaxChildAge:         17,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
