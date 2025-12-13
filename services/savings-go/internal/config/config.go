package config

import (
	"os"
)

type Config struct {
	Port        string
	JWTSecret   string
	Environment string
	
	// Interest rates
	FlexibleBaseRate    float64
	FixedDepositMinRate float64
	FixedDepositMaxRate float64
	
	// Limits
	MinVaultDeposit     float64
	MaxVaultDeposit     float64
	MinFixedDeposit     float64
	MaxSalaryAdvance    float64
	
	// Group savings
	MaxGroupMembers     int
	MinGroupMembers     int
}

func Load() *Config {
	return &Config{
		Port:                getEnv("PORT", "8083"),
		JWTSecret:           getEnv("JWT_SECRET", "neobank-savings-secret-key"),
		Environment:         getEnv("ENVIRONMENT", "development"),
		FlexibleBaseRate:    4.0,
		FixedDepositMinRate: 6.0,
		FixedDepositMaxRate: 14.0,
		MinVaultDeposit:     100,
		MaxVaultDeposit:     100000000,
		MinFixedDeposit:     10000,
		MaxSalaryAdvance:    500000,
		MaxGroupMembers:     20,
		MinGroupMembers:     2,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
