package config

import (
	"os"
)

type Config struct {
	Port        string
	JWTSecret   string
	Environment string
	
	// Rewards settings
	PointsPerNaira      float64
	CashbackRate        float64
	ReferralReward      float64
	SignupBonus         float64
	PointsToNairaRate   float64
}

func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8087"),
		JWTSecret:         getEnv("JWT_SECRET", "neobank-rewards-secret-key"),
		Environment:       getEnv("ENVIRONMENT", "development"),
		PointsPerNaira:    0.01,
		CashbackRate:      0.01,
		ReferralReward:    5000,
		SignupBonus:       1000,
		PointsToNairaRate: 0.1,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
