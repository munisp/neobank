package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/neobank/commodities-trading/internal/handlers"
)

func main() {
	// Set Gin mode
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Initialize handler
	h := handlers.NewCommoditiesHandler()

	// Health check
	r.GET("/health", h.HealthCheck)

	// API routes
	api := r.Group("/api/v1")
	{
		// Commodities
		commodities := api.Group("/commodities")
		{
			commodities.GET("", h.GetAllCommodities)
			commodities.GET("/categories", h.GetCategories)
			commodities.GET("/:symbol", h.GetCommodityQuote)
			commodities.GET("/:symbol/history", h.GetHistoricalData)
		}

		// Orders
		orders := api.Group("/orders")
		{
			orders.POST("", h.CreateOrder)
			orders.GET("", h.GetOrders)
		}

		// Portfolio
		api.GET("/portfolio", h.GetPortfolio)

		// Price Alerts
		alerts := api.Group("/alerts")
		{
			alerts.POST("", h.CreatePriceAlert)
			alerts.GET("", h.GetPriceAlerts)
		}

		// AgriDex (blockchain trading)
		agridex := api.Group("/agridex")
		{
			agridex.GET("/listings", h.GetAgriDexListings)
			agridex.POST("/trade", h.ExecuteAgriDexTrade)
		}
	}

	// Get port from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "8095"
	}

	log.Printf("Commodities Trading Service starting on port %s", port)
	log.Printf("Providers: Twelve Data (global), AFEX (African), AgriDex (blockchain)")
	
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
