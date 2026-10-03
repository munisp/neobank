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
	"github.com/neobank/banking-service/internal/config"
	"github.com/neobank/banking-service/internal/database"
	"github.com/neobank/banking-service/internal/handlers"
	"github.com/neobank/banking-service/internal/middleware"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	// Database initialization - require DATABASE_URL in production
	databaseURL := os.Getenv("DATABASE_URL")
	environment := os.Getenv("ENVIRONMENT")
	
	if databaseURL == "" && environment == "production" {
		log.Fatal("DATABASE_URL is required in production environment")
	}
	if databaseURL == "" {
		log.Println("WARNING: Using in-memory database (not for production use)")
	}
	
	db, err := database.NewStore(context.Background(), databaseURL)
	if err != nil {
		// NewStore returns a usable in-memory store alongside a warning-level
		// error when DATABASE_URL is empty (dev/test only).
		log.Println("store selection:", err)
	}
	defer db.Close(context.Background())

	// Initialize handlers
	loanHandler := handlers.NewLoanHandler(db, cfg)
	cardHandler := handlers.NewCardHandler(db, cfg)
	complianceHandler := handlers.NewComplianceHandler(db, cfg)

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	// Global middleware
	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.RequestIDMiddleware())
	router.Use(middleware.LoggingMiddleware())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "banking-service",
			"version": "1.0.0",
		})
	})

	// API routes
	api := router.Group("/api")
	{
		// Loan routes
		loans := api.Group("/loans")
		loans.Use(middleware.AuthMiddleware(cfg))
		{
			loans.POST("/apply", loanHandler.ApplyForLoan)
			loans.GET("", loanHandler.GetUserLoans)
			loans.GET("/summary", loanHandler.GetLoanSummary)
			loans.GET("/:id", loanHandler.GetLoan)
			loans.POST("/:id/decision", loanHandler.ProcessLoanDecision)
			loans.POST("/:id/disburse", loanHandler.DisburseLoan)
			loans.GET("/:id/schedule", loanHandler.GetRepaymentSchedule)
			loans.POST("/:id/payments", loanHandler.MakePayment)
		}

		// Card routes
		cards := api.Group("/cards")
		cards.Use(middleware.AuthMiddleware(cfg))
		{
			cards.POST("", cardHandler.CreateCard)
			cards.GET("", cardHandler.GetUserCards)
			cards.GET("/:id", cardHandler.GetCard)
			cards.POST("/:id/activate", cardHandler.ActivateCard)
			cards.POST("/:id/freeze", cardHandler.FreezeCard)
			cards.POST("/:id/unfreeze", cardHandler.UnfreezeCard)
			cards.POST("/:id/block", cardHandler.BlockCard)
			cards.PUT("/:id/limits", cardHandler.UpdateCardLimits)
			cards.PUT("/:id/controls", cardHandler.UpdateCardControls)
			cards.POST("/:id/pin", cardHandler.SetPIN)
			cards.GET("/:id/transactions", cardHandler.GetCardTransactions)
		}

		// Compliance routes
		compliance := api.Group("/compliance")
		compliance.Use(middleware.AuthMiddleware(cfg))
		{
			compliance.POST("/check", complianceHandler.RunComplianceCheck)
			compliance.GET("/checks/:id", complianceHandler.GetComplianceCheck)
			compliance.GET("/users/:user_id/checks", complianceHandler.GetUserComplianceChecks)
			compliance.GET("/users/:user_id/summary", complianceHandler.GetComplianceSummary)
			compliance.GET("/alerts", complianceHandler.GetAlerts)
			compliance.GET("/alerts/:id", complianceHandler.GetAlert)
			compliance.PUT("/alerts/:id/review", complianceHandler.ReviewAlert)
		}
	}

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Banking Service starting on port %s", cfg.Server.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
