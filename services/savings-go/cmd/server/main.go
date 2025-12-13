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
	"github.com/neobank/savings-service/internal/config"
	"github.com/neobank/savings-service/internal/database"
	"github.com/neobank/savings-service/internal/handlers"
	"github.com/neobank/savings-service/internal/middleware"
)

func main() {
	cfg := config.Load()
	db := database.NewInMemoryDB()
	savingsHandler := handlers.NewSavingsHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "savings-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints
	public := router.Group("/api")
	{
		public.GET("/interest-rates", savingsHandler.GetInterestRates)
		public.GET("/fixed-deposits/rates", savingsHandler.GetFixedDepositRates)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Summary
		api.GET("/summary", savingsHandler.GetSavingsSummary)
		
		// Vaults
		api.POST("/vaults", savingsHandler.CreateVault)
		api.GET("/vaults", savingsHandler.GetVaults)
		api.GET("/vaults/:id", savingsHandler.GetVault)
		api.POST("/vaults/:id/deposit", savingsHandler.DepositToVault)
		api.POST("/vaults/:id/withdraw", savingsHandler.WithdrawFromVault)
		api.POST("/vaults/:id/auto-save", savingsHandler.SetAutoSave)
		api.POST("/vaults/:id/round-up", savingsHandler.SetRoundUp)
		api.POST("/vaults/:id/close", savingsHandler.CloseVault)
		
		// Fixed Deposits
		api.POST("/fixed-deposits", savingsHandler.CreateFixedDeposit)
		api.GET("/fixed-deposits", savingsHandler.GetFixedDeposits)
		
		// Group Savings (Ajo/Esusu)
		api.POST("/group-savings", savingsHandler.CreateGroupSavings)
		api.GET("/group-savings", savingsHandler.GetGroupSavings)
		api.POST("/group-savings/:id/join", savingsHandler.JoinGroupSavings)
		api.POST("/group-savings/:id/contribute", savingsHandler.ContributeToGroup)
		
		// Salary Advance
		api.POST("/salary-advance", savingsHandler.RequestSalaryAdvance)
		api.GET("/salary-advance", savingsHandler.GetSalaryAdvances)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Savings service starting on port %s", cfg.Port)
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
