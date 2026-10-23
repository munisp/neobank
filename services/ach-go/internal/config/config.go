package config

import "os"

type Config struct {
	ServerPort  string
	Environment string
	// FileHeader defaults for generated NACHA files
	ImmediateDestination string // RDFI routing (9 digits, space-padded by writer)
	ImmediateOrigin      string // ODFI routing / company id
	DestinationName      string
	OriginName           string
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func Load() *Config {
	return &Config{
		ServerPort:         getEnv("PORT", "8092"),
		Environment:        getEnv("ENVIRONMENT", "development"),
		ImmediateDestination: getEnv("ACH_IMMEDIATE_DESTINATION", "021000018"),
		ImmediateOrigin:      getEnv("ACH_IMMEDIATE_ORIGIN", "1234567890"),
		DestinationName:      getEnv("ACH_DESTINATION_NAME", "BANK"),
		OriginName:           getEnv("ACH_ORIGIN_NAME", "NEOBANK"),
	}
}
