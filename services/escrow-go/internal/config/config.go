package config

import (
	"os"
	"strconv"
)

type Config struct {
	ServerPort   string
	DatabaseURL  string
	KafkaBrokers string
	RedisURL     string
	Environment  string
	LogLevel     string
}

func Load() *Config {
	return &Config{
		ServerPort:   getEnv("SERVER_PORT", "8090"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/neobank_escrow?sslmode=disable"),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "localhost:9092"),
		RedisURL:     getEnv("REDIS_URL", "redis://localhost:6379"),
		Environment:  getEnv("ENVIRONMENT", "development"),
		LogLevel:     getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
