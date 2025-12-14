package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"neobank/escrow-go/internal/config"
	"neobank/escrow-go/internal/database"
	"neobank/escrow-go/internal/handlers"
	"neobank/escrow-go/internal/service"
)

func main() {
	cfg := config.Load()

	log.Printf("Starting NeoBank Escrow Service on port %s", cfg.ServerPort)
	log.Printf("Environment: %s", cfg.Environment)

	db, err := database.NewPostgresDB(cfg.DatabaseURL)
	if err != nil {
		log.Printf("Warning: Could not connect to PostgreSQL: %v", err)
		log.Println("Running with in-memory storage (not recommended for production)")
		db = nil
	} else {
		if err := db.Migrate(); err != nil {
			log.Printf("Warning: Migration failed: %v", err)
		}
		defer db.Close()
	}

	escrowService := service.NewEscrowService(db, nil)

	escrowHandler := handlers.NewEscrowHandler(escrowService)

	r := mux.NewRouter()

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","service":"escrow-go","version":"1.0.0"}`))
	}).Methods("GET")

	r.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	}).Methods("GET")

	api := r.PathPrefix("/api/v1").Subrouter()
	escrowHandler.RegisterRoutes(api)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Escrow service listening on port %s", cfg.ServerPort)
		log.Println("API endpoints available at /api/v1/escrows")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
