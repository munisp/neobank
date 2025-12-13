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
	"github.com/neobank/kyc-kyb-service/internal/config"
	"github.com/neobank/kyc-kyb-service/internal/database"
	"github.com/neobank/kyc-kyb-service/internal/handlers"
	"github.com/neobank/kyc-kyb-service/internal/middleware"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db := database.NewInMemoryDB()

	// Initialize handlers
	kycHandler := handlers.NewKYCHandler(db, cfg)
	kybHandler := handlers.NewKYBHandler(db, cfg)

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
			"service": "kyc-kyb-service",
			"version": "1.0.0",
		})
	})

	// API routes
	api := router.Group("/api")
	{
		// KYC routes
		kyc := api.Group("/kyc")
		kyc.Use(middleware.AuthMiddleware(cfg))
		{
			kyc.POST("/initiate", kycHandler.InitiateKYC)
			kyc.GET("/applications", kycHandler.GetUserApplications)
			kyc.GET("/applications/:id", kycHandler.GetApplication)
			kyc.POST("/applications/:id/personal-info", kycHandler.SubmitPersonalInfo)
			kyc.POST("/applications/:id/address", kycHandler.SubmitAddressInfo)
			kyc.POST("/applications/:id/identity", kycHandler.SubmitIdentityVerification)
			kyc.POST("/applications/:id/documents", kycHandler.UploadDocument)
			kyc.GET("/applications/:id/documents", kycHandler.GetDocuments)
			kyc.POST("/applications/:id/biometric", kycHandler.SubmitBiometric)
			kyc.POST("/applications/:id/submit", kycHandler.SubmitForReview)
			kyc.GET("/applications/:id/aml-screening", kycHandler.GetAMLScreening)
			kyc.POST("/applications/:id/upgrade", kycHandler.UpgradeTier)
		}

		// KYB routes
		kyb := api.Group("/kyb")
		kyb.Use(middleware.AuthMiddleware(cfg))
		{
			kyb.POST("/initiate", kybHandler.InitiateKYB)
			kyb.GET("/applications", kybHandler.GetUserApplications)
			kyb.GET("/applications/:id", kybHandler.GetApplication)
			kyb.POST("/applications/:id/business-info", kybHandler.SubmitBusinessInfo)
			kyb.POST("/applications/:id/cac-verification", kybHandler.VerifyCACRegistration)
			kyb.POST("/applications/:id/ubos", kybHandler.AddUBO)
			kyb.GET("/applications/:id/ubos", kybHandler.GetUBOs)
			kyb.PUT("/applications/:id/ubos/:ubo_id", kybHandler.UpdateUBO)
			kyb.DELETE("/applications/:id/ubos/:ubo_id", kybHandler.DeleteUBO)
			kyb.POST("/applications/:id/financial-info", kybHandler.SubmitFinancialInfo)
			kyb.POST("/applications/:id/documents", kybHandler.UploadDocument)
			kyb.GET("/applications/:id/documents", kybHandler.GetDocuments)
			kyb.POST("/applications/:id/submit", kybHandler.SubmitForReview)
			kyb.GET("/applications/:id/risk-assessment", kybHandler.GetRiskAssessment)
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
		log.Printf("KYC/KYB Service starting on port %s", cfg.Server.Port)
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
