package config

import (
	"os"
	"time"
)

type Config struct {
	Server     ServerConfig
	Database   DatabaseConfig
	Redis      RedisConfig
	Compliance ComplianceConfig
	JWT        JWTConfig
	Storage    StorageConfig
}

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

type ComplianceConfig struct {
	ComplyAdvantageAPIKey   string
	ComplyAdvantageURL      string
	SanctionsAPIKey         string
	SanctionsURL            string
	BiometricAPIKey         string
	BiometricURL            string
	CACVerificationAPIKey   string
	CACVerificationURL      string
}

type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

type StorageConfig struct {
	UploadDir     string
	MaxFileSize   int64
	AllowedTypes  []string
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnv("SERVER_PORT", "8080"),
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "neobank"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "neobank_kyc"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       0,
		},
		Compliance: ComplianceConfig{
			ComplyAdvantageAPIKey: getEnv("COMPLYADVANTAGE_API_KEY", ""),
			ComplyAdvantageURL:    getEnv("COMPLYADVANTAGE_URL", "https://api.complyadvantage.com/v1"),
			SanctionsAPIKey:       getEnv("SANCTIONS_API_KEY", ""),
			SanctionsURL:          getEnv("SANCTIONS_URL", "https://api.sanctionsexplorer.com/v1"),
			BiometricAPIKey:       getEnv("BIOMETRIC_API_KEY", ""),
			BiometricURL:          getEnv("BIOMETRIC_URL", "https://api.biometric-verify.com/v1"),
			CACVerificationAPIKey: getEnv("CAC_API_KEY", ""),
			CACVerificationURL:    getEnv("CAC_URL", "https://api.cac.gov.ng/v1"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", ""),
			Expiration: 24 * time.Hour,
		},
		Storage: StorageConfig{
			UploadDir:    getEnv("UPLOAD_DIR", "/var/uploads/kyc"),
			MaxFileSize:  10 * 1024 * 1024, // 10MB
			AllowedTypes: []string{"image/jpeg", "image/png", "application/pdf"},
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
