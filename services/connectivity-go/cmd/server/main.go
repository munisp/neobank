package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/segmentio/kafka-go"
)

// Configuration
type Config struct {
	Port           string
	RedisAddr      string
	RedisPassword  string
	KafkaBrokers   []string
	DaprPort       string
	TigerBeetleAddr string
}

func loadConfig() *Config {
	return &Config{
		Port:           getEnv("PORT", "8089"),
		RedisAddr:      getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:  getEnv("REDIS_PASSWORD", ""),
		KafkaBrokers:   []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
		DaprPort:       getEnv("DAPR_HTTP_PORT", "3500"),
		TigerBeetleAddr: getEnv("TIGERBEETLE_ADDR", "localhost:3000"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Power Management Service
type PowerState struct {
	DeviceID      string    `json:"device_id"`
	BatteryLevel  int       `json:"battery_level"`
	IsCharging    bool      `json:"is_charging"`
	PowerSaveMode bool      `json:"power_save_mode"`
	LastUpdated   time.Time `json:"last_updated"`
}

type SyncPolicy struct {
	SyncInterval    time.Duration `json:"sync_interval"`
	EnablePush      bool          `json:"enable_push"`
	EnablePolling   bool          `json:"enable_polling"`
	ReducedFeatures []string      `json:"reduced_features"`
}

type PowerManagementService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
}

func NewPowerManagementService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *PowerManagementService {
	return &PowerManagementService{
		redis:       redisClient,
		kafkaWriter: kafkaWriter,
	}
}

func (s *PowerManagementService) UpdatePowerState(ctx context.Context, state *PowerState) (*SyncPolicy, error) {
	state.LastUpdated = time.Now()
	
	// Store in Redis
	data, _ := json.Marshal(state)
	s.redis.Set(ctx, fmt.Sprintf("power:state:%s", state.DeviceID), data, 24*time.Hour)
	
	// Publish to Kafka for analytics
	s.publishEvent(ctx, "power.state.updated", state)
	
	// Calculate sync policy based on battery level
	policy := s.calculateSyncPolicy(state)
	
	return policy, nil
}

func (s *PowerManagementService) calculateSyncPolicy(state *PowerState) *SyncPolicy {
	policy := &SyncPolicy{
		EnablePush:    true,
		EnablePolling: true,
	}
	
	if state.IsCharging {
		// Full features when charging
		policy.SyncInterval = 30 * time.Second
		return policy
	}
	
	switch {
	case state.BatteryLevel <= 5:
		// Critical battery - minimal sync
		policy.SyncInterval = 30 * time.Minute
		policy.EnablePolling = false
		policy.ReducedFeatures = []string{"analytics", "notifications", "background_refresh", "image_loading", "animations"}
	case state.BatteryLevel <= 15:
		// Low battery - reduced sync
		policy.SyncInterval = 15 * time.Minute
		policy.EnablePolling = false
		policy.ReducedFeatures = []string{"analytics", "background_refresh", "animations"}
	case state.BatteryLevel <= 30:
		// Medium-low battery
		policy.SyncInterval = 5 * time.Minute
		policy.ReducedFeatures = []string{"background_refresh"}
	case state.BatteryLevel <= 50:
		// Medium battery
		policy.SyncInterval = 2 * time.Minute
	default:
		// Good battery
		policy.SyncInterval = 30 * time.Second
	}
	
	// Override if power save mode is enabled
	if state.PowerSaveMode {
		policy.SyncInterval = 15 * time.Minute
		policy.EnablePolling = false
		policy.ReducedFeatures = append(policy.ReducedFeatures, "animations", "auto_refresh")
	}
	
	return policy
}

func (s *PowerManagementService) publishEvent(ctx context.Context, eventType string, data interface{}) {
	if s.kafkaWriter == nil {
		return
	}
	
	payload, _ := json.Marshal(map[string]interface{}{
		"event_type": eventType,
		"data":       data,
		"timestamp":  time.Now().Unix(),
	})
	
	s.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: payload,
	})
}

