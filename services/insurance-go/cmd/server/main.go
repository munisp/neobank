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
	"github.com/neobank/insurance-service/internal/config"
	"github.com/neobank/insurance-service/internal/database"
	"github.com/neobank/insurance-service/internal/handlers"
	"github.com/neobank/insurance-service/internal/middleware"
)

func main() {
	cfg := config.Load()
	db := database.NewInMemoryDB()
	insuranceHandler := handlers.NewInsuranceHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "insurance-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints
	public := router.Group("/api")
	{
		public.GET("/products", insuranceHandler.GetProducts)
		public.GET("/products/:id", insuranceHandler.GetProduct)
		public.POST("/quotes", insuranceHandler.GetQuote)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Summary
		api.GET("/summary", insuranceHandler.GetInsuranceSummary)
		
		// Policies
		api.POST("/policies", insuranceHandler.PurchasePolicy)
		api.GET("/policies", insuranceHandler.GetPolicies)
		api.GET("/policies/:id", insuranceHandler.GetPolicy)
		api.POST("/policies/:id/cancel", insuranceHandler.CancelPolicy)
		api.POST("/policies/:id/renew", insuranceHandler.RenewPolicy)
		
		// Claims
		api.POST("/claims", insuranceHandler.SubmitClaim)
		api.GET("/claims", insuranceHandler.GetClaims)
		api.GET("/claims/:id", insuranceHandler.GetClaim)
		api.POST("/claims/:id/documents", insuranceHandler.UploadClaimDocument)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Insurance service starting on port %s", cfg.Port)
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
