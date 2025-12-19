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
	"github.com/neobank/rewards-service/internal/config"
	"github.com/neobank/rewards-service/internal/database"
	"github.com/neobank/rewards-service/internal/handlers"
	"github.com/neobank/rewards-service/internal/middleware"
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
	rewardsHandler := handlers.NewRewardsHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "rewards-service",
			"version": "1.0.0",
		})
	})

	// Public endpoints
	public := router.Group("/api")
	{
		public.GET("/programs", rewardsHandler.GetPrograms)
		public.GET("/partners", rewardsHandler.GetPartners)
		public.GET("/partners/:id", rewardsHandler.GetPartner)
		public.GET("/tiers", rewardsHandler.GetTiers)
	}

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Summary
		api.GET("/summary", rewardsHandler.GetUserRewards)
		
		// Earning
		api.POST("/earn", rewardsHandler.EarnReward)
		api.GET("/history", rewardsHandler.GetRewardHistory)
		
		// Redemption
		api.POST("/redeem/points", rewardsHandler.RedeemPoints)
		api.POST("/redeem/cashback", rewardsHandler.RedeemCashback)
		api.GET("/redemptions", rewardsHandler.GetRedemptionHistory)
		
		// Referrals
		api.GET("/referral/code", rewardsHandler.GetReferralCode)
		api.POST("/referral/invite", rewardsHandler.CreateReferral)
		api.POST("/referral/apply", rewardsHandler.ApplyReferralCode)
		api.GET("/referrals", rewardsHandler.GetReferrals)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Rewards service starting on port %s", cfg.Port)
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