// Adaptive Data Service
type NetworkQuality struct {
	DeviceID       string  `json:"device_id"`
	ConnectionType string  `json:"connection_type"` // 2g, 3g, 4g, 5g, wifi
	DownloadSpeed  float64 `json:"download_speed"`  // Mbps
	UploadSpeed    float64 `json:"upload_speed"`    // Mbps
	Latency        int     `json:"latency"`         // ms
	PacketLoss     float64 `json:"packet_loss"`     // percentage
}

type DataPolicy struct {
	ImageQuality      string `json:"image_quality"`       // low, medium, high, original
	EnableCompression bool   `json:"enable_compression"`
	BatchRequests     bool   `json:"batch_requests"`
	BatchInterval     int    `json:"batch_interval"`      // seconds
	MaxPayloadSize    int    `json:"max_payload_size"`    // bytes
	EnableDeltaSync   bool   `json:"enable_delta_sync"`
	PreloadEnabled    bool   `json:"preload_enabled"`
}

type AdaptiveDataService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
}

func NewAdaptiveDataService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *AdaptiveDataService {
	return &AdaptiveDataService{
		redis:       redisClient,
		kafkaWriter: kafkaWriter,
	}
}

func (s *AdaptiveDataService) UpdateNetworkQuality(ctx context.Context, quality *NetworkQuality) (*DataPolicy, error) {
	// Store in Redis
	data, _ := json.Marshal(quality)
	s.redis.Set(ctx, fmt.Sprintf("network:quality:%s", quality.DeviceID), data, 1*time.Hour)
	
	// Publish to Kafka
	s.publishEvent(ctx, "network.quality.updated", quality)
	
	// Calculate data policy
	policy := s.calculateDataPolicy(quality)
	
	return policy, nil
}

func (s *AdaptiveDataService) calculateDataPolicy(quality *NetworkQuality) *DataPolicy {
	policy := &DataPolicy{
		EnableCompression: true,
		EnableDeltaSync:   true,
	}
	
	switch quality.ConnectionType {
	case "2g":
		policy.ImageQuality = "low"
		policy.BatchRequests = true
		policy.BatchInterval = 30
		policy.MaxPayloadSize = 10 * 1024 // 10KB
		policy.PreloadEnabled = false
	case "3g":
		policy.ImageQuality = "medium"
		policy.BatchRequests = true
		policy.BatchInterval = 10
		policy.MaxPayloadSize = 50 * 1024 // 50KB
		policy.PreloadEnabled = false
	case "4g":
		policy.ImageQuality = "high"
		policy.BatchRequests = false
		policy.MaxPayloadSize = 500 * 1024 // 500KB
		policy.PreloadEnabled = true
	case "5g", "wifi":
		policy.ImageQuality = "original"
		policy.BatchRequests = false
		policy.MaxPayloadSize = 5 * 1024 * 1024 // 5MB
		policy.PreloadEnabled = true
	default:
		// Unknown - assume slow
		policy.ImageQuality = "low"
		policy.BatchRequests = true
		policy.BatchInterval = 15
		policy.MaxPayloadSize = 30 * 1024
	}
	
	// Adjust based on actual speed
	if quality.DownloadSpeed < 0.1 { // < 100 Kbps
		policy.ImageQuality = "low"
		policy.BatchRequests = true
		policy.BatchInterval = 60
		policy.MaxPayloadSize = 5 * 1024
	} else if quality.DownloadSpeed < 0.5 { // < 500 Kbps
		policy.ImageQuality = "low"
		policy.BatchRequests = true
		policy.BatchInterval = 30
	}
	
	// Adjust based on latency
	if quality.Latency > 1000 { // > 1 second
		policy.BatchRequests = true
		policy.BatchInterval = max(policy.BatchInterval, 30)
	}
	
	return policy
}

