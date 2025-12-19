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
	"github.com/neobank/accounts-service/internal/config"
	"github.com/neobank/accounts-service/internal/database"
	"github.com/neobank/accounts-service/internal/handlers"
	"github.com/neobank/accounts-service/internal/middleware"
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
	accountsHandler := handlers.NewAccountsHandler(db, cfg)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "accounts-service",
			"version": "1.0.0",
		})
	})

	// Protected endpoints
	api := router.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Accounts
		api.GET("/accounts", accountsHandler.GetAccounts)
		api.GET("/accounts/:id", accountsHandler.GetAccount)
		api.POST("/accounts/:id/freeze", accountsHandler.FreezeAccount)
		api.POST("/accounts/:id/unfreeze", accountsHandler.UnfreezeAccount)
		
		// Joint accounts
		api.POST("/accounts/joint", accountsHandler.CreateJointAccount)
		api.POST("/accounts/:id/invite", accountsHandler.InviteToJointAccount)
		
		// Invitations
		api.GET("/invitations", accountsHandler.GetInvitations)
		api.POST("/invitations/:id/respond", accountsHandler.RespondToInvitation)
		
		// Kids accounts
		api.POST("/accounts/kids", accountsHandler.CreateKidsAccount)
		api.GET("/accounts/kids", accountsHandler.GetKidsAccounts)
		api.POST("/accounts/:id/limits", accountsHandler.SetSpendingLimit)
		api.POST("/accounts/:id/restrictions", accountsHandler.SetCategoryRestrictions)
		api.POST("/accounts/:id/transfer", accountsHandler.TransferToKids)
		
		// Tasks
		api.POST("/accounts/:id/tasks", accountsHandler.CreateTask)
		api.POST("/accounts/:id/tasks/:taskId/complete", accountsHandler.CompleteTask)
		api.POST("/accounts/:id/tasks/:taskId/approve", accountsHandler.ApproveTask)
	}

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Accounts service starting on port %s", cfg.Port)
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
