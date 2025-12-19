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
	"github.com/neobank/telecom-service/internal/config"
	"github.com/neobank/telecom-service/internal/database"
	"github.com/neobank/telecom-service/internal/handlers"
	"github.com/neobank/telecom-service/internal/middleware"
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
	telecomHandler := handlers.NewTelecomHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "telecom-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints
	public := router.Group("/api")
	{
		public.GET("/networks", telecomHandler.GetNetworks)
		public.GET("/networks/:id", telecomHandler.GetNetwork)
		public.GET("/networks/:id/data-plans", telecomHandler.GetDataPlans)
		public.POST("/validate-phone", telecomHandler.ValidatePhone)
		public.GET("/esim/plans", telecomHandler.GetESIMPlans)
		public.GET("/esim/plans/:id", telecomHandler.GetESIMPlan)
		public.GET("/esim/regions", telecomHandler.GetRegions)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Airtime
		api.POST("/airtime", telecomHandler.BuyAirtime)
		api.GET("/airtime/history", telecomHandler.GetAirtimeHistory)
		
		// Data
		api.POST("/data", telecomHandler.BuyData)
		api.GET("/data/history", telecomHandler.GetDataHistory)
		
		// eSIM
		api.POST("/esim", telecomHandler.BuyESIM)
		api.GET("/esim/my", telecomHandler.GetMyESIMs)
		api.GET("/esim/:id", telecomHandler.GetESIMDetails)
		api.POST("/esim/:id/activate", telecomHandler.ActivateESIM)
		
		// Beneficiaries
		api.POST("/beneficiaries", telecomHandler.SaveBeneficiary)
		api.GET("/beneficiaries", telecomHandler.GetBeneficiaries)
		api.DELETE("/beneficiaries/:id", telecomHandler.DeleteBeneficiary)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Telecom service starting on port %s", cfg.Port)
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
