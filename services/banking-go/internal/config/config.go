package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server      ServerConfig
	Database    DatabaseConfig
	JWT         JWTConfig
	TigerBeetle TigerBeetleConfig
	TwoFactor   TwoFactorConfig
	Environment string
}

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	DBName          string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	UsePostgres     bool
}

type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

type TigerBeetleConfig struct {
	Address  string
	Cluster  uint32
	Required bool
}

type TwoFactorConfig struct {
	Issuer     string
	SecretSize int
	Period     int
	Digits     int
}

func Load() *Config {
	env := getEnv("ENVIRONMENT", "development")
	usePostgres := getEnv("USE_POSTGRES", "false") == "true" || env == "production"
	tigerBeetleRequired := getEnv("TIGERBEETLE_REQUIRED", "false") == "true" || env == "production"

	return &Config{
		Environment: env,
		Server: ServerConfig{
			Port:         getEnv("SERVER_PORT", "8081"),
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
		},
		Database: DatabaseConfig{
			Host:            getEnv("DB_HOST", "localhost"),
			Port:            getEnvInt("DB_PORT", 5432),
			User:            getEnv("DB_USER", "neobank"),
			Password:        getEnv("DB_PASSWORD", ""),
			DBName:          getEnv("DB_NAME", "neobank_banking"),
			SSLMode:         getEnv("DB_SSL_MODE", "disable"),
			MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: time.Duration(getEnvInt("DB_CONN_MAX_LIFETIME_MINUTES", 5)) * time.Minute,
			UsePostgres:     usePostgres,
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "neobank-banking-secret-key"),
			Expiration: 24 * time.Hour,
		},
		TigerBeetle: TigerBeetleConfig{
			Address:  getEnv("TIGERBEETLE_ADDRESS", "localhost:3000"),
			Cluster:  0,
			Required: tigerBeetleRequired,
		},
		TwoFactor: TwoFactorConfig{
			Issuer:     getEnv("TOTP_ISSUER", "NeoBank"),
			SecretSize: getEnvInt("TOTP_SECRET_SIZE", 20),
			Period:     getEnvInt("TOTP_PERIOD", 30),
			Digits:     getEnvInt("TOTP_DIGITS", 6),
		},
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

// Validate checks if required configuration is present for production
func (c *Config) Validate() error {
	if c.Environment == "production" {
		if c.Database.Password == "" {
			return &ConfigError{Field: "DB_PASSWORD", Message: "database password is required in production"}
		}
		if c.JWT.Secret == "neobank-banking-secret-key" {
			return &ConfigError{Field: "JWT_SECRET", Message: "default JWT secret cannot be used in production"}
		}
	}
	return nil
}

// ConfigError represents a configuration validation error
type ConfigError struct {
	Field   string
	Message string
}

func (e *ConfigError) Error() string {
	return e.Field + ": " + e.Message
}
