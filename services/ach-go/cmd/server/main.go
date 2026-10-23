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
	"neobank/ach-go/internal/config"
	"neobank/ach-go/internal/handlers"
	"neobank/ach-go/internal/service"
)

func main() {
	cfg := config.Load()
	log.Printf("Starting NeoBank ACH Service (moov-io/ach engine) on port %s", cfg.ServerPort)

	svc := service.NewNachaService(
		cfg.ImmediateDestination, cfg.ImmediateOrigin,
		cfg.DestinationName, cfg.OriginName)
	handler := handlers.NewNachaHandler(svc)

	r := mux.NewRouter()
	r.HandleFunc("/health", handlers.Health).Methods("GET")
	r.HandleFunc("/ready", handlers.Health).Methods("GET")

	api := r.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/nacha/generate", handler.Generate).Methods("POST")
	api.HandleFunc("/nacha/validate", handler.Validate).Methods("POST")
	api.HandleFunc("/nacha/parse", handler.Parse).Methods("POST")

	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
