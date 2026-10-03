package database

import (
	"github.com/shopspring/decimal"

	"github.com/neobank/savings-service/internal/models"
)

// defaultInterestTiers is static reference data shared by both stores.
var defaultInterestTiers = []models.InterestTier{
		{MinBalance: decimal.Zero, MaxBalance: decimal.NewFromInt(100000), Rate: decimal.NewFromFloat(4.0)},
		{MinBalance: decimal.NewFromInt(100000), MaxBalance: decimal.NewFromInt(500000), Rate: decimal.NewFromFloat(6.0)},
		{MinBalance: decimal.NewFromInt(500000), MaxBalance: decimal.NewFromInt(1000000), Rate: decimal.NewFromFloat(8.0)},
		{MinBalance: decimal.NewFromInt(1000000), MaxBalance: decimal.NewFromInt(5000000), Rate: decimal.NewFromFloat(10.0)},
		{MinBalance: decimal.NewFromInt(5000000), MaxBalance: decimal.NewFromInt(999999999999), Rate: decimal.NewFromFloat(12.0)},
	}
