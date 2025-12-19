package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/neobank/investments-service/internal/config"
	"github.com/neobank/investments-service/internal/database"
	"github.com/neobank/investments-service/internal/handlers"
	"github.com/neobank/investments-service/internal/middleware"
)

func main() {
	cfg := config.Load()
	// Database initialization - require DATABASE_URL in production
	databaseURL := os.Getenv("DATABASE_URL")
	environment := os.Getenv("ENVIRONMENT")
	
	if databaseURL == "" && environment == "production" {
		log.Fatal("DATABASE_URL is required in production environment")
	}
	if databaseURL == "" {
		log.Println("WARNING: Using in-memory database (not for production use)")
	}
	
	db := database.NewInMemoryDB()
	tradingHandler := handlers.NewTradingHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.RequestIDMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "investments-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints (market data)
	public := router.Group("/api")
	{
		// Stocks
		public.GET("/stocks", tradingHandler.GetStocks)
		public.GET("/stocks/:symbol", tradingHandler.GetStock)
		
		// ETFs
		public.GET("/etfs", tradingHandler.GetETFs)
		
		// Commodities
		public.GET("/commodities", tradingHandler.GetCommodities)
		public.GET("/commodities/:symbol", tradingHandler.GetCommodity)
		
		// Market summary
		public.GET("/market/summary", tradingHandler.GetMarketSummary)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Portfolio
		api.GET("/portfolio", tradingHandler.GetPortfolio)
		api.POST("/portfolio/deposit", tradingHandler.DepositFunds)
		api.POST("/portfolio/withdraw", tradingHandler.WithdrawFunds)
		
		// Holdings
		api.GET("/holdings", tradingHandler.GetHoldings)
		
		// Orders
		api.POST("/orders", tradingHandler.PlaceOrder)
		api.GET("/orders", tradingHandler.GetOrders)
		api.GET("/orders/:id", tradingHandler.GetOrder)
		api.POST("/orders/:id/cancel", tradingHandler.CancelOrder)
		
		// Watchlists
		api.POST("/watchlists", tradingHandler.CreateWatchlist)
		api.GET("/watchlists", tradingHandler.GetWatchlists)
		api.POST("/watchlists/:id/symbols", tradingHandler.AddToWatchlist)
		
		// Price Alerts
		api.POST("/alerts", tradingHandler.CreatePriceAlert)
		api.GET("/alerts", tradingHandler.GetPriceAlerts)
		
		// Recurring Investments
		api.POST("/recurring", tradingHandler.CreateRecurringInvestment)
		api.GET("/recurring", tradingHandler.GetRecurringInvestments)
		
		// Dividends
		api.GET("/dividends", tradingHandler.GetDividends)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Investments service starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
