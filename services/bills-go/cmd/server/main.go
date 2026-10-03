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
	"github.com/neobank/bills-service/internal/config"
	"github.com/neobank/bills-service/internal/database"
	"github.com/neobank/bills-service/internal/handlers"
	"github.com/neobank/bills-service/internal/middleware"
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
	
	db, err := database.NewStore(context.Background(), databaseURL)
	if err != nil {
		// NewStore returns a usable in-memory store alongside a warning-level
		// error when DATABASE_URL is empty (dev/test only).
		log.Println("store selection:", err)
	}
	defer db.Close(context.Background())
	billsHandler := handlers.NewBillsHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "bills-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints
	public := router.Group("/api")
	{
		public.GET("/billers", billsHandler.GetBillers)
		public.GET("/billers/:id", billsHandler.GetBiller)
		public.GET("/categories", billsHandler.GetCategories)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Summary
		api.GET("/summary", billsHandler.GetSummary)
		
		// Validation
		api.POST("/validate", billsHandler.ValidateCustomer)
		
		// Payments
		api.POST("/pay", billsHandler.PayBill)
		api.GET("/payments", billsHandler.GetPayments)
		api.GET("/payments/:id", billsHandler.GetPayment)
		
		// Saved billers
		api.POST("/saved", billsHandler.SaveBiller)
		api.GET("/saved", billsHandler.GetSavedBillers)
		api.DELETE("/saved/:id", billsHandler.DeleteSavedBiller)
		
		// Subscriptions
		api.POST("/subscriptions", billsHandler.CreateSubscription)
		api.GET("/subscriptions", billsHandler.GetSubscriptions)
		api.GET("/subscriptions/:id", billsHandler.GetSubscription)
		api.POST("/subscriptions/:id/pause", billsHandler.PauseSubscription)
		api.POST("/subscriptions/:id/resume", billsHandler.ResumeSubscription)
		api.POST("/subscriptions/:id/cancel", billsHandler.CancelSubscription)
		
		// Scheduled payments
		api.POST("/scheduled", billsHandler.SchedulePayment)
		api.GET("/scheduled", billsHandler.GetScheduledPayments)
		api.DELETE("/scheduled/:id", billsHandler.CancelScheduledPayment)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Bills service starting on port %s", cfg.Port)
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
