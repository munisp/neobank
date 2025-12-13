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
	// Nigeria-specific API keys
	NigeriaBVNAPIKey        string
	NigeriaNINAPIKey        string
	NigeriaCACAPIKey        string
	// South Africa-specific API keys
	SouthAfricaCIPCAPIKey   string
	SouthAfricaIDAPIKey     string
	// Kenya-specific API keys
	KenyaIPRSAPIKey         string
	KenyaKRAAPIKey          string
	// Ghana-specific API keys
	GhanaGRAAPIKey          string
	GhanaCardAPIKey         string
	// Egypt-specific API keys
	EgyptNIDAPIKey          string
	// Morocco-specific API keys
	MoroccoOMPICAPIKey      string
	// Uganda-specific API keys
	UgandaURSBAPIKey        string
	UgandaNINAPIKey         string
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
			// Nigeria-specific API keys
			NigeriaBVNAPIKey:      getEnv("NIGERIA_BVN_API_KEY", ""),
			NigeriaNINAPIKey:      getEnv("NIGERIA_NIN_API_KEY", ""),
			NigeriaCACAPIKey:      getEnv("NIGERIA_CAC_API_KEY", ""),
			// South Africa-specific API keys
			SouthAfricaCIPCAPIKey: getEnv("SOUTH_AFRICA_CIPC_API_KEY", ""),
			SouthAfricaIDAPIKey:   getEnv("SOUTH_AFRICA_ID_API_KEY", ""),
			// Kenya-specific API keys
			KenyaIPRSAPIKey:       getEnv("KENYA_IPRS_API_KEY", ""),
			KenyaKRAAPIKey:        getEnv("KENYA_KRA_API_KEY", ""),
			// Ghana-specific API keys
			GhanaGRAAPIKey:        getEnv("GHANA_GRA_API_KEY", ""),
			GhanaCardAPIKey:       getEnv("GHANA_CARD_API_KEY", ""),
			// Egypt-specific API keys
			EgyptNIDAPIKey:        getEnv("EGYPT_NID_API_KEY", ""),
			// Morocco-specific API keys
			MoroccoOMPICAPIKey:    getEnv("MOROCCO_OMPIC_API_KEY", ""),
			// Uganda-specific API keys
			UgandaURSBAPIKey:      getEnv("UGANDA_URSB_API_KEY", ""),
			UgandaNINAPIKey:       getEnv("UGANDA_NIN_API_KEY", ""),
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