func (s *AdaptiveDataService) publishEvent(ctx context.Context, eventType string, data interface{}) {
	if s.kafkaWriter == nil {
		return
	}
	
	payload, _ := json.Marshal(map[string]interface{}{
		"event_type": eventType,
		"data":       data,
		"timestamp":  time.Now().Unix(),
	})
	
	s.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: payload,
	})
}

// Extended Offline Service
type OfflineTransaction struct {
	TransactionID   string          `json:"transaction_id"`
	UserID          string          `json:"user_id"`
	DeviceID        string          `json:"device_id"`
	Type            string          `json:"type"`
	Amount          float64         `json:"amount"`
	Recipient       string          `json:"recipient,omitempty"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
	Signature       string          `json:"signature"`
	Nonce           string          `json:"nonce"`
	SequenceNumber  int64           `json:"sequence_number"`
	CreatedAt       time.Time       `json:"created_at"`
	ExpiresAt       time.Time       `json:"expires_at"`
	Status          string          `json:"status"`
	ConflictReason  string          `json:"conflict_reason,omitempty"`
}

type ExtendedOfflineService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
	// Extended expiry: 72 hours for remote areas
	defaultExpiry time.Duration
	maxTransactions int
	maxAmount     float64
}

func NewExtendedOfflineService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *ExtendedOfflineService {
	return &ExtendedOfflineService{
		redis:           redisClient,
		kafkaWriter:     kafkaWriter,
		defaultExpiry:   72 * time.Hour, // Extended from 24h to 72h
		maxTransactions: 100,            // Increased from 50
		maxAmount:       500000,         // Increased from 100,000
	}
}

func (s *ExtendedOfflineService) QueueTransaction(ctx context.Context, tx *OfflineTransaction) error {
	tx.CreatedAt = time.Now()
	tx.ExpiresAt = time.Now().Add(s.defaultExpiry)
	tx.Status = "pending"
	
	// Validate
	if tx.Amount > s.maxAmount {
		return fmt.Errorf("amount exceeds maximum offline limit of %.2f", s.maxAmount)
	}
	
	// Check queue size
	queueKey := fmt.Sprintf("offline:queue:%s", tx.UserID)
	queueSize, _ := s.redis.LLen(ctx, queueKey).Result()
	if queueSize >= int64(s.maxTransactions) {
		return fmt.Errorf("offline queue full, max %d transactions", s.maxTransactions)
	}
	
	// Store transaction
	data, _ := json.Marshal(tx)
	s.redis.RPush(ctx, queueKey, data)
	s.redis.Expire(ctx, queueKey, s.defaultExpiry)
	
	// Store by ID for lookup
	s.redis.Set(ctx, fmt.Sprintf("offline:tx:%s", tx.TransactionID), data, s.defaultExpiry)
	
	// Publish event
	s.publishEvent(ctx, "offline.transaction.queued", tx)
	
	return nil
}

func (s *ExtendedOfflineService) SyncTransactions(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	queueKey := fmt.Sprintf("offline:queue:%s", userID)
	
	// Get all pending transactions
	txData, err := s.redis.LRange(ctx, queueKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}
	
	results := make([]map[string]interface{}, 0)
	
	for _, data := range txData {
		var tx OfflineTransaction
		if err := json.Unmarshal([]byte(data), &tx); err != nil {
			continue
		}
		
		// Check expiry
		if time.Now().After(tx.ExpiresAt) {
			tx.Status = "expired"
			results = append(results, map[string]interface{}{
				"transaction_id": tx.TransactionID,
				"status":         "expired",
				"error":          "Transaction expired",
			})
			continue
		}
		
		// Process transaction (would call actual services)
		result := s.processTransaction(ctx, &tx)
		results = append(results, result)
	}
	
	// Clear processed transactions
	s.redis.Del(ctx, queueKey)
	
	// Publish sync event
	s.publishEvent(ctx, "offline.sync.completed", map[string]interface{}{
		"user_id": userID,
		"count":   len(results),
	})
	
	return results, nil
}

func (s *ExtendedOfflineService) processTransaction(ctx context.Context, tx *OfflineTransaction) map[string]interface{} {
	// Simulate processing - in production would call TigerBeetle/actual services
	return map[string]interface{}{
		"transaction_id": tx.TransactionID,
		"status":         "confirmed",
		"reference":      fmt.Sprintf("OFF%d", time.Now().UnixNano()),
	}
}

func (s *ExtendedOfflineService) GetPendingCount(ctx context.Context, userID string) (int64, error) {
	queueKey := fmt.Sprintf("offline:queue:%s", userID)
	return s.redis.LLen(ctx, queueKey).Result()
}

func (s *ExtendedOfflineService) publishEvent(ctx context.Context, eventType string, data interface{}) {
	if s.kafkaWriter == nil {
		return
	}
	
	payload, _ := json.Marshal(map[string]interface{}{
		"event_type": eventType,
		"data":       data,
		"timestamp":  time.Now().Unix(),
	})
	
	s.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: payload,
	})
}

// Conflict Resolution Service
type ConflictType string

const (
	ConflictInsufficientBalance ConflictType = "insufficient_balance"
	ConflictRecipientChanged    ConflictType = "recipient_changed"
	ConflictRateChanged         ConflictType = "rate_changed"
	ConflictDuplicateNonce      ConflictType = "duplicate_nonce"
	ConflictAccountLocked       ConflictType = "account_locked"
)

type Conflict struct {
	ConflictID      string       `json:"conflict_id"`
	TransactionID   string       `json:"transaction_id"`
	UserID          string       `json:"user_id"`
	Type            ConflictType `json:"type"`
	Description     string       `json:"description"`
	OriginalData    interface{}  `json:"original_data"`
	CurrentData     interface{}  `json:"current_data"`
	ResolutionOptions []string   `json:"resolution_options"`
	CreatedAt       time.Time    `json:"created_at"`
	ResolvedAt      *time.Time   `json:"resolved_at,omitempty"`
	Resolution      string       `json:"resolution,omitempty"`
}

type ConflictResolutionService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
}

func NewConflictResolutionService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *ConflictResolutionService {
	return &ConflictResolutionService{
		redis:       redisClient,
		kafkaWriter: kafkaWriter,
	}
}

func (s *ConflictResolutionService) CreateConflict(ctx context.Context, conflict *Conflict) error {
	conflict.CreatedAt = time.Now()
	conflict.ResolutionOptions = s.getResolutionOptions(conflict.Type)
	
	data, _ := json.Marshal(conflict)
	
	// Store conflict
	s.redis.Set(ctx, fmt.Sprintf("conflict:%s", conflict.ConflictID), data, 7*24*time.Hour)
	
	// Add to user's conflict list
	s.redis.SAdd(ctx, fmt.Sprintf("conflicts:user:%s", conflict.UserID), conflict.ConflictID)
	
	// Publish event for notification
	s.publishEvent(ctx, "conflict.created", conflict)
	
	return nil
}

func (s *ConflictResolutionService) getResolutionOptions(conflictType ConflictType) []string {
	switch conflictType {
	case ConflictInsufficientBalance:
		return []string{"cancel", "retry_with_available", "wait_for_funds"}
	case ConflictRecipientChanged:
		return []string{"cancel", "proceed_anyway", "update_recipient"}
	case ConflictRateChanged:
		return []string{"cancel", "accept_new_rate", "retry_later"}
	case ConflictDuplicateNonce:
		return []string{"cancel", "regenerate"}
	case ConflictAccountLocked:
		return []string{"cancel", "contact_support"}
	default:
		return []string{"cancel", "retry"}
	}
}

func (s *ConflictResolutionService) ResolveConflict(ctx context.Context, conflictID string, resolution string) error {
	// Get conflict
	data, err := s.redis.Get(ctx, fmt.Sprintf("conflict:%s", conflictID)).Result()
	if err != nil {
		return fmt.Errorf("conflict not found")
	}
	
	var conflict Conflict
	json.Unmarshal([]byte(data), &conflict)
	
	now := time.Now()
	conflict.ResolvedAt = &now
	conflict.Resolution = resolution
	
	// Update conflict
	updatedData, _ := json.Marshal(conflict)
	s.redis.Set(ctx, fmt.Sprintf("conflict:%s", conflictID), updatedData, 7*24*time.Hour)
	
	// Remove from user's active conflicts
	s.redis.SRem(ctx, fmt.Sprintf("conflicts:user:%s", conflict.UserID), conflictID)
	
	// Publish event
	s.publishEvent(ctx, "conflict.resolved", conflict)
	
	return nil
}

func (s *ConflictResolutionService) GetUserConflicts(ctx context.Context, userID string) ([]Conflict, error) {
	conflictIDs, err := s.redis.SMembers(ctx, fmt.Sprintf("conflicts:user:%s", userID)).Result()
	if err != nil {
		return nil, err
	}
	
	conflicts := make([]Conflict, 0)
	for _, id := range conflictIDs {
		data, err := s.redis.Get(ctx, fmt.Sprintf("conflict:%s", id)).Result()
		if err != nil {
			continue
		}
		
		var conflict Conflict
		json.Unmarshal([]byte(data), &conflict)
		conflicts = append(conflicts, conflict)
	}
	
	return conflicts, nil
}

func (s *ConflictResolutionService) publishEvent(ctx context.Context, eventType string, data interface{}) {
	if s.kafkaWriter == nil {
		return
	}
	
	payload, _ := json.Marshal(map[string]interface{}{
		"event_type": eventType,
		"data":       data,
		"timestamp":  time.Now().Unix(),
	})
	
	s.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: payload,
	})
}

// Data Saver Mode Service
type DataSaverSettings struct {
	UserID           string   `json:"user_id"`
	Enabled          bool     `json:"enabled"`
	TextOnlyMode     bool     `json:"text_only_mode"`
	DisableAutoPlay  bool     `json:"disable_auto_play"`
	DisablePreload   bool     `json:"disable_preload"`
	ReduceAnimations bool     `json:"reduce_animations"`
	CompressImages   bool     `json:"compress_images"`
	ImageQuality     int      `json:"image_quality"` // 1-100
	DisabledFeatures []string `json:"disabled_features"`
}

type DataSaverService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
}

func NewDataSaverService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *DataSaverService {
	return &DataSaverService{
		redis:       redisClient,
		kafkaWriter: kafkaWriter,
	}
}

func (s *DataSaverService) GetSettings(ctx context.Context, userID string) (*DataSaverSettings, error) {
	data, err := s.redis.Get(ctx, fmt.Sprintf("datasaver:%s", userID)).Result()
	if err == redis.Nil {
		// Return defaults
		return &DataSaverSettings{
			UserID:           userID,
			Enabled:          false,
			CompressImages:   true,
			ImageQuality:     80,
			DisabledFeatures: []string{},
		}, nil
	}
	if err != nil {
		return nil, err
	}
	
	var settings DataSaverSettings
	json.Unmarshal([]byte(data), &settings)
	return &settings, nil
}

func (s *DataSaverService) UpdateSettings(ctx context.Context, settings *DataSaverSettings) error {
	data, _ := json.Marshal(settings)
	s.redis.Set(ctx, fmt.Sprintf("datasaver:%s", settings.UserID), data, 0)
	
	// Publish event
	s.publishEvent(ctx, "datasaver.settings.updated", settings)
	
	return nil
}

func (s *DataSaverService) EnableExtremeSaver(ctx context.Context, userID string) (*DataSaverSettings, error) {
	settings := &DataSaverSettings{
		UserID:           userID,
		Enabled:          true,
		TextOnlyMode:     true,
		DisableAutoPlay:  true,
		DisablePreload:   true,
		ReduceAnimations: true,
		CompressImages:   true,
		ImageQuality:     20,
		DisabledFeatures: []string{"analytics", "charts", "maps", "videos", "rich_notifications"},
	}
	
	return settings, s.UpdateSettings(ctx, settings)
}

func (s *DataSaverService) publishEvent(ctx context.Context, eventType string, data interface{}) {
	if s.kafkaWriter == nil {
		return
	}
	
	payload, _ := json.Marshal(map[string]interface{}{
		"event_type": eventType,
		"data":       data,
		"timestamp":  time.Now().Unix(),
	})
	
	s.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: payload,
	})
}

// Progressive Loading Service
type LoadingPriority int

const (
	PriorityCritical LoadingPriority = 1
	PriorityHigh     LoadingPriority = 2
	PriorityMedium   LoadingPriority = 3
	PriorityLow      LoadingPriority = 4
)

type ResourceRequest struct {
	ResourceID   string          `json:"resource_id"`
	ResourceType string          `json:"resource_type"`
	Priority     LoadingPriority `json:"priority"`
	Size         int64           `json:"size"`
	URL          string          `json:"url"`
}

type LoadingPlan struct {
	DeviceID    string            `json:"device_id"`
	Resources   []ResourceRequest `json:"resources"`
	TotalSize   int64             `json:"total_size"`
	EstimatedTime int             `json:"estimated_time"` // seconds
}

type ProgressiveLoadingService struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
}

func NewProgressiveLoadingService(redisClient *redis.Client, kafkaWriter *kafka.Writer) *ProgressiveLoadingService {
	return &ProgressiveLoadingService{
		redis:       redisClient,
		kafkaWriter: kafkaWriter,
	}
}

func (s *ProgressiveLoadingService) CreateLoadingPlan(ctx context.Context, deviceID string, resources []ResourceRequest, networkSpeed float64) (*LoadingPlan, error) {
	// Sort by priority
	sortedResources := make([]ResourceRequest, len(resources))
	copy(sortedResources, resources)
	
	// Simple bubble sort by priority
	for i := 0; i < len(sortedResources)-1; i++ {
		for j := 0; j < len(sortedResources)-i-1; j++ {
			if sortedResources[j].Priority > sortedResources[j+1].Priority {
				sortedResources[j], sortedResources[j+1] = sortedResources[j+1], sortedResources[j]
			}
		}
	}
	
	var totalSize int64
	for _, r := range sortedResources {
		totalSize += r.Size
	}
	
	// Estimate time based on network speed (Mbps)
	estimatedTime := 0
	if networkSpeed > 0 {
		estimatedTime = int(float64(totalSize) / (networkSpeed * 125000)) // Convert Mbps to bytes/sec
	}
	
	plan := &LoadingPlan{
		DeviceID:      deviceID,
		Resources:     sortedResources,
		TotalSize:     totalSize,
		EstimatedTime: estimatedTime,
	}
	
	// Cache plan
	data, _ := json.Marshal(plan)
	s.redis.Set(ctx, fmt.Sprintf("loading:plan:%s", deviceID), data, 1*time.Hour)
	
	return plan, nil
}

func (s *ProgressiveLoadingService) GetSkeletonData(ctx context.Context, screenType string) (map[string]interface{}, error) {
	// Return skeleton structure for different screens
	skeletons := map[string]map[string]interface{}{
		"dashboard": {
			"balance_card":    true,
			"quick_actions":   4,
			"recent_transactions": 5,
			"cards_carousel":  3,
		},
		"transactions": {
			"filter_bar":     true,
			"transaction_list": 10,
			"pagination":     true,
		},
		"accounts": {
			"account_cards": 3,
			"total_balance": true,
		},
	}
	
	if skeleton, ok := skeletons[screenType]; ok {
		return skeleton, nil
	}
	
	return map[string]interface{}{"loading": true}, nil
}

// Server setup
type Server struct {
	config                    *Config
	redis                     *redis.Client
	kafkaWriter               *kafka.Writer
	powerService              *PowerManagementService
	adaptiveService           *AdaptiveDataService
	offlineService            *ExtendedOfflineService
	conflictService           *ConflictResolutionService
	dataSaverService          *DataSaverService
	progressiveLoadingService *ProgressiveLoadingService
}

func NewServer(config *Config) (*Server, error) {
	// Initialize Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr:     config.RedisAddr,
		Password: config.RedisPassword,
		DB:       0,
	})
	
	// Initialize Kafka writer
	kafkaWriter := &kafka.Writer{
		Addr:     kafka.TCP(config.KafkaBrokers...),
		Topic:    "neobank.connectivity.events",
		Balancer: &kafka.LeastBytes{},
	}
	
	return &Server{
		config:                    config,
		redis:                     redisClient,
		kafkaWriter:               kafkaWriter,
		powerService:              NewPowerManagementService(redisClient, kafkaWriter),
		adaptiveService:           NewAdaptiveDataService(redisClient, kafkaWriter),
		offlineService:            NewExtendedOfflineService(redisClient, kafkaWriter),
		conflictService:           NewConflictResolutionService(redisClient, kafkaWriter),
		dataSaverService:          NewDataSaverService(redisClient, kafkaWriter),
		progressiveLoadingService: NewProgressiveLoadingService(redisClient, kafkaWriter),
	}, nil
}

func (s *Server) setupRoutes(r *gin.Engine) {
	api := r.Group("/api/v1/connectivity")
	
	// Power Management
	power := api.Group("/power")
	{
		power.POST("/state", s.handleUpdatePowerState)
		power.GET("/policy/:device_id", s.handleGetSyncPolicy)
	}
	
	// Adaptive Data
	adaptive := api.Group("/adaptive")
	{
		adaptive.POST("/network", s.handleUpdateNetworkQuality)
		adaptive.GET("/policy/:device_id", s.handleGetDataPolicy)
	}
	
	// Offline Transactions
	offline := api.Group("/offline")
	{
		offline.POST("/queue", s.handleQueueTransaction)
		offline.POST("/sync/:user_id", s.handleSyncTransactions)
		offline.GET("/pending/:user_id", s.handleGetPendingCount)
	}
	
	// Conflict Resolution
	conflicts := api.Group("/conflicts")
	{
		conflicts.GET("/:user_id", s.handleGetUserConflicts)
		conflicts.POST("/resolve/:conflict_id", s.handleResolveConflict)
	}
	
	// Data Saver
	datasaver := api.Group("/datasaver")
	{
		datasaver.GET("/:user_id", s.handleGetDataSaverSettings)
		datasaver.PUT("/:user_id", s.handleUpdateDataSaverSettings)
		datasaver.POST("/:user_id/extreme", s.handleEnableExtremeSaver)
	}
	
	// Progressive Loading
	loading := api.Group("/loading")
	{
		loading.POST("/plan", s.handleCreateLoadingPlan)
		loading.GET("/skeleton/:screen_type", s.handleGetSkeleton)
	}
	
	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "connectivity"})
	})
}

// Handlers
func (s *Server) handleUpdatePowerState(c *gin.Context) {
	var state PowerState
	if err := c.ShouldBindJSON(&state); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	policy, err := s.powerService.UpdatePowerState(c.Request.Context(), &state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, policy)
}

func (s *Server) handleGetSyncPolicy(c *gin.Context) {
	deviceID := c.Param("device_id")
	
	// Get cached state
	data, err := s.redis.Get(c.Request.Context(), fmt.Sprintf("power:state:%s", deviceID)).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device state not found"})
		return
	}
	
	var state PowerState
	json.Unmarshal([]byte(data), &state)
	
	policy := s.powerService.calculateSyncPolicy(&state)
	c.JSON(http.StatusOK, policy)
}

func (s *Server) handleUpdateNetworkQuality(c *gin.Context) {
	var quality NetworkQuality
	if err := c.ShouldBindJSON(&quality); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	policy, err := s.adaptiveService.UpdateNetworkQuality(c.Request.Context(), &quality)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, policy)
}

func (s *Server) handleGetDataPolicy(c *gin.Context) {
	deviceID := c.Param("device_id")
	
	data, err := s.redis.Get(c.Request.Context(), fmt.Sprintf("network:quality:%s", deviceID)).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network quality not found"})
		return
	}
	
	var quality NetworkQuality
	json.Unmarshal([]byte(data), &quality)
	
	policy := s.adaptiveService.calculateDataPolicy(&quality)
	c.JSON(http.StatusOK, policy)
}

func (s *Server) handleQueueTransaction(c *gin.Context) {
	var tx OfflineTransaction
	if err := c.ShouldBindJSON(&tx); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if err := s.offlineService.QueueTransaction(c.Request.Context(), &tx); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"transaction_id": tx.TransactionID,
		"status":         "queued",
		"expires_at":     tx.ExpiresAt,
	})
}

func (s *Server) handleSyncTransactions(c *gin.Context) {
	userID := c.Param("user_id")
	
	results, err := s.offlineService.SyncTransactions(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"synced":  len(results),
		"results": results,
	})
}

func (s *Server) handleGetPendingCount(c *gin.Context) {
	userID := c.Param("user_id")
	
	count, err := s.offlineService.GetPendingCount(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"pending_count": count})
}

func (s *Server) handleGetUserConflicts(c *gin.Context) {
	userID := c.Param("user_id")
	
	conflicts, err := s.conflictService.GetUserConflicts(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, conflicts)
}

func (s *Server) handleResolveConflict(c *gin.Context) {
	conflictID := c.Param("conflict_id")
	
	var body struct {
		Resolution string `json:"resolution"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if err := s.conflictService.ResolveConflict(c.Request.Context(), conflictID, body.Resolution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}

func (s *Server) handleGetDataSaverSettings(c *gin.Context) {
	userID := c.Param("user_id")
	
	settings, err := s.dataSaverService.GetSettings(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, settings)
}

func (s *Server) handleUpdateDataSaverSettings(c *gin.Context) {
	userID := c.Param("user_id")
	
	var settings DataSaverSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	settings.UserID = userID
	
	if err := s.dataSaverService.UpdateSettings(c.Request.Context(), &settings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, settings)
}

func (s *Server) handleEnableExtremeSaver(c *gin.Context) {
	userID := c.Param("user_id")
	
	settings, err := s.dataSaverService.EnableExtremeSaver(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, settings)
}

func (s *Server) handleCreateLoadingPlan(c *gin.Context) {
	var body struct {
		DeviceID     string            `json:"device_id"`
		Resources    []ResourceRequest `json:"resources"`
		NetworkSpeed float64           `json:"network_speed"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	plan, err := s.progressiveLoadingService.CreateLoadingPlan(c.Request.Context(), body.DeviceID, body.Resources, body.NetworkSpeed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, plan)
}

func (s *Server) handleGetSkeleton(c *gin.Context) {
	screenType := c.Param("screen_type")
	
	skeleton, err := s.progressiveLoadingService.GetSkeletonData(c.Request.Context(), screenType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, skeleton)
}

func main() {
	config := loadConfig()
	
	server, err := NewServer(config)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}
	
	r := gin.Default()
	server.setupRoutes(r)
	
	srv := &http.Server{
		Addr:    ":" + config.Port,
		Handler: r,
	}
	
	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()
	
	log.Printf("Connectivity service started on port %s", config.Port)
	
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	
	log.Println("Shutting down server...")
	
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	
	server.kafkaWriter.Close()
	server.redis.Close()
	
	log.Println("Server exited")
}
